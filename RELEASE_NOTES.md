# Release Notes — Store Intelligence Platform (v1.0.0)

We are proud to release version 1.0.0 of the **Store Intelligence Platform**, built for the Purplle Tech Challenge 2026 Round 2. This repository delivers an end-to-end, production-ready, containerized pipeline and FastAPI-based REST API that processes raw CCTV footage and returns actionable store-level metrics.

---

## 🚀 Key Engineering Highlights

### 1. Robust Centroid-Tracking & Re-ID Pipeline
* **Group Entry Splitting:** Uses dynamic aspect ratio thresholds to split large bounding boxes, correctly counting individual visitors entering in groups rather than treating them as a single person.
* **Staff Filtering:** Combines path span, zone dwell diversity, and session length to accurately separate staff movements from visitor events.
* **Dynamic Re-entry Handling:** Fingerprints recently exited visitors and recognizes returning customers within a 10-minute window, mapping them to a `REENTRY` event and preventing traffic count inflation.

### 2. High-Throughput FastAPI REST API
* **Idempotent Ingestion:** Employs SQLAlchemy-level database lookups to ensure that replayed events (by `event_id`) are safely ignored and returned with a `duplicate` status.
* **Partial Ingestion Success:** Individually validates and rejects malformed objects in a batch while committing valid events, returning an accurate `accepted` vs `rejected` counts payload.
* **Outage Resilience:** Configured with custom database error handling middleware that captures DB failures (e.g. SQLite locks) and returns clean HTTP 503 Service Unavailable responses instead of stack traces.

### 3. POS-Correlated Conversion Rate Heuristics
* **Window-based Attribution:** Instead of relying on simulated in-camera purchase signals, conversion is derived by correlating billing-zone visitor sessions with real POS transactions from `pos_transactions.csv` within a 5-minute window, using a greedy attribution model to prevent double-counting.

### 4. Interactive SSE Operator Dashboard
* **Dynamic Analytics UI:** A responsive, dark-themed dashboard updating in real time using Server-Sent Events (SSE) from the metrics stream.
* **Detailed Visualizations:** Displays key performance indicators (KPIs), conversion funnel stages (Entry → Zone Visit → Queue → Purchase), normalized heatmaps, and a live anomaly/alert feed.
* **CORS & Split-Deployment Support:** CORS middleware enabled on the API and path dynamicization in the dashboard (`backend_url` query param) allow hosting the frontend on Vercel while querying a separate API backend.

---

## 🛠 Release Checklist Status
All production readiness checks are fully complete:
* [x] **Containerization:** Clean, multi-platform Dockerfile & docker-compose.yml verified.
* [x] **Test Coverage:** 42 tests passed with **74% code coverage** targeting edge cases.
* [x] **Documentation:** Comprehensive `README.md`, `DESIGN.md`, `CHOICES.md`, `REVIEWER_GUIDE.md`, and `SUBMISSION_ASSETS.md` written.
* [x] **Clean Repository:** Datasets, database files, and build artifacts properly gitignored.
