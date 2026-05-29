# Store Intelligence System

> End-to-end CCTV analytics pipeline — from raw video footage to a live, queryable retail intelligence API.

Built for the Purplle Tech Challenge 2026 Round 2. The system processes CCTV clips, detects visitors, tracks movement, classifies zones, correlates with POS transactions, and exposes real-time store analytics through a production-grade REST API with a live dashboard.

---

## Quick Start (5 commands)

```bash
# 1. Clone the repository
git clone <repo-url> && cd store-intelligence

# 2. Start the entire stack (API + SQLite)
docker compose up --build -d

# 3. Run the detection pipeline on CCTV clips
docker compose exec api python -m store_intelligence.pipeline.detect \
  --video /app/data/clips/STORE_BLR_002_CAM_ENTRY_01.mp4 \
  --layout /app/data/store_layout.json \
  --output /app/data/events.jsonl \
  --api-url http://localhost:8000

# 4. Open the live dashboard
open http://localhost:8000/dashboard

# 5. Query metrics
curl http://localhost:8000/stores/STORE_BLR_002/metrics | python -m json.tool
```

### Local development (without Docker)

```bash
python -m venv .venv && .venv/Scripts/activate  # Windows
# source .venv/bin/activate                     # Linux/macOS
pip install -r requirements-dev.txt
pip install -e .
python -m uvicorn store_intelligence.api.main:app --host 127.0.0.1 --port 8000 --reload
```

---

## Architecture

```
Raw CCTV Clips → Detection Layer → Structured Events (JSONL) → POST /events/ingest → FastAPI + SQLite → Live Dashboard
                                                                                ↓
                                                            POS CSV (auto-loaded on startup)
```

| Layer | Tech | Purpose |
|-------|------|---------|
| **Detection** | OpenCV MOG2 + SimpleTracker + Re-ID Registry | Motion-based person detection, multi-object tracking, visitor identity assignment |
| **Event Emission** | Pydantic schema → JSONL + HTTP sink | Structured behavioral events conforming to the challenge spec |
| **API** | FastAPI + Uvicorn | REST endpoints for metrics, funnel, heatmap, anomalies, health |
| **Storage** | SQLite + SQLAlchemy | Single-file persistence, zero-config deployment |
| **Dashboard** | Server-Sent Events + Vanilla JS | Real-time KPI cards, funnel visualization, heatmap, anomaly feed |

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/events/ingest` | POST | Accepts batches of up to 500 events. Idempotent by `event_id`. Partial success on malformed events. |
| `/stores/{id}/metrics` | GET | Unique visitors, conversion rate, avg dwell per zone, queue depth, abandonment rate. |
| `/stores/{id}/funnel` | GET | Conversion funnel: Entry → Zone Visit → Billing Queue → Purchase (POS-correlated). |
| `/stores/{id}/heatmap` | GET | Zone visit frequency + avg dwell, normalized 0–100. Includes `data_confidence` flag. |
| `/stores/{id}/anomalies` | GET | Active anomalies: queue spike, conversion drop, dead zone. Severity + `suggested_action`. |
| `/health` | GET | Service status, last event timestamp per store, `STALE_FEED` warning if >10 min lag. |
| `/dashboard` | GET | Live web dashboard with real-time metrics via SSE. |

---

## Detection Pipeline

The pipeline processes each CCTV clip and emits structured behavioral events:

```bash
# Process a single clip (writes JSONL + optional API POST)
python -m store_intelligence.pipeline.detect \
  --video data/clips/STORE_BLR_002_CAM_ENTRY_01.mp4 \
  --layout data/store_layout.json \
  --output out/events.jsonl \
  --api-url http://localhost:8000

# Process all clips at once
bash pipeline/run.sh data/clips data/store_layout.json out/events http://localhost:8000

# Real-time mode (simulates live feed speed)
python -m store_intelligence.pipeline.detect \
  --video data/clips/STORE_BLR_002_CAM_ENTRY_01.mp4 \
  --layout data/store_layout.json \
  --output out/events.jsonl \
  --api-url http://localhost:8000 \
  --realtime
