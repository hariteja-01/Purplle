from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from uuid import uuid4

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"


def _get(path: str) -> tuple[int, str]:
    req = urllib.request.Request(f"{BASE}{path}", method="GET")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8")


def _post_json(path: str, payload: object) -> tuple[int, str]:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE}{path}",
        method="POST",
        data=body,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8")


def main() -> int:
    status, body = _get("/health")
    print("GET /health", status)
    if status != 200:
        print(body)
        return 2

    status, body = _get("/dashboard?store_id=STORE_BLR_002")
    print("GET /dashboard", status, "has-title=", "Store Intelligence" in body)
    if status != 200:
        return 2

    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    events = [
        {
            "event_id": str(uuid4()),
            "store_id": "STORE_BLR_002",
            "camera_id": "CAM_ENTRY_01",
            "visitor_id": "VIS_1",
            "event_type": "ENTRY",
            "timestamp": now,
            "zone_id": None,
            "dwell_ms": 0,
            "is_staff": False,
            "confidence": 0.9,
            "metadata": {"queue_depth": None, "sku_zone": None, "session_seq": 1},
        },
        {
            "event_id": str(uuid4()),
            "store_id": "STORE_BLR_002",
            "camera_id": "CAM_ENTRY_01",
            "visitor_id": "VIS_1",
            "event_type": "ZONE_ENTER",
            "timestamp": now,
            "zone_id": "SKINCARE",
            "dwell_ms": 0,
            "is_staff": False,
            "confidence": 0.9,
            "metadata": {"queue_depth": None, "sku_zone": "SKINCARE", "session_seq": 1},
        },
        {
            "event_id": str(uuid4()),
            "store_id": "STORE_BLR_002",
            "camera_id": "CAM_BILLING_01",
            "visitor_id": "VIS_2",
            "event_type": "BILLING_QUEUE_JOIN",
            "timestamp": now,
            "zone_id": "BILLING",
            "dwell_ms": 0,
            "is_staff": False,
            "confidence": 0.9,
            "metadata": {"queue_depth": 5, "sku_zone": "BILLING", "session_seq": 1},
        },
    ]

    status, body = _post_json("/events/ingest", events)
    print("POST /events/ingest", status)
    if status != 200:
        print(body)
        return 2

    ingest = json.loads(body)
    print("  accepted=", ingest.get("accepted"), "rejected=", ingest.get("rejected"), "duplicates=", ingest.get("duplicates"))

    status, body = _get("/stores/STORE_BLR_002/metrics")
    print("GET /stores/STORE_BLR_002/metrics", status)
    if status == 200:
        metrics = json.loads(body)
        print("  unique_visitors=", metrics.get("unique_visitors"), "queue_depth=", metrics.get("queue_depth"))

    status, body = _get("/stores/STORE_BLR_002/funnel")
    print("GET /stores/STORE_BLR_002/funnel", status)
    if status == 200:
        funnel = json.loads(body)
        stages = funnel.get("stages", [])
        print("  stages=", len(stages), "purchase_count=", (stages[-1].get("count") if stages else None))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
