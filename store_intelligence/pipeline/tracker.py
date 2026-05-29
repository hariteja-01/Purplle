from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from hashlib import sha1


def fingerprint_from_box(box: tuple[int, int, int, int], mean_color: tuple[float, float, float]) -> str:
    payload = f"{box[0]}:{box[1]}:{box[2]}:{box[3]}:{mean_color[0]:.1f}:{mean_color[1]:.1f}:{mean_color[2]:.1f}"
    return sha1(payload.encode("utf-8")).hexdigest()[:12]


@dataclass
class TrackObservation:
    box: tuple[int, int, int, int]
    centroid: tuple[float, float]
    fingerprint: str
    frame_index: int
    timestamp: datetime


@dataclass
class TrackState:
    track_id: str
    first_seen: datetime
    last_seen: datetime
    last_centroid: tuple[float, float]
    fingerprint: str
    history: list[TrackObservation] = field(default_factory=list)
    exit_seen: bool = False
    staff_likelihood: float = 0.0
    zone_visits: set[str] = field(default_factory=set)

    def update(self, observation: TrackObservation) -> None:
        self.last_seen = observation.timestamp
        self.last_centroid = observation.centroid
        self.fingerprint = observation.fingerprint
        self.history.append(observation)

    @property
    def age(self) -> timedelta:
        return self.last_seen - self.first_seen


class SimpleReIDRegistry:
    def __init__(self, reentry_window: timedelta = timedelta(minutes=10)) -> None:
        self.reentry_window = reentry_window
        self.previous_visitors: dict[str, tuple[datetime, str]] = {}
        self.track_to_visitor: dict[str, str] = {}

    def resolve(self, track: TrackState, timestamp: datetime) -> tuple[str, bool]:
        if track.track_id in self.track_to_visitor:
            return self.track_to_visitor[track.track_id], False
        for visitor_id, (exited_at, fingerprint) in list(self.previous_visitors.items()):
            if fingerprint != track.fingerprint:
                continue
            if timestamp - exited_at <= self.reentry_window:
                self.track_to_visitor[track.track_id] = visitor_id
                return visitor_id, True
        visitor_id = f"VIS_{track.fingerprint[:8]}"
        self.track_to_visitor[track.track_id] = visitor_id
        return visitor_id, False

    def close(self, track: TrackState, timestamp: datetime) -> None:
        visitor_id = self.track_to_visitor.get(track.track_id, f"VIS_{track.fingerprint[:8]}")
        self.previous_visitors[visitor_id] = (timestamp, track.fingerprint)
