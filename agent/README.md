# Education CRM Agent

Agent over the education CRM (schools, courses, students, enrollments). It picks
its own tools, passes ids from one call into the next, and stops when it can answer.

It talks to the real CRM API (`tools/api_crm.py`). `--mock` swaps in in-memory data
(`tools/mock_crm.py`), which needs no database and has no create tools.

## Setup

Everything runs in Docker. The agent reads `OPENAI_API_KEY` from your shell.

```bash
export OPENAI_API_KEY=sk-...
docker compose build
docker compose up -d db api                    # start the API the agent talks to
docker compose exec api npm run migrate
docker compose exec api npm run seed
```

You only need the migrate and seed once. Mock mode (`--mock`) needs none of this — just
the key.

## Commands

Everything is `docker compose run --rm agent` followed by an optional prompt and flags.

```bash
docker compose run --rm agent                                     # runs a default example
docker compose run --rm agent "Which students take Intro to Python?"
docker compose run --rm agent --chat                             # interactive session
docker compose run --rm agent --mock "list all schools"          # in-memory data
docker compose run --rm agent --keep-log "..."                   # append to the trace
docker compose run --rm -q agent "..."                           # -q hides Docker's own output
MAX_AGENT_STEPS=2 docker compose run --rm agent "..."            # override a setting
```

### Flags

| | |
|---|---|
| `"<prompt>"` | the request; omit it to run a default example |
| `--chat` | interactive session that keeps context between turns (`exit`/`quit`/`q` to leave) |
| `--mock` | use in-memory data instead of the API — read-only, no database, no create tools |
| `--keep-log` | append to the trace instead of clearing it at the start of the run |

### Environment

Set in the shell (or in a `.env` next to `docker-compose.yml`). Compose supplies
sensible defaults for everything except the key.

| Variable | Default | |
|---|---|---|
| `OPENAI_API_KEY` | — | required |
| `MAX_AGENT_STEPS` | 12 | tool-call budget per turn |
| `TOOL_TIMEOUT_SECONDS` | 20 | outer timeout on any tool |
| `HTTP_TIMEOUT_SECONDS` | 10 | timeout on an API call |
| `CRM_API_URL` | http://api:3000 | where the API lives |
| `CRM_USER_EMAIL` | admin@school.example | login used under the hood |
| `CRM_USER_PASSWORD` | admin123 | |

## How it runs

`--chat` keeps context between turns. If the API is down or the CRM is empty, the agent
says so and exits instead of answering from nothing.

The agent logs in with `CRM_USER_EMAIL` / `CRM_USER_PASSWORD` on its first call and
reuses the token. The model never sees it. A 401 mid-run triggers one re-login and retry.

Re-running the onboarding brief is safe. Schools are unique on `(name, city)`, so the
second run gets a 409, searches for what already exists and continues with those ids.

The capstone (`capstone.py`) runs the onboarding brief and verifies the result; run it
with `docker compose run --rm capstone` (see the root README).

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
**create** (not in `--mock`) `create_school` `create_course` `create_student` `create_enrollment`

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
