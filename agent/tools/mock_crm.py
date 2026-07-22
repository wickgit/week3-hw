"""In-memory education CRM used before the agent is wired to the real API.

Mirrors the shape of the REST API so the API-backed tools in the next milestone
can be swapped in without changing the agent.
"""

from __future__ import annotations

SCHOOLS = [
    {"id": 1, "name": "Bright Future Academy", "city": "Kyiv"},
    {"id": 2, "name": "Riverside College", "city": "Lviv"},
]

COURSES = [
    {"id": 1, "school_id": 1, "title": "Intro to Python", "subject": "Computer Science", "credits": 5},
    {"id": 2, "school_id": 1, "title": "Linear Algebra", "subject": "Mathematics", "credits": 4},
    {"id": 3, "school_id": 2, "title": "World History", "subject": "History", "credits": 3},
]

STUDENTS = [
    {"id": 1, "school_id": 1, "full_name": "Olena Kovalenko", "email": "olena@bright.example"},
    {"id": 2, "school_id": 1, "full_name": "Andriy Shevchenko", "email": "andriy@bright.example"},
    {"id": 3, "school_id": 2, "full_name": "Maria Boyko", "email": "maria@riverside.example"},
]

ENROLLMENTS = [
    {"id": 1, "student_id": 1, "course_id": 1, "status": "active", "grade": None},
    {"id": 2, "student_id": 1, "course_id": 2, "status": "active", "grade": None},
    {"id": 3, "student_id": 2, "course_id": 1, "status": "completed", "grade": "A"},
    {"id": 4, "student_id": 3, "course_id": 3, "status": "active", "grade": None},
]


def _matches(row: dict, fields: tuple[str, ...], query: str) -> bool:
    needle = query.lower()
    return any(needle in str(row.get(f, "")).lower() for f in fields)


def _by_id(rows: list[dict], row_id: int) -> dict:
    for row in rows:
        if row["id"] == row_id:
            return row
    raise ValueError(f"No record with id {row_id}")


def list_schools() -> list[dict]:
    return SCHOOLS


def search_schools(query: str) -> list[dict]:
    return [s for s in SCHOOLS if _matches(s, ("name", "city"), query)]


def search_courses(query: str) -> list[dict]:
    return [c for c in COURSES if _matches(c, ("title", "subject"), query)]


def search_students(query: str) -> list[dict]:
    return [s for s in STUDENTS if _matches(s, ("full_name", "email"), query)]


def get_school(school_id: int) -> dict:
    return _by_id(SCHOOLS, school_id)


def get_course(course_id: int) -> dict:
    return _by_id(COURSES, course_id)


def get_student(student_id: int) -> dict:
    return _by_id(STUDENTS, student_id)


def get_school_courses(school_id: int) -> list[dict]:
    return [c for c in COURSES if c["school_id"] == school_id]


def get_school_students(school_id: int) -> list[dict]:
    return [s for s in STUDENTS if s["school_id"] == school_id]


def get_student_enrollments(student_id: int) -> list[dict]:
    return [e for e in ENROLLMENTS if e["student_id"] == student_id]


def get_course_enrollments(course_id: int) -> list[dict]:
    return [e for e in ENROLLMENTS if e["course_id"] == course_id]
