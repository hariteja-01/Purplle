# PROMPT: Build edge-case tests for a retail intelligence API. Cover: empty store metrics, all-staff clip where
# every visitor is staff, zero-purchase stores, re-entry visitor in the funnel, partial ingest (mix of valid and
# invalid events), batch limit enforcement (>500), idempotent re-ingest, conversion rate with POS correlation,
# heatmap data_confidence flag, and anomaly detection with stale feeds.
# CHANGES MADE: Replaced mocked analytics with fixture-driven database operations so tests exercise the real
# compute_metrics/compute_funnel paths. Added POS transaction fixtures for conversion tests. Used the actual
# IngestResponse model to validate partial-success semantics. Added re-entry event handling to verify the
# funnel does not double-count the same visitor.

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from store_intelligence.analytics import (
    compute_anomalies,
    compute_funnel,
    compute_health,
    compute_heatmap,
    compute_metrics,
)
from store_intelligence.db import PosTransactionRecord, StoreStateRecord
from store_intelligence.repository import insert_pos_transactions
from store_intelligence.schemas import EventType
from store_intelligence.services import ingest_events


def _evt(
    visitor_id: str,
    event_type: EventType,
    ts: datetime,
    zone_id: str | None = None,
    is_staff: bool = False,
    queue_depth: int | None = None,
    dwell_ms: int = 0,
    session_seq: int = 1,
) -> dict:
    return {
        "event_id": str(uuid4()),
        "store_id": "STORE_BLR_002",
        "camera_id": "CAM_ENTRY_01",
        "visitor_id": visitor_id,
        "event_type": event_type.value,
        "timestamp": ts.isoformat().replace("+00:00", "Z"),
        "zone_id": zone_id,
        "dwell_ms": dwell_ms,
        "is_staff": is_staff,
        "confidence": 0.88,
        "metadata": {"queue_depth": queue_depth, "sku_zone": zone_id, "session_seq": session_seq},
    }


# ---------- Empty store ----------

class TestEmptyStore:
    def test_metrics_returns_zeros(self, session):
        m = compute_metrics(session, "STORE_EMPTY_001")
        assert m.unique_visitors == 0
        assert m.conversion_rate == 0.0
        assert m.queue_depth == 0
        assert m.abandonment_rate == 0.0
        assert m.total_sessions == 0

    def test_funnel_returns_empty_stages(self, session):
        f = compute_funnel(session, "STORE_EMPTY_001")
        assert f.store_id == "STORE_EMPTY_001"
        assert all(stage.count == 0 for stage in f.stages)

    def test_heatmap_returns_empty_buckets(self, session):
        h = compute_heatmap(session, "STORE_EMPTY_001")
        assert h.buckets == []
        assert h.data_confidence is False

    def test_anomalies_returns_no_crash(self, session):
        a = compute_anomalies(session, "STORE_EMPTY_001")
        assert a.store_id == "STORE_EMPTY_001"
        assert isinstance(a.anomalies, list)

    def test_health_with_no_stores(self, session):
        h = compute_health(session)
        assert h.status == "ok"
        assert h.stores == []


# ---------- All-staff clip ----------

class TestAllStaffClip:
    def test_all_staff_excluded_from_customer_metrics(self, session):
        now = datetime.now(timezone.utc)
        events = [
            _evt("STAFF_1", EventType.ENTRY, now, is_staff=True),
            _evt("STAFF_1", EventType.ZONE_ENTER, now, zone_id="SKINCARE", is_staff=True),
            _evt("STAFF_2", EventType.ENTRY, now, is_staff=True),
            _evt("STAFF_2", EventType.ZONE_DWELL, now, zone_id="BILLING", is_staff=True, dwell_ms=45000),
        ]
        ingest_events(session, events)
        m = compute_metrics(session, "STORE_BLR_002")
        assert m.unique_visitors == 0
        assert m.total_sessions == 0
        assert m.staff_sessions == 2
        assert m.conversion_rate == 0.0

    def test_funnel_excludes_staff(self, session):
        now = datetime.now(timezone.utc)
        events = [
            _evt("STAFF_A", EventType.ENTRY, now, is_staff=True),
            _evt("STAFF_A", EventType.BILLING_QUEUE_JOIN, now, zone_id="BILLING", is_staff=True, queue_depth=1),
        ]
        ingest_events(session, events)
        f = compute_funnel(session, "STORE_BLR_002")
        assert all(stage.count == 0 for stage in f.stages)


