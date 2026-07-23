# AI-Native Education CRM

An AI agent that operates an education CRM over HTTP:

```
natural-language brief → agent (tools, loop, guardrails) → REST API (JWT) → PostgreSQL
```

The agent takes a plain-language request, calls the API to read and create records, and
the API stores them in Postgres. A GraphQL endpoint sits alongside REST as a bonus.

## Domain

| Entity | Fields | Relations |
|---|---|---|
| `users` | email, password_hash, role | authentication |
| `schools` | name, city | 1 → N courses, 1 → N students |
| `courses` | school_id, title, subject, credits | N → 1 school; 1 → N enrollments |
| `students` | school_id, full_name, email | N → 1 school; 1 → N enrollments |
| `enrollments` | student_id, course_id, status, grade | joins a student to a course |

`enrollments` is a join table: a student takes many courses, a course has many students.
Names are never duplicated across tables — a course stores `school_id`, not the school's
name. Schools are unique on `(name, city)`.

## Layout

```
api/       Express + Knex + Postgres, JWT auth, REST + GraphQL
agent/     Python agent (OpenAI Agents SDK) — see agent/README.md
logs/      trace.jsonl and capstone-trace.jsonl
docker-compose.yml
```

Everything runs in Docker. There are three services (`db`, `api`, `agent`) plus a
`capstone` runner. The only thing you provide is an OpenAI API key.

---

## First-time setup

```bash
export OPENAI_API_KEY=sk-...          # add to ~/.bashrc to keep it
docker compose build
docker compose up -d db api           # start Postgres and the API
docker compose exec api npm run migrate
docker compose exec api npm run seed
```

That's it — the API is on http://localhost:3000, seeded with demo data.
Demo login: `admin@school.example` / `admin123`.

## Every time after

```bash
docker compose up -d db api           # start
docker compose run --rm agent "..."   # use the agent
docker compose stop                   # stop when done (keeps data)
```

---

## Running the agent

```bash
docker compose run --rm agent "Which students are enrolled in Intro to Python?"
docker compose run --rm agent --chat
docker compose run --rm agent --mock "list all schools"
```

With no prompt it runs a default example. Full flag and environment reference is in
**[agent/README.md](agent/README.md)**.

## The capstone

Runs an onboarding brief end to end and verifies the result against the database and
the trace — records exist, foreign keys line up, no duplicates, ids passed between
steps. It resets its own data first, so it is repeatable.

```bash
docker compose run --rm capstone
```

Ends with `All 19 checks passed`. Trace is written to `logs/capstone-trace.jsonl`.

---

## The REST API

Base URL `http://localhost:3000`. Everything except `/health` and `/auth/login` needs
a `Bearer` token.

| Method | Route | |
|---|---|---|
| GET | `/health` | liveness, public |
| POST | `/auth/login` | `{ email, password }` → `{ token, user }`, public |
| GET | `/schools?q=` | list, search by name/city |
| GET | `/schools/:id` | one school |
| POST | `/schools` | `{ name, city? }` |
| GET | `/courses?school_id=&q=` | list, filter, search |
| GET | `/courses/:id` | one course |
| POST | `/courses` | `{ school_id, title, subject?, credits? }` |
| GET | `/students?school_id=&q=` | list, filter, search |
| GET | `/students/:id` | student with school and enrolled courses |
| POST | `/students` | `{ school_id, full_name, email }` |
| GET | `/enrollments?student_id=&course_id=&status=` | list |
| POST | `/enrollments` | `{ student_id, course_id, status?, grade? }` |

```bash
# log in, copy the token from the output
curl -s -X POST localhost:3000/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@school.example","password":"admin123"}'

curl -s localhost:3000/schools -H "Authorization: Bearer <token>"
```

Reads return `{ data: ... }`, creates return `201`. Errors are `{ error, message }`,
with a `details` array on validation failures. Statuses: `400` invalid input, `401`
missing/bad token, `404` missing parent, `409` duplicate.

## GraphQL (bonus)

Same domain and JWT at `POST /graphql`. `login` is public; everything else needs a
token. Open http://localhost:3000/graphql in a browser for the interactive explorer.

```bash
# login
curl -s -X POST localhost:3000/graphql -H 'Content-Type: application/json' \
  -d '{"query":"mutation { login(email:\"admin@school.example\", password:\"admin123\") { token } }"}'

# nested query: school -> courses -> enrollments -> student, in one request
curl -s -X POST localhost:3000/graphql \
  -H 'Content-Type: application/json' -H "Authorization: Bearer <token>" \
  -d '{"query":"{ school(id:1){ name courses { title enrollments { status student { full_name } } } } }"}'
```

Relations are batched with DataLoader (no N+1).

---

## Database commands (run from `api/`, or prefix with `docker compose exec api`)

| Command | |
|---|---|
| `npm run migrate` | apply migrations |
| `npm run rollback` | undo the last migration batch |
| `npm run seed` | wipe and reload demo data |

Inspect the data directly:

```bash
docker exec -it education-crm-db psql -U crm -d education_crm
```

In `psql`: `\dt` lists tables, `\d schools` describes one, `\q` quits.

## Tests

```bash
cd api && cp .env.example .env && npm install
npm test
```

27 tests: login, protected reads, the create chain, GraphQL, and DataLoader batching.
The capstone above is the integration check.

A local `npm install` is only needed for tests — running the app doesn't need it, since
the API runs in Docker.

---

## Docker reference

| Command | |
|---|---|
| `docker compose build` | build images (after dependency changes) |
| `docker compose up -d db api` | start database and API in the background |
| `docker compose run --rm agent "..."` | one agent run, then clean up |
| `docker compose run --rm capstone` | run the capstone |
| `docker compose exec api npm run seed` | run a command in the API container |
| `docker compose ps` | what's running |
| `docker compose logs -f api` | follow the API logs |
| `docker compose stop` | stop, keep data |
| `docker compose down` | remove containers, keep data |
| `docker compose down -v` | remove containers and delete the database |

After `down -v`, rerun `migrate` and `seed`.

Editing `agent/*.py` needs no rebuild (the directory is mounted). Editing `api/src/*.js`
needs `docker compose up -d --build api`.
