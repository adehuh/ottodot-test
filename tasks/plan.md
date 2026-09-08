# Implementation Plan — Ottodot Trial Booking

## Context

`SPEC.md`, `ARCHITECTURE.md` and `.claude/RULES.md` exist. **No code does** — the repo is six
markdown files, no `package.json`, no git. This plan turns that specification into an ordered,
verifiable build.

The brief grades *judgment and verification over feature breadth*. So the plan is weighted the same
way: the confirm transaction and its proofs get their own phase and their own checkpoint, and that
checkpoint sits **before any HTTP exists** (RULES R10 fixes this order — verification precedes the
API). Four screens are the cheapest part of the deliverable and are scheduled last, under a hard
45-minute cap.

Target: a correct transactional core, a race test with genuine parallelism, a lock-disabled proof,
and a README that explains the tradeoff. Cap: 4 hours.

---

## Decisions resolved before planning

| # | Question | Decision |
|---|---|---|
| 1 | `failPayment` vs decline-inside-confirm | **Folded into `confirmBooking`.** `failPayment` does not exist. One code path owns the money ordering. Deviation from SPEC §6 — recorded in the README. |
| 2 | Where the lock-free SQL lives (R9.4) | **Test-owned.** `src/db/` keeps no lock-disabling branch. The test derives its variant from the exported production SQL constant by stripping `FOR UPDATE`, and asserts the strip changed the string — so the copy cannot drift, and deleting `FOR UPDATE` from production turns the proof red instead of silently passing. |
| 3 | Deploy (SPEC §12.2) | **Cut.** Reviewer path is `supabase db reset && npm run verify`. Named in the README's cuts section with the reason. The pooler-vs-direct split stays documented in `.env.example` per R5.1 — the decision stands even unexercised. |

## Standing assumptions

- **Row types live in `src/domain/`,** not `src/db/`. R1.4 has repositories return row types and
  services map them through `toDto()` in `src/domain/dto.ts`. Domain imports nothing internal
  (R1.1), so the row types must originate there for both layers to reference them legally.
- **`CLASS_FULL` is advisory and returned only by `createBooking`.** `SEAT_TAKEN` is the
  authoritative confirm-time code. R3 makes the pre-flight check explicitly non-load-bearing.
- **Capture happens after `COMMIT`,** because R1 forbids holding a transaction across a payment
  call. This leaves a real gap: a capture failing after commit yields a `CONFIRMED` seat with an
  uncaptured authorization. Not fixed — a reconciliation job is Tier 3. **Named in the README as an
  accepted tradeoff.**
- **The video is recorded separately,** outside the 4h engineering cap (SPEC §12.1).

---

## Architecture decisions

**Slicing.** Pure vertical slicing (schema+API+UI per feature) is wrong here and the plan does not
use it. RULES R10 mandates that the race be proven against the service before any HTTP exists, so
slices run vertically through the **correctness stack** instead: each task in Phases 1–2 delivers one
behaviour proven end-to-end from migration through service to a green integration test. Nothing is
"a layer"; every task ends with a passing proof. The UI is genuinely last, by rule and by grading
weight.

**Both indexes are asserted by name.** The Definition of Done claims removing *either* index turns
the suite red. `bookings_confirmed_by_class` is a performance object — dropping it would not fail a
behavioural test. So `tests/schema.int.test.ts` asserts both indexes exist by name via `pg_indexes`.
DoD then holds literally, without pretending the index carries correctness.

**Test harness.** Each `*.int.test.ts` file creates its own schema from `TEST_DATABASE_URL`, replays
the real migration files (legal because R2.1b bans schema qualifiers), and drops it after. No second
copy of the schema, no mocked database in any invariant test.

---

## Dependency graph

