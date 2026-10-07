from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field

Status = Literal["open", "in_review", "closed"]


class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class InspectionOut(BaseModel):
    id: str
    title: str
    site: str
    status: Status
    severity: int
    notes: str
    photos: list[str]
    deleted: bool
    field_ts: dict[str, int]
    seq: int


class ChangeIn(BaseModel):
    """A client patch: only the fields edited while offline, each with its edit time (epoch ms)."""

    id: str = Field(min_length=36, max_length=36)
    fields: dict[str, Any]
    field_ts: dict[str, int]


class SyncRequest(BaseModel):
    cursor: int = 0
    changes: list[ChangeIn] = Field(default_factory=list, max_length=500)


class Conflict(BaseModel):
    id: str
    field: str
    kept: Any  # value the server kept
    rejected: Any  # value the client tried to write
    reason: Literal["stale", "invalid"]


class SyncResponse(BaseModel):
    cursor: int
    has_more: bool
    records: list[InspectionOut]
    conflicts: list[Conflict]


class UploadTicket(BaseModel):
    blob_name: str
    upload_url: str
    headers: dict[str, str]
    expires_in: int
