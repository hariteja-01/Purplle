from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from statistics import mean

from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import EventRecord, StoreStateRecord
from .repository import days_ago, get_store_events, get_store_transactions, start_of_day, utc_now
from .schemas import AnomalyResponse, EventType, FunnelResponse, FunnelStage, HealthResponse, HealthStoreStatus, HeatmapBucket, HeatmapResponse, MetricResponse
from .settings import get_settings


@dataclass(frozen=True)
class SessionKey:
    visitor_id: str
    session_index: int


@dataclass
class VisitorSession:
    key: SessionKey
    start: datetime
    end: datetime
    is_staff: bool
    had_zone_visit: bool = False
    had_billing_queue: bool = False
    billing_presence: list[datetime] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.billing_presence is None:
            self.billing_presence = []


def compute_metrics(session: Session, store_id: str) -> MetricResponse:
    settings = get_settings()
    day_start = start_of_day()
    events = get_store_events(session, store_id, start=day_start)

    sessions = _build_sessions(events)
    customer_sessions = [s for s in sessions if not s.is_staff]
    staff_sessions = [s for s in sessions if s.is_staff]

    unique_visitors = len({s.key.visitor_id for s in customer_sessions})
    total_sessions = len(customer_sessions)

    # Zone dwell (ms) from ZONE_DWELL events.
    zone_dwell: dict[str, list[int]] = defaultdict(list)
    for event in events:
        if event.is_staff or not event.zone_id:
            continue
        if event.event_type == EventType.ZONE_DWELL.value:
            zone_dwell[event.zone_id].append(int(event.dwell_ms or 0))
    avg_dwell_per_zone = {zone: round(mean(values), 2) if values else 0.0 for zone, values in zone_dwell.items()}

    converted_sessions = _pos_converted_sessions(session, store_id, customer_sessions, start=day_start)
    converted_visitors = {key.visitor_id for key in converted_sessions}

    billing_sessions = {s.key for s in customer_sessions if s.had_billing_queue}
    abandoned_sessions = {s.key for s in customer_sessions if s.had_billing_queue and s.key not in converted_sessions}

    state = session.get(StoreStateRecord, store_id)
    queue_depth = int(state.active_queue_depth) if state else 0

    conversion_rate = round(len(converted_visitors) / max(1, unique_visitors), 4)
    abandonment_rate = round(len(abandoned_sessions) / max(1, len(billing_sessions)), 4)

    return MetricResponse(
        store_id=store_id,
        unique_visitors=int(unique_visitors),
        conversion_rate=float(conversion_rate),
        avg_dwell_per_zone=avg_dwell_per_zone,
        queue_depth=int(queue_depth),
        abandonment_rate=float(abandonment_rate),
        total_sessions=int(total_sessions),
        staff_sessions=int(len(staff_sessions)),
    )


def compute_funnel(session: Session, store_id: str) -> FunnelResponse:
    day_start = start_of_day()
    events = get_store_events(session, store_id, start=day_start)
    sessions = [s for s in _build_sessions(events) if not s.is_staff]

    converted = _pos_converted_sessions(session, store_id, sessions, start=day_start)

    entry_count = len(sessions)
    zone_count = sum(1 for s in sessions if s.had_zone_visit)
    billing_count = sum(1 for s in sessions if s.had_billing_queue)
    purchase_count = sum(1 for s in sessions if s.key in converted)

    counts = [entry_count, zone_count, billing_count, purchase_count]
    names = ["Entry", "Zone Visit", "Billing Queue", "Purchase"]
    stages: list[FunnelStage] = []
    for idx, name in enumerate(names):
        previous = counts[idx - 1] if idx > 0 else counts[idx]
        dropoff = 0.0 if previous == 0 else round(1 - counts[idx] / max(1, previous), 4)
        stages.append(FunnelStage(name=name, count=int(counts[idx]), dropoff_rate=float(dropoff)))
    return FunnelResponse(store_id=store_id, stages=stages)