```
T1 scaffold ── T2 domain ─┬─ T3 migration + B1 constraint proof ── T4 seed
                          │            │                            │
                          │            └──── T5 pool/errors/tx ─────┴── T6 repositories
                          │                                                  │
                          └─ T7 payment mock ──────────┐                     │
                                                       │                     │
                                        T8 createBooking ◀──────────────────┘
                                                       │
                                        T9 confirmBooking  ← THE GRADED CORE
                                                       │
                                     ┌─────────────────┴──────────────┐
                                T10 race test              T11 lock-disabled proof
                                     └─────────────────┬──────────────┘
                                          ══ CHECKPOINT B ══  (human review)
                                                       │
                                        T12 actions + roster route ── T13 dev reset
                                                       │
                                     T14 /book · T15 /pay + /status · T16 /roster
                                                       │
                                          T17 README ── T18 AI_USAGE
```

---

## Phase 0 — Scaffold

### T1 · Repo scaffold and quality gates
Stand up Next.js App Router + TypeScript strict + Tailwind, the ESLint layer rule, vitest with three
project configs, the npm scripts from SPEC §7, `.env.example` with both connection strings, and
`supabase init`. `git init` and the first commit land here.

**Acceptance**
- [ ] `npm run typecheck`, `npm run lint` (`--max-warnings 0`) and `npm run build` all green
- [ ] `supabase start` brings up local Postgres and prints a usable direct connection string
- [ ] A deliberate `domain → db` import fails `npm run lint` (proved, then reverted)
- [ ] `.env.example` documents direct `:5432` (migrations/seed/tests) vs pooler `:6543` (app), R5.1

**Verification** — run all three gates; add the scratch import, see lint fail, remove it.
**Files** — `package.json`, `tsconfig.json`, `eslint.config.mjs`, `.prettierrc`, `.editorconfig`,
`vitest.config.ts`, `.env.example`, `supabase/config.toml`, `app/layout.tsx`
**Deps** — none · **Size** — M · **Risk** — highest setup friction in the build; first so it fails fast

---

## Phase 1 — Foundation

### T2 · `src/domain` — pure types, codes, DTOs
Status/payment/subject unions matching the Postgres enum labels verbatim, the seven result codes,
`Result<T>` discriminated union, `CAPACITY = 4`, hand-written row types (R2.2), DTO shapes and
`toDto()`.

**Acceptance**
- [ ] Zero internal imports (lint layer rule proves it)
- [ ] Every enum label is the same `UPPER_SNAKE_CASE` string used at every layer
- [ ] `toDto()` unit-tested; no row shape leaks a `Date` or raw column name into a DTO

**Verification** — `npm test` · **Files** — `src/domain/{types,result,dto}.ts`, `tests/domain.test.ts`
**Deps** — T1 · **Size** — S

### T3 · Initial migration + the raw-SQL duplicate proof (B1)
One timestamped migration: three enums, five tables with audit columns, the partial unique index, the
partial confirmed index, RLS enabled with no policies on every table, no schema qualifiers (R2.1b).
Plus the integration harness and a constraint test written in **raw SQL with the application
removed**.

**Acceptance**
- [ ] `supabase db reset` runs clean **twice in a row**
- [ ] Two `PENDING_PAYMENT` rows for the same `(student, class)` → `23505`, in raw SQL
- [ ] A `PAYMENT_FAILED` row does not block a fresh `PENDING_PAYMENT` for the same pair
- [ ] Both indexes asserted present by name via `pg_indexes`
- [ ] RLS confirmed enabled on all five tables

**Verification** — `supabase db reset && npm run test:int`
**Files** — `supabase/migrations/<ts>_init.sql`, `tests/helpers/schema.ts`, `tests/schema.int.test.ts`
**Deps** — T1, T2 · **Size** — M

### T4 · `db/seed.ts` — every case the brief names
One `seed()` used by tests *and* `/api/dev/reset`. Fixed UUIDs, idempotent, deterministic. Two
parents, three students, and the four class states from SPEC §9 plus the duplicate-attempt fixture.

