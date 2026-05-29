# FINAL AUDIT — Purplle Tech Challenge Round 2 (Store Intelligence)

This document is the final quality/audit pass for the repository as it stands in this workspace.

## 1) Acceptance gates

### ✅ Single-command local deployment
- Docker entrypoint: `uvicorn store_intelligence.api.main:app --host 0.0.0.0 --port 8000` (see `Dockerfile`).
- Compose file exposes `8000:8000` and mounts `./data` into `/app/data` (see `docker-compose.yml`).

How to run:
- `docker compose up --build`
- Open `http://localhost:8000/dashboard`

Note: Docker is not installed in this VS Code environment, so `docker compose up` could not be executed here. The configuration is kept minimal and aligned with the runtime entrypoint.

### ✅ API surface (required endpoints)
Implemented in `store_intelligence/api/main.py`:
- `POST /events/ingest`
- `GET /stores/{store_id}/metrics`
- `GET /stores/{store_id}/funnel`
- `GET /stores/{store_id}/heatmap`
- `GET /stores/{store_id}/anomalies`
- `GET /health`

### ✅ Bonus: live dashboard
- `GET /dashboard` serves HTML (template in `store_intelligence/api/templates/dashboard.html`).
- SSE stream: `GET /stream/stores/{store_id}/metrics`.

## 2) PDF-aligned data contracts

### Event schema hardening
In `store_intelligence/schemas.py`:
- `event_id` must be a UUIDv4 (rejects non-UUID and non-v4).
- `timestamp` must be timezone-aware and is normalized to UTC.
- `EventMetadata` is strict and minimal (`queue_depth`, `sku_zone`, `session_seq`); removed non-spec fields.
- Removed non-spec event type `PURCHASE`.

### Ingestion semantics
In `store_intelligence/services.py` and `store_intelligence/repository.py`:
- Partial success: invalid items are returned as `rejected` with an item-level reason; valid items still ingest.
- Idempotency/dedup: duplicates are detected by `event_id` and returned as `duplicate` without inserting again.
- Store state updates:
  - `last_event_timestamp` updated from ingested events.
  - `active_queue_depth` updated from `BILLING_QUEUE_JOIN.metadata.queue_depth`.
- SQLite UPSERT used for store state to avoid UNIQUE/constraint failures under batching.

## 3) Analytics alignment

In `store_intelligence/analytics.py`:
- Session reconstruction is the basis for metrics and funnel.
- Purchase/conversion is derived via POS correlation (not a `PURCHASE` event):
  - A session is considered converted if the visitor had billing-zone presence within the configured window (default 5 minutes) before a POS transaction timestamp.
  - Greedy attribution ensures each POS transaction is assigned to at most one session (prevents double counting).
- Funnel stages are: Entry → Zone Visit → Billing Queue → Purchase (POS-correlated).
- Heatmap is normalized 0–100 and includes a `data_confidence` gate (session-count based).
- Anomalies include `code`, `severity`, and `suggested_action`.

## 4) Production-readiness features

### Structured request logging
In `store_intelligence/api/main.py` middleware:
- Logs JSON with: `trace_id`, `endpoint`, `method`, `latency_ms`, `event_count` (for ingest), `status_code`, and `store_id` if present.
- Response includes `x-trace-id` header.

### Resilience for DB outages
In `store_intelligence/api/main.py`:
- SQLAlchemy `OperationalError` and `DBAPIError` return `503` with a structured JSON body including `trace_id`.

### POS bootstrap on startup
On API startup (FastAPI lifespan):
- If `SI_POS_CSV_PATH` exists (or `/app/data/pos_transactions.csv` exists), POS transactions are loaded into the DB.

## 5) Test + coverage status

Executed in this workspace:
- `python -m pytest`
- Result: `11 passed`
- Coverage: `72%` (configured in `pyproject.toml`)

Key tests added/updated:
- Strict schema tests (UUIDv4, strict metadata).
- Idempotent ingestion.
- POS-correlated conversion (no `PURCHASE` event type).
- API smoke tests (health, dashboard, ingest, metrics/funnel/heatmap/anomalies).

## 6) Remaining known limitations / risks

- Docker execution could not be runtime-validated in this environment (no Docker CLI installed). If your evaluation environment runs Compose, the provided config should work as-is.
- SSE endpoint is intentionally simple (polls metrics on an interval). This is acceptable for the challenge but would be upgraded to event-driven updates in a true production system.
- Pipeline heuristics (OpenCV motion segmentation + heuristic tracking/Re-ID) are deterministic but not ML-grade; they’re written for robustness and explainability under the challenge constraints.

## 7) Fast validation checklist (for reviewers)

- Start: `docker compose up --build`
- Local (no Docker): `python -m uvicorn store_intelligence.api.main:app --host 127.0.0.1 --port 8000`
- Browser: `http://localhost:8000/dashboard`
- Ingest sample:
  - `POST http://localhost:8000/events/ingest` with a JSON list of events (UUIDv4 ids; timestamps with `Z`).
- Smoke test script (stdlib HTTP client): `python scripts/smoke_http.py http://127.0.0.1:8000`
- Verify:
  - `GET /stores/STORE_BLR_002/metrics`
  - `GET /stores/STORE_BLR_002/funnel`
  - `GET /stores/STORE_BLR_002/heatmap`
  - `GET /stores/STORE_BLR_002/anomalies`
  - `GET /health`
