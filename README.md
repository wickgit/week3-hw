# AI-Native Education CRM

An AI agent that operates an education CRM over HTTP:

```
natural-language brief → agent (tools, loop, guardrails) → REST API (JWT) → PostgreSQL
```

The agent takes a plain-language request, calls the API's tools to read and create
records, and the API persists them in Postgres.

## Domain

| Entity | Fields | Relations |
|---|---|---|
| `users` | email, password_hash, role | authentication |
| `schools` | name, city | 1 → N courses, 1 → N students |
| `courses` | school_id, title, subject, credits | N → 1 school; 1 → N enrollments |
| `students` | school_id, full_name, email | N → 1 school; 1 → N enrollments |
| `enrollments` | student_id, course_id, status, grade | joins a student to a course |

`enrollments` is a join table: a student takes many courses and a course has many
students. Names are never duplicated across tables — a course stores `school_id`,
not the school's name. Schools are unique on `(name, city)`.

## Layout

```
api/       Express + Knex + Postgres, JWT auth
agent/     Python agent, OpenAI Agents SDK (see agent/README.md)
logs/      trace.jsonl and capstone-trace.jsonl
docker-compose.yml
```

## Setup

Everything runs in Docker. The agent needs an OpenAI key.

```bash
export OPENAI_API_KEY=sk-...
docker compose build
docker compose up -d db api
docker compose exec api npm run migrate
docker compose exec api npm run seed
```

Demo login: `admin@school.example` / `admin123`.

## Run the agent

```bash
docker compose run --rm agent "Which students are enrolled in Intro to Python?"
docker compose run --rm agent --chat            # interactive
docker compose run --rm agent --mock "..."      # in-memory data, no database
```

See [agent/README.md](agent/README.md) for tools, guardrails and the trace format.

## GraphQL

A GraphQL endpoint sits alongside REST at `POST /graphql`, over the same schema and
JWT. `login` is public and returns the same token as `/auth/login`; every other query
and mutation needs a `Bearer` token, and an unauthenticated request returns an
`UNAUTHENTICATED` error.

Log in:

```bash
curl -s -X POST localhost:3000/graphql -H 'Content-Type: application/json' \
  -d '{"query":"mutation { login(email:\"admin@school.example\", password:\"admin123\") { token } }"}'
```

Nested query — one request walks school → courses → enrollments → student:

```bash
curl -s -X POST localhost:3000/graphql \
  -H 'Content-Type: application/json' -H "Authorization: Bearer <token>" \
  -d '{"query":"{ school(id:1){ name courses { title enrollments { status student { full_name } } } } }"}'
```

Relations are batched with DataLoader, so resolving a field across many parents runs
one query rather than one per parent (no N+1).

## Capstone

One command runs the onboarding brief end to end and verifies the result against the
database — records exist, foreign keys line up, no duplicates from the run — then checks
the trace for the expected tools and id reuse.

```bash
docker compose run --rm capstone
```

It resets its own records first, so it is repeatable. The trace is written to
`logs/capstone-trace.jsonl`. The brief:

> Onboard a new school: create Nova Tech Academy in Odesa, add a course 'Intro to Go'
> in Computer Science worth 6 credits, add student Ivan Petrenko (ivan@nova.example),
> enrol him in that course, then show a summary.

## Tests

```bash
cd api && cp .env.example .env && npm install
npm test
```

21 API tests plus the capstone integration check above.
