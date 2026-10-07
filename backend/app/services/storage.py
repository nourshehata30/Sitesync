"""
Photo storage.

Production: clients upload straight to Azure Blob Storage with a short-lived,
write-only, single-blob SAS minted from a *user delegation key* (Managed Identity,
no storage account keys anywhere). The API never proxies image bytes.

Local/dev/tests: same contract, but the "upload URL" points at this API.
"""

import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from ..config import get_settings
from ..schemas import UploadTicket

UPLOAD_TTL = 300
READ_TTL = 900


def new_blob_name(user_id: str) -> str:
    return f"{user_id}/{uuid.uuid4()}.jpg"


def blob_belongs_to(user_id: str, blob_name: str) -> bool:
    return blob_name.startswith(f"{user_id}/") and ".." not in blob_name


def _azure_sas(blob_name: str, *, write: bool) -> str:
    from azure.identity import DefaultAzureCredential
    from azure.storage.blob import BlobSasPermissions, BlobServiceClient, generate_blob_sas

    s = get_settings()
    account_url = f"https://{s.azure_storage_account}.blob.core.windows.net"
    now = datetime.now(timezone.utc)
    expiry = now + timedelta(seconds=UPLOAD_TTL if write else READ_TTL)
    client = BlobServiceClient(account_url, credential=DefaultAzureCredential())
    key = client.get_user_delegation_key(now - timedelta(minutes=1), expiry)
    token = generate_blob_sas(
        account_name=s.azure_storage_account,
        container_name=s.azure_storage_container,
        blob_name=blob_name,
        user_delegation_key=key,
        permission=BlobSasPermissions(create=True, write=True) if write else BlobSasPermissions(read=True),
        expiry=expiry,
        content_type="image/jpeg" if write else None,
    )
    return f"{account_url}/{s.azure_storage_container}/{blob_name}?{token}"


async def create_upload_ticket(user_id: str) -> UploadTicket:
    s = get_settings()
    blob_name = new_blob_name(user_id)
    if s.azure_storage_account:
        url = await asyncio.to_thread(_azure_sas, blob_name, write=True)
        headers = {"x-ms-blob-type": "BlockBlob", "Content-Type": "image/jpeg"}
    else:
        url = f"{s.public_base_url}/api/uploads/local/{blob_name}"
        headers = {"Content-Type": "image/jpeg"}
    return UploadTicket(blob_name=blob_name, upload_url=url, headers=headers, expires_in=UPLOAD_TTL)


async def create_read_url(blob_name: str) -> str:
    s = get_settings()
    if s.azure_storage_account:
        return await asyncio.to_thread(_azure_sas, blob_name, write=False)
    return f"{s.public_base_url}/api/uploads/local/{blob_name}"


def local_path(blob_name: str) -> Path:
    root = Path(get_settings().local_upload_dir).resolve()
    path = (root / blob_name).resolve()
    if root not in path.parents:
        raise ValueError("path traversal")
    return path
