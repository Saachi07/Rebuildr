"""Application configuration loaded from environment variables.

Two database modes are supported:

* **Supabase / Postgres** — set ``DATABASE_URL`` to the Postgres connection
  string (Supabase dashboard → Project Settings → Database → Connection string,
  URI format). Example::

      postgresql+psycopg://postgres:<password>@db.<ref>.supabase.co:5432/postgres

* **SQLite fallback** — if ``DATABASE_URL`` is unset, the app falls back to a
  local SQLite file at ``backend/instance/rebuildr.db``. This is the
  "Supabase is flaky" escape hatch called out in roadmap.md.
"""

from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
INSTANCE_DIR = BASE_DIR / "instance"
INSTANCE_DIR.mkdir(exist_ok=True)


def _normalize_db_url(url: str) -> str:
    # Supabase exposes URLs as ``postgres://`` but SQLAlchemy requires
    # ``postgresql+psycopg://``.
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://") :]
    if url.startswith("postgresql://") and "+psycopg" not in url:
        return "postgresql+psycopg://" + url[len("postgresql://") :]
    return url


class Config:
    SECRET_KEY = os.environ.get("FLASK_SECRET_KEY", "dev-only-change-me")

    _db_url = os.environ.get("DATABASE_URL")
    SQLALCHEMY_DATABASE_URI = (
        _normalize_db_url(_db_url)
        if _db_url
        else f"sqlite:///{INSTANCE_DIR / 'rebuildr.db'}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    SUPABASE_URL = os.environ.get("SUPABASE_URL")
    SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
    GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")


class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
