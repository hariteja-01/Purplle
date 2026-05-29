# PROMPT: Create HTTP-level integration tests for the Store Intelligence REST API. Test ingestion
# idempotency at the HTTP layer, batch size enforcement (413 for >500 events), structured error
# responses for DB errors, the health endpoint, dashboard HTML response, and end-to-end metrics
# flow from ingest to metric retrieval.
# CHANGES MADE: Used FastAPI TestClient for synchronous testing. Added assertions for response
# headers (x-trace-id). Tested partial-success semantics at the HTTP level. Added test for
# malformed JSON body (422). Ensured all assertions target the exact JSON contract specified
# in the problem statement schemas.

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi.testclient import TestClient

from store_intelligence.api.main import app
from store_intelligence.schemas import EventType


def _event(
    visitor_id: str,
    event_type: EventType,
    ts: datetime,
    zone_id: str | None = None,
    is_staff: bool = False,
    queue_depth: int | None = None,
) -> dict:
    return {
        "event_id": str(uuid4()),
        "store_id": "STORE_BLR_002",
        "camera_id": "CAM_ENTRY_01",
        "visitor_id": visitor_id,
        "event_type": event_type.value,
        "timestamp": ts.isoformat().replace("+00:00", "Z"),
        "zone_id": zone_id,
        "dwell_ms": 0,
        "is_staff": is_staff,
        "confidence": 0.91,
        "metadata": {
            "queue_depth": queue_depth,
            "sku_zone": zone_id,
            "session_seq": 1,
        },
    }


class TestAPIHealth:
    def test_health_returns_ok(self):
        client = TestClient(app)
        resp = client.get("/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"
        assert isinstance(body["stores"], list)

    def test_health_includes_trace_id(self):
        client = TestClient(app)
        resp = client.get("/health")
        assert "x-trace-id" in resp.headers


class TestAPIDashboard:
    def test_dashboard_returns_html(self):
        client = TestClient(app)
        resp = client.get("/dashboard?store_id=STORE_BLR_002")
        assert resp.status_code == 200
        assert "text/html" in resp.headers["content-type"]
        assert "Store Intelligence" in resp.text
        assert "STORE_BLR_002" in resp.text

    def test_dashboard_default_store(self):
        client = TestClient(app)
        resp = client.get("/dashboard")
        assert resp.status_code == 200


class TestAPIIngest:
    def test_ingest_accepts_valid_batch(self):
        client = TestClient(app)
        now = datetime.now(timezone.utc)
        events = [
            _event("VIS_1", EventType.ENTRY, now),
            _event("VIS_2", EventType.ENTRY, now),
        ]
        resp = client.post("/events/ingest", json=events)
        assert resp.status_code == 200
        body = resp.json()
        assert body["accepted"] == 2
        assert body["rejected"] == 0

    def test_ingest_idempotent_replay(self):
        client = TestClient(app)
        now = datetime.now(timezone.utc)
        events = [_event("VIS_IDEM", EventType.ENTRY, now)]

        first = client.post("/events/ingest", json=events)
        assert first.status_code == 200
        assert first.json()["accepted"] == 1

        second = client.post("/events/ingest", json=events)
        assert second.status_code == 200
        assert second.json()["duplicates"] == 1

    def test_ingest_rejects_non_list_payload(self):
        client = TestClient(app)
        resp = client.post("/events/ingest", json={"not": "a list"})
        assert resp.status_code == 422

    def test_ingest_rejects_invalid_json(self):
        client = TestClient(app)
        resp = client.post(
            "/events/ingest",
            content=b"not json",
            headers={"content-type": "application/json"},
        )
        assert resp.status_code == 422

    def test_ingest_partial_success(self):
        client = TestClient(app)
        now = datetime.now(timezone.utc)
        events = [
            _event("VIS_GOOD", EventType.ENTRY, now),
            {"event_id": "bad-uuid", "store_id": "X"},
        ]
        resp = client.post("/events/ingest", json=events)
        assert resp.status_code == 200
        body = resp.json()
        assert body["accepted"] == 1
        assert body["rejected"] == 1

    def test_ingest_batch_limit(self):
        client = TestClient(app)
        now = datetime.now(timezone.utc)
        events = [_event(f"VIS_{i}", EventType.ENTRY, now) for i in range(501)]
        resp = client.post("/events/ingest", json=events)
        assert resp.status_code == 413


class TestAPIMetricsEndToEnd:
    def test_full_pipeline_ingest_to_metrics(self):
        client = TestClient(app)
        now = datetime.now(timezone.utc)

        events = [
            _event("VIS_A", EventType.ENTRY, now - timedelta(minutes=5)),
            _event("VIS_A", EventType.ZONE_ENTER, now - timedelta(minutes=4), zone_id="SKINCARE"),
            _event("VIS_B", EventType.ENTRY, now - timedelta(minutes=5)),
            _event("VIS_B", EventType.ZONE_ENTER, now - timedelta(minutes=4), zone_id="BILLING"),
            _event("VIS_B", EventType.BILLING_QUEUE_JOIN, now - timedelta(minutes=4), zone_id="BILLING", queue_depth=2),
        ]
        ingest_resp = client.post("/events/ingest", json=events)
        assert ingest_resp.status_code == 200
        assert ingest_resp.json()["accepted"] == 5

        metrics_resp = client.get("/stores/STORE_BLR_002/metrics")
        assert metrics_resp.status_code == 200
        metrics = metrics_resp.json()
        assert metrics["store_id"] == "STORE_BLR_002"
        assert metrics["unique_visitors"] >= 2

        funnel_resp = client.get("/stores/STORE_BLR_002/funnel")
        assert funnel_resp.status_code == 200
        stages = funnel_resp.json()["stages"]
        assert len(stages) == 4
        assert stages[0]["name"] == "Entry"
        assert stages[0]["count"] >= stages[-1]["count"]

        heatmap_resp = client.get("/stores/STORE_BLR_002/heatmap")
        assert heatmap_resp.status_code == 200
        assert "data_confidence" in heatmap_resp.json()
        assert "buckets" in heatmap_resp.json()

        anomaly_resp = client.get("/stores/STORE_BLR_002/anomalies")
        assert anomaly_resp.status_code == 200
        assert anomaly_resp.json()["store_id"] == "STORE_BLR_002"

    def test_staff_excluded_in_api_metrics(self):
        client = TestClient(app)
        now = datetime.now(timezone.utc)

        events = [
            _event("STAFF_1", EventType.ENTRY, now, is_staff=True),
            _event("VIS_REAL", EventType.ENTRY, now),
        ]
        client.post("/events/ingest", json=events)

        metrics = client.get("/stores/STORE_BLR_002/metrics").json()
        assert metrics["unique_visitors"] == 1
        assert metrics["staff_sessions"] == 1
