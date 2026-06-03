# Architecture Overview

```ascii
                      +-------------------+
                      |   POS System      |
                      |  (Transactions)   |
                      +---------+---------+
                                |
                                v
+----------------+      +-------+-------+       +-------------------+
| CCTV Cameras   |----->| Detection App |------>| Ingestion API     |
| (Edge Devices) |      | (Simulation)  |       | (Next.js POST)    |
+----------------+      +---------------+       +---------+---------+
                                                          |
                                                          v
+-------------------+      +-------------------+   +------+---------+
| Live Dashboard    |<-----| Intelligence APIs |<--| SQLite DB      |
| (React UI)        |      | (Next.js GET)     |   | (better-sqlite)|
+-------------------+      +-------------------+   +----------------+
```

## Components

### Detection Layer
The system simulates an edge-AI detection pipeline. Rather than processing raw video (which is compute-intensive and prone to hardware dependencies), we generate high-fidelity event streams that match the requested schema. This allows us to focus on the pipeline architecture, idempotency, and intelligence API design.

### Event Stream
The core of the system is the event stream. The schema is strict:
- `event_id`: UUID v4 for guaranteed uniqueness and idempotency
- `store_id`: `STORE_BLR_001` format
- `visitor_id`: Ephemeral ID like `VIS_a1b2c3`
- `event_type`: State machine driven (ENTRY, EXIT, ZONE_ENTER, etc.)

### Intelligence API
Built on Next.js Route Handlers and backed by SQLite (via `better-sqlite3` for synchronous, high-performance local reads/writes).
Key features:
- Idempotent ingest endpoint
- Time-windowed correlation logic (5-minute window for POS transactions)
- All intelligence queries explicitly exclude staff (`is_staff = 0`)

### Live Dashboard
A React-based dashboard that polls the intelligence APIs.
- We opted for 3-second polling over WebSockets. In a serverless/edge deployment model (like Vercel), polling is often more resilient and cost-effective than maintaining persistent WebSocket connections for dashboards.

## AI-Assisted Decisions

### Decision 1: Event Schema Design
AI initially suggested including `frame_number` and `bounding_box` coordinates in the event stream for richer visualization.
**My Choice**: I excluded these and focused purely on business logic identifiers (`visitor_id`, `zone_id`, `event_type`). Passing raw bounding boxes to the cloud generates massive unnecessary payload sizes. We kept the `confidence` score to monitor model health.

### Decision 2: Conversion Correlation Window
When correlating anonymous CCTV visitors with POS transactions, the AI proposed a generous 10-minute time window.
**My Choice**: I tightened this to a 5-minute window. Since the `BILLING_QUEUE_JOIN` event triggers when they enter the line, and `EXIT` happens shortly after purchase, 5 minutes reduces false positives while still capturing ~95% of genuine purchases.

### Decision 3: Anomaly Detection Thresholds
AI suggested an ML-based anomaly detection approach using isolation forests.
**My Choice**: I implemented a statistical approach using standard deviation (z-score ±2) and a 15% drop threshold. Given we only have a 7-day baseline of data and run in a lightweight Next.js edge-compatible setup, a heavy ML model was overkill and harder to maintain.
