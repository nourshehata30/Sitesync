from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import current_user
from ..db import get_session
from ..models import User
from ..schemas import InspectionOut, SyncRequest, SyncResponse
from ..services import sync as engine

router = APIRouter(prefix="/api", tags=["sync"])


@router.post("/sync", response_model=SyncResponse)
async def sync(
    body: SyncRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> SyncResponse:
    """Push local changes, then pull everything newer than `cursor`, in one round trip."""
    conflicts = []
    for change in body.changes:
        conflicts.extend(await engine.apply_change(session, user.id, change))
    await session.commit()

    rows, has_more = await engine.pull(session, user.id, body.cursor)
    cursor = rows[-1].seq if rows else body.cursor
    return SyncResponse(
        cursor=cursor,
        has_more=has_more,
        records=[InspectionOut.model_validate(r, from_attributes=True) for r in rows],
        conflicts=conflicts,
    )
