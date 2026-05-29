# Design Choices

This document covers three key decisions — detection model selection, event schema design, and API architecture — with full reasoning, alternatives considered, AI input, and final rationale.

---

## 1. Detection Model Choice

### Options Considered

| Option | Pros | Cons |
|--------|------|------|
| **YOLOv8 / RT-DETR** | State-of-the-art person detection accuracy, handles occlusion well, pre-trained on COCO | Requires model weight download (~25–50 MB), GPU recommended for real-time, adds `ultralytics` dependency, startup latency |
| **MediaPipe Pose / Holistic** | Lightweight, runs on CPU, good skeleton detection | Designed for single-person or few-person scenarios, poor performance in crowded retail scenes |
| **OpenCV MOG2 + heuristic tracker** | Zero model downloads, CPU-only, deterministic, fast startup, trivially containerized | Lower detection accuracy, struggles with stationary people, no learned person features |
| **Hybrid: YOLO for detection + heuristic fallback** | Best accuracy with graceful degradation | Complexity of maintaining two code paths for a take-home |

### What AI Suggested

I used Claude to evaluate the trade-offs between YOLOv8 and the OpenCV heuristic approach. The AI recommended YOLOv8 as the default because:

- Pre-trained COCO weights detect people with >90% mAP
- Built-in ByteTrack integration handles multi-object tracking
- The `ultralytics` library provides a clean Python API

The AI also flagged that RT-DETR would be a strong alternative for transformer-based detection, but noted the larger model size.

### What I Chose and Why

I chose **OpenCV MOG2 + SimpleTracker** as the default implementation, with a clear architectural seam for swapping in a heavier detector.

**Rationale:**

1. **Acceptance gate compliance.** The challenge requires `docker compose up` to start everything on a clean machine. YOLOv8 requires downloading ~25 MB of weights on first run, which could fail in air-gapped environments or slow networks. The acceptance gate is binary — if it fails, the submission scores zero.

2. **Reproducibility over accuracy.** The challenge explicitly states: *"What if my detection isn't perfect? That's expected — production CV systems are never perfect. What we evaluate is how you handle uncertainty, confidence thresholds, and edge cases — not a perfect detection rate."* The heuristic pipeline handles uncertainty explicitly through calibrated confidence scores rather than suppressing low-confidence detections.

3. **Architectural readiness.** The detection pipeline is a single module (`store_intelligence.pipeline.detect`) with a clear interface boundary (the Pydantic event schema). Swapping the detector to YOLOv8 requires changing one class (`MotionDetector` → a YOLO wrapper) without touching the event builder, API, or analytics layer. The architecture is detector-agnostic by design.

4. **Edge case handling.** The heuristic approach required me to explicitly build solutions for group entry (bounding box splitting), staff classification (multi-signal rule-based), and partial occlusion (confidence degradation). These would be partially handled by YOLO's learned features, but would also introduce harder-to-debug failure modes. For a take-home evaluation where I need to explain every decision, explicit heuristics are more defensible than learned features.

**What would make me change this decision:** If the deployment environment guaranteed GPU availability and pre-cached model weights, I would switch to YOLOv8-nano with ByteTrack. The detection accuracy improvement would be significant (especially for stationary visitors and partial occlusion), and the architectural seam already exists to make the swap.

---

## 2. Event Schema Design Rationale

### Options Considered

| Option | Description | Trade-offs |
|--------|-------------|------------|
| **Raw frame-level detections** | One event per detection per frame (bounding box, track ID, timestamp) | Massive data volume (~18,000 events per minute at 15fps), downstream aggregation complexity, schema too low-level for analytics |
| **Minimal entry/exit schema** | Only ENTRY and EXIT events with visitor_id | Insufficient: cannot compute dwell, zone heatmap, queue depth, or funnel stages without zone-level events |
| **Rich visitor-session schema** (PDF spec) | Full event type catalogue with zone, dwell, billing, staff, confidence, and metadata fields | Higher implementation complexity, but directly supports all required API endpoints |

### What AI Suggested

I asked Claude to evaluate whether a minimal schema (ENTRY/EXIT only) could support the required API endpoints through post-hoc inference. The AI's analysis:

- Dwell and heatmap require `ZONE_ENTER` / `ZONE_DWELL` events — cannot be inferred from entry/exit alone
- Queue depth and abandonment require `BILLING_QUEUE_JOIN` / `BILLING_QUEUE_ABANDON`
- Staff exclusion requires an `is_staff` flag at the event level, not as a post-processing filter

