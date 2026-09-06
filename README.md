# CodeArena

A mini technical-assessment platform. A candidate opens a coding challenge,
writes a Python solution in an in-browser editor, and submits it. The code
runs against real test cases in a throwaway Docker container; each test-case
result streams back to the UI over a WebSocket as it finishes. Separately, an
LLM reviews the submission for style and quality. A recruiter dashboard lists
every past submission with its score and its review.

- **Frontend** — Next.js (App Router) + TypeScript, Monaco editor
- **Backend** — Node + TypeScript, Fastify REST API, raw `ws` WebSocket gateway
- **Execution** — one Docker container per submission, no network, resource-capped, torn down after
- **Redis** — execution queue, queue/run state, challenge cache, pub/sub fan-out
- **LLM review** — Anthropic or OpenAI, on its own worker and its own table

---

## The core design decision: deterministic signals stay deterministic

This is the most important thing in the codebase.

> **The score and pass/fail come *only* from sandboxed test execution.
> The LLM adds a separate advisory layer that can never move that number.**

It is enforced structurally, not by convention:

| | Deterministic | Advisory (LLM) |
|---|---|---|
| **Tables** | `Submission` (`status`, `scorePct`, `testsPassed/Total`), `TestResult` (one row per case) | `Review` — a separate table, one nullable row per submission |
| **Producer** | executor worker → sandbox → test cases | review worker → LLM API |
| **Queue** | `exec:queue` | `review:queue` (different worker process) |
| **WS events** | `status`, `test_result`, `run_complete` | `review_status`, `review_ready` |
| **Failure mode** | a failed run is a real `error` status | a failed LLM call sets `review.status = "failed"` and changes nothing else |
| **UI** | "Test results" panel — slate/green/red, carries the % | "AI code review" panel — violet, labelled *advisory*, says in words that it does not affect the score |

There is no code path where an LLM response is read back into a deterministic
field. `Review` joins to `Submission` by `submissionId` and nothing else. The
review worker (`apps/worker/src/review/`) only ever writes the `Review` row —
grep it: it never touches `Submission` or `TestResult`. The LLM prompt itself
tells the model not to judge correctness (`apps/worker/src/review/prompt.ts`).

Why: correctness must be trustworthy and reproducible. An LLM's opinion is
useful context for a human but is non-deterministic, occasionally wrong, and
can fail or rate-limit. Blending the two would make the reliable signal
unreliable. So they are kept in separate stores, separate workers, separate
event types, and separate panels.

---

## Architecture

```
 Monaco editor (Next.js, apps/web)
   │  POST /api/submissions { challengeId, candidateName, code }
   ▼
 REST API  (Fastify, apps/api)
   │  1. persist Submission (status = queued)                 [Postgres / Prisma]
   │  2. LPUSH exec:queue <id>                                [Redis: queue]
   │  3. HSET exec:state:<id> status=queued                   [Redis: queue state]
   │  4. 201 { submissionId }
   ▼
 Executor worker  (apps/worker/src/executor)
   │  BRPOP exec:queue           (up to EXECUTOR_CONCURRENCY at once)
   │  SADD exec:running <id> ; publish status=running          [Redis: pub/sub]
   │  load challenge + test cases   GET cache:challenge:exec:<id> → miss → Postgres → SET EX
   │  write submission.py + job.json to a temp dir
   │  docker run --rm --network=none --memory --cpus --pids-limit --cap-drop=ALL
   │             --read-only --user 65534 -v <tmp>:/sandbox:ro  codearena-sandbox-python
   │
   │  runner.py runs each test case as its own subprocess, one at a time,
   │  and prints ONE JSON line per case (flushed):
   │      worker reads each line → persist TestResult
   │                             → PUBLISH ws:submission:<id> { test_result }
   │  on EOF: weighted score → update Submission → PUBLISH { run_complete }
   │          SREM exec:running ; LPUSH review:queue <id>
   ▼
 Review worker  (apps/worker/src/review)   ── separate process ──
   │  BRPOP review:queue → call Anthropic/OpenAI → write Review row
   │  PUBLISH ws:submission:<id> { review_ready }
   ▼
 WebSocket gateway  (apps/api/src/ws.ts, inside the API process)
   │  one Redis connection, PSUBSCRIBE ws:submission:*
   │  client subscribes to a submissionId → one snapshot, then live forward
   ▼
 Next.js client
   │  Test results panel  ← fills row-by-row, live        (deterministic)
   │  AI review panel     ← "analyzing…" → populated       (advisory, separate)
```

### Where Redis fits (four real jobs)

1. **Execution queue** — `exec:queue` list; executor workers `BRPOP` it. A real job queue with real backpressure (`EXECUTOR_CONCURRENCY`).
2. **Queue / run state** — `exec:running` (set of ids currently executing) and `exec:state:<id>` (hash). The dashboard's *"running now"* is read straight from `exec:running`, not a DB scan.
3. **Challenge cache (cache-aside)** — `cache:challenge:<id>` (public projection served to the browser) and `cache:challenge:exec:<id>` (full projection with hidden test I/O, worker-only — deliberately a different key so hidden expected output can never share an entry with client-facing data). `cache:challenges:index` for the list. TTL 1h, filled on miss.
4. **Pub/Sub fan-out** — workers `PUBLISH` execution/review events to `ws:submission:<id>`; the API gateway `PSUBSCRIBE`s `ws:submission:*` and forwards to the right sockets. The gateway holds no run state, so it scales horizontally.

