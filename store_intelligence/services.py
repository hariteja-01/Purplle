from __future__ import annotations

from typing import Any, Iterable

from pydantic import ValidationError
from sqlalchemy.orm import Session

from .analytics import compute_anomalies, compute_funnel, compute_health, compute_heatmap, compute_metrics
from .repository import upsert_events
from .schemas import BehaviorEvent, IngestResponse, IngestResultItem


def validate_events(payload: Iterable[Any]) -> tuple[list[BehaviorEvent], list[IngestResultItem]]:
    accepted: list[BehaviorEvent] = []
    results: list[IngestResultItem] = []
    for raw in payload:
        if not isinstance(raw, dict):
            results.append(IngestResultItem(event_id="invalid", status="rejected", detail="event must be an object"))
            continue
        try:
            event = BehaviorEvent.model_validate(raw)
        except ValidationError as exc:
            event_id = raw.get("event_id", "invalid")
            detail = exc.errors()[0]["msg"] if exc.errors() else "invalid event"
            results.append(IngestResultItem(event_id=event_id, status="rejected", detail=detail))
            continue
        accepted.append(event)
        results.append(IngestResultItem(event_id=event.event_id, status="accepted"))
    return accepted, results


def ingest_events(session: Session, raw_events: list[Any]) -> IngestResponse:
    events, results = validate_events(raw_events)
    inserted, _rejected, duplicates, duplicate_ids = upsert_events(session, events)

    rejected_count = sum(1 for item in results if item.status == "rejected")
    for item in results:
        if item.status == "accepted" and item.event_id in duplicate_ids:
            item.status = "duplicate"

    return IngestResponse(
        accepted=int(inserted),
        rejected=int(rejected_count),
        duplicates=int(duplicates),
        results=results,
    )


def store_metrics(session: Session, store_id: str):
    return compute_metrics(session, store_id)


def store_funnel(session: Session, store_id: str):
    return compute_funnel(session, store_id)


def store_heatmap(session: Session, store_id: str):
    return compute_heatmap(session, store_id)


def store_anomalies(session: Session, store_id: str):
    return compute_anomalies(session, store_id)


def health_status(session: Session):
    return compute_health(session)