```

### Edge case handling

| Edge Case | How It's Handled |
|-----------|-----------------|
| Group entry | Large bounding boxes are heuristically split into multiple tracks |
| Staff movement | Classified by motion span, zone coverage, and session duration |
| Re-entry | Fingerprint-based Re-ID within a configurable time window |
| Partial occlusion | Confidence score degrades gracefully; low-confidence events are flagged, not suppressed |
| Empty periods | API returns zeroes, not nulls or errors |
| Camera overlap | Events are deduplicated by `event_id` (UUIDv4) at ingestion |

---

## Event Schema

Events conform to the challenge specification:

```json
{
  "event_id":   "uuid-v4",
  "store_id":   "STORE_BLR_002",
  "camera_id":  "CAM_ENTRY_01",
  "visitor_id": "VIS_c8a2f1",
  "event_type": "ZONE_DWELL",
  "timestamp":  "2026-03-03T14:22:10Z",
  "zone_id":    "SKINCARE",
  "dwell_ms":   8400,
  "is_staff":   false,
  "confidence": 0.91,
  "metadata":   { "queue_depth": null, "sku_zone": "SKINCARE", "session_seq": 5 }
}
```

**Event types:** `ENTRY`, `EXIT`, `ZONE_ENTER`, `ZONE_EXIT`, `ZONE_DWELL`, `BILLING_QUEUE_JOIN`, `BILLING_QUEUE_ABANDON`, `REENTRY`

---

## POS Transaction Correlation

POS transactions are auto-loaded from `data/pos_transactions.csv` on API startup. Conversion is computed via time-window correlation:

> A session counts as converted if the visitor had billing-zone presence within 5 minutes (configurable) before a POS transaction timestamp.

There is no `PURCHASE` event type — conversion is derived from the ground-truth source (POS/billing system).

---

## Configuration

All settings are configurable via environment variables (prefix `SI_`):

| Variable | Default | Description |
|----------|---------|-------------|
| `SI_DATABASE_URL` | `sqlite:///./store_intelligence.db` | Database connection string |
| `SI_DATA_DIR` | `./data` | Directory for POS CSV and video clips |
| `SI_POS_CSV_PATH` | Auto-detected | Explicit path to POS transactions CSV |
| `SI_STALE_FEED_MINUTES` | `10` | Minutes before a store feed is marked stale |
| `SI_DEAD_ZONE_MINUTES` | `30` | Minutes without zone activity before anomaly |
| `SI_CONVERSION_WINDOW_MINUTES` | `5` | POS correlation time window |
| `SI_QUEUE_SPIKE_THRESHOLD` | `4` | Queue depth that triggers anomaly |
| `SI_DASHBOARD_REFRESH_MS` | `3000` | Dashboard refresh interval |

---

## Testing

```bash
pip install -r requirements-dev.txt
python -m pytest -v

# Coverage report
python -m pytest --cov=store_intelligence --cov-report=term-missing
```

Test coverage: **>70%** (target met). Tests cover:
- Schema validation (UUIDv4, timezone-aware timestamps)
- Idempotent ingestion and deduplication
- POS-correlated conversion rate computation
- Empty store, all-staff, zero-purchase edge cases
- Re-entry visitor handling in funnel
- Anomaly detection (queue spike, dead zone, stale feed)
- API endpoint integration tests (HTTP-level)
- Pipeline event builder unit tests

---

## Live Dashboard

The dashboard at `/dashboard` provides real-time visibility into store operations:

- **KPI Cards**: Unique visitors, conversion rate, queue depth, abandonment rate, staff sessions
- **Conversion Funnel**: Visual funnel from Entry → Zone Visit → Billing Queue → Purchase
- **Zone Heatmap**: Color-coded zone activity with normalized scores
- **Anomaly Feed**: Active alerts with severity levels and suggested actions
- **SSE-powered**: Metrics update automatically via Server-Sent Events

---

## Project Structure

```
store-intelligence/
├── pipeline/
│   └── run.sh                           # Process all clips → events
├── store_intelligence/
│   ├── pipeline/
│   │   ├── detect.py                    # Detection + tracking pipeline
│   │   ├── tracker.py                   # Re-ID / tracking logic
│   │   ├── emit.py                      # Event sinks (JSONL + HTTP)
│   │   └── layout.py                    # Store layout parser
│   ├── api/
│   │   ├── main.py                      # FastAPI entrypoint + middleware
│   │   └── templates/dashboard.html     # Live dashboard
│   ├── analytics.py                     # Metrics, funnel, heatmap, anomalies
│   ├── repository.py                    # Data access layer
│   ├── schemas.py                       # Pydantic models
│   ├── services.py                      # Business logic orchestration
│   ├── db.py                            # SQLAlchemy models + session
│   └── settings.py                      # Configuration
├── tests/                               # Pytest test suite
├── docs/
│   ├── DESIGN.md                        # Architecture + AI-assisted decisions
│   └── CHOICES.md                       # Model, schema, API decisions
├── scripts/
│   └── smoke_http.py                    # HTTP smoke test (stdlib only)
├── docker-compose.yml
├── Dockerfile
└── README.md
```

---

## Documentation

- **[DESIGN.md](docs/DESIGN.md)** — Architecture overview, AI-assisted decisions
- **[CHOICES.md](docs/CHOICES.md)** — Detection model, schema design, API architecture rationale
- **[REVIEWER_GUIDE.md](REVIEWER_GUIDE.md)** — 5-minute reviewer walkthrough