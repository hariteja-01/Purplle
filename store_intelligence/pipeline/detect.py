from __future__ import annotations

import argparse
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

import cv2
import numpy as np

from ..schemas import BehaviorEvent, EventMetadata, EventType
from .emit import ApiSink, JsonlSink
from .layout import CameraLayout, load_layout
from .tracker import SimpleReIDRegistry, TrackObservation, TrackState, fingerprint_from_box


@dataclass
class Detection:
    box: tuple[int, int, int, int]
    centroid: tuple[float, float]
    area: float
    mean_color: tuple[float, float, float]


class MotionDetector:
    def __init__(self) -> None:
        self.subtractor = cv2.createBackgroundSubtractorMOG2(history=500, varThreshold=32, detectShadows=False)

    def detect(self, frame: np.ndarray) -> list[Detection]:
        mask = self.subtractor.apply(frame)
        mask = cv2.medianBlur(mask, 5)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
        mask = cv2.dilate(mask, np.ones((7, 7), np.uint8), iterations=2)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        detections: list[Detection] = []
        for contour in contours:
            area = cv2.contourArea(contour)
            if area < 1200:
                continue
            x, y, w, h = cv2.boundingRect(contour)
            if w < 25 or h < 40:
                continue
            centroid = (x + w / 2.0, y + h / 2.0)
            crop = frame[y : y + h, x : x + w]
            if crop.size == 0:
                continue
            mean_color = tuple(float(v) for v in cv2.mean(crop)[:3])
            # Heuristic group-splitting: large merged blobs often represent 2–4 people entering together.
            # We prefer emitting multiple lower-confidence tracks over under-counting.
            boxes = [(x, y, w, h)]
            if w >= 180 and area >= 9000:
                splits = 2 if w < 360 else 3
                step = max(1, w // splits)
                boxes = [(x + i * step, y, step, h) for i in range(splits)]
            for bx, by, bw, bh in boxes:
                c = (bx + bw / 2.0, by + bh / 2.0)
                detections.append(Detection(box=(bx, by, bw, bh), centroid=c, area=float(bw * bh), mean_color=mean_color))
        return detections


class SimpleTracker:
    def __init__(self, max_distance: float = 90.0, max_missing_seconds: float = 2.0) -> None:
        self.max_distance = max_distance
        self.max_missing_seconds = max_missing_seconds
        self.tracks: dict[str, TrackState] = {}
        self.counter = 0

    def update(self, detections: list[Detection], timestamp: datetime, frame_index: int) -> list[TrackState]:
        observations = [TrackObservation(box=det.box, centroid=det.centroid, fingerprint=fingerprint_from_box(det.box, det.mean_color), frame_index=frame_index, timestamp=timestamp) for det in detections]
        assigned: set[str] = set()
        updated: list[TrackState] = []
        for track_id, track in list(self.tracks.items()):
            observation = self._best_match(track, observations, assigned)
            if observation is None:
                if timestamp - track.last_seen > timedelta(seconds=self.max_missing_seconds):
                    del self.tracks[track_id]
                continue
            track.update(observation)
            assigned.add(observation.fingerprint)
            updated.append(track)
        for observation in observations:
            if observation.fingerprint in assigned:
                continue
            track_id = f"trk_{self.counter:05d}"
            self.counter += 1
            track = TrackState(track_id=track_id, first_seen=timestamp, last_seen=timestamp, last_centroid=observation.centroid, fingerprint=observation.fingerprint, history=[observation])
            self.tracks[track_id] = track
            updated.append(track)
        return updated

    def _best_match(self, track: TrackState, observations: list[TrackObservation], assigned: set[str]) -> TrackObservation | None:
        best_score = self.max_distance
        best = None
        for observation in observations:
            if observation.fingerprint in assigned:
                continue
            distance = ((track.last_centroid[0] - observation.centroid[0]) ** 2 + (track.last_centroid[1] - observation.centroid[1]) ** 2) ** 0.5
            if distance < best_score:
                best_score = distance
                best = observation
        return best


class EventBuilder:
    def __init__(self, store_id: str, camera_id: str, layout: CameraLayout) -> None:
        self.store_id = store_id
        self.camera_id = camera_id
        self.layout = layout
        self.registry = SimpleReIDRegistry()
        self.entry_line = 0.38 if "entry" in camera_id.lower() else 0.55
        self.session_seq: dict[str, int] = {}
        self.active_zones: dict[str, set[str]] = {}
        self.zone_entry_times: dict[tuple[str, str], datetime] = {}
        self.last_direction: dict[str, str] = {}
        self.queue_depth = 0

    def set_queue_depth(self, queue_depth: int) -> None:
        self.queue_depth = max(0, int(queue_depth))

    def build(self, track: TrackState, frame: np.ndarray, frame_index: int, timestamp: datetime) -> list[BehaviorEvent]:
        visitor_id, is_reentry = self.registry.resolve(track, timestamp)
        seq = self.session_seq.get(visitor_id, 0)
        events: list[BehaviorEvent] = []
        direction = self._direction(track)
        is_staff = self._is_staff(track)
        if seq == 0:
            self.session_seq[visitor_id] = 1
            if is_reentry:
                events.append(self._event(EventType.REENTRY, visitor_id, timestamp, None, 0, is_staff, self._confidence(track, base=0.85), 1))
            else:
                events.append(self._event(EventType.ENTRY, visitor_id, timestamp, None, 0, is_staff, self._confidence(track, base=0.9), 1))
        self.last_direction[visitor_id] = direction

        active_zone_ids = self._zones_for_track(track)
        track.zone_visits.update(active_zone_ids)
        previous_zones = self.active_zones.get(visitor_id, set())
        entered = active_zone_ids - previous_zones
        exited = previous_zones - active_zone_ids
        for zone_id in entered:
            self.zone_entry_times[(visitor_id, zone_id)] = timestamp
            metadata = EventMetadata(queue_depth=self.queue_depth if "billing" in zone_id.lower() else None, sku_zone=zone_id, session_seq=self.session_seq.get(visitor_id, 1))
            event_type = EventType.BILLING_QUEUE_JOIN if "billing" in zone_id.lower() and self.queue_depth > 0 else EventType.ZONE_ENTER
            events.append(self._event(event_type, visitor_id, timestamp, zone_id, 0, is_staff, self._confidence(track, base=0.82), self.session_seq.get(visitor_id, 1), metadata))
        for zone_id in exited:
            start_time = self.zone_entry_times.pop((visitor_id, zone_id), timestamp)
            dwell_ms = max(0, int((timestamp - start_time).total_seconds() * 1000))
            if dwell_ms >= 30000:
                events.append(self._event(EventType.ZONE_DWELL, visitor_id, timestamp, zone_id, dwell_ms, is_staff, self._confidence(track, base=0.78), self.session_seq.get(visitor_id, 1), EventMetadata(sku_zone=zone_id, session_seq=self.session_seq.get(visitor_id, 1))))
            events.append(self._event(EventType.ZONE_EXIT, visitor_id, timestamp, zone_id, dwell_ms, is_staff, self._confidence(track, base=0.8), self.session_seq.get(visitor_id, 1), EventMetadata(sku_zone=zone_id, session_seq=self.session_seq.get(visitor_id, 1))))
            if "billing" in zone_id.lower():
                # The PDF requires an abandonment signal, but ground-truth purchase is in POS (no customer_id).
                # Emit the abandonment *attempt* here; the API later computes the true abandonment rate using POS correlation.
                events.append(self._event(EventType.BILLING_QUEUE_ABANDON, visitor_id, timestamp, zone_id, 0, is_staff, self._confidence(track, base=0.72), self.session_seq.get(visitor_id, 1), EventMetadata(queue_depth=self.queue_depth, sku_zone=zone_id, session_seq=self.session_seq.get(visitor_id, 1))))
        self.active_zones[visitor_id] = active_zone_ids
        if direction == "outbound" and track.age > timedelta(seconds=2) and not track.exit_seen:
            track.exit_seen = True
            self.registry.close(track, timestamp)
            events.append(self._event(EventType.EXIT, visitor_id, timestamp, None, 0, is_staff, self._confidence(track, base=0.88), self.session_seq.get(visitor_id, 1)))
        self.session_seq[visitor_id] = self.session_seq.get(visitor_id, 1) + 1
        return events

    def _confidence(self, track: TrackState, base: float = 0.85) -> float:
        # Confidence is intentionally conservative: lower when the box is small/skinny (partial occlusion)
        # and never suppressed (PDF asks to flag low confidence rather than drop events).
        if not track.history:
            return base
        x, y, w, h = track.history[-1].box
        area = max(1, w * h)
        aspect = w / max(1, h)
        area_score = min(1.0, area / 18000)
        occlusion_penalty = 0.15 if area < 2500 or aspect > 1.2 else 0.0
        value = base * (0.6 + 0.4 * area_score) - occlusion_penalty
        return float(max(0.05, min(1.0, value)))

    def _zones_for_track(self, track: TrackState) -> set[str]:
        zones = set()
        for zone in self.layout.zones:
            if zone.contains(track.last_centroid):
                zones.add(zone.zone_id)
        if not zones:
            x = track.last_centroid[0]
            width_hint = 1280
            if x < width_hint * self.entry_line:
                zones.add("ENTRY_THRESHOLD")
            else:
                zones.add("MAIN_FLOOR")
        return zones

    def _direction(self, track: TrackState) -> str:
        if len(track.history) < 2:
            return "inbound"
        return "inbound" if track.history[0].centroid[0] <= track.history[-1].centroid[0] else "outbound"

    def _is_staff(self, track: TrackState) -> bool:
        motion_span = max((obs.centroid[0] for obs in track.history), default=0) - min((obs.centroid[0] for obs in track.history), default=0)
        zone_hits = len(track.zone_visits)
        likelihood = 0.0
        if motion_span > 400:
            likelihood += 0.3
        if zone_hits >= 3:
            likelihood += 0.5
        if track.age > timedelta(minutes=10):
            likelihood += 0.4
        track.staff_likelihood = min(1.0, likelihood)
        return track.staff_likelihood >= 0.75

    def _event(self, event_type: EventType, visitor_id: str, timestamp: datetime, zone_id: str | None, dwell_ms: int, is_staff: bool, confidence: float, session_seq: int, metadata: EventMetadata | None = None) -> BehaviorEvent:
        metadata = metadata or EventMetadata(session_seq=session_seq)
        return BehaviorEvent(
            event_id=str(uuid.uuid4()),
            store_id=self.store_id,
            camera_id=self.camera_id,
            visitor_id=visitor_id,
            event_type=event_type,
            timestamp=timestamp.astimezone(timezone.utc),
            zone_id=zone_id,
            dwell_ms=dwell_ms,
            is_staff=is_staff,
            confidence=confidence,
            metadata=metadata,
        )


def run_detection(video_path: Path, layout_path: Path, output_path: Path, api_url: str | None = None, store_id: str | None = None, camera_id: str | None = None, realtime: bool = False) -> list[BehaviorEvent]:
    layout_map = load_layout(layout_path)
    camera_id = camera_id or _camera_id_from_path(video_path)
    layout = layout_map.get(camera_id) or next(iter(layout_map.values()))
    store_id = store_id or layout.store_id
    cap = cv2.VideoCapture(str(video_path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 15.0
    base_time = datetime.now(timezone.utc)
    detector = MotionDetector()
    tracker = SimpleTracker()
    builder = EventBuilder(store_id=store_id, camera_id=camera_id, layout=layout)
    sink = JsonlSink(output_path)
    api_sink = ApiSink(api_url) if api_url else None
    events: list[BehaviorEvent] = []
    frame_index = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        timestamp = base_time + timedelta(seconds=frame_index / fps)
        detections = detector.detect(frame)
        tracks = tracker.update(detections, timestamp, frame_index)
        billing_zone_ids = {zone.zone_id for zone in layout.zones if "billing" in zone.zone_id.lower() or zone.kind == "billing"}
        queue_depth = sum(1 for track in tracks if billing_zone_ids.intersection(builder._zones_for_track(track)))
        builder.set_queue_depth(queue_depth)
        for track in tracks:
            for event in builder.build(track, frame, frame_index, timestamp):
                sink.emit(event)
                if api_sink:
                    api_sink.emit(event)
                events.append(event)
        frame_index += 1
        if realtime:
            time.sleep(max(0.0, 1.0 / fps))
    cap.release()
    return events


def _camera_id_from_path(path: Path) -> str:
    stem = path.stem.lower()
    if "entry" in stem:
        return "CAM_ENTRY_01"
    if "billing" in stem:
        return "CAM_BILLING_01"
    return "CAM_MAIN_01"


def main() -> None:
    parser = argparse.ArgumentParser(description="Process CCTV clips into store intelligence events.")
    parser.add_argument("--video", type=Path, required=True)
    parser.add_argument("--layout", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--api-url", type=str, default=None)
    parser.add_argument("--store-id", type=str, default=None)
    parser.add_argument("--camera-id", type=str, default=None)
    parser.add_argument("--realtime", action="store_true")
    args = parser.parse_args()
    run_detection(args.video, args.layout, args.output, api_url=args.api_url, store_id=args.store_id, camera_id=args.camera_id, realtime=args.realtime)


if __name__ == "__main__":
    main()