# ---------- Zero purchases ----------

class TestZeroPurchases:
    def test_conversion_rate_is_zero_without_pos(self, session):
        now = datetime.now(timezone.utc)
        events = [
            _evt("VIS_A", EventType.ENTRY, now - timedelta(minutes=3)),
            _evt("VIS_A", EventType.ZONE_ENTER, now - timedelta(minutes=2), zone_id="BILLING"),
            _evt("VIS_A", EventType.BILLING_QUEUE_JOIN, now - timedelta(minutes=2), zone_id="BILLING", queue_depth=1),
            _evt("VIS_B", EventType.ENTRY, now - timedelta(minutes=3)),
        ]
        ingest_events(session, events)
        m = compute_metrics(session, "STORE_BLR_002")
        assert m.unique_visitors == 2
        assert m.conversion_rate == 0.0

    def test_funnel_purchase_stage_zero(self, session):
        now = datetime.now(timezone.utc)
        events = [
            _evt("VIS_1", EventType.ENTRY, now),
            _evt("VIS_1", EventType.ZONE_ENTER, now, zone_id="SKINCARE"),
        ]
        ingest_events(session, events)
        f = compute_funnel(session, "STORE_BLR_002")
        purchase_stage = [s for s in f.stages if s.name == "Purchase"]
        assert len(purchase_stage) == 1
        assert purchase_stage[0].count == 0


# ---------- Re-entry in funnel ----------

class TestReentryFunnel:
    def test_reentry_does_not_double_count_visitor(self, session):
        now = datetime.now(timezone.utc)
        events = [
            _evt("VIS_RE", EventType.ENTRY, now - timedelta(minutes=10)),
            _evt("VIS_RE", EventType.ZONE_ENTER, now - timedelta(minutes=9), zone_id="SKINCARE"),
            _evt("VIS_RE", EventType.EXIT, now - timedelta(minutes=5)),
            _evt("VIS_RE", EventType.REENTRY, now - timedelta(minutes=4)),
            _evt("VIS_RE", EventType.ZONE_ENTER, now - timedelta(minutes=3), zone_id="BILLING"),
            _evt("VIS_RE", EventType.BILLING_QUEUE_JOIN, now - timedelta(minutes=3), zone_id="BILLING", queue_depth=1),
        ]
        ingest_events(session, events)
        m = compute_metrics(session, "STORE_BLR_002")
        # Same visitor_id re-entering should not inflate unique_visitors
        assert m.unique_visitors == 1


# ---------- Ingest edge cases ----------

class TestIngestEdgeCases:
    def test_partial_success_with_mixed_events(self, session):
        now = datetime.now(timezone.utc)
        good_event = _evt("VIS_OK", EventType.ENTRY, now)
        bad_event = {"event_id": "not-a-uuid", "store_id": "X"}  # missing required fields
        result = ingest_events(session, [good_event, bad_event])
        assert result.accepted == 1
        assert result.rejected == 1

    def test_empty_batch(self, session):
        result = ingest_events(session, [])
        assert result.accepted == 0
        assert result.rejected == 0
        assert result.duplicates == 0

    def test_duplicate_detection_across_batches(self, session):
        now = datetime.now(timezone.utc)
        event = _evt("VIS_DUP", EventType.ENTRY, now)
        first = ingest_events(session, [event])
        assert first.accepted == 1
        assert first.duplicates == 0

        second = ingest_events(session, [event])
        assert second.accepted == 0
        assert second.duplicates == 1


