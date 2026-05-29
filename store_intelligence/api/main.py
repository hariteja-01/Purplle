from __future__ import annotations

import asyncio
import csv
import json
import logging
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.exc import DBAPIError, OperationalError
from sqlalchemy.orm import Session

from ..analytics import compute_anomalies, compute_funnel, compute_health, compute_heatmap, compute_metrics
from ..db import PosTransactionRecord, SessionLocal, get_db, init_db
from ..repository import insert_pos_transactions
from ..schemas import AnomalyResponse, FunnelResponse, HeatmapResponse, IngestResponse, MetricResponse
from ..services import ingest_events
from ..settings import get_settings

logger = logging.getLogger("store_intelligence")

templates = Jinja2Templates(directory=str(Path(__file__).parent / "templates"))


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    _load_pos_transactions_if_configured()
    yield


from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Store Intelligence API", version="1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _load_pos_transactions_if_configured() -> None:
    settings = get_settings()

    candidates: list[Path] = []
    if settings.pos_csv_path is not None:
        candidates.append(settings.pos_csv_path)
    # Common dataset mount path in docker-compose
    candidates.append(settings.data_dir / "pos_transactions.csv")

    csv_path = next((path for path in candidates if path.exists()), None)
    if csv_path is None:
        return

    try:
        rows = []
        with csv_path.open("r", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            for raw in reader:
                try:
                    timestamp = datetime.fromisoformat(str(raw["timestamp"]).replace("Z", "+00:00")).astimezone(timezone.utc)
                    rows.append(
                        PosTransactionRecord(
                            store_id=str(raw["store_id"]),
                            transaction_id=str(raw["transaction_id"]),
                            timestamp=timestamp,
                            basket_value_inr=float(raw["basket_value_inr"]),
                        )
                    )
                except Exception:
                    continue
        if not rows:
            return
        # Use a short-lived session (startup is sync)
        from ..db import SessionLocal

        with SessionLocal() as session:
            insert_pos_transactions(session, rows)
            logger.info(json.dumps({"event": "pos_ingested", "path": str(csv_path), "rows": len(rows)}))
    except Exception as exc:  # pragma: no cover
        logger.warning(json.dumps({"event": "pos_ingest_failed", "path": str(csv_path), "error": str(exc)}))


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    trace_id = request.headers.get("x-trace-id") or str(uuid.uuid4())
    request.state.trace_id = trace_id

    event_count: int | None = None
    if request.url.path == "/events/ingest" and request.method.upper() == "POST":
        body = await request.body()
        request.state.raw_body = body
        try:
            payload = json.loads(body.decode("utf-8")) if body else []
            if isinstance(payload, list):
                event_count = len(payload)
        except Exception:
            event_count = None

    start = time.perf_counter()
    status_code: int | None = None
    try:
        response = await call_next(request)
        status_code = response.status_code
    except Exception:
        status_code = 500
        raise
    finally:
        latency_ms = round((time.perf_counter() - start) * 1000, 2)
        store_id = request.path_params.get("store_id") or request.path_params.get("id")
        logger.info(
            json.dumps(
                {
                    "trace_id": trace_id,
                    "store_id": store_id,
                    "endpoint": request.url.path,
                    "method": request.method,
                    "latency_ms": latency_ms,
                    "event_count": event_count,
                    "status_code": status_code,
                }
            )
        )

    response.headers["x-trace-id"] = trace_id
    return response


@app.exception_handler(OperationalError)
async def operational_error_handler(request: Request, exc: OperationalError):
    trace_id = getattr(request.state, "trace_id", None)
    return JSONResponse(
        status_code=503,
        content={
            "error": "db_unavailable",
            "detail": "Database unavailable. Retry.",
            "trace_id": trace_id,
        },
    )


@app.exception_handler(DBAPIError)
async def dbapi_error_handler(request: Request, exc: DBAPIError):
    trace_id = getattr(request.state, "trace_id", None)
    return JSONResponse(
        status_code=503,
        content={
            "error": "db_unavailable",
            "detail": "Database unavailable. Retry.",
            "trace_id": trace_id,
        },
    )


@app.post("/events/ingest", response_model=IngestResponse)
async def ingest(request: Request, db: Session = Depends(get_db)):
    # Prefer the middleware-captured body to avoid double JSON parsing and to keep request logging consistent.
    try:
        raw = getattr(request.state, "raw_body", None)
        payload: Any = json.loads(raw.decode("utf-8")) if raw else await request.json()
    except Exception as exc:
        raise HTTPException(status_code=422, detail="invalid JSON body") from exc

    if not isinstance(payload, list):
        raise HTTPException(status_code=422, detail="payload must be a list of events")
    if len(payload) > 500:
        raise HTTPException(status_code=413, detail="batch limit exceeded (max 500 events)")

    return ingest_events(db, payload)


@app.get("/stores/{store_id}/metrics", response_model=MetricResponse)
def metrics(store_id: str, db: Session = Depends(get_db)):
    return compute_metrics(db, store_id)


@app.get("/stores/{store_id}/funnel", response_model=FunnelResponse)
def funnel(store_id: str, db: Session = Depends(get_db)):
    return compute_funnel(db, store_id)


@app.get("/stores/{store_id}/heatmap", response_model=HeatmapResponse)
def heatmap(store_id: str, db: Session = Depends(get_db)):
    return compute_heatmap(db, store_id)


@app.get("/stores/{store_id}/anomalies", response_model=AnomalyResponse)
def anomalies(store_id: str, db: Session = Depends(get_db)):
    return compute_anomalies(db, store_id)


@app.get("/health")
def health(db: Session = Depends(get_db)):
    return compute_health(db)


@app.get("/dashboard", response_class=HTMLResponse)
def dashboard(request: Request, store_id: str = "STORE_BLR_002"):
    settings = get_settings()
    return templates.TemplateResponse(
        request,
        "dashboard.html",
        {
            "store_id": store_id,
            "refresh_ms": settings.dashboard_refresh_ms,
        },
    )


@app.get("/stream/stores/{store_id}/metrics")
async def stream_metrics(store_id: str):
    settings = get_settings()

    async def event_stream():
        while True:
            with SessionLocal() as db:
                metrics = compute_metrics(db, store_id).model_dump(mode="json")
            yield f"event: metrics\ndata: {json.dumps(metrics)}\n\n"
            await asyncio.sleep(max(0.25, settings.dashboard_refresh_ms / 1000.0))

    return StreamingResponse(event_stream(), media_type="text/event-stream")
