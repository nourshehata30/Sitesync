from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Local dev uses SQLite; in Azure this is a PostgreSQL Flexible Server URL
    # (postgresql+asyncpg://...) injected from Key Vault via Container Apps secrets.
    database_url: str = "sqlite+aiosqlite:///./sitesync.db"

    jwt_secret: str = "dev-only-change-me"
    jwt_ttl_minutes: int = 60 * 12

    # When set, uploads go to Azure Blob Storage using short-lived SAS URLs
    # (managed identity / user-delegation key). When empty, a local fallback is used.
    azure_storage_account: str = ""
    azure_storage_container: str = "inspection-photos"
    local_upload_dir: str = "./.uploads"

    # Set automatically by Bicep; enables OpenTelemetry -> Application Insights.
    applicationinsights_connection_string: str = ""

    public_base_url: str = "http://localhost:8000"


@lru_cache
def get_settings() -> Settings:
    return Settings()
