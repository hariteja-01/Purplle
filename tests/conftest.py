from __future__ import annotations

import os
from datetime import datetime, timezone

import pytest

os.environ.setdefault("SI_DATABASE_URL", "sqlite:///./store_intelligence_test.db")

from store_intelligence.db import Base, SessionLocal, engine  # noqa: E402


@pytest.fixture(autouse=True)
def clean_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture()
def utc_now() -> datetime:
    return datetime.now(timezone.utc)