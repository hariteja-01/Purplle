from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class EventType(str, Enum):
    ENTRY = "ENTRY"
    EXIT = "EXIT"
    ZONE_ENTER = "ZONE_ENTER"
    ZONE_EXIT = "ZONE_EXIT"
    ZONE_DWELL = "ZONE_DWELL"
    BILLING_QUEUE_JOIN = "BILLING_QUEUE_JOIN"
    BILLING_QUEUE_ABANDON = "BILLING_QUEUE_ABANDON"
    REENTRY = "REENTRY"


class EventMetadata(BaseModel):
    queue_depth: int | None = None
    sku_zone: str | None = None
    session_seq: int = Field(default=1, ge=1)


class BehaviorEvent(BaseModel):
    event_id: str
    store_id: str
    camera_id: str
    visitor_id: str
    event_type: EventType
    timestamp: datetime
    zone_id: str | None = None
    dwell_ms: int = Field(default=0, ge=0)
    is_staff: bool = False
    confidence: float = Field(ge=0.0, le=1.0)
    metadata: EventMetadata = Field(default_factory=EventMetadata)

    @field_validator("event_id")
    @classmethod
    def validate_event_id(cls, value: str) -> str:
        if not value:
            raise ValueError("event_id is required")
        try:
            parsed = UUID(value)
        except ValueError as exc:
            raise ValueError("event_id must be a UUID") from exc
        if parsed.version != 4:
            raise ValueError("event_id must be a UUIDv4")
        return value

    @field_validator("timestamp")
    @classmethod
    def validate_timestamp(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("timestamp must be timezone-aware UTC")
        return value.astimezone(timezone.utc)


class IngestResultItem(BaseModel):
    event_id: str
    status: str
    detail: str | None = None


class IngestResponse(BaseModel):
    accepted: int
    rejected: int
    duplicates: int
    results: list[IngestResultItem]


class MetricResponse(BaseModel):
    store_id: str
    unique_visitors: int
    conversion_rate: float
    avg_dwell_per_zone: dict[str, float]
    queue_depth: int
    abandonment_rate: float
    total_sessions: int
    staff_sessions: int


class FunnelStage(BaseModel):
    name: str
    count: int
    dropoff_rate: float


class FunnelResponse(BaseModel):
    store_id: str
    stages: list[FunnelStage]


class HeatmapBucket(BaseModel):
    zone_id: str
    visit_count: int
    avg_dwell_ms: float
    normalized_score: float


class HeatmapResponse(BaseModel):
    store_id: str
    data_confidence: bool
    buckets: list[HeatmapBucket]


class AnomalyResponse(BaseModel):
    store_id: str
    anomalies: list[dict[str, Any]]


class HealthStoreStatus(BaseModel):
    store_id: str
    last_event_timestamp: datetime | None
    stale_feed: bool
    lag_minutes: float | None


class HealthResponse(BaseModel):
    status: str
    stores: list[HealthStoreStatus]