**Acceptance**
- [ ] Volcanoes 1/4 · Fractions **3/4** · Circuits 4/4 · Geometry 2 confirmed + 1 `PAYMENT_FAILED`
- [ ] A `CONFIRMED` booking exists for one child in Volcanoes (the duplicate case)
- [ ] Running `seed()` twice yields identical row counts *and* identical ids

**Verification** — `npm run test:int` · **Files** — `db/seed.ts`, `tests/seed.int.test.ts`
**Deps** — T3 · **Size** — S

### T5 · `src/db` infrastructure — pool, error mapping, transaction helper

> **Deviation:** `withTransaction` landed in `src/services/tx.ts`, not `src/db/tx.ts`. R1.2 forbids
> `BEGIN`/`COMMIT` outside `src/services/` and the DoD greps for exactly that, so the helper belongs
> with the layer that owns transactions.
`pg.Pool` singleton on `globalThis` with small `max` (R5.3), never `name:` on a query (R5.2).
`errors.ts` is the **only** file that knows `23505` (R4.6). `withTransaction` checks out one client
and releases it in `finally` (R5.4).

**Acceptance**
- [ ] `23505` on `bookings_one_live_per_student_class` → `DUPLICATE`; no other layer reads PG codes
- [ ] `withTransaction` rolls back on throw and always releases the client
- [ ] No `pool.query` is reachable from inside a transaction body

**Verification** — `npm test && npm run test:int`
**Files** — `src/db/{pool,errors,tx}.ts`, `tests/errors.test.ts`, `tests/tx.int.test.ts`
**Deps** — T2, T3 · **Size** — M

### T6 · Repositories — all SQL, typed and parameterized
Classes with **derived** seat counts (`count(*) WHERE status='CONFIRMED'`, R2.8 — no counter
column), students by parent, bookings (insert, get, the guarded confirm statement, cancel with
reason), payment attempts. The confirm SQL is an **exported constant** with `FOR UPDATE` hardcoded —
T11 reads it.

**Acceptance**
- [ ] Every query parameterized and typed; no `any`, no non-null `!` on a database result
- [ ] `grep`: no SQL outside `src/db/`, no `BEGIN`/`COMMIT` anywhere yet
- [ ] `grep`: no counter column, no separate read-then-write capacity check
- [ ] Each query integration-tested against seeded data

**Verification** — `npm run test:int` + the two greps
**Files** — `src/db/{classes,students,bookings,payments}.ts`, `tests/repositories.int.test.ts`
**Deps** — T4, T5 · **Size** — M

### ══ Checkpoint A ══
- [ ] `supabase db reset && npm run verify` green from clean
- [ ] B1 proven at the database level with zero application code involved
- [ ] Layer lint rule green; greps for SQL/BEGIN placement clean

---

## Phase 2 — The graded core

### T7 · `src/payments` — deterministic mock gateway
`authorize` / `capture` / `void`. `simulate: 'SUCCESS' | 'DECLINE' | 'SLOW'` — `SLOW` adds a
controllable delay to widen the race window on demand. The gateway records nothing; the service
writes `payment_attempts`.

**Acceptance**
- [ ] Decline is an explicit input, never random
- [ ] `capture` on a voided authorization throws — that is a fault, not a result code
- [ ] All three outcomes unit-tested, no database

**Verification** — `npm test` · **Files** — `src/payments/mock.ts`, `tests/payments.test.ts`
**Deps** — T2 · **Size** — S

### T8 · `createBooking(studentId, classId)`
Insert `PENDING_PAYMENT`. `23505` → `DUPLICATE` through `errors.ts`. `CLASS_FULL` when already at
capacity — **advisory only**. `NOT_FOUND` for a missing student or class.

**Acceptance** — A1, A2, and B1 at the service level
- [ ] A duplicate live booking returns `DUPLICATE`, never a 500
- [ ] Retry after a decline creates a **fresh** row; the `PAYMENT_FAILED` row survives as audit
- [ ] `PENDING_PAYMENT` consumes no capacity — asserted by a seat count before and after

