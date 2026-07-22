"""Append-only JSONL trace of every tool call the agent makes."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_TRACE = Path(__file__).resolve().parent.parent / "logs" / "trace.jsonl"


def trace_path() -> Path:
    return Path(os.getenv("TRACE_LOG") or DEFAULT_TRACE)


def reset_log() -> None:
    path = trace_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("", encoding="utf-8")


def log_step(
    step: int,
    tool: str,
    args: dict,
    result=None,
    error: str | None = None,
    duration_ms: float | None = None,
    http_status: int | None = None,
) -> None:
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "step": step,
        "tool": tool,
        "args": args,
        "ok": error is None,
    }
    if duration_ms is not None:
        entry["duration_ms"] = round(duration_ms, 1)
    if http_status is not None:
        entry["http_status"] = http_status
    if error is not None:
        entry["error"] = error
    else:
        entry["result"] = result

    path = trace_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False, default=str) + "\n")
