# PROMPT: Create a test that verifies the __main__.py entrypoint correctly calls uvicorn.run with the
# expected target, host, and port settings.
# CHANGES MADE: Used monkeypatch to stub uvicorn.run instead of actually starting the server, so the
# test runs instantly and does not bind ports.

from __future__ import annotations

import store_intelligence.__main__ as main_mod


def test_main_invokes_uvicorn(monkeypatch):
    calls = {}

    def fake_run(target: str, host: str, port: int, reload: bool):
        calls["target"] = target
        calls["host"] = host
        calls["port"] = port
        calls["reload"] = reload

    monkeypatch.setattr(main_mod.uvicorn, "run", fake_run)
    main_mod.main()

    assert calls["target"] == "store_intelligence.api.main:app"
    assert calls["host"]
    assert isinstance(calls["port"], int)
    assert calls["reload"] is False