**Verification** — `npm run test:int`
**Files** — `src/services/booking.ts`, `tests/create-booking.int.test.ts`
**Deps** — T6, T7 · **Size** — M

### T9 · `confirmBooking(bookingId, simulate)` — THE GRADED CORE
The single most important task in the build.

```
authorize(amount, simulate)              no lock held
  ├─ DECLINED ──▶ payment_attempts FAILED · booking PAYMENT_FAILED · return PAYMENT_FAILED
  └─ AUTHORIZED
       ▼
  withTransaction {                      the only critical section
     SELECT id, capacity FROM trial_classes WHERE id=$1 FOR UPDATE;   -- load-bearing
     UPDATE bookings ... AND status='PENDING_PAYMENT'
                         AND (SELECT count(*) ... ='CONFIRMED') < capacity  RETURNING *;
     rows = 0 → re-read the booking IN THE SAME TRANSACTION, branch three ways
  }
       ├─ won            ──▶ capture(authId)  → CONFIRMED          (after COMMIT)
       ├─ ALREADY_CONFIRMED ▶ do nothing — void nothing
       ├─ SEAT_TAKEN     ──▶ void(authId) → CANCELLED, reason SEAT_TAKEN
       └─ BOOKING_NOT_ACTIVE ▶ do nothing
```

**Acceptance** — B2, B3, B6
- [ ] A 5th confirm on a 4-seat class is impossible (B2)
- [ ] A declined authorization never confirms and **rosters nobody** — roster asserted *unchanged* (B3)
- [ ] An already-confirmed retry returns `ALREADY_CONFIRMED` and **voids nothing** (B6, the R3.2 branch)
- [ ] A stale `CANCELLED`/`PAYMENT_FAILED` booking returns `BOOKING_NOT_ACTIVE`
- [ ] All three re-read branches exist and each has its own test
- [ ] `grep`: no capture before the seat is secured; no refund path; no lock held across a payment call

**Verification** — `npm run test:int` + the greps
**Files** — `src/services/booking.ts`, `src/db/bookings.ts`, `tests/confirm-booking.int.test.ts`
**Deps** — T8 · **Size** — M–L · **Risk** — highest in the build; collapsing the three-way branch is
the exact bug the suite exists to catch

### T10 · The race test (B4, B5)
Genuine parallelism — `Promise.all` over independent connections, never a sequential loop. Two
scenarios: the last seat (Fractions at 3/4, N concurrent confirms) and an empty 4-seat class with
N=8.

**Acceptance**
- [ ] Exactly one winner on the last seat; `count(CONFIRMED) === capacity` exactly
- [ ] Every loser is `CANCELLED` with `cancellation_reason = 'SEAT_TAKEN'`
- [ ] Every loser's authorization is **VOIDED** and **zero losers are CAPTURED** (B5)
- [ ] Passes **20 consecutive runs** (R9.7) — result recorded in the README

**Verification** — `npm run test:race` (`--no-file-parallelism`), then a 20× loop
**Files** — `tests/race.int.test.ts`, `package.json` · **Deps** — T9 · **Size** — M

### T11 · The lock-disabled proof (B7)
Derive the lock-free statement from the exported production SQL constant by stripping `FOR UPDATE`,
assert the strip actually changed the string, then run the same concurrency and assert overbooking
**does** occur.

**Acceptance**
- [ ] Overbooking occurs without the lock — proving the lock is load-bearing
- [ ] The test fails loudly if `FOR UPDATE` is ever removed from the production constant
- [ ] `src/db/` contains no lock-disabling branch or runtime toggle

**Verification** — `npm run test:int` · **Files** — `tests/lock-proof.int.test.ts`
**Deps** — T10 · **Size** — S

