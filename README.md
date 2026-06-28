# LeetCode 2.0

A full-stack competitive-programming platform: a React Native mobile app where users solve coding problems, submit solutions, and get **live judging verdicts** streamed back over WebSockets. Submissions are executed in sandboxed Docker containers by a horizontally-scalable Go judge worker.

---

## Architecture

The system is split into five independently-deployable services connected by **two SQS FIFO queues** and a **Redis pub/sub** channel.

```mermaid
flowchart LR
  M[mobile app] -- POST /submissions --> B[backend<br/>Express :3000]
  M -- socket: watch:submission --> W[ws-server<br/>Socket.IO :3001]

  B -- enqueue --> SQ[(SQS submission queue)]
  SQ --> J[judge-worker<br/>Go + Docker]
  J -- run code in<br/>per-language container --> J
  J -- fetch test cases --> S3[(S3 bucket)]
  J -- enqueue verdict --> RQ[(SQS result queue)]
  RQ --> RC[results-consumer<br/>Node]
  RC -- UPDATE submission --> DB[(PostgreSQL)]
  RC -- publish submission:&lt;id&gt; --> R[(Redis)]
  R --> W
  W -- submission:result --> M

  B -. reads/writes .-> DB
  W -. ownership check .-> DB
```

### End-to-end flow of one submission

1. **Mobile → backend:** `POST /submissions` inserts a `PENDING` row and enqueues the code (+ hidden driver code) to the **submission SQS queue**, returning a `submissionId`.
2. **Mobile → ws-server:** the app opens a Socket.IO connection (JWT in the handshake) and emits `watch:submission` with that id.
3. **judge-worker** pulls the message, downloads the problem's test cases from **S3**, runs the code inside a locked-down Docker container (`--network none`, memory/CPU limits, read-only FS) for each test case, and enqueues the verdict to the **result SQS queue**.
4. **results-consumer** writes the verdict to PostgreSQL with a single `UPDATE` (a DB trigger updates problem counters and per-user solved/attempted status), then **publishes** the verdict to Redis channel `submission:<id>`.
5. **ws-server** (subscribed to that channel) emits `submission:result` to the waiting mobile client. If the verdict landed before the client connected, ws-server serves it directly from the DB.

---

## Tech stack

| Layer | Tech |
| --- | --- |
| Mobile | React Native 0.85 (New Arch), Zustand + MMKV, TanStack Query, Socket.IO client |
| Backend API | Node/Express, Drizzle ORM, Zod, JWT, AWS SDK (SQS) |
| Judge worker | Go 1.22, Docker, AWS SDK (SQS, S3) |
| Results consumer | Node, AWS SDK (SQS), ioredis, Drizzle |
| WS server | Node, Socket.IO, ioredis, JWT, Drizzle |
| Data | PostgreSQL (Neon or local), Redis, AWS SQS (×2 FIFO), AWS S3 |

---

## Repository layout

```
leetcode-2.0/
├── backend/           Express API — auth, problems, submissions, DB migrations + seed
├── judge-worker/      Go service — runs submissions in Docker sandboxes (per-language images)
├── results-consumer/  Node — writes verdicts to DB + publishes to Redis
├── ws-server/         Node Socket.IO — streams verdicts to clients
└── mobile/            React Native app
```

---

## Prerequisites

- **Node.js ≥ 22.11**
- **Go ≥ 1.22** (for the judge worker)
- **Docker** (judge worker runs each submission in a container)
- **PostgreSQL** (local, or a managed Neon database)
- **Redis** (local `redis-server`, Docker, or managed)
- **AWS account** with:
  - Two **SQS FIFO** queues (submission + result), each ideally with a dead-letter queue
  - One **S3** bucket (stores problem test cases)
  - An IAM user/role with SQS + S3 access
