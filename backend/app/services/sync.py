"""
Delta-sync engine.

Design
------
* Pull uses a per-user monotonic `seq` cursor, not wall-clock time -> immune to clock skew.
* Push applies *field-level* last-writer-wins using the client's edit timestamps, so two
  devices editing different fields of the same inspection while offline both survive.
* `photos` is a grow-only set (union merge): photos taken on two devices are never lost.
* Deletes are tombstones (`deleted=true`) so they replicate like any other field.
* Pushes are idempotent: replaying a change (flaky network, retry) is a no-op.
"""

from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Inspection, SyncCounter
from ..schemas import ChangeIn, Conflict

PAGE_SIZE = 500
STATUSES = {"open", "in_review", "closed"}


def validate_field(name: str, value: Any) -> Any:
    """Return the normalised value or raise ValueError."""
    if name in {"title", "site"}:
        if not isinstance(value, str) or len(value) > 200:
            raise ValueError("must be a string up to 200 chars")
        return value.strip()
    if name == "notes":
        if not isinstance(value, str) or len(value) > 20_000:
            raise ValueError("must be a string up to 20000 chars")
        return value
    if name == "status":
        if value not in STATUSES:
            raise ValueError(f"must be one of {sorted(STATUSES)}")
        return value
    if name == "severity":
        if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 5:
            raise ValueError("must be an integer 1-5")
        return value
    if name == "photos":
        if not isinstance(value, list) or len(value) > 100 or not all(isinstance(p, str) for p in value):
            raise ValueError("must be a list of blob names (max 100)")
        return value
    if name == "deleted":
        if not isinstance(value, bool):
            raise ValueError("must be a boolean")
        return value
    raise ValueError("unknown field")


async def _next_seq(session: AsyncSession, owner_id: str) -> int:
    # Row-level lock via UPDATE serialises concurrent syncs per user on every backend.
    result = await session.execute(
        update(SyncCounter).where(SyncCounter.owner_id == owner_id).values(value=SyncCounter.value + 1)
    )
    if result.rowcount == 0:
        session.add(SyncCounter(owner_id=owner_id, value=1))
        await session.flush()
        return 1
    return (await session.execute(select(SyncCounter.value).where(SyncCounter.owner_id == owner_id))).scalar_one()


async def apply_change(session: AsyncSession, owner_id: str, change: ChangeIn) -> list[Conflict]:
    conflicts: list[Conflict] = []
    record = await session.get(Inspection, change.id)

    if record is not None and record.owner_id != owner_id:
        # Don't leak existence of other users' records; treat the whole change as invalid.
        return [Conflict(id=change.id, field=f, kept=None, rejected=v, reason="invalid") for f, v in change.fields.items()]

    is_new = record is None
    if is_new:
        record = Inspection(id=change.id, owner_id=owner_id, photos=[], field_ts={})

    field_ts = dict(record.field_ts or {})
    changed = is_new

    for name, raw in change.fields.items():
        try:
            value = validate_field(name, raw)
        except ValueError:
            conflicts.append(
                Conflict(id=change.id, field=name, kept=getattr(record, name, None), rejected=raw, reason="invalid")
            )
            continue

        ts = change.field_ts.get(name, 0)
        current = getattr(record, name) if not is_new or name in field_ts else None

        if name == "photos":
            merged = list(dict.fromkeys([*(record.photos or []), *value]))  # ordered union
            if merged != (record.photos or []):
                record.photos = merged
                field_ts[name] = max(ts, field_ts.get(name, 0))
                changed = True
            continue

        if ts > field_ts.get(name, 0):
            if current != value or is_new:
                setattr(record, name, value)
                changed = True
            field_ts[name] = ts
        elif current != value:
            conflicts.append(Conflict(id=change.id, field=name, kept=current, rejected=value, reason="stale"))

    if changed:
        record.field_ts = field_ts
        record.seq = await _next_seq(session, owner_id)
        session.add(record)
    return conflicts


async def pull(session: AsyncSession, owner_id: str, cursor: int) -> tuple[list[Inspection], bool]:
    rows = (
        (
            await session.execute(
                select(Inspection)
                .where(Inspection.owner_id == owner_id, Inspection.seq > cursor)
                .order_by(Inspection.seq)
                .limit(PAGE_SIZE + 1)
            )
        )
        .scalars()
        .all()
    )
    return list(rows[:PAGE_SIZE]), len(rows) > PAGE_SIZE