### ══ Checkpoint B ══ — human review, before any HTTP exists
This is the gate the submission is graded on.
- [ ] B2–B7 all green; every brief edge case has a named test
- [ ] Race test passed 20 consecutive runs
- [ ] **Invariant-removal sweep (R9.6):** drop `FOR UPDATE` → suite red · drop
      `bookings_one_live_per_student_class` → suite red · drop `bookings_confirmed_by_class` →
      suite red (via the `pg_indexes` assertion). Each verified manually, recorded in the README.
- [ ] `npm run verify` green · **Review with human before proceeding to the API**

---

## Phase 3 — API surface

### T12 · Server actions + roster route handler
`app/actions.ts`: `listTrialClasses`, `createBooking`, `confirmBooking`, `getBooking`. Zod at the
boundary, UUIDs validated before touching SQL. `GET /api/roster/[classId]` read-only, `problem+json`
on error.

**Acceptance** — A4, A5
- [ ] Handlers hold no business logic; the route handler is under ~30 lines (R1.3)
- [ ] Errors are `application/problem+json` with a stable `code`
- [ ] Roster counts `CONFIRMED` only
- [ ] Node runtime forced — `pg` cannot run on edge

**Verification** — `npm run test:int` route test
**Files** — `app/actions.ts`, `app/api/roster/[classId]/route.ts`, `tests/roster-route.int.test.ts`
**Deps** — T9 · **Size** — M

### T13 · `POST /api/dev/reset`
Calls the **same** `seed()` as the tests (R2.3). Returns 404 when `NODE_ENV === 'production'` (R4.5).

**Acceptance**
- [ ] 404 under production env — asserted by test
- [ ] Reset restores the exact seed state, including ids

**Verification** — `npm run test:int` · **Files** — `app/api/dev/reset/route.ts`,
`tests/dev-reset.int.test.ts` · **Deps** — T4, T12 · **Size** — S

### ══ Checkpoint C ══
- [ ] `npm run verify` green · A1–A5 all satisfied · handlers thin, lint layer rule green

---

## Phase 4 — UI · hard 45-minute cap (R10)

If this phase exceeds 45 minutes total, **stop and report**. Ship unstyled.

### T14 · `/book` — pick child and class
`StepHeader`, `ChildPicker`, `ClassList`/`ClassRow`, `BookingSummary`. Real `<fieldset>` +
`<input type="radio">`, not clickable divs. Disabled rows carry the reason in the label text; "1 seat
left" and "FULL" carry meaning in words, never colour alone.
**Deps** — T12 · **Size** — S

### T15 · `/pay/[bookingId]` and `/status/[bookingId]`
`PaymentPanel` with Pay and Simulate-decline, both disabled on submit (one in-flight request).
`ResultCard` is **one** component driven by a `code → {icon, tone, title, body, actions}` map.
`src/ui/labels.ts` holds `Record<BookingStatus, string>` — exhaustive, so typecheck catches a missing
label. A network or 5xx failure renders "we're still confirming — do not pay again" and polls; it
**never** renders the declined card (R4.3).
**Deps** — T12 · **Size** — S

### T16 · `/roster/[classId]` — admin roster
`RosterTable`/`RosterRow`. Count reflects `CONFIRMED` only.
**Deps** — T12 · **Size** — S

**Acceptance, all three**
- [ ] No invariant lives in React state — deleting every frontend check changes nothing the system permits
- [ ] Loading, empty and error states on every list
- [ ] Result region is `role="status" aria-live="polite"`; focus rings visible
- [ ] No raw enum code rendered as copy; no `toLowerCase()`/`replace('_',' ')` to derive prose
- [ ] Stock Tailwind only — no config extension, no plugins, no icon packages

### ══ Checkpoint D ══
- [ ] Manual walkthrough: happy path → forced decline with roster unchanged → full class rejected →
      duplicate rejected · [ ] `npm run verify` green

---

## Phase 5 — Documentation

### T17 · `README.md`
Written against `.claude/README_STYLE.md` — its skeleton, the brief's own headings, plain first
person, no marketing adjectives, no restating the brief.