def compute_heatmap(session: Session, store_id: str) -> HeatmapResponse:
    settings = get_settings()
    day_start = start_of_day()
    events = get_store_events(session, store_id, start=day_start)
    sessions = [s for s in _build_sessions(events) if not s.is_staff]

    zone_dwell: dict[str, list[int]] = defaultdict(list)
    visits: dict[str, int] = defaultdict(int)
    for event in events:
        if event.is_staff or not event.zone_id:
            continue
        if event.event_type in {EventType.ZONE_ENTER.value, EventType.ZONE_DWELL.value}:
            visits[event.zone_id] += 1
        if event.event_type == EventType.ZONE_DWELL.value:
            zone_dwell[event.zone_id].append(int(event.dwell_ms or 0))

    max_visits = max(visits.values(), default=1)
    max_avg_dwell = max((mean(values) for values in zone_dwell.values() if values), default=1.0)

    buckets: list[HeatmapBucket] = []
    for zone_id, count in visits.items():
        avg_dwell = mean(zone_dwell.get(zone_id, [0])) if zone_dwell.get(zone_id) else 0.0
        freq_component = count / max_visits
        dwell_component = (avg_dwell / max_avg_dwell) if max_avg_dwell else 0.0
        normalized = round((0.6 * freq_component + 0.4 * dwell_component) * 100, 2)
        buckets.append(HeatmapBucket(zone_id=zone_id, visit_count=int(count), avg_dwell_ms=round(float(avg_dwell), 2), normalized_score=float(normalized)))

    buckets.sort(key=lambda item: (-item.normalized_score, item.zone_id))
    data_confidence = len(sessions) >= settings.min_sessions_for_confidence
    return HeatmapResponse(store_id=store_id, data_confidence=bool(data_confidence), buckets=buckets)


def compute_anomalies(session: Session, store_id: str) -> AnomalyResponse:
    settings = get_settings()
    day_start = start_of_day()
    events = get_store_events(session, store_id, start=day_start)
    anomalies: list[dict[str, object]] = []

    now = utc_now()
    customer_events = [event for event in events if not event.is_staff]
    last_zone_visit = max((event.timestamp for event in customer_events if event.zone_id), default=None)

    state = session.get(StoreStateRecord, store_id)
    queue_depth = int(state.active_queue_depth) if state else 0

    if queue_depth >= settings.queue_spike_threshold:
        anomalies.append(
            {
                **_anomaly(
                    "BILLING_QUEUE_SPIKE",
                    "WARN",
                    "Queue is building at billing. Open another counter or reassign a staff member to billing.",
                ),
                "detected_at": now,
                "queue_depth": queue_depth,
            }
        )

    today_metrics = compute_metrics(session, store_id)
    rolling = _seven_day_conversion_baseline(session, store_id)
    if rolling is not None and today_metrics.conversion_rate < rolling * 0.7:
        anomalies.append(
            {
                **_anomaly(
                    "CONVERSION_DROP",
                    "CRITICAL",
                    "Conversion is materially below the 7-day baseline. Check queue load, staffing, camera health, and POS ingestion.",
                ),
                "detected_at": now,
                "today_conversion_rate": today_metrics.conversion_rate,
                "baseline_7d": round(float(rolling), 4),
            }
        )

    if last_zone_visit is None or now - _ensure_utc(last_zone_visit) > timedelta(minutes=settings.dead_zone_minutes):
        anomalies.append(
            {
                **_anomaly(
                    "DEAD_ZONE",
                    "INFO",
                    "No zone activity detected recently. Verify camera coverage, open hours, and feed freshness.",
                ),
                "detected_at": now,
                "last_zone_visit": last_zone_visit,
            }
        )

    return AnomalyResponse(store_id=store_id, anomalies=anomalies)


def compute_health(session: Session) -> HealthResponse:
    settings = get_settings()
    now = utc_now()
    statuses: list[HealthStoreStatus] = []
    stores = {row[0] for row in session.execute(select(StoreStateRecord.store_id)).all()}
    for store_id in sorted(stores):
        state = session.get(StoreStateRecord, store_id)
        last = state.last_event_timestamp if state else None
        lag_minutes = None if last is None else round((now - _ensure_utc(last)).total_seconds() / 60, 2)
        statuses.append(
            HealthStoreStatus(
                store_id=store_id,
                last_event_timestamp=last,
                stale_feed=lag_minutes is not None and lag_minutes > settings.stale_feed_minutes,
                lag_minutes=lag_minutes,
            )
        )
    return HealthResponse(status="ok", stores=statuses)


