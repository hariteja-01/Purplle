from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session
from sqlalchemy.sql import case

try:  # sqlite-specific UPSERT
    from sqlalchemy.dialects.sqlite import insert as sqlite_insert
except Exception:  # pragma: no cover
    sqlite_insert = None  # type: ignore[assignment]

from .db import EventRecord, PosTransactionRecord, StoreStateRecord
from .schemas import BehaviorEvent, EventType


def upsert_events(session: Session, events: list[BehaviorEvent]) -> tuple[int, int, int, set[str]]:
    if not events:
        return 0, 0, 0, set()

    event_ids = [event.event_id for event in events]
    existing_ids = set(session.scalars(select(EventRecord.event_id).where(EventRecord.event_id.in_(event_ids))).all())

    duplicates = 0
    to_insert: list[dict[str, object]] = []
    store_last_event: dict[str, datetime] = {}
    store_queue_depth: dict[str, int] = {}

    for event in events:
        if event.event_id in existing_ids:
            duplicates += 1
            continue
        to_insert.append(
            {
                "event_id": event.event_id,
                "store_id": event.store_id,
                "camera_id": event.camera_id,
                "visitor_id": event.visitor_id,
                "event_type": event.event_type.value,
                "timestamp": event.timestamp,
                "zone_id": event.zone_id,
                "dwell_ms": event.dwell_ms,
                "is_staff": event.is_staff,
                "confidence": event.confidence,
                "metadata_json": event.metadata.model_dump_json(),
            }
        )
        previous = store_last_event.get(event.store_id)
        store_last_event[event.store_id] = event.timestamp if previous is None else max(previous, event.timestamp)
        if event.event_type == EventType.BILLING_QUEUE_JOIN and event.metadata.queue_depth is not None:
            store_queue_depth[event.store_id] = max(int(event.metadata.queue_depth), store_queue_depth.get(event.store_id, 0))

    accepted = len(to_insert)
    if accepted == 0:
        return 0, 0, duplicates, existing_ids

    try:
        session.execute(EventRecord.__table__.insert(), to_insert)
        _upsert_store_state(session, store_last_event, store_queue_depth)
        session.commit()
    except Exception:
        session.rollback()
        raise

    return accepted, 0, duplicates, existing_ids


def _upsert_store_state(session: Session, store_last_event: dict[str, datetime], store_queue_depth: dict[str, int]) -> None:
    if not store_last_event:
        return

    for store_id, last_event_ts in store_last_event.items():
        queue_depth = int(store_queue_depth.get(store_id, 0))
        if sqlite_insert is None or not session.bind or session.bind.dialect.name != "sqlite":
            # Fallback path: ORM merge (sufficient for non-SQLite backends in this challenge).
            existing = session.get(StoreStateRecord, store_id)
            if existing is None:
                session.add(StoreStateRecord(store_id=store_id, last_event_timestamp=last_event_ts, active_queue_depth=queue_depth))
            else:
                if existing.last_event_timestamp is None or last_event_ts > existing.last_event_timestamp:
                    existing.last_event_timestamp = last_event_ts
                existing.active_queue_depth = max(existing.active_queue_depth, queue_depth)
            continue

        stmt = sqlite_insert(StoreStateRecord).values(
            store_id=store_id,
            last_event_timestamp=last_event_ts,
            active_queue_depth=queue_depth,
            updated_at=utc_now(),
        )
        excluded = stmt.excluded
        stmt = stmt.on_conflict_do_update(
            index_elements=[StoreStateRecord.store_id],
            set_={
                "last_event_timestamp": case(
                    (StoreStateRecord.last_event_timestamp.is_(None), excluded.last_event_timestamp),
                    (StoreStateRecord.last_event_timestamp < excluded.last_event_timestamp, excluded.last_event_timestamp),
                    else_=StoreStateRecord.last_event_timestamp,
                ),
                "active_queue_depth": case(
                    (StoreStateRecord.active_queue_depth < excluded.active_queue_depth, excluded.active_queue_depth),
                    else_=StoreStateRecord.active_queue_depth,
                ),
                "updated_at": excluded.updated_at,
            },
        )
        session.execute(stmt)


def insert_pos_transactions(session: Session, rows: list[PosTransactionRecord]) -> int:
    inserted = 0
    for row in rows:
        if session.get(PosTransactionRecord, row.transaction_id) is None:
            session.add(row)
            inserted += 1
    session.commit()
    return inserted


def get_store_events(session: Session, store_id: str, start: datetime | None = None, end: datetime | None = None) -> list[EventRecord]:
    statement = select(EventRecord).where(EventRecord.store_id == store_id)
    if start is not None:
        statement = statement.where(EventRecord.timestamp >= start)
    if end is not None:
        statement = statement.where(EventRecord.timestamp <= end)
    statement = statement.order_by(EventRecord.timestamp.asc())
    return list(session.execute(statement).scalars())


def get_store_transactions(session: Session, store_id: str, start: datetime | None = None, end: datetime | None = None) -> list[PosTransactionRecord]:
    statement = select(PosTransactionRecord).where(PosTransactionRecord.store_id == store_id)
    if start is not None:
        statement = statement.where(PosTransactionRecord.timestamp >= start)
    if end is not None:
        statement = statement.where(PosTransactionRecord.timestamp <= end)
    statement = statement.order_by(PosTransactionRecord.timestamp.asc())
    return list(session.execute(statement).scalars())


def get_distinct_stores(session: Session) -> list[str]:
    stores = session.execute(select(EventRecord.store_id).distinct()).all()
    return [row[0] for row in stores]


def start_of_day(value: datetime | None = None) -> datetime:
    value = value or utc_now()
    return value.astimezone(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)


def days_ago(days: int) -> datetime:
    return utc_now() - timedelta(days=days)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def get_recent_zone_visits(session: Session, store_id: str, window_start: datetime) -> dict[str, list[EventRecord]]:
    rows = get_store_events(session, store_id, start=window_start)
    by_zone: dict[str, list[EventRecord]] = defaultdict(list)
    for row in rows:
        if row.zone_id:
            by_zone[row.zone_id].append(row)
    return by_zone