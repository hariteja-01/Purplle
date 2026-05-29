# Final Release Checklist

This checklist confirms the compliance, design alignment, and correctness of the Store Intelligence System before submission.

---

## 1. Acceptance Gates & Deployment Readiness

- [x] **Runs via Single Command:** `docker compose up --build` works on a clean machine and requires no manual database or setup steps.
- [x] **FastAPI Ingestion Endpoint:** `POST /events/ingest` accepts batches of up to 500 events without crashing.
- [x] **FastAPI Metrics Endpoint:** `GET /stores/{id}/metrics` returns valid JSON with all metrics computed.
- [x] **FastAPI Funnel Endpoint:** `GET /stores/{id}/funnel` returns the conversion stages.
- [x] **FastAPI Heatmap Endpoint:** `GET /stores/{id}/heatmap` returns the normalized scores.
- [x] **FastAPI Anomalies Endpoint:** `GET /stores/{id}/anomalies` returns the active anomalies.
- [x] **FastAPI Health Endpoint:** `GET /health` returns status and `stale_feed` signals.
- [x] **Live Dashboard:** `/dashboard` displays live streaming metrics via SSE and visualizes the store state.
- [x] **Documentation Files:** both `docs/DESIGN.md` and `docs/CHOICES.md` are non-trivial and contain >250 words each.

---

## 2. Ingestion & Database Semantics

- [x] **Idempotency:** Re-posting events with the same `event_id` is safe and returns `"status": "duplicate"`.
- [x] **Partial Success:** Malformed events are rejected individually with a clear message; valid events in the same payload are accepted.
- [x] **UUIDv4 Validation:** `event_id` validation rejects non-UUID or non-UUIDv4 values.
- [x] **Timezone-Aware Timestamps:** Event ingestion enforces timezone-aware UTC timestamps.
- [x] **Store State Updates:** Automatically track `last_event_timestamp` and `active_queue_depth` on event ingestion using UPSERT statements.

---

## 3. Analytics & Business Logic

- [x] **Session Reconstruction:** Metrics are built using reconstructed sessions based on ENTRY/EXIT transitions and a 10-minute inactivity timeout.
- [x] **POS Conversion Correlation:** Conversion rates are computed by correlating billing zone presence with POS transactions within a 5-minute window.
- [x] **Staff Exclusion:** All metrics (visitors, conversion, dwell, funnel) exclude sessions flagged as `is_staff=true`.
- [x] **Funnel Accuracy:** Funnel stages follow the strict sequence: `Entry` → `Zone Visit` → `Billing Queue` → `Purchase`.
- [x] **Heatmap Normalization:** Scores are normalized 0–100 using a balanced frequency (60%) and average dwell time (40%) heuristic.
- [x] **Heatmap Confidence Gate:** A `data_confidence` flag is false if the store has fewer than 20 sessions today.
- [x] **Anomaly Actions:** All anomalies include severity (INFO/WARN/CRITICAL) and a clear, actionable `suggested_action`.

---

## 4. Detection Pipeline Heuristics

- [x] **Group Entry Splitting:** Large bounding boxes are split into multiple tracking states to count individual visitors instead of groups.
- [x] **Staff Classification:** Uniform movement, zone coverage, and session length are evaluated to classify staff.
- [x] **Re-entry Re-ID:** Fingerprints of recently exited visitors are cached and matched to prevent double-counting.
- [x] **Confidence Calibration:** Bounding box sizes are evaluated to detect partial occlusions and scale the confidence score.

---

## 5. Operations & Production Polish

- [x] **Structured Logging:** HTTP request logging middleware outputs clean, parsable JSON to stdout with trace IDs.
- [x] **Outage Resilience:** Operations on the SQLite database return a structured 503 response on error rather than stack traces.
- [x] **POS CSV Autoload:** On startup, the system discovers and ingests POS transactions from `pos_transactions.csv`.
- [x] **Test Coverage:** Pytest coverage is above 70% and tests cover empty stores, zero purchases, re-entry, and all-staff clips.
- [x] **Git Cleanliness:** A robust `.gitignore` avoids committing databases or python compiler caches.
- [x] **One-Command Pipeline Runner:** `pipeline/run.sh` processes all video clips in a single run.
