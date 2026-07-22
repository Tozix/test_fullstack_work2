# URL Checker

Monorepo with two services:

- `server/` — NestJS + TypeScript + Zod, runs on Bun, listens on **:3001**
- `client/` — Vite + React + TypeScript + Ant Design + Zustand, dev server on **:3000**

## Tech stack

| Layer | Choice |
| --- | --- |
| Runtime + package manager | bun (≥ 1.1) |
| Backend framework | NestJS 11 |
| Validation | Zod 4 (`ZodType`-based, custom `ZodValidationPipe`) |
| Concurrency | tiny FIFO async `Semaphore` (stdlib, no p-limit) |
| Frontend | React 19 + Vite 8 |
| UI | Ant Design 6 |
| State | Zustand 5 |
| HTTP | Axios |
| Tests | Vitest 4 (unit + e2e for backend, unit for frontend) |
| Containers | Docker (`oven/bun:1` + `nginx:alpine`) |

## Repository layout

```
url-checker/
├── server/                   # NestJS API
│   ├── src/                  # main.ts, app.module.ts, jobs/...
│   ├── test/                 # e2e specs
│   ├── Dockerfile
│   └── package.json
├── client/                   # React UI
│   ├── src/                  # api/, store/, components/, App.tsx
│   ├── public/
│   ├── nginx.conf
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
└── README.md
```

## Running locally

Prereqs: bun ≥ 1.1 installed (`brew install bun`).

Open two terminals.

### 1. Backend

```bash
cd server
bun install
bun run start:dev        # nodemon-like file watcher via Bun
# → http://localhost:3001/api/jobs
```

### 2. Frontend

```bash
cd client
bun install
bun run dev              # Vite dev server with /api → :3001 proxy
# → http://localhost:3000
```

The vite dev server proxies `/api/*` to the backend, so no CORS gymnastics are needed for local dev. `app.enableCors()` is also configured in `server/src/main.ts` for non-browser clients.

## Running with Docker

```bash
docker compose up --build
```

- Client → http://localhost:3000 (nginx serves the static bundle and proxies `/api/*` to the `server` container at port 3001)
- Server → http://localhost:3001 (only reachable directly; the UI talks through nginx)

## Testing

```bash
# Backend unit tests (Vitest, mocks global fetch)
cd server && bun run test

# Backend e2e tests (Vitest + supertest, in-process Nest app)
cd server && bun run test:e2e

# Frontend tests (Vitest + jsdom)
cd client && bun run test
```

## API

All endpoints are namespaced under `/api`.

| Method | Path             | Body / Query                                                                                                                | Response                                                                  |
| ------ | ---------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| POST   | `/api/jobs`      | `{ "urls": string[] }` (1–500 entries, each a valid URL)                                                                    | `201 { "jobId": "<uuid>" }`                                               |
| GET    | `/api/jobs`      | `?page=1&limit=20&sortBy=createdAt&sortOrder=desc`                                                                         | `200 { "data": JobSummary[], "meta": { page, limit, total } }`            |
| GET    | `/api/jobs/:id`  | —                                                                                                                           | `200 Job` (with `items[]`) or `404`                                       |
| DELETE | `/api/jobs/:id`  | —                                                                                                                           | `200 Job` (status `cancelled`) or `404` if unknown                        |

### Job status state machine

```
pending  →  in_progress  →  completed   (any URL succeeded)
                          →  failed      (every URL errored)
                          →  cancelled   (DELETE /api/jobs/:id called)
```

### Per-URL status

```
pending → in_progress → success | error | cancelled
```

## Behavior notes

- **Concurrency**: at most 5 URLs processed in parallel per job (`Semaphore(5)`).
- **Per-URL timeout**: 10 s (`AbortController` + `setTimeout`). On timeout the item is treated as `error` (or `cancelled` if it was a job-level abort).
- **Redirects**: HEAD probe uses `redirect: 'manual'` and follows up to 5 hops; on the 6th, throws `Too many redirects`.
- **Post-response delay**: each successful probe sleeps 0–10 s before saving the result, so the UI can showcase progress.
- **Cancellation**: `DELETE /api/jobs/:id` aborts the job's `AbortController`; in-flight fetches get an abort signal, pending/in-progress items flip to `cancelled`.
- **Storage**: in-memory `Map<string, Job>` (resets on restart).

## License

UNLICENSED — internal demo.
