# Technical Choices & Trade-offs

## 1. Detection Model Choice
**Options Considered**: 
- Implement actual YOLOv8/v9 object detection on sample videos
- Use MediaPipe for browser-based detection
- Build a simulation engine generating synthetic events

**AI Suggestion**: The AI suggested using MediaPipe in the browser so the dashboard could show real "detections" on video elements.

**My Choice**: Simulation Engine (`lib/simulation.ts`).

**Reasoning**: The problem statement focuses heavily on the "data pipeline architecture, schema compliance, and API design" rather than computer vision accuracy. Real CV models introduce massive dependencies, hardware constraints (GPU requirements), and flakiness. A simulation engine allows me to reliably generate edge cases (partial occlusion, staff movement, group entries) to test the backend logic thoroughly.

---

## 2. Event Schema Design
**Options Considered**:
- Deeply nested JSON (e.g., `events: { entry: [...], zones: [...] }`)
- Flat schema (current implementation)
- Minimal schema (just ID and type)

**AI Suggestion**: The AI suggested a deeply nested schema to group events by visitor.

**My Choice**: Flat schema with `visitor_id` and `timestamp`.

**Reasoning**: A flat schema is the industry standard for event streaming platforms (Kafka, Kinesis). It makes writing to relational databases (SQLite, Postgres) or columnar databases (ClickHouse) trivial. Grouping by visitor can be easily done at query time via SQL `GROUP BY` or window functions.

---

## 3. API Architecture & Persistence
**Options Considered**:
- Express.js with PostgreSQL
- FastAPI (Python) with SQLAlchemy
- Next.js Route Handlers with `better-sqlite3`

**AI Suggestion**: AI strongly recommended Python/FastAPI since it's the standard for AI/data engineering tasks.

**My Choice**: Next.js Route Handlers with `better-sqlite3`.

**Reasoning**: Since this is a full-stack dashboard challenge, using Next.js allows me to keep the frontend and backend in a single repository and single language (TypeScript), drastically simplifying the setup process for the reviewer (just `npm install` and `npm run dev`). `better-sqlite3` was chosen because it's synchronous and extremely fast, avoiding the connection pooling complexities of remote databases during a demo.
