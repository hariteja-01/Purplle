from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass
class ZoneDefinition:
    zone_id: str
    camera_id: str | None = None
    polygon: list[tuple[int, int]] | None = None
    bbox: tuple[int, int, int, int] | None = None
    kind: str = "generic"

    def contains(self, point: tuple[float, float]) -> bool:
        if self.bbox:
            x, y, w, h = self.bbox
            return x <= point[0] <= x + w and y <= point[1] <= y + h
        if self.polygon:
            return _point_in_polygon(point, self.polygon)
        return False


@dataclass
class CameraLayout:
    camera_id: str
    store_id: str
    zones: list[ZoneDefinition]
    open_hours: str | None = None


def load_layout(path: Path) -> dict[str, CameraLayout]:
    import json

    payload = json.loads(path.read_text(encoding="utf-8"))
    layouts: dict[str, CameraLayout] = {}
    stores = payload if isinstance(payload, dict) and "stores" not in payload else payload.get("stores", payload)
    if isinstance(stores, dict):
        iterator = stores.items()
    else:
        iterator = ((item["store_id"], item) for item in stores)
    for store_id, store_data in iterator:
        cameras = store_data.get("cameras") or store_data.get("camera_layouts") or []
        for camera in cameras:
            camera_id = camera.get("camera_id") or camera.get("id")
            zones = []
            for zone in camera.get("zones", []):
                zones.append(
                    ZoneDefinition(
                        zone_id=zone.get("zone_id") or zone.get("name") or zone.get("id"),
                        camera_id=camera_id,
                        bbox=_normalize_bbox(zone.get("bbox") or zone.get("region")),
                        polygon=_normalize_polygon(zone.get("polygon")),
                        kind=zone.get("kind", "generic"),
                    )
                )
            if not zones:
                zones = _fallback_zones(camera_id)
            layouts[camera_id] = CameraLayout(camera_id=camera_id, store_id=store_id, zones=zones, open_hours=store_data.get("open_hours"))
    return layouts


def _fallback_zones(camera_id: str) -> list[ZoneDefinition]:
    lowered = camera_id.lower()
    if "entry" in lowered:
        return [ZoneDefinition(zone_id="ENTRY_THRESHOLD", bbox=(0, 0, 640, 1080), kind="entry")]
    if "bill" in lowered:
        return [ZoneDefinition(zone_id="BILLING", bbox=(760, 300, 320, 540), kind="billing")]
    return [ZoneDefinition(zone_id="MAIN_FLOOR", bbox=(200, 120, 860, 860), kind="floor")]


def _normalize_bbox(value):
    if not value:
        return None
    if isinstance(value, dict):
        return int(value.get("x", 0)), int(value.get("y", 0)), int(value.get("w", value.get("width", 0))), int(value.get("h", value.get("height", 0)))
    if isinstance(value, (list, tuple)) and len(value) == 4:
        return int(value[0]), int(value[1]), int(value[2]), int(value[3])
    return None


def _normalize_polygon(value):
    if not value:
        return None
    if isinstance(value, list):
        return [(int(point[0]), int(point[1])) for point in value]
    return None


def _point_in_polygon(point: tuple[float, float], polygon: list[tuple[int, int]]) -> bool:
    x, y = point
    inside = False
    previous = polygon[-1]
    for current in polygon:
        if ((current[1] > y) != (previous[1] > y)) and (x < (previous[0] - current[0]) * (y - current[1]) / ((previous[1] - current[1]) or 1) + current[0]):
            inside = not inside
        previous = current
    return inside
