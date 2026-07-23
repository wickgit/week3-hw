"""Tools backed by the real CRM API.

Same shapes as tools/mock_crm.py, so the agent wiring does not change between
modes. Auth happens here: the agent never sees a token.
"""

from __future__ import annotations

import os
import threading

import httpx


class ApiError(RuntimeError):
    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


_token: str | None = None
_token_lock = threading.Lock()

# Tool calls can run on parallel threads, so the last status has to be per-thread
# or concurrent requests overwrite each other's value before it is traced.
_local = threading.local()


def last_status() -> int | None:
    return getattr(_local, "status", None)


def base_url() -> str:
    return os.getenv("CRM_API_URL", "http://api:3000").rstrip("/")


def _timeout() -> float:
    # Cancels the socket itself, unlike the thread-based guardrail which can
    # only stop waiting for a call it cannot kill.
    return float(os.getenv("HTTP_TIMEOUT_SECONDS", "10"))


def _login() -> str:
    email = os.getenv("CRM_USER_EMAIL", "admin@school.example")
    password = os.getenv("CRM_USER_PASSWORD", "admin123")

    response = httpx.post(
        f"{base_url()}/auth/login",
        json={"email": email, "password": password},
        timeout=_timeout(),
    )
    if response.status_code != 200:
        raise ApiError(f"Login failed for {email}", response.status_code)
    return response.json()["token"]


def token() -> str:
    global _token
    with _token_lock:
        if _token is None:
            _token = _login()
        return _token


def reset_token() -> None:
    global _token
    with _token_lock:
        _token = None


def _request(method: str, path: str, *, params: dict | None = None, json_body: dict | None = None):
    def send() -> httpx.Response:
        return httpx.request(
            method,
            f"{base_url()}{path}",
            params=params,
            json=json_body,
            headers={"Authorization": f"Bearer {token()}"},
            timeout=_timeout(),
        )

    response = send()
    # An expired token is the one failure worth retrying automatically.
    if response.status_code == 401:
        reset_token()
        response = send()

    _local.status = response.status_code

    if response.status_code >= 400:
        try:
            body = response.json()
            message = body.get("message") or body.get("error") or response.text
            details = body.get("details")
            if details:
                message = f"{message}: {details}"
        except ValueError:
            message = response.text
        raise ApiError(message, response.status_code)

    return response.json().get("data")


def _clean(params: dict) -> dict:
    return {k: v for k, v in params.items() if v is not None}


def list_schools():
    return _request("GET", "/schools")


def search_schools(query: str):
    return _request("GET", "/schools", params={"q": query})


def search_courses(query: str):
    return _request("GET", "/courses", params={"q": query})


def search_students(query: str):
    return _request("GET", "/students", params={"q": query})


def get_school(school_id: int):
    return _request("GET", f"/schools/{school_id}")


def get_course(course_id: int):
    return _request("GET", f"/courses/{course_id}")


def get_student(student_id: int):
    return _request("GET", f"/students/{student_id}")


def get_school_courses(school_id: int):
    return _request("GET", "/courses", params={"school_id": school_id})


def get_school_students(school_id: int):
    return _request("GET", "/students", params={"school_id": school_id})


def get_student_enrollments(student_id: int):
    return _request("GET", "/enrollments", params={"student_id": student_id})


def get_course_enrollments(course_id: int):
    return _request("GET", "/enrollments", params={"course_id": course_id})


def create_school(name: str, city: str | None = None):
    return _request("POST", "/schools", json_body=_clean({"name": name, "city": city}))


def create_course(school_id: int, title: str, subject: str | None = None, credits: int = 0):
    return _request(
        "POST",
        "/courses",
        json_body=_clean(
            {"school_id": school_id, "title": title, "subject": subject, "credits": credits}
        ),
    )


def create_student(school_id: int, full_name: str, email: str):
    return _request(
        "POST",
        "/students",
        json_body={"school_id": school_id, "full_name": full_name, "email": email},
    )


def create_enrollment(student_id: int, course_id: int, status: str = "active", grade: str | None = None):
    return _request(
        "POST",
        "/enrollments",
        json_body=_clean(
            {"student_id": student_id, "course_id": course_id, "status": status, "grade": grade}
        ),
    )
