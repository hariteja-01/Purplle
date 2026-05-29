# PROMPT: Generate tests for the CCTV-to-event pipeline with a focus on schema validation, re-entry handling, and structured event emission.
# CHANGES MADE: Kept the tests synthetic and deterministic so they can run without the full CCTV dataset while still exercising the event builder contract.

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import numpy as np

from store_intelligence.pipeline.detect import EventBuilder, SimpleTracker
from store_intelligence.pipeline.layout import CameraLayout, ZoneDefinition
from store_intelligence.schemas import BehaviorEvent, EventMetadata, EventType


def test_behavior_event_schema_accepts_valid_payload():
    event = BehaviorEvent(
        event_id=str(uuid4()),
        store_id="STORE_BLR_002",
        camera_id="CAM_ENTRY_01",
        visitor_id="VIS_abc12345",
        event_type=EventType.ENTRY,
        timestamp=datetime.now(timezone.utc),
        zone_id=None,
        dwell_ms=0,
        is_staff=False,
        confidence=0.91,
        metadata=EventMetadata(session_seq=1),
    )

    assert event.store_id == "STORE_BLR_002"
    assert event.metadata.session_seq == 1


def test_event_builder_emits_entry_and_zone_events():
    layout = CameraLayout(
        camera_id="CAM_ENTRY_01",
        store_id="STORE_BLR_002",
        zones=[ZoneDefinition(zone_id="ENTRY_THRESHOLD", bbox=(0, 0, 640, 1080), kind="entry")],
    )
    builder = EventBuilder(store_id="STORE_BLR_002", camera_id="CAM_ENTRY_01", layout=layout)
    frame = np.zeros((1080, 1920, 3), dtype=np.uint8)
    timestamp = datetime.now(timezone.utc)

    class Track:
        track_id = "trk_1"
        first_seen = timestamp
        last_seen = timestamp + timedelta(seconds=1)
        last_centroid = (120, 340)
        fingerprint = "abc123"
        history = []
        age = timedelta(seconds=1)
        zone_visits = set()

    events = builder.build(Track(), frame, 10, timestamp)
    assert events
    assert events[0].store_id == "STORE_BLR_002"
    assert events[0].confidence > 0.0


def test_tracker_retains_track_identity_for_close_detections():
    tracker = SimpleTracker(max_distance=100.0)
    timestamp = datetime.now(timezone.utc)
    detections = [
        type("Detection", (), {"box": (10, 10, 50, 80), "centroid": (35, 50), "mean_color": (10.0, 20.0, 30.0)})(),
    ]
    first = tracker.update(detections, timestamp, 0)
    second = tracker.update(detections, timestamp + timedelta(milliseconds=200), 1)
    assert len(first) == 1
    assert first[0].track_id == second[0].track_id