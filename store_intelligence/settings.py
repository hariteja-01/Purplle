from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SI_", case_sensitive=False)

    app_name: str = "store-intelligence"
    environment: str = Field(default="local")
    database_url: str = Field(default="sqlite:///./store_intelligence.db")
    api_host: str = Field(default="0.0.0.0")
    api_port: int = Field(default=8000)
    data_dir: Path = Field(default=Path("./data"))
    pos_csv_path: Path | None = None
    dashboard_refresh_ms: int = 3000
    stale_feed_minutes: int = 10
    dead_zone_minutes: int = 30
    conversion_window_minutes: int = 5
    queue_spike_threshold: int = 4
    min_sessions_for_confidence: int = 20


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    s = Settings()
    import os
    if (os.environ.get("VERCEL") == "1" or os.environ.get("VERCEL_ENV") is not None) and s.database_url == "sqlite:///./store_intelligence.db":
        s.database_url = "sqlite:////tmp/store_intelligence.db"
    return s