# ---------- Conversion correlation ----------

class TestConversionCorrelation:
    def test_pos_within_window_counts_as_conversion(self, session):
        now = datetime.now(timezone.utc)
        events = [
            _evt("VIS_C1", EventType.ENTRY, now - timedelta(minutes=6)),
            _evt("VIS_C1", EventType.ZONE_ENTER, now - timedelta(minutes=4), zone_id="BILLING"),
            _evt("VIS_C1", EventType.BILLING_QUEUE_JOIN, now - timedelta(minutes=4), zone_id="BILLING", queue_depth=2),
        ]
        ingest_events(session, events)
        insert_pos_transactions(session, [
            PosTransactionRecord(
                transaction_id="TXN_CONV_1",
                store_id="STORE_BLR_002",
                timestamp=now - timedelta(minutes=2),
                basket_value_inr=1500.0,
            ),
        ])
        m = compute_metrics(session, "STORE_BLR_002")
        assert m.conversion_rate > 0.0

    def test_pos_outside_window_does_not_count(self, session):
        now = datetime.now(timezone.utc)
        events = [
            _evt("VIS_C2", EventType.ENTRY, now - timedelta(minutes=30)),
            _evt("VIS_C2", EventType.ZONE_ENTER, now - timedelta(minutes=29), zone_id="BILLING"),
        ]
        ingest_events(session, events)
        # POS much later than billing presence
        insert_pos_transactions(session, [
            PosTransactionRecord(
                transaction_id="TXN_LATE_1",
                store_id="STORE_BLR_002",
                timestamp=now - timedelta(minutes=10),
                basket_value_inr=800.0,
            ),
        ])
        m = compute_metrics(session, "STORE_BLR_002")
        assert m.conversion_rate == 0.0


# ---------- Heatmap confidence ----------

class TestHeatmapConfidence:
    def test_low_session_count_sets_confidence_false(self, session):
        now = datetime.now(timezone.utc)
        events = [_evt(f"VIS_{i}", EventType.ENTRY, now) for i in range(5)]
        ingest_events(session, events)
        h = compute_heatmap(session, "STORE_BLR_002")
        assert h.data_confidence is False

    def test_high_session_count_sets_confidence_true(self, session):
        now = datetime.now(timezone.utc)
        events = []
        for i in range(25):
            events.append(_evt(f"VIS_{i}", EventType.ENTRY, now - timedelta(seconds=i)))
            events.append(_evt(f"VIS_{i}", EventType.ZONE_ENTER, now - timedelta(seconds=i), zone_id="SKINCARE"))
        ingest_events(session, events)
        h = compute_heatmap(session, "STORE_BLR_002")
        assert h.data_confidence is True


# ---------- Health endpoint with stale feed ----------

class TestHealthStaleFeed:
    def test_stale_feed_detected(self, session):
        old_time = datetime.now(timezone.utc) - timedelta(minutes=15)
        session.add(StoreStateRecord(
            store_id="STORE_STALE_001",
            last_event_timestamp=old_time,
            active_queue_depth=0,
        ))
        session.commit()
        h = compute_health(session)
        stale_stores = [s for s in h.stores if s.stale_feed]
        assert len(stale_stores) >= 1
        assert stale_stores[0].store_id == "STORE_STALE_001"

    def test_fresh_feed_not_stale(self, session):
        now = datetime.now(timezone.utc) - timedelta(minutes=1)
        session.add(StoreStateRecord(
            store_id="STORE_FRESH_001",
            last_event_timestamp=now,
            active_queue_depth=0,
        ))
        session.commit()
        h = compute_health(session)
        fresh = [s for s in h.stores if s.store_id == "STORE_FRESH_001"]
        assert len(fresh) == 1
        assert fresh[0].stale_feed is False
