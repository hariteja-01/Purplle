from __future__ import annotations

import uvicorn

from .settings import get_settings


def main() -> None:
    # Keep `python -m store_intelligence` aligned with docker-compose entrypoint.
    settings = get_settings()
    uvicorn.run(
        "store_intelligence.api.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=False,
    )


if __name__ == "__main__":
	main()
