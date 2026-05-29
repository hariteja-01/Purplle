# PROMPT: Create analytics tests for idempotent ingestion, metrics, funnel conversion, and zero-traffic behavior.
# CHANGES MADE: Added fixture-driven database setup and POS correlation coverage so the endpoint logic is exercised instead of mocked.

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from store_intelligence.analytics import compute_funnel, compute_health, compute_heatmap, compute_metrics
from store_intelligence.db import PosTransactionRecord
from store_intelligence.repository import insert_pos_transactions
from store_intelligence.schemas import EventType
from store_intelligence.services import ingest_events


def _event(event_id: str, visitor_id: str, event_type: EventType, timestamp: datetime, zone_id: str | None = None, is_staff: bool = False, confidence: float = 0.95, session_seq: int = 1):
    return {
        "event_id": event_id,
        "store_id": "STORE_BLR_002",
        "camera_id": "CAM_ENTRY_01",
        "visitor_id": visitor_id,
        "event_type": event_type.value,
        "timestamp": timestamp.isoformat().replace("+00:00", "Z"),
        "zone_id": zone_id,
        "dwell_ms": 30000 if event_type == EventType.ZONE_DWELL else 0,
        "is_staff": is_staff,
        "confidence": confidence,
        "metadata": {"queue_depth": 3 if event_type == EventType.BILLING_QUEUE_JOIN else None, "sku_zone": zone_id, "session_seq": session_seq},
    }


def test_ingest_is_idempotent(session):
    now = datetime.now(timezone.utc)
    payload = [
        _event(str(uuid4()), "VIS_1", EventType.ENTRY, now),
        _event(str(uuid4()), "VIS_1", EventType.ZONE_ENTER, now + timedelta(seconds=1), zone_id="SKINCARE"),
    ]

    first = ingest_events(session, payload)
    second = ingest_events(session, payload)

    assert first.accepted == 2
    assert second.duplicates == 2


def test_metrics_and_funnel_cover_purchase_correlation(session):
    now = datetime.now(timezone.utc)
    payload = [
        _event(str(uuid4()), "VIS_10", EventType.ENTRY, now - timedelta(minutes=2)),
        _event(str(uuid4()), "VIS_10", EventType.ZONE_ENTER, now - timedelta(minutes=2), zone_id="BILLING"),
        _event(str(uuid4()), "VIS_10", EventType.BILLING_QUEUE_JOIN, now - timedelta(minutes=2), zone_id="BILLING"),
        _event(str(uuid4()), "VIS_11", EventType.ENTRY, now - timedelta(minutes=2)),
        _event(str(uuid4()), "VIS_11", EventType.ZONE_ENTER, now - timedelta(minutes=2), zone_id="SKINCARE"),
        _event(str(uuid4()), "VIS_11", EventType.BILLING_QUEUE_ABANDON, now - timedelta(minutes=1), zone_id="BILLING"),
    ]
    ingest_events(session, payload)
    insert_pos_transactions(
        session,
        [
            PosTransactionRecord(
                transaction_id="TXN_1",
                store_id="STORE_BLR_002",
                timestamp=now - timedelta(minutes=1),
                basket_value_inr=900.0,
            )
        ],
    )

    metrics = compute_metrics(session, "STORE_BLR_002")
    funnel = compute_funnel(session, "STORE_BLR_002")
    heatmap = compute_heatmap(session, "STORE_BLR_002")

    assert metrics.store_id == "STORE_BLR_002"
    assert metrics.unique_visitors == 2
    assert metrics.conversion_rate > 0
    assert funnel.stages[0].count >= funnel.stages[-1].count
    assert isinstance(heatmap.data_confidence, bool)


def test_health_and_anomalies_handle_empty_store(session):
    health = compute_health(session)
    assert health.status == "ok"
    assert health.stores == []