**Must contain**
- [ ] How to run, ≤5 commands, first section
- [ ] **The last-seat race second**, not buried — mechanism, the two SQL fragments, the R3.5
      alternatives table, and the accepted tradeoff stated plainly
- [ ] Schema · endpoints · statuses · duplicate prevention · payment failure · where each check lives
      (UI / backend / database / **background job: deliberately none**, with the reason)
- [ ] Concrete monitoring: `count(bookings WHERE status='CONFIRMED') > capacity` for any class — must
      be zero, page immediately
- [ ] Every Tier 3 cut, one sentence each — including **deploy**, cut to protect the graded core
- [ ] The three deviations recorded: `failPayment` folded into `confirmBooking`; deploy cut; capture
      occurs after `COMMIT`, leaving a confirmed-but-uncaptured gap a reconciliation job would close
- [ ] The invariant-removal sweep results from Checkpoint B, and the 20-run race result

### T18 · `AI_USAGE.md`
All required points, including **one specific, diff-level instance** where AI output was rejected.

### ══ Checkpoint E — Definition of Done ══
Run the full `.claude/RULES.md` DoD checklist. Every unchecked box is a defect.

---

## Time budget — honest reconciliation

SPEC §10 allots 50m to M0–M2, but that assumes the scaffold is free. It is not: Next.js + strict TS +
the ESLint layer rule + vitest projects + `supabase init` is realistically 25–35m on its own.

| Phase | SPEC budget | Realistic | Note |
|---|---|---|---|
| 0–1 (T1–T6) | 50m | **~80m** | scaffold is the overrun |
| 2 (T7–T11) | 60m + 55m | 115m | **never cut** |
| 3 (T12–T13) | 20m | 20m | |
| 4 (T14–T16) | 45m | **~25m** | absorbs the Phase 0–1 overrun; ship unstyled |
| 5 (T17–T18) | 30m | 30m | **never cut** |
| Deploy | 20m | **0m** | cut — buys back the remaining overrun |

Cutting deploy plus trimming UI polish covers the scaffold overrun inside the 4h cap. Order of
sacrifice stays fixed: deploy → UI polish → E2E. Never the race test, the lock-disabled proof, or
the README. Record time per phase as it happens.

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Docker / `supabase start` unavailable locally | **High** — blocks every integration test | Verified in T1, the first task, so it fails fast. Fallback: any local Postgres via `TEST_DATABASE_URL`. |
| Race test passes for the wrong reason | **High** — the whole submission rests on it | T11's lock-disabled proof must show overbooking; if it does not, the race test is not testing the lock. Plus 20 consecutive runs. |
| Collapsing the R3.2 three-way branch | **High** — voids an already-confirmed parent's payment | Each branch gets its own named test (T9). This is the bug the suite exists to catch. |
| Scaffold overruns the foundation budget | Medium | Absorbed from UI per the fixed sacrifice order; deploy already cut. |
| Vitest file parallelism corrupts shared state | Medium | Per-file throwaway schema (T3 harness); race test runs `--no-file-parallelism`. |
| `pg` on the Next.js edge runtime | Medium | Node runtime forced explicitly in T12; direct vs pooler strings documented. |
| 18 tasks against a 4h cap | High | Checkpoint B is the real deliverable. Phases 4–5 degrade gracefully; Phases 0–3 do not. |

---

## Verification — the standing bar

Every task ends green. The project-wide gate is unchanged from `.claude/RULES.md`:

```bash
supabase db reset && npm run verify     # typecheck + lint + test + test:int
npm run test:race                       # 20 consecutive runs before submission
```

Never weaken a test, type, lint rule, database constraint, or the `FOR UPDATE` lock to reach green.

---

## Task list

Tasks and checkpoints are tracked as a checklist in [`tasks/todo.md`](./todo.md) — 18 tasks,
5 checkpoints, in the dependency order above. That file is the one `/build` reads.
