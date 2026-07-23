#!/usr/bin/env python3
"""Education CRM agent — mock tools for now, real API tools land in the next milestone."""

from __future__ import annotations

import argparse
import json
import os
import sys
import threading
import time

from dotenv import load_dotenv

load_dotenv()

from guardrails import (
    GuardrailError,
    assert_tool_allowed,
    assert_within_budget,
    max_steps_instruction,
    run_with_timeout,
)
from tracing import log_step, reset_log

_step = 0
# The SDK dispatches independent tool calls on worker threads, so the counter
# needs a lock or concurrent calls end up sharing a step number.
_step_lock = threading.Lock()

# Set to the api_crm module in API mode so traces can carry HTTP statuses.
_status_source = None


def reset_steps() -> None:
    global _step
    with _step_lock:
        _step = 0


def steps_used() -> int:
    return _step


def _current_status() -> int | None:
    return _status_source.last_status() if _status_source else None


def guarded(name: str, fn):
    """Wrap a tool with the allowlist, step budget, timeout and trace logging."""

    def call(**kwargs):
        global _step
        with _step_lock:
            _step += 1
            step = _step

        started = time.perf_counter()
        elapsed = lambda: (time.perf_counter() - started) * 1000

        def invoke(**call_kwargs):
            # The status is thread-local and run_with_timeout uses a worker
            # thread, so it has to be read here rather than by the caller.
            return fn(**call_kwargs), _current_status()

        try:
            # Inside the try so a blocked call still reaches the trace.
            assert_tool_allowed(name)
            assert_within_budget(step)
            result, status = run_with_timeout(invoke, kwargs)
        except Exception as exc:
            log_step(
                step,
                name,
                kwargs,
                error=str(exc),
                duration_ms=elapsed(),
                http_status=getattr(exc, "status", None),
            )
            raise

        log_step(
            step,
            name,
            kwargs,
            result=result,
            duration_ms=elapsed(),
            http_status=status,
        )
        return result if isinstance(result, str) else json.dumps(result, ensure_ascii=False)

    return call


def build_agent(use_api: bool = False):
    global _status_source

    try:
        from agents import Agent, ModelSettings, function_tool
    except ImportError:
        print("Dependencies missing. Build the image: docker compose build agent", file=sys.stderr)
        sys.exit(1)

    if use_api:
        from tools import api_crm as crm

        _status_source = crm
    else:
        from tools import mock_crm as crm

        _status_source = None

    @function_tool
    def list_schools() -> str:
        """List every school in the CRM."""
        return guarded("list_schools", crm.list_schools)()

    @function_tool
    def search_schools(query: str) -> str:
        """Find schools whose name or city matches the query."""
        return guarded("search_schools", crm.search_schools)(query=query)

    @function_tool
    def search_courses(query: str) -> str:
        """Find courses whose title or subject matches the query."""
        return guarded("search_courses", crm.search_courses)(query=query)

    @function_tool
    def search_students(query: str) -> str:
        """Find students whose full name or email matches the query."""
        return guarded("search_students", crm.search_students)(query=query)

    @function_tool
    def get_school(school_id: int) -> str:
        """Read one school by its id."""
        return guarded("get_school", crm.get_school)(school_id=school_id)

    @function_tool
    def get_course(course_id: int) -> str:
        """Read one course by its id."""
        return guarded("get_course", crm.get_course)(course_id=course_id)

    @function_tool
    def get_student(student_id: int) -> str:
        """Read one student by their id."""
        return guarded("get_student", crm.get_student)(student_id=student_id)

    @function_tool
    def get_school_courses(school_id: int) -> str:
        """List the courses that belong to a school."""
        return guarded("get_school_courses", crm.get_school_courses)(school_id=school_id)

    @function_tool
    def get_school_students(school_id: int) -> str:
        """List the students that belong to a school."""
        return guarded("get_school_students", crm.get_school_students)(school_id=school_id)

    @function_tool
    def get_student_enrollments(student_id: int) -> str:
        """List a student's enrollment rows. Each row has a course_id to look up."""
        return guarded("get_student_enrollments", crm.get_student_enrollments)(student_id=student_id)

    @function_tool
    def get_course_enrollments(course_id: int) -> str:
        """List a course's enrollment rows. Each row has a student_id to look up."""
        return guarded("get_course_enrollments", crm.get_course_enrollments)(course_id=course_id)

    @function_tool
    def draft_enrollment_summary(student_name: str, courses: str) -> str:
        """Draft a short enrollment summary for a student from their course list."""

        def build(student_name: str, courses: str) -> str:
            return (
                f"Enrollment summary — {student_name}\n\n"
                f"Currently enrolled in:\n{courses}\n\n"
                "Please contact the registrar with any questions."
            )

        return guarded("draft_enrollment_summary", build)(
            student_name=student_name, courses=courses
        )

    @function_tool
    def draft_welcome_email(student_name: str, school_name: str, courses: str) -> str:
        """Draft a welcome email for a student who has just joined a school."""

        def build(student_name: str, school_name: str, courses: str) -> str:
            return (
                f"Subject: Welcome to {school_name}, {student_name}!\n\n"
                f"Hi {student_name},\n\n"
                f"We are glad to have you at {school_name}. Your courses:\n{courses}\n\n"
                "Best regards,\nThe Registrar"
            )

        return guarded("draft_welcome_email", build)(
            student_name=student_name, school_name=school_name, courses=courses
        )

    @function_tool
    def create_school(name: str, city: str = "") -> str:
        """Create a school. Returns the created row including its new id."""
        return guarded("create_school", crm.create_school)(name=name, city=city or None)

    @function_tool
    def create_course(school_id: int, title: str, subject: str = "", credits: int = 0) -> str:
        """Create a course under a school. Returns the created row including its new id."""
        return guarded("create_course", crm.create_course)(
            school_id=school_id, title=title, subject=subject or None, credits=credits
        )

    @function_tool
    def create_student(school_id: int, full_name: str, email: str) -> str:
        """Create a student under a school. Returns the created row including its new id."""
        return guarded("create_student", crm.create_student)(
            school_id=school_id, full_name=full_name, email=email
        )

    @function_tool
    def create_enrollment(student_id: int, course_id: int, status: str = "active") -> str:
        """Enrol a student in a course. Status is active, completed or dropped."""
        return guarded("create_enrollment", crm.create_enrollment)(
            student_id=student_id, course_id=course_id, status=status
        )

    tools = [
        list_schools,
        search_schools,
        search_courses,
        search_students,
        get_school,
        get_course,
        get_student,
        get_school_courses,
        get_school_students,
        get_student_enrollments,
        get_course_enrollments,
        draft_enrollment_summary,
        draft_welcome_email,
    ]

    if use_api:
        tools += [create_school, create_course, create_student, create_enrollment]

    instructions = (
        "You are an assistant for an education CRM holding schools, courses, students "
        "and enrollments. Answer by calling tools rather than guessing.\n"
        "The tools are deliberately small: search for a record to get its id, then use "
        "that id to read related rows. Enrollment rows only carry course_id and "
        "student_id, so look those up when you need titles or names.\n"
        "When asked for a summary or an email, gather the data first, then call the "
        "matching draft tool.\n"
    )

    if use_api:
        instructions += (
            "You can also create records. Create the parent first and reuse the id from "
            "the response: a course and a student both need a school_id, and an enrollment "
            "needs the student_id and course_id you just created. A student can only be "
            "enrolled in a course from their own school.\n"
            "Create the parent first and take the id from its response: a course and a "
            "student need the school_id of the school you just created, and an enrollment "
            "needs the student_id and course_id from the creates before it. Never guess an "
            "id or reuse one from an earlier request.\n"
            "Create each record exactly once per request. If a create fails because the "
            "record already exists, search for it and carry on with the id you find "
            "instead of retrying the create.\n"
        )

    instructions += max_steps_instruction()

    return Agent(
        name="Education CRM Agent",
        instructions=instructions,
        tools=tools,
        # Dependent creates need the id from the previous response, and calls
        # dispatched together cannot see each other's results.
        model_settings=ModelSettings(parallel_tool_calls=False),
    )