### Real-time, not polling

The only polling anywhere is the recruiter *list* page refetching every 3s (a
list of historical rows — reasonable). Everything about a live run —
per-test-case results, status transitions, the review landing — is pushed over
a WebSocket, driven by Redis pub/sub messages the workers publish as each
event actually happens. `runner.py` flushes one line per test case, so the
stream is genuinely incremental; it is not one delayed response.

---

## Security model for the sandbox

Running arbitrary candidate code is the risky part. It is treated as such.

**Applied to every run** (`apps/worker/src/executor/sandbox.ts`):

| Control | Flag |
|---|---|
| No network | `--network=none` |
| RAM cap, no swap | `--memory=256m --memory-swap=256m` |
| CPU quota | `--cpus=0.5` |
| Fork-bomb ceiling | `--pids-limit=64` |
| Drop all Linux capabilities | `--cap-drop=ALL` |
| No privilege escalation | `--security-opt=no-new-privileges` |
| Immutable root filesystem | `--read-only` |
| Writable scratch only, non-exec | `--tmpfs /tmp:rw,noexec,nosuid,size=16m` |
| Run as `nobody` | `--user 65534:65534` |
| Secondary CPU-seconds + fd caps | `--ulimit cpu=15 --ulimit nofile=256:256` |
| Only mount is the job dir, read-only | `-v <tmp>:/sandbox:ro` |
| Container deleted on exit | `--rm` |
| Per-case wall-clock timeout | in `runner.py` (`subprocess timeout`) |
| Whole-run wall-clock budget | in the worker; `docker kill` on breach |

The image itself (`sandbox/Dockerfile`) is `python:3.12-slim` with only the
runner baked in (read-only, `chmod 0444`, so a submission can't replace it), a
non-root user, no `.pyc`, `python -I` isolated mode.

**Out of scope, and why:** this is Docker-level isolation — a shared kernel. A
hostile production workload would want a stronger boundary (gVisor,
Firecracker / Kata, a per-run microVM), plus image scanning and egress
filtering on the worker host. For an assessment platform running known
challenge types that trade-off is documented rather than built.

You can exercise the isolation directly, without the rest of the stack:

```bash
npm run sandbox:build
npm run run:once -w @codearena/worker -- --slug sum-of-list --file ./my-solution.py
```

---

## Running it

### Prerequisites

- **Docker Desktop** running (Linux containers / WSL2 backend on Windows). The
  worker shells out to `docker`, so the Docker CLI must be on `PATH`.
- **Node 20+**

### First-time setup

```bash
npm install
docker compose up -d postgres redis      # Postgres on :5434, Redis on :6380
cp .env.example .env
npm run db:migrate                        # apply the Prisma migration
npm run db:seed                           # load the 4 challenges
npm run sandbox:build                     # build codearena-sandbox-python:latest
```

### Run the app (primary path)

```bash
npm run dev
```

Starts four processes: the API (`:4000`), the executor worker, the review
worker, and the Next.js app (`:3100`). Open **http://localhost:3100**.

- Solve a challenge: pick one, edit, **Submit**, watch results stream in and
  the review appear separately.
- Recruiter view: **http://localhost:3100/submissions**.

### The LLM layer

Set the provider in `.env`:

```ini
LLM_PROVIDER="anthropic"      # or "openai" or "stub"
ANTHROPIC_API_KEY="sk-ant-..."
ANTHROPIC_MODEL="claude-sonnet-5"
```

`stub` runs the entire review path — queue, `Review` table, WS events, UI
panel — with a canned response and **no API call**, so the rest of the system
is fully demonstrable without a key. If `LLM_PROVIDER` is `anthropic`/`openai`
but the key is missing, the review is marked `failed` (with a clear message)
and — the point of the whole design — the deterministic score is untouched.

### Full containerised run (optional)

```bash
docker compose --profile full up --build
```

Brings up Postgres, Redis, the API, both workers, and the web app in
containers. The executor container bind-mounts the host Docker socket
(`/var/run/docker.sock`) so it can spawn sibling sandbox containers — this
makes the worker container trust-sensitive and the sandboxes the untrusted
layer, which is the intended shape. Migrations and seed run automatically via
the `api` service's entrypoint. App on **http://localhost:3100**.

---

## Project layout

```
packages/
  shared/     REST DTOs, WebSocket protocol, Redis key map, runner protocol.
              Deterministic vs advisory types are separated here.
  db/         Prisma schema, migration, seed (the challenge catalogue).
apps/
  api/        Fastify REST + raw-ws gateway. Cache-aside, enqueue, snapshots.
  worker/
    executor/ BRPOP exec:queue → sandbox → stream test_result → score.
    review/   BRPOP review:queue → LLM → write Review row only.
    cli/      run-once: exercise the sandbox with no API/queue/DB writes.
  web/        Next.js App Router. Editor page + recruiter dashboard.
sandbox/      The execution image + runner.py.
```

---

## Deliberately out of scope

Trimmed so the required pieces could be built properly rather than all built
thinly:

- **One language** (Python). Another language is just another image + runner, no new design.
- **No auth / accounts.** A candidate is a name string; the recruiter view is unguarded.
- **No challenge-authoring UI.** Challenges are fixtures in `packages/db/prisma/seed.ts`.
- **Container-per-submission**, not a warm pool. ~1–2s cold start, accepted and noted; a pool is the production optimisation.
