from __future__ import annotations

from pathlib import Path
from typing import Protocol

import httpx

from ..schemas import BehaviorEvent


class EventSink(Protocol):
    def emit(self, event: BehaviorEvent) -> None: ...


class JsonlSink:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def emit(self, event: BehaviorEvent) -> None:
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(event.model_dump_json())
            handle.write("\n")


class ApiSink:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")

    def emit(self, event: BehaviorEvent) -> None:
        with httpx.Client(timeout=10.0) as client:
            client.post(f"{self.base_url}/events/ingest", json=[event.model_dump(mode="json")])