def _seven_day_conversion_baseline(session: Session, store_id: str) -> float | None:
    settings = get_settings()
    day_start = start_of_day()
    lookback_start = days_ago(7)
    events = get_store_events(session, store_id, start=lookback_start, end=day_start)
    sessions = [s for s in _build_sessions(events) if not s.is_staff]
    if len(sessions) < settings.min_sessions_for_confidence:
        return None
    converted = _pos_converted_sessions(session, store_id, sessions, start=lookback_start, end=day_start)
    unique_visitors = len({s.key.visitor_id for s in sessions})
    converted_visitors = len({key.visitor_id for key in converted})
    if unique_visitors == 0:
        return None
    return converted_visitors / unique_visitors


def _anomaly(code: str, severity: str, suggested_action: str) -> dict[str, object]:
    return {"code": code, "severity": severity, "suggested_action": suggested_action}


def _build_sessions(events: list[EventRecord]) -> list[VisitorSession]:
    # Session is the unit of funnel metrics (PDF). We reconstruct sessions per visitor_id using ENTRY/EXIT,
    # plus an inactivity timeout for safety.
    inactivity_timeout = timedelta(minutes=10)
    by_visitor: dict[str, list[EventRecord]] = defaultdict(list)
    for event in events:
        by_visitor[event.visitor_id].append(event)
    sessions: list[VisitorSession] = []
    for visitor_id, rows in by_visitor.items():
        rows.sort(key=lambda r: r.timestamp)
        current: VisitorSession | None = None
        session_index = 0
        for row in rows:
            ts = _ensure_utc(row.timestamp)
            if current is not None and ts - current.end > inactivity_timeout:
                sessions.append(current)
                current = None

            if current is None:
                session_index += 1
                current = VisitorSession(
                    key=SessionKey(visitor_id=visitor_id, session_index=session_index),
                    start=ts,
                    end=ts,
                    is_staff=bool(row.is_staff),
                )
            current.end = max(current.end, ts)
            current.is_staff = current.is_staff or bool(row.is_staff)

            if row.zone_id and row.event_type in {EventType.ZONE_ENTER.value, EventType.ZONE_DWELL.value}:
                current.had_zone_visit = True
            if row.event_type == EventType.BILLING_QUEUE_JOIN.value:
                current.had_billing_queue = True
            if row.zone_id and "billing" in row.zone_id.lower():
                current.billing_presence.append(ts)
            if row.event_type == EventType.EXIT.value:
                sessions.append(current)
                current = None
        if current is not None:
            sessions.append(current)
    return sessions


def _pos_converted_sessions(
    session: Session,
    store_id: str,
    sessions: list[VisitorSession],
    start: datetime,
    end: datetime | None = None,
) -> set[SessionKey]:
    # PDF rule: a visitor who was in the billing zone in the N-minute window before a POS transaction timestamp
    # counts as converted for that session.
    settings = get_settings()
    transactions = get_store_transactions(session, store_id, start=start, end=end)
    converted: set[SessionKey] = set()
    window = timedelta(minutes=settings.conversion_window_minutes)

    # Greedy assignment: each transaction is attributed to the closest eligible session to avoid double-counting.
    for txn in transactions:
        txn_ts = _ensure_utc(txn.timestamp)
        best_key: SessionKey | None = None
        best_delta: timedelta | None = None
        for candidate in sessions:
            if candidate.key in converted:
                continue
            if not candidate.billing_presence:
                continue
            # Any billing-zone presence within the correlation window qualifies.
            if not any((txn_ts - window) <= t <= txn_ts for t in candidate.billing_presence):
                continue
            closest_presence = min((txn_ts - t for t in candidate.billing_presence if t <= txn_ts), default=None)
            if closest_presence is None:
                continue
            if best_delta is None or closest_presence < best_delta:
                best_delta = closest_presence
                best_key = candidate.key
        if best_key is not None:
            converted.add(best_key)
    return converted


def _ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)