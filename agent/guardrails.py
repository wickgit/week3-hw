"""Guardrails applied around every tool call: allowlist, step budget, timeout."""

from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout


class GuardrailError(RuntimeError):
    """Raised when a guardrail blocks or aborts a tool call."""


ALLOWED_TOOLS = {
    "list_schools",
    "search_schools",
    "search_courses",
    "search_students",
    "get_school",
    "get_course",
    "get_student",
    "get_school_courses",
    "get_school_students",
    "get_student_enrollments",
    "get_course_enrollments",
    "draft_enrollment_summary",
    "draft_welcome_email",
    "create_school",
    "create_course",
    "create_student",
    "create_enrollment",
}


def max_steps() -> int:
    return int(os.getenv("MAX_AGENT_STEPS", "12"))


def tool_timeout() -> float:
    return float(os.getenv("TOOL_TIMEOUT_SECONDS", "20"))


def assert_tool_allowed(name: str) -> None:
    if name not in ALLOWED_TOOLS:
        raise GuardrailError(f"Tool '{name}' is not on the allowlist")


def assert_within_budget(step: int) -> None:
    limit = max_steps()
    if step > limit:
        raise GuardrailError(f"Max agent steps exceeded ({limit})")


def max_steps_instruction() -> str:
    return (
        f"Use at most {max_steps()} tool calls per request. "
        "Prefer the smallest set of calls that answers the question."
    )


def run_with_timeout(fn, kwargs: dict):
    """Run fn(**kwargs) under a wall-clock timeout.

    The tools are blocking HTTP/dict lookups, so a worker thread plus a timed
    join is enough to stop one slow call from stalling the whole run. The thread
    itself cannot be killed, so the pool is left to shut down on its own.
    """
    executor = ThreadPoolExecutor(max_workers=1)
    future = executor.submit(fn, **kwargs)
    try:
        return future.result(timeout=tool_timeout())
    except FutureTimeout:
        raise GuardrailError(f"Tool timed out after {tool_timeout()}s") from None
    finally:
        executor.shutdown(wait=False)
