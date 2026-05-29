# PROMPT: Build anomaly tests around queue pressure, dead-zone detection, and stale feed state.
# CHANGES MADE: Focused on deterministic thresholds so the tests verify the heuristic behavior without requiring live CCTV footage.

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from store_intelligence.analytics import compute_anomalies
from store_intelligence.repository import insert_pos_transactions
from store_intelligence.services import ingest_events
from store_intelligence.db import PosTransactionRecord
from store_intelligence.schemas import EventType


def _event(event_id: str, visitor_id: str, event_type: EventType, timestamp: datetime, zone_id: str | None = None, queue_depth: int | None = None):
    return {
        "event_id": event_id,
        "store_id": "STORE_BLR_002",
        "camera_id": "CAM_BILLING_01",
        "visitor_id": visitor_id,
        "event_type": event_type.value,
        "timestamp": timestamp.isoformat().replace("+00:00", "Z"),
        "zone_id": zone_id,
        "dwell_ms": 0,
        "is_staff": False,
        "confidence": 0.88,
        "metadata": {"queue_depth": queue_depth, "sku_zone": zone_id, "session_seq": 1},
    }


def test_queue_spike_anomaly_triggers(session):
    now = datetime.now(timezone.utc)
    payload = [_event(str(uuid4()), f"VIS_{i}", EventType.BILLING_QUEUE_JOIN, now - timedelta(minutes=1), zone_id="BILLING", queue_depth=5) for i in range(6)]
    ingest_events(session, payload)
    anomaly = compute_anomalies(session, "STORE_BLR_002")
    assert any(item["code"] == "BILLING_QUEUE_SPIKE" for item in anomaly.anomalies)


def test_dead_zone_anomaly_triggers_without_recent_visits(session):
    now = datetime.now(timezone.utc)
    ingest_events(session, [_event(str(uuid4()), "VIS_X", EventType.ENTRY, now - timedelta(hours=1), zone_id=None)])
    anomaly = compute_anomalies(session, "STORE_BLR_002")
    assert any(item["code"] == "DEAD_ZONE" for item in anomaly.anomalies)