def run_once(agent, prompt: str, history: list | None):
    from agents import Runner

    reset_steps()
    agent_input = (history + [{"role": "user", "content": prompt}]) if history else prompt
    result = Runner.run_sync(agent, agent_input)
    return result.final_output, result.to_input_list()


EXIT_WORDS = {"exit", "quit", "q"}


def chat_loop(agent) -> None:
    print("Education CRM agent ready. Type a request, or 'exit' to quit.\n")
    history: list | None = None
    while True:
        try:
            prompt = input("crm> ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nBye.")
            return
        if not prompt:
            continue
        if prompt.lower() in EXIT_WORDS:
            print("Bye.")
            return
        try:
            answer, history = run_once(agent, prompt, history)
            print(f"\n{answer}\n")
        except GuardrailError as exc:
            print(f"\n[guardrail] {exc}\n")
        except Exception as exc:
            print(f"\n[error] {exc}\n")


def check_api_ready() -> None:
    """Fail with a usable message instead of letting the agent answer from an empty CRM."""
    from tools import api_crm

    try:
        schools = api_crm.list_schools()
    except Exception as exc:
        print(f"Cannot reach the CRM API at {api_crm.base_url()}: {exc}", file=sys.stderr)
        print("Start it with: docker compose up -d db api", file=sys.stderr)
        sys.exit(1)

    if not schools:
        print("The CRM has no schools. Load the demo data with: cd api && npm run seed", file=sys.stderr)
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Education CRM agent")
    parser.add_argument(
        "prompt",
        nargs="?",
        default="Find Bright Future Academy, list its courses and students, "
        "then draft an enrollment summary for Olena Kovalenko.",
    )
    parser.add_argument("--chat", action="store_true", help="interactive session")
    parser.add_argument("--keep-log", action="store_true", help="append to the existing trace")
    parser.add_argument(
        "--mock",
        action="store_true",
        help="use in-memory mock data instead of the CRM API (read-only, no database needed)",
    )
    args = parser.parse_args()

    if not os.getenv("OPENAI_API_KEY"):
        print("OPENAI_API_KEY is not set", file=sys.stderr)
        sys.exit(1)

    use_api = not args.mock

    if use_api:
        check_api_ready()

    if not args.keep_log:
        reset_log()

    agent = build_agent(use_api=use_api)

    if args.mock:
        print("Using mock data.\n")

    if args.chat:
        chat_loop(agent)
        return

    answer, _ = run_once(agent, args.prompt, None)
    print(answer)


if __name__ == "__main__":
    main()
