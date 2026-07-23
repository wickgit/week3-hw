# Education CRM Agent

Agent over the education CRM (schools, courses, students, enrollments). It picks
its own tools, passes ids from one call into the next, and stops when it can answer.

Two modes: mock data by default (`tools/mock_crm.py`), or the real API with
`--use-api` (`tools/api_crm.py`), which also enables the create tools.

## Setup

Everything runs in Docker. The agent reads `OPENAI_API_KEY` from your shell.

```bash
export OPENAI_API_KEY=sk-...
docker compose build
```

## Mock mode

```bash
docker compose run --rm agent
docker compose run --rm agent "Which students are enrolled in Intro to Python?"
docker compose run --rm agent --chat
```

`--chat` keeps context between turns.

## API mode

Start the database and API first:

```bash
docker compose up -d db api
cd api && npm run seed && cd ..
```

```bash
docker compose run --rm agent --use-api "Which students are enrolled in Intro to Python?"

docker compose run --rm agent --use-api "Onboard a new school: create Nova Tech Academy in Odesa, add a course 'Intro to Go' in Computer Science worth 6 credits, add student Ivan Petrenko (ivan@nova.example), enrol him in that course, then show a summary."
```

The agent logs in with `CRM_USER_EMAIL` / `CRM_USER_PASSWORD` on its first call and
reuses the token. The model never sees it. A 401 mid-run triggers one re-login and retry.

Re-running the onboarding brief is safe. Schools are unique on `(name, city)`, so the
second run gets a 409, searches for what already exists and continues with those ids.

## Example chains

`"Find Bright Future Academy, list its courses and students, then draft an enrollment
summary for Olena Kovalenko."`

```
search_schools → get_school_courses → get_school_students → search_students
→ get_student_enrollments → get_course (per enrollment) → draft_enrollment_summary
```

`"Which students are enrolled in Intro to Python, and what are their emails?"`

```
search_courses → get_course_enrollments → get_student (per row)
```

## Tools

**search** `list_schools` `search_schools` `search_courses` `search_students`
**read** `get_school` `get_course` `get_student`
**relations** `get_school_courses` `get_school_students` `get_student_enrollments` `get_course_enrollments`
**draft** `draft_enrollment_summary` `draft_welcome_email`
**create** (API mode) `create_school` `create_course` `create_student` `create_enrollment`

Tools are small on purpose. Enrollment rows only carry `course_id` and `student_id`,
so the agent has to look the names up itself instead of getting everything from one call.

Both tool modules expose the same function names, so switching modes only changes
which one gets imported.

Parallel tool calls are turned off (`parallel_tool_calls=False`). Calls dispatched in
the same turn can't see each other's results, so a course created alongside its school
ends up with a guessed `school_id`.

## Guardrails

| | Env var | Default | |
|---|---|---|---|
| Step budget | `MAX_AGENT_STEPS` | 12 | Extra calls are refused; the agent answers with what it has |
| Allowlist | — | `guardrails.py` | Unlisted tools are refused before running |
| Tool timeout | `TOOL_TIMEOUT_SECONDS` | 20 | Stops waiting on a slow call |
| HTTP timeout | `HTTP_TIMEOUT_SECONDS` | 10 | Cancels the request itself, which the thread timeout can't |

```bash
MAX_AGENT_STEPS=2 docker compose run --rm agent    # trips the budget
```

## Trace

Each tool call appends a line to `logs/trace.jsonl`: step, tool, args, result or error,
duration, and `http_status` in API mode. Refused calls are logged with the guardrail
that stopped them.

```bash
head -3 logs/trace.jsonl
```

The log is cleared at the start of each run. Use `--keep-log` to append.