The AI recommended keeping the schema minimal to reduce implementation risk. I disagreed — the PDF explicitly requires these fields, and a minimal schema would force complex post-hoc inference that is harder to test and debug.

### What I Chose and Why

I chose the **rich visitor-session schema** that matches the PDF specification exactly. Every field exists because at least one downstream query depends on it:

| Field | Required By |
|-------|-------------|
| `event_type` (full catalogue) | Funnel stages, anomaly detection, session reconstruction |
| `zone_id` | Heatmap, zone dwell, billing correlation |
| `dwell_ms` | Average dwell per zone in metrics |
| `is_staff` | Staff exclusion from all customer-facing metrics |
| `confidence` | Quality monitoring — low-confidence events are flagged, not dropped |
| `metadata.queue_depth` | Billing queue spike anomaly |
| `metadata.sku_zone` | Heatmap zone attribution |
| `metadata.session_seq` | Ordinal event ordering within a visitor session |

**Key design decision — no PURCHASE event type.** The PDF specifies that conversion is computed by correlating billing-zone presence with POS transactions in a time window. Adding a `PURCHASE` event type would create a second source of truth that could conflict with the POS data. The system uses the POS CSV as the ground-truth purchase signal and correlates it with billing-zone presence timestamps. This is more accurate and matches how real retail analytics systems work — the POS system is the authoritative source for transactions, not the camera.

---

## 3. API Architecture Choice

### Options Considered

| Option | Description | Trade-offs |
|--------|-------------|------------|
| **Kafka + stream processor** | Events ingested into Kafka, processed by a Flink/Spark consumer, metrics materialized into a read-optimized store | Production-grade scalability, but massive operational overhead for a take-home challenge. Requires Kafka, Zookeeper, and a stream processor in docker-compose. |
| **Background worker with cached metrics** | Events stored in DB, a periodic worker recomputes metrics and caches results | Reduces query latency, but introduces cache staleness and a second failure mode (worker crash). Harder to test correctness. |
| **Direct recomputation from relational store** | Events stored in SQLite via SQLAlchemy, analytics computed on every API request from the event table | Simple, testable, deterministic. Higher query latency at scale, but the challenge dataset is small. |

### What AI Suggested

The AI recommended a brokered architecture (Kafka + consumer) for "production realism" and to demonstrate distributed systems knowledge. It also suggested Redis as a caching layer for computed metrics.

I evaluated this against the scoring criteria:

- Part C (Production Readiness, 20 points) weights containerization, structured logging, idempotency, graceful degradation, and test coverage. It does not award points for distributed architecture complexity.
- The acceptance gate requires `docker compose up` to start everything. Adding Kafka + Zookeeper triples the compose file complexity and the probability of startup failure.

### What I Chose and Why

I chose **direct recomputation from SQLite** for the following reasons:

1. **Correctness is trivially verifiable.** Every metric is a function of `(events, POS transactions)` — there is no intermediate cache that could be stale. The reviewer can ingest events, query metrics, and verify the numbers match. With a cached architecture, there is always a question of "is the cache stale?"

2. **Zero-traffic correctness.** The PDF requires that the API handle zero-traffic correctly (no crash, no null). Direct recomputation naturally returns zeroes for empty stores. A cached architecture requires special handling for stores with no cached metrics.

3. **Single-command deployment.** SQLite is embedded — no separate database process. The docker-compose file has exactly one service. This minimizes the probability of startup failure and makes the reviewer's testing experience frictionless.

4. **Session reconstruction accuracy.** The funnel requires session-level analysis (not raw event counts). Sessions are reconstructed from the event stream using ENTRY/EXIT boundaries with an inactivity timeout. This logic is easier to test and debug when it runs synchronously on query rather than asynchronously in a background worker.

**What breaks at 40 live stores:** The direct recomputation approach scans all events for the current day on every `/metrics` request. At 40 stores with ~50K events/day each, this would exceed acceptable latency (~500ms per request). The first thing I would add is a materialized metrics table updated by a background worker on a 5-second interval, with the API reading from the materialized view. The second optimization would be time-partitioned event storage (daily tables or PostgreSQL partitioning). The current architecture supports this migration cleanly because the analytics module (`compute_metrics`) is a pure function of `(session, store_id)` — it can be called by either the API handler or a background worker without refactoring.