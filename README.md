# Apex Retail Intelligence System

An end-to-end retail intelligence platform that simulates CCTV edge detections, ingests them into a robust API, correlates them with POS transactions, and provides real-time insights via a live dashboard.

## 🚀 Quick Start (5 Commands)

```bash
git clone https://github.com/hariteja-01/Purplle
cd Purplle
npm install
npm run db:setup
npm run dev
```

Then visit [http://localhost:3000/demo](http://localhost:3000/demo) for an interactive guided walkthrough!

## 🧪 Validating the System

### Running the Live Simulation
The system includes an active simulation engine that generates realistic visitor journeys.
1. Open the Dashboard at [http://localhost:3000/dashboard](http://localhost:3000/dashboard)
2. Use the **Play/Stop/Reset** buttons in the top right header to control the simulation.
3. Watch the Live Event Feed, KPI Cards, and Anomaly alerts update in real-time.

### Manual Event Injection (cURL)

The ingest API is strictly validated and idempotent. Test it yourself:

```bash
curl -X POST http://localhost:3000/api/events/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "event_id": "550e8400-e29b-41d4-a716-446655440000",
    "store_id": "STORE_BLR_001",
    "camera_id": "CAM_ENTRY_01",
    "visitor_id": "VIS_abc123",
    "event_type": "ENTRY",
    "timestamp": "2026-03-03T14:22:10Z",
    "zone_id": "ENTRY",
    "dwell_ms": 0,
    "is_staff": false,
    "confidence": 0.95,
    "metadata": {
      "session_seq": 1
    }
  }'
```

### Running the Test Suite
The project uses Vitest for comprehensive API and edge-case testing.

```bash
npm run test
```

## 🏗️ Architecture
See [DESIGN.md](./DESIGN.md) and [CHOICES.md](./CHOICES.md) for detailed architectural decisions and trade-offs.

## 🐳 Docker Deployment

To run the system in a completely isolated Docker environment:

```bash
docker-compose up --build
```
