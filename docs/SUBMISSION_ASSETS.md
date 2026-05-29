# Apex Retail Store Intelligence Platform

Built for the Purplle Tech Challenge 2026 Round 2. An end-to-end edge-to-cloud retail intelligence solution converting raw CCTV camera footage into real-time operational insights, conversion funnel metrics, and anomaly alerts.

---

## 1. Submission Details

* **Submission Title:** Apex Retail Store Intelligence Platform
* **Description:** A production-ready CCTV analytics pipeline and queryable REST API designed to solve the retail "offline blind spot." By processing raw cctv streams, tracking visitors dynamically using centroid trajectories with Re-ID registries, and correlating presence data against checkout transactions, the system computes store conversion rates, heatmaps, and funnel drop-offs with absolute precision. Includes a live-updating operator dashboard (SSE-driven).
* **Architecture:** Edge-to-Cloud divided into a deterministic OpenCV motion-segmentation and tracking pipeline, a high-throughput FastAPI ingest service with idempotency guarantees, an SQLite data warehouse using SQL-level session reconstruction, and a real-time visualization layer.

---

## 2. Business Value & Impact

* **Offline Store Conversion Rate (North Star):** Direct measurement of offline conversion (Purchases / Unique Visitors) by correlating billing-zone visitor presence against POS transaction timestamps.
* **Leakage Detection:** Pinpoints exactly where store layout or checkout speeds fail (Zone drop-off vs. Queue abandonment).
* **Operational Audits:** Automatically alerts managers of active bottlenecks (e.g. queue spikes exceeding thresholds) or technical issues (stale feeds, dead zones) in real time.
* **Deduplication:** Excludes staff paths from conversion metrics and deduplicates re-entry sessions, preventing vendor-side inflation of store traffic.

---

## 3. Key Feature Highlights

1. **Idempotent Ingest Pipeline:** Handles batches of up to 500 events safely, ignoring duplicates (by `event_id`) and allowing partial success for invalid objects.
2. **Re-entry Re-ID Tracking:** Uses bounding box feature/color hashing to identify returning customers within 10 minutes and classify them under `REENTRY` rather than inflating unique traffic counts.
3. **Calibrated Confidence:** Penalyzes tracking confidence when bounding box area is low or skinny (indicating occlusion) and flags events without dropping them.
4. **Greedy Transaction Attribution:** Correlates transactions to the closest eligible session to prevent double-counting, giving a highly accurate conversion metric.
5. **SSE Dashboard:** A dark-themed, glassmorphic operator dashboard displaying live traffic, real-time funnel drop-offs, normalized heatmaps, and active system alerts.

---

## 4. Instructions to Run

### Local Quickstart
```bash
# 1. Clone repository
git clone <repo-url> && cd Purplle_Round2

# 2. Build and run docker container
docker compose up --build -d

# 3. Stream a video clip through the pipeline
docker compose exec api python -m store_intelligence.pipeline.detect \
  --video /app/data/clips/STORE_BLR_002_CAM_ENTRY_01.mp4 \
  --layout /app/data/store_layout.json \
  --output /app/data/events.jsonl \
  --api-url http://localhost:8000
```
* **Dashboard URL:** `http://localhost:8000/dashboard`
* **Health Endpoint:** `http://localhost:8000/health`

---

## 5. Walkthrough & Demo Script

### Demo Flow
1. **System Health:** Open `/health` showing all stores status: `lag_minutes` and `stale_feed: false`.
2. **Open Dashboard:** Navigate to `/dashboard` showing live metrics for `STORE_BLR_002` connected.
3. **Simulate Influx:** Run `smoke_http.py` or feed a video. Watch the Unique Visitors, Conversion Rate, and Queue Depth update live.
4. **Bottle-neck Alert:** Observe `BILLING_QUEUE_SPIKE` or `DEAD_ZONE` anomaly appear dynamically with suggested operational action.
5. **Analytics Drill-down:** Query the `/funnel` and `/heatmap` JSON endpoints to show the clean structure of the response payload.

### Presentation Structure
* **Introduction (1 min):** Highlighting the retail blind spot problem.
* **Pipeline Deep Dive (2 mins):** Explaining tracking heuristics, group-splitting, and Re-ID logic.
* **API & Data Warehouse (1.5 mins):** POS transaction correlation window and SQL session-reconstruction query structure.
* **Live Demo (1.5 mins):** Visualizing events stream on the SSE dashboard and showing health alerts.
* **Conclusion & Scalability (1 min):** How to scale from SQLite to PostgreSQL + Kafka for 40 stores.
