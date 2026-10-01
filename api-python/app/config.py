from __future__ import annotations

import os
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = (
        "postgresql+psycopg://hub:hub_secret@localhost:5432/learning_hub"
    )
    tracks_dir: str = str(Path(__file__).resolve().parents[2] / "tracks")
    cors_origins: str = "http://localhost:3000"
    snapshots_dir: str = str(Path(__file__).resolve().parents[2] / "snapshots")
    max_code_chars: int = 20_000
    runner_timeout_sec: float = 8.0

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
# Allow env override without pydantic field rename friction
if os.getenv("DATABASE_URL"):
    settings.database_url = os.environ["DATABASE_URL"]
if os.getenv("TRACKS_DIR"):
    settings.tracks_dir = os.environ["TRACKS_DIR"]
if os.getenv("CORS_ORIGINS"):
    settings.cors_origins = os.environ["CORS_ORIGINS"]
