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


def reset_steps() -> None:
    global _step
    with _step_lock:
        _step = 0


def steps_used() -> int:
    return _step


def guarded(name: str, fn):
    """Wrap a tool with the allowlist, step budget, timeout and trace logging."""

    def call(**kwargs):
        global _step
        with _step_lock:
            _step += 1
            step = _step

        started = time.perf_counter()
        elapsed = lambda: (time.perf_counter() - started) * 1000

        try:
            # Inside the try so a blocked call still reaches the trace.
            assert_tool_allowed(name)
            assert_within_budget(step)
            result = run_with_timeout(fn, kwargs)
        except Exception as exc:
            log_step(step, name, kwargs, error=str(exc), duration_ms=elapsed())
            raise

        log_step(step, name, kwargs, result=result, duration_ms=elapsed())
        return result if isinstance(result, str) else json.dumps(result, ensure_ascii=False)

    return call


def build_agent():
    try:
        from agents import Agent, function_tool
    except ImportError:
        print("Dependencies missing. Build the image: docker compose build agent", file=sys.stderr)
        sys.exit(1)

    from tools import mock_crm as crm

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

    instructions = (
        "You are an assistant for an education CRM holding schools, courses, students "
        "and enrollments. Answer by calling tools rather than guessing.\n"
        "The tools are deliberately small: search for a record to get its id, then use "
        "that id to read related rows. Enrollment rows only carry course_id and "
        "student_id, so look those up when you need titles or names.\n"
        "When asked for a summary or an email, gather the data first, then call the "
        "matching draft tool.\n" + max_steps_instruction()
    )

    return Agent(name="Education CRM Agent", instructions=instructions, tools=tools)


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
            print(f"({steps_used()} tool calls — see logs/trace.jsonl)\n")
        except GuardrailError as exc:
            print(f"\n[guardrail] {exc}\n")
        except Exception as exc:
            print(f"\n[error] {exc}\n")


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
    args = parser.parse_args()

    if not os.getenv("OPENAI_API_KEY"):
        print("OPENAI_API_KEY is not set", file=sys.stderr)
        sys.exit(1)

    if not args.keep_log:
        reset_log()

    agent = build_agent()

    if args.chat:
        chat_loop(agent)
        return

    print(f"> {args.prompt}\n")
    answer, _ = run_once(agent, args.prompt, None)
    print("--- answer ---\n")
    print(answer)
    print(f"\n({steps_used()} tool calls — see logs/trace.jsonl)")


if __name__ == "__main__":
    main()
