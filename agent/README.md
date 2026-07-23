# Education CRM Agent

An agent over the education CRM domain (schools, courses, students, enrollments).
It runs a real agent loop: it picks tools, feeds ids from one call into the next,
and stops when it can answer.

It has two modes. By default it reads in-memory mock data (`tools/mock_crm.py`).
With `--use-api` it talks to the real CRM API over HTTP (`tools/api_crm.py`) and
gains the create tools.

## Running

Everything runs in Docker, so nothing needs installing locally. The agent reads
`OPENAI_API_KEY` from your shell.

```bash
export OPENAI_API_KEY=sk-...        # or put it in a .env next to docker-compose.yml
docker compose build
```

### Mock mode

```bash
docker compose run --rm agent
docker compose run --rm agent "Which students are enrolled in Intro to Python?"
docker compose run --rm agent --chat          # keeps context between turns
```

### API mode

Bring up the database and API first, and make sure the demo data is loaded:

```bash
docker compose up -d db api
cd api && npm run seed && cd ..
```

Then:

```bash
docker compose run --rm agent --use-api "Which students are enrolled in Intro to Python?"
docker compose run --rm agent --use-api "Onboard a new school: create Nova Tech Academy in Odesa, add a course 'Intro to Go' in Computer Science worth 6 credits, add student Ivan Petrenko (ivan@nova.example), enrol him in that course, then show a summary."
```

`depends_on` waits for the API's healthcheck, so the agent never starts before the
API can answer.

The agent logs in with `CRM_USER_EMAIL` / `CRM_USER_PASSWORD` on its first call and
reuses the token; the model never sees it. A 401 mid-run triggers one silent re-login
and retry, so an expired token does not end the run.

Creates are not idempotent — running the same onboarding brief twice creates a second
school, because nothing enforces unique school names. Re-seed (`cd api && npm run seed`)
before repeating a demo.

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
| create (`--use-api` only) | `create_school`, `create_course`, `create_student`, `create_enrollment` |

Enrollment rows carry only `course_id` and `student_id`, so the agent has to look
up the names itself — that is what forces the multi-step chain.

Both modules expose the same function names, so switching modes changes only which
one is imported.

Creates run one at a time. The SDK will happily dispatch several tool calls in a
single turn, and a course created in the same turn as its school cannot know the
school's id yet — the model guesses one. The system prompt forbids it explicitly.

## Guardrails

| Guardrail | Setting | Behaviour |
|---|---|---|
| Step budget | `MAX_AGENT_STEPS` (12) | Calls past the limit are refused, and the agent answers with what it has |
| Tool allowlist | `ALLOWED_TOOLS` in `guardrails.py` | Anything not listed is refused before it runs |
| Tool timeout | `TOOL_TIMEOUT_SECONDS` (20) | A call that overruns is abandoned rather than stalling the run |
| HTTP timeout | `HTTP_TIMEOUT_SECONDS` (10) | Cancels the socket in API mode, which the thread-based timeout cannot do |

Try the budget:

```bash
MAX_AGENT_STEPS=2 docker compose run --rm agent
```

## Trace

Every tool call appends a line to `logs/trace.jsonl` — step, tool, arguments,
result or error, and duration. In API mode each line also carries the `http_status`
of the underlying request. Blocked calls are recorded too, with the guardrail that
stopped them. The log is truncated at the start of each run; pass `--keep-log` to
append instead.

```bash
cat logs/trace.jsonl | head -3
```
