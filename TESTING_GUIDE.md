# Testing Guide — everything built beyond the base README

`README.md` already covers the core submission pipeline (backend, judge-worker,
results-consumer, ws-server, mobile — infra setup, `.env` files, startup
order). **Start there first.** This document covers everything built *on top*
of that base: contests, the search engine, `db-explorer-mcp`, and the AI
problem-generation agents — plus a single end-to-end walkthrough tying it all
together.

Honesty check before you start: everything below marked ✅ has been run and
verified against real data in this project. Anything marked ⚠️ is built and
code-reviewed but **not yet run end-to-end** here — mainly the AI agent lab,
which needs an `OPENAI_API_KEY` that was never added during development.

---

## 0. One-time prerequisites beyond the base README

| Requirement | Needed for | Status on this machine |
| --- | --- | --- |
| `OPENAI_API_KEY` in `backend/.env` | Problem Architect / Solver / Adversary agents | **Missing — add before testing Section 4** |
| Docker | judge-worker (all 5 languages); optional speed-up for the agent lab | **Not installed** — judge-worker cannot run without it; the agent lab auto-falls-back to a Docker-free local runner (`javascript`/`python3` only), so it still works without Docker |
| `pg_trgm` Postgres extension | Search typo-tolerance | Already installed via migration `0008_problem_search.sql` — nothing to do |
| `redis-server` running locally | Contest live leaderboard | `brew services start redis` (or however you normally start it) |

---

## 1. Contests — lifecycle, scoring, live leaderboard

Everything here was verified directly against the real Neon DB + a live
`results-consumer`/`ws-server` earlier in development.

### 1a. Backend REST API ✅

```bash
# List contests
curl http://localhost:3000/contests

# Contest detail
curl http://localhost:3000/contests/<slug>

# Register (auth required)
curl -X POST -H "Authorization: Bearer <token>" \
  http://localhost:3000/contests/<slug>/register

# Leaderboard — reads Redis while RUNNING, Postgres once FINISHED
curl http://localhost:3000/contests/<slug>/leaderboard
```

### 1b. Lifecycle sweep + finalize trigger ✅

`results-consumer` runs a 60s sweep (`contestLifecycle.js`) flipping
`DRAFT→RUNNING` at `startsAt` and `RUNNING→FINISHED` at `endsAt`. The
`RUNNING→FINISHED` flip fires the `trg_finalize_contest` Postgres trigger,
which recomputes final rank/score **directly from `submissions`**, independent
of whatever Redis says.

To test: seed a contest with `endsAt` a few minutes in the future, register,
submit against one of its problems, wait for `endsAt` to pass (or update it to
`now() - interval '1 minute'` directly in Postgres to force it), then confirm
`contestParticipants.rank/totalScore/totalPenalty` populated correctly and
`contest.status = 'FINISHED'`.

### 1c. Live leaderboard over WebSocket ✅

Mobile: open a contest via `ContestsScreen` → `ContestDetailScreen`, which uses
`useContestWatcher` (`mobile/src/hooks/useContestWatcher.js`) to `watch:contest`
and receive `contest:leaderboard`/`contest:rank` pushes every 10s while
submissions land.

Manual test without the app: connect a `socket.io-client` to `ws-server`,
`auth: { token }`, emit `watch:contest` with a contest id, and confirm an
immediate snapshot arrives, followed by ticked updates as verdicts land.

---

## 2. Search engine ✅

Natural-language query parsing lives in `backend/src/utils/parseSearchQuery.js`
+ `problemSearch.js` — there is **no separate `difficulty` or `tags` query
param**; difficulty and topic words are extracted from the single `q` param.

```bash
curl "http://localhost:3000/problems?q=hard%20problems"          # difficulty-only, no text search
curl "http://localhost:3000/problems?q=easy%20problems"
curl "http://localhost:3000/problems?q=problems%20on%20substring" # full-text match on title/description
curl "http://localhost:3000/problems?q=susbtring"                 # deliberate typo — trigram fallback
curl "http://localhost:3000/problems?q=hash%20table"               # tag-name match
curl "http://localhost:3000/problems"                              # empty q — full public list
```