- For the mobile app: **Android Studio** / **Xcode**, and the standard [React Native environment](https://reactnative.dev/docs/environment-setup).

---

## 1. Shared infrastructure setup

Before running the services, provision:

1. **PostgreSQL** — get a connection string (Neon: copy the pooled `postgresql://...` URL).
2. **Redis** — get a `REDIS_URL` (e.g. `redis://localhost:6379`). commands : - docker run --name my-redis -d -p 6379:6379 redis
3. **SQS** — create two **FIFO** queues, e.g. `leetcode-submission.fifo` and `leetcode-result.fifo`. Note both URLs.
4. **S3** — create a bucket for test cases; note its name and region.

---

## 2. Backend API (`backend/`)

Create `backend/.env`:

```env
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
JWT_SECRET=replace_with_a_long_random_secret

AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
SQS_SUBMISSION_QUEUE_URL=https://sqs.<region>.amazonaws.com/<acct>/leetcode-submission.fifo
TEST_CASES_S3_BUCKET=your-bucket-name
# PORT=3000   # optional, defaults to 3000
```

Install, migrate the schema, and seed problems + code templates:

```bash
cd backend
npm install
npm run db:migrate      # apply Drizzle migrations
npm run db:seed         # seed tags, problems, code templates & driver code
node upload-tests.js    # upload test cases to S3 and set testCasesFileUrl in the DB
npm start               # http://localhost:3000
```

> `upload-tests.js` is a cross-platform Node uploader (no `aws` CLI / `psql` needed). It reads every `backend/test-cases/<slug>/cases.json`, uploads it to `s3://<bucket>/test-cases/<slug>/cases.json`, and updates the matching problem row.

**Key endpoints**

| Method | Route | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/auth/signup` / `/auth/login` | – | Returns `{ token, user }` |
| `GET` | `/problems` | – | List public problems |
| `GET` | `/problems/:slug` | – | Problem detail (+ code templates) |
| `POST` | `/submissions` | ✅ | Enqueue a submission → `{ submissionId, status }` |
| `GET` | `/submissions/:id` | ✅ | Fetch a submission |

---

## 3. Judge worker (`judge-worker/`)

Build the per-language sandbox images first (one-time, rebuild when a runner changes):

```bash
cd judge-worker
docker build -t judge-python3:latest   images/python3
docker build -t judge-javascript:latest images/javascript
docker build -t judge-cpp:latest        images/cpp
docker build -t judge-java:latest       images/java
docker build -t judge-go:latest         images/go
```

Create `judge-worker/.env`:

```env
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
SQS_SUBMISSION_QUEUE_URL=https://sqs.<region>.amazonaws.com/<acct>/leetcode-submission.fifo
SQS_RESULT_QUEUE_URL=https://sqs.<region>.amazonaws.com/<acct>/leetcode-result.fifo
TEST_CASES_S3_BUCKET=your-bucket-name

MAX_CONCURRENT_JOBS=4
POLL_WAIT_SECONDS=20
VISIBILITY_TIMEOUT_SECONDS=60
# IMAGE_REGISTRY=<acct>.dkr.ecr.<region>.amazonaws.com   # optional; uses local judge-<lang>:latest if unset
```

Run it (Docker must be running):

```bash
go run ./cmd/worker          # or: go build -o judge ./cmd/worker && ./judge
```

A health endpoint is served on `:8080`.

---

## 4. Results consumer (`results-consumer/`)

Create `results-consumer/.env`:

```env
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
REDIS_URL=redis://localhost:6379

AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
SQS_RESULT_QUEUE_URL=https://sqs.<region>.amazonaws.com/<acct>/leetcode-result.fifo
VISIBILITY_TIMEOUT_SECONDS=60
```

```bash
cd results-consumer
npm install
npm start
```

---

## 5. WebSocket server (`ws-server/`)

Create `ws-server/.env`:

```env
PORT=3001
JWT_SECRET=must_match_backend_JWT_SECRET
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
REDIS_URL=redis://localhost:6379
CORS_ORIGIN=*
```

> `JWT_SECRET` **must** match the backend — the ws-server verifies the same token the backend issues.

```bash
cd ws-server
npm install
npm run dev      # http://localhost:3001
```

---

## 6. Mobile app (`mobile/`)

Set the backend + websocket URLs in `mobile/src/config.js`:

```js
export const API_URL = "http://<your-host>:3000"; // express backend
export const WS_URL  = "http://<your-host>:3001"; // ws-server
```

> On a **physical device**, `localhost` is the phone itself. Use your machine's LAN IP, or expose both ports via tunnels (e.g. two `ngrok` tunnels) and paste the URLs here.

Install and run:

```bash
cd mobile
npm install
# iOS only:
cd ios && pod install && cd ..

npm start                     # Metro bundler
# in another terminal:
npm run android               # or: npm run ios
```

This app uses native modules (MMKV, WebView, screens), so a **full native build is required** — a JS-only reload is not enough after dependency changes.

---

## Recommended startup order

1. PostgreSQL + Redis up
2. `backend` (migrate + seed + upload test cases once, then `npm start`)
3. Build judge Docker images → run `judge-worker`
4. `results-consumer`
5. `ws-server`
6. `mobile` (Metro + device/emulator)

---

## Supported languages

Canonical language keys used **everywhere** (submission API, code templates, judge images): `python3`, `javascript`, `cpp`, `java`, `go`. The mobile app currently ships starter templates + driver code for **`python3`, `javascript`, `cpp`**.

Each problem stores:
- **`codeTemplates`** — the editor starter stub shown to the user (per language).
- **`driverCode`** — a hidden stdin/stdout harness appended to the user's function before judging (function-only submission model).

---

## How judging works (function-only model)

Users only write a function/class — not a full program. At submit time the backend concatenates the user's code with the problem's hidden `driverCode[language]`. The judge feeds each test case's `input` to the program's **stdin** and compares trimmed **stdout** to the expected output. Test cases live in S3 as `test-cases/<slug>/cases.json`:

```json
[{ "id": 1, "input": "4\n2 7 11 15\n9", "expectedOutput": "0 1" }]
```

---

## Troubleshooting

- **Verdict never arrives / stuck on "Judging…":** ensure `judge-worker`, `results-consumer`, and `ws-server` are all running, Redis is reachable, and Docker images are built. Without the full pipeline the submission stays `PENDING`.
- **Mobile logs out on reload:** MMKV must be v3 on RN's New Architecture (already set). Confirm a full native rebuild was done.
- **`watch:submission` rejected:** the ws-server `JWT_SECRET` must equal the backend's.
- **Submission rejected with "no test cases configured":** run `node backend/upload-tests.js` so `testCasesFileUrl` is populated.
- **Physical device can't reach the API:** `localhost` won't work — use a LAN IP or tunnels in `mobile/src/config.js`.

---

## Security notes

- Never commit real secrets. Each service reads its own gitignored `.env`.
- Rotate any AWS keys / DB passwords that have been shared or committed.
