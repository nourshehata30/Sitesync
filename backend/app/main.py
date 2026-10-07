import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .config import get_settings
from .db import init_models
from .routers import auth, sync, uploads

log = logging.getLogger("sitesync")


def _setup_telemetry() -> None:
    conn = get_settings().applicationinsights_connection_string
    if not conn:
        return
    from azure.monitor.opentelemetry import configure_azure_monitor

    configure_azure_monitor(connection_string=conn)  # traces, metrics, logs -> App Insights
    log.info("Azure Monitor OpenTelemetry enabled")


@asynccontextmanager
async def lifespan(_: FastAPI):
    _setup_telemetry()
    await init_models()  # swap for Alembic migrations in a longer-lived deployment
    yield


app = FastAPI(title="SiteSync API", version="1.0.0", lifespan=lifespan)
app.include_router(auth.router)
app.include_router(sync.router)
app.include_router(uploads.router)


@app.get("/healthz", tags=["ops"])
async def healthz() -> dict[str, str]:
    return {"status": "ok"}