Layering, in order: (1) regex-extract `easy|medium|hard` → structured
difficulty filter, (2) remaining terms run through Postgres full-text search
(`tsvector`/`ts_rank_cd`) **and** curated tag-name matching — every term must
be covered by *something* (FTS lexeme or tag substring) for a hit to count, not
just any one term, (3) only if that returns nothing does it fall back to
`pg_trgm` similarity for typo tolerance. Mobile: `ProblemSearchScreen.js` is
the client, a plain text box calling `searchProblems(q, 50)`.

---

## 3. `db-explorer-mcp` — the problem-authoring tool ✅ (tool itself), no LLM

This MCP server is a pure capability — validate + dry-run + persist — with
**no LLM call inside it**. It expects a fully-authored problem as input.

Run it standalone as an MCP server:

```bash
cd db-explorer-mcp
npm install   # if not already done
node server.js
```

It speaks MCP over stdio, so it's normally driven by an MCP client (Section 4
below is exactly that), not called directly from a terminal. Tools exposed:
`get_submission_trends`, `get_recent_errors`, `get_user_stats`, and
`create_problem` (the interesting one — validates, dry-runs the reference
solution against hidden test cases using `javascript`/`python3` subprocesses,
no Docker, uploads test cases to S3, then transactionally inserts into
`problems`/`problemTags`, defaulting new problems to `visibility: "PRIVATE"`).

---

## 4. AI problem-generation agents ⚠️ needs `OPENAI_API_KEY` — not yet run

Two separate entry points exist under `backend/ai-lab/`:

### 4a. `problem-architect.js` — single agent, real production path

```bash
cd backend
node ai-lab/agents/problem-architect.js "binary search on answer"
```

Generates one problem draft (OpenAI structured output, scoped to
`javascript`+`python3`), connects to `db-explorer-mcp` as a real MCP client,
and calls `create_problem` — meaning this path goes through **real S3 upload +
DB insert**, exactly like a human using the tool. Retries up to 3 times,
feeding `create_problem`'s validation/dry-run failures back to the model.
Resulting problems are immediately playable through the real submission flow
(their `testCasesFileUrl` is a real S3 key).

### 4b. `04-multi-agent-lab.js` — the full Architect → Solver → Adversary graph

```bash
cd backend
node ai-lab/04-multi-agent-lab.js "sliding window maximum"
```

A LangGraph state machine: **Architect** drafts a problem → **Solver**
attempts to write a correct solution against it (bounded reflection loop,
`ai-lab/lib/localJudge.js`) → **Adversary** deliberately writes a *wrong*
solution and tries to get it wrongly `ACCEPTED` → if it succeeds, that's fed
back to the Architect as "your hidden tests are too weak, add edge cases" and
the loop repeats (max 2 revisions) → once the Adversary fails to break it, the
problem is approved and inserted.

**Important difference from 4a**: this path does **not** go through
`db-explorer-mcp`/S3 at all — it inserts directly into Postgres with test
cases written to a local JSON file (`ai-lab/tmp/cases/<slug>.json`). Problems
created this way are **lab artifacts only** — not solvable through the real
submission flow, since `testCasesFileUrl` points at a local path the real
judge-worker/S3 client can't read. Good for practicing/tuning the multi-agent
loop; not for populating the real problem catalog (use 4a for that).

`localJudge.js` auto-detects Docker (`docker info`) and uses it if present;
otherwise falls back to a host `node`/`python3` runner with file-redirected
stdin — so both scripts work on this machine despite no Docker being
installed, just restricted to `javascript`/`python3`.

**Before running either**: add `OPENAI_API_KEY=sk-...` to `backend/.env`.
Optional: `OPENAI_MODEL` (defaults to `gpt-4o-2024-08-06`).

---

## 5. Full manual walkthrough (mobile app)

1. Sign up / log in (`LoginScreen`/`SignupScreen`).
2. `HomeScreen` → tap the Search tile → `ProblemSearchScreen`, try a few
   queries from Section 2.
3. Open a problem → `SubmitScreen` → write/submit code → watch the live
   verdict stream in over the socket (needs judge-worker + Docker running, or
   test against a problem already solvable — see README's judging section).
4. `ContestsScreen` → register for a contest → `ContestDetailScreen` → submit
   against a contest problem and watch the leaderboard update live.
5. `CompletedScreen` / `GapsScreen` → confirm solved/unsolved problem and
   contest-registration status reflect what you just did (`/me/problem-status`,
   `/me/contests`).
