# PROMPT: Generate smoke tests for the FastAPI endpoints: health check, dashboard HTML rendering,
# and a full ingest-then-query flow covering metrics, funnel, heatmap, and anomalies.
# CHANGES MADE: Simplified the test to use a TestClient per function to avoid shared state.
# Added assertions for response field types and funnel stage ordering.

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi.testclient import TestClient

from store_intelligence.api.main import app
from store_intelligence.schemas import EventType


def _event(visitor_id: str, event_type: EventType, ts: datetime, zone_id: str | None = None):
    return {
        "event_id": str(uuid4()),
        "store_id": "STORE_BLR_002",
        "camera_id": "CAM_ENTRY_01",
        "visitor_id": visitor_id,
        "event_type": event_type.value,
        "timestamp": ts.isoformat().replace("+00:00", "Z"),
        "zone_id": zone_id,
        "dwell_ms": 0,
        "is_staff": False,
        "confidence": 0.9,
        "metadata": {"queue_depth": 2 if event_type == EventType.BILLING_QUEUE_JOIN else None, "sku_zone": zone_id, "session_seq": 1},
    }


def test_api_health_and_dashboard_smoke():
    client = TestClient(app)

    health = client.get("/health")
    assert health.status_code == 200
    payload = health.json()
    assert payload["status"] == "ok"
    assert isinstance(payload["stores"], list)

    dash = client.get("/dashboard?store_id=STORE_BLR_002")
    assert dash.status_code == 200
    assert "Store Intelligence" in dash.text
    assert "STORE_BLR_002" in dash.text


def test_api_ingest_then_metrics_funnel_heatmap_anomalies():
    client = TestClient(app)
    now = datetime.now(timezone.utc)

    ingest = client.post(
        "/events/ingest",
        json=[
            _event("VIS_1", EventType.ENTRY, now),
            _event("VIS_1", EventType.ZONE_ENTER, now, zone_id="SKINCARE"),
            _event("VIS_2", EventType.ENTRY, now),
            _event("VIS_2", EventType.BILLING_QUEUE_JOIN, now, zone_id="BILLING"),
        ],
    )
    assert ingest.status_code == 200
    ingest_body = ingest.json()
    assert ingest_body["accepted"] == 4
    assert ingest_body["rejected"] == 0

    metrics = client.get("/stores/STORE_BLR_002/metrics")
    assert metrics.status_code == 200
    assert metrics.json()["store_id"] == "STORE_BLR_002"

    funnel = client.get("/stores/STORE_BLR_002/funnel")
    assert funnel.status_code == 200
    stages = funnel.json()["stages"]
    assert len(stages) == 4
    assert stages[0]["name"] == "Entry"

    heatmap = client.get("/stores/STORE_BLR_002/heatmap")
    assert heatmap.status_code == 200
    assert "data_confidence" in heatmap.json()

    anomalies = client.get("/stores/STORE_BLR_002/anomalies")
    assert anomalies.status_code == 200
    assert anomalies.json()["store_id"] == "STORE_BLR_002"
