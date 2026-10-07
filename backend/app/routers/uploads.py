from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import FileResponse

from ..auth import current_user
from ..models import User
from ..schemas import UploadTicket
from ..services import storage

router = APIRouter(prefix="/api/uploads", tags=["uploads"])
MAX_PHOTO_BYTES = 10 * 1024 * 1024


@router.post("/ticket", response_model=UploadTicket)
async def upload_ticket(user: User = Depends(current_user)) -> UploadTicket:
    """Mint a short-lived, write-only URL for one photo."""
    return await storage.create_upload_ticket(user.id)


@router.get("/read-url")
async def read_url(blob_name: str, user: User = Depends(current_user)) -> dict[str, str]:
    if not storage.blob_belongs_to(user.id, blob_name):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    return {"url": await storage.create_read_url(blob_name)}


# --- local fallback (dev / tests only; in Azure clients talk to Blob Storage directly) ---


@router.put("/local/{user_id}/{name}", status_code=status.HTTP_201_CREATED)
async def local_put(user_id: str, name: str, request: Request, user: User = Depends(current_user)) -> Response:
    blob_name = f"{user_id}/{name}"
    if not storage.blob_belongs_to(user.id, blob_name):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Forbidden")
    body = await request.body()
    if len(body) > MAX_PHOTO_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Photo too large")
    path = storage.local_path(blob_name)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(body)
    return Response(status_code=status.HTTP_201_CREATED)


@router.get("/local/{user_id}/{name}")
async def local_get(user_id: str, name: str, user: User = Depends(current_user)) -> FileResponse:
    blob_name = f"{user_id}/{name}"
    if not storage.blob_belongs_to(user.id, blob_name):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    path = storage.local_path(blob_name)
    if not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    return FileResponse(path, media_type="image/jpeg")
