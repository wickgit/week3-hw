# Education CRM Agent

An agent over the education CRM domain (schools, courses, students, enrollments).
It runs a real agent loop: it picks tools, feeds ids from one call into the next,
and stops when it can answer.

This milestone runs against in-memory mock data (`tools/mock_crm.py`). The next one
swaps those tools for the REST API.

## Running

The agent runs in Docker, so nothing needs installing locally. It reads
`OPENAI_API_KEY` from your shell.

```bash
export OPENAI_API_KEY=sk-...        # or put it in a .env next to docker-compose.yml
docker compose build agent
```

Default scenario:

```bash
docker compose run --rm agent
```

Your own request:

```bash
docker compose run --rm agent "Which students are enrolled in Intro to Python?"
```

Interactive session, which keeps context between turns:

```bash
docker compose run --rm agent --chat
```

## Example requests

```bash
docker compose run --rm agent "Find Bright Future Academy, list its courses and students, then draft an enrollment summary for Olena Kovalenko."
```
Chains eight calls: `search_schools` → `get_school_courses` + `get_school_students`
→ `search_students` → `get_student_enrollments` → `get_course` per enrollment →
`draft_enrollment_summary`.

```bash
docker compose run --rm agent "Which students are enrolled in Intro to Python, and what are their emails?"
```
Chains four: `search_courses` → `get_course_enrollments` → `get_student` per row.

## Tools

Deliberately small, so the agent has to compose them and the trace shows real
reasoning rather than one opaque call.

| | |
|---|---|
| search / list | `list_schools`, `search_schools`, `search_courses`, `search_students` |
| read one | `get_school`, `get_course`, `get_student` |
| read relations | `get_school_courses`, `get_school_students`, `get_student_enrollments`, `get_course_enrollments` |
| draft | `draft_enrollment_summary`, `draft_welcome_email` |

Enrollment rows carry only `course_id` and `student_id`, so the agent has to look
up the names itself — that is what forces the multi-step chain.

## Guardrails

| Guardrail | Setting | Behaviour |
|---|---|---|
| Step budget | `MAX_AGENT_STEPS` (12) | Calls past the limit are refused, and the agent answers with what it has |
| Tool allowlist | `ALLOWED_TOOLS` in `guardrails.py` | Anything not listed is refused before it runs |
| Tool timeout | `TOOL_TIMEOUT_SECONDS` (20) | A call that overruns is abandoned rather than stalling the run |

Try the budget:

```bash
MAX_AGENT_STEPS=2 docker compose run --rm agent
```

## Trace

Every tool call appends a line to `logs/trace.jsonl` — step, tool, arguments,
result or error, and duration. Blocked calls are recorded too, with the guardrail
that stopped them. The log is truncated at the start of each run; pass `--keep-log`
to append instead.

```bash
cat logs/trace.jsonl | head -3
```
