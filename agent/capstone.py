#!/usr/bin/env python3
"""Capstone: run the onboarding brief, then check what actually landed in Postgres.

Verifies three things the agent's own answer cannot prove:
  1. the records exist in the database
  2. the foreign keys line up
  3. one run produced one of each record

Trace goes to logs/capstone-trace.jsonl.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# Compose already sets TRACE_LOG for normal runs, so this has to overwrite it
# rather than fall back to it.
os.environ["TRACE_LOG"] = os.getenv("CAPSTONE_TRACE_LOG", "/logs/capstone-trace.jsonl")

import psycopg

import main
from tracing import reset_log, trace_path

BRIEF = (
    "Onboard a new school: create Nova Tech Academy in Odesa, add a course "
    "'Intro to Go' in Computer Science worth 6 credits, add student Ivan Petrenko "
    "(ivan@nova.example), enrol him in that course, then show a summary."
)

EXPECTED = {
    "school": ("Nova Tech Academy", "Odesa"),
    "course": "Intro to Go",
    "student": "ivan@nova.example",
}

CREATE_TOOLS = ["create_school", "create_course", "create_student", "create_enrollment"]


class Checks:
    def __init__(self) -> None:
        self.results: list[tuple[bool, str]] = []

    def check(self, ok: bool, label: str, detail: str = "") -> None:
        self.results.append((bool(ok), f"{label}{f' ({detail})' if detail else ''}"))

    @property
    def failed(self) -> int:
        return sum(1 for ok, _ in self.results if not ok)

    def report(self) -> None:
        for ok, label in self.results:
            print(f"  {'PASS' if ok else 'FAIL'}  {label}")


def read_trace() -> list[dict]:
    path = trace_path()
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def reset_capstone_data() -> None:
    """Remove records from a previous capstone run so this one starts clean and
    exercises the create path. The FK cascade clears the course, student and
    enrollment along with the school."""
    name, city = EXPECTED["school"]
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM schools WHERE name = %s AND city = %s", (name, city))
        conn.commit()


def verify_database(checks: Checks) -> None:
    name, city = EXPECTED["school"]

    with psycopg.connect(os.environ["DATABASE_URL"]) as conn, conn.cursor() as cur:
        cur.execute("SELECT id FROM schools WHERE name = %s AND city = %s", (name, city))
        schools = cur.fetchall()
        checks.check(len(schools) == 1, "school exists exactly once", f"found {len(schools)}")
        if len(schools) != 1:
            return
        school_id = schools[0][0]

        cur.execute(
            "SELECT id, school_id FROM courses WHERE title = %s AND school_id = %s",
            (EXPECTED["course"], school_id),
        )
        courses = cur.fetchall()
        checks.check(len(courses) == 1, "course exists under that school", f"found {len(courses)}")

        cur.execute(
            "SELECT id, school_id FROM students WHERE email = %s", (EXPECTED["student"],)
        )
        students = cur.fetchall()
        checks.check(len(students) == 1, "student exists exactly once", f"found {len(students)}")

        if len(courses) != 1 or len(students) != 1:
            return

        course_id, course_school = courses[0]
        student_id, student_school = students[0]

        checks.check(
            course_school == school_id and student_school == school_id,
            "course and student both belong to the new school",
        )

        cur.execute(
            "SELECT id, status FROM enrollments WHERE student_id = %s AND course_id = %s",
            (student_id, course_id),
        )
        enrollments = cur.fetchall()
        checks.check(
            len(enrollments) == 1, "enrollment links the student to the course", f"found {len(enrollments)}"
        )

        cur.execute(
            """
            SELECT sc.name, c.title, st.full_name, e.status
            FROM enrollments e
            JOIN students st ON st.id = e.student_id
            JOIN courses  c  ON c.id  = e.course_id
            JOIN schools  sc ON sc.id = st.school_id
            WHERE sc.id = %s
            """,
            (school_id,),
        )
        rows = cur.fetchall()
        checks.check(len(rows) == 1, "the full join returns one row")
        if rows:
            print(f"\n  {' | '.join(str(v) for v in rows[0])}\n")


def verify_trace(checks: Checks, entries: list[dict]) -> None:
    checks.check(bool(entries), "trace was written", f"{len(entries)} calls")
    if not entries:
        return

    tools = [e["tool"] for e in entries]

    for tool in CREATE_TOOLS:
        count = tools.count(tool)
        # A retry after a 409 is fine; more than one success is a duplicate.
        successes = sum(1 for e in entries if e["tool"] == tool and e["ok"])
        checks.check(count >= 1, f"{tool} was called")
        checks.check(successes <= 1, f"{tool} succeeded at most once", f"{successes} successes")

    order = [tools.index(t) for t in CREATE_TOOLS if t in tools]
    checks.check(order == sorted(order), "creates ran parent-first")

    created_ids = {}
    for entry in entries:
        if entry["tool"] in CREATE_TOOLS and entry["ok"] and isinstance(entry.get("result"), dict):
            created_ids[entry["tool"]] = entry["result"].get("id")

    school_id = created_ids.get("create_school")
    if school_id is not None:
        used = [
            e for e in entries
            if e["tool"] in ("create_course", "create_student")
            and e["args"].get("school_id") == school_id
        ]
        checks.check(len(used) == 2, "school id from create_school reused by course and student")

    course_id = created_ids.get("create_course")
    student_id = created_ids.get("create_student")
    enrollment = next((e for e in entries if e["tool"] == "create_enrollment"), None)
    if enrollment and course_id is not None and student_id is not None:
        checks.check(
            enrollment["args"].get("course_id") == course_id
            and enrollment["args"].get("student_id") == student_id,
            "enrollment used the ids returned by the two creates",
        )

    checks.check(
        all(e.get("http_status") is not None for e in entries if e["tool"].startswith(("create_", "get_", "search_", "list_"))),
        "every API call recorded an http status",
    )


def main_() -> int:
    if not os.getenv("OPENAI_API_KEY"):
        print("OPENAI_API_KEY is not set", file=sys.stderr)
        return 1

    main.check_api_ready()
    reset_capstone_data()
    reset_log()

    print(f"Brief:\n  {BRIEF}\n")
    agent = main.build_agent(use_api=True)
    answer, _ = main.run_once(agent, BRIEF, None)

    print(f"Agent answer:\n{answer}\n")
    print(f"Trace: {trace_path()}")

    entries = read_trace()
    print(f"\nTool calls ({len(entries)}):")
    for entry in entries:
        status = entry.get("http_status")
        mark = "ok" if entry["ok"] else "ERR"
        print(f"  {entry['step']:>2}. {entry['tool']:<26} {mark:<4} http={status}")

    checks = Checks()
    verify_database(checks)
    verify_trace(checks, entries)

    print("\nChecks:")
    checks.report()

    if checks.failed:
        print(f"\n{checks.failed} check(s) failed")
        return 1

    print(f"\nAll {len(checks.results)} checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main_())
