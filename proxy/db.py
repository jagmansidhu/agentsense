"""Optional persistence layer.

If `DATABASE_URL` is set, AgentSense persists agents and events to that
database (Postgres or SQLite). Otherwise everything stays in-memory and the
proxy behaves exactly as it did before this module existed.

This module exposes:

- `is_enabled()` — quick flag for callers that want to short-circuit.
- `get_session()` — context manager yielding a SQLAlchemy Session.
- `init_db()` — creates tables on startup; safe to call multiple times.
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Iterator, Optional

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from proxy.models import Base


_DATABASE_URL = (os.environ.get("DATABASE_URL") or "").strip() or None
_engine: Optional[Engine] = None
_SessionLocal: Optional[sessionmaker[Session]] = None


def _build_engine(url: str) -> Engine:
    connect_args = {}
    if url.startswith("sqlite"):
        # SQLite + multithreaded FastAPI workers: allow cross-thread access.
        connect_args["check_same_thread"] = False
    return create_engine(url, future=True, pool_pre_ping=True, connect_args=connect_args)


def is_enabled() -> bool:
    return _DATABASE_URL is not None


def init_db() -> None:
    """Create tables if persistence is enabled."""
    global _engine, _SessionLocal
    if _DATABASE_URL is None:
        return
    if _engine is None:
        _engine = _build_engine(_DATABASE_URL)
        _SessionLocal = sessionmaker(bind=_engine, expire_on_commit=False, future=True)
    Base.metadata.create_all(_engine)


@contextmanager
def get_session() -> Iterator[Session]:
    """Yield a Session; commits on success, rolls back on error."""
    if _SessionLocal is None:
        init_db()
    if _SessionLocal is None:
        raise RuntimeError("DATABASE_URL is not configured; persistence is disabled")
    session = _SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def describe() -> str:
    """Human-readable summary for logs/health checks."""
    if _DATABASE_URL is None:
        return "in-memory (no DATABASE_URL set)"
    # Don't leak credentials.
    safe = _DATABASE_URL
    if "@" in safe:
        scheme, _, rest = safe.partition("://")
        creds, _, host = rest.partition("@")
        if ":" in creds:
            user, _, _password = creds.partition(":")
            safe = f"{scheme}://{user}:***@{host}"
    return safe
