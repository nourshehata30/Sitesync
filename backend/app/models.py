import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, BigInteger, Boolean, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Inspection(Base):
    """
    A field inspection. Every mutable field is a last-writer-wins register:
    `field_ts` stores the client edit time (epoch ms) of the winning write per field,
    so concurrent offline edits to *different* fields merge cleanly instead of one
    device clobbering the whole record.
    """

    __tablename__ = "inspections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)  # client-generated UUID
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)

    title: Mapped[str] = mapped_column(String(200), default="")
    site: Mapped[str] = mapped_column(String(200), default="")
    status: Mapped[str] = mapped_column(String(20), default="open")  # open | in_review | closed
    severity: Mapped[int] = mapped_column(Integer, default=1)  # 1 (low) .. 5 (critical)
    notes: Mapped[str] = mapped_column(Text, default="")
    photos: Mapped[list] = mapped_column(JSON, default=list)  # blob names
    deleted: Mapped[bool] = mapped_column(Boolean, default=False)

    field_ts: Mapped[dict] = mapped_column(JSON, default=dict)
    # Monotonic server sequence; clients pull "everything after cursor N".
    # Avoids clock-skew bugs that timestamps-as-cursors suffer from.
    seq: Mapped[int] = mapped_column(BigInteger, index=True, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    __table_args__ = (Index("ix_inspection_owner_seq", "owner_id", "seq"),)


class SyncCounter(Base):
    """Single-row-per-user sequence generator (portable across SQLite / PostgreSQL)."""

    __tablename__ = "sync_counters"

    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    value: Mapped[int] = mapped_column(BigInteger, default=0)
