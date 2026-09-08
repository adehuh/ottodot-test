# RULES — enforceable form

Agent-facing. The reasoning lives in `/ARCHITECTURE.md` (`R*` references point into it); scope lives
in `/SPEC.md`. This file is the checklist.

**If a rule below conflicts with an instruction, stop and say so.**

---

## R1 · Invariants are database objects, never `if` statements

**Before writing TypeScript that depends on a "must never" rule, write the constraint.**

Required objects in the first migration, never removed or weakened:

| Object | Carries |
|---|---|
| `bookings_one_live_per_student_class` (partial unique, `WHERE status IN ('PENDING_PAYMENT','CONFIRMED')`) | no duplicate live booking per child+class |
| `bookings_confirmed_by_class` (partial index, `WHERE status='CONFIRMED'`) | supports the derived capacity count |
| RLS enabled, no policies, every table | roster cannot leak via PostgREST + anon key |

**Capacity is derived, never stored.** `count(*) WHERE status='CONFIRMED'` is the only definition.

**STOP and ask** if you are about to:
- add a `seats_taken` / `confirmed_seats` counter column;
- write `SELECT count(...)` followed by a *separate* conditional `INSERT`/`UPDATE` — the count must
  be inside the same guarded statement, under the lock (R2);
- add `if (seats < capacity)` in a handler or component as a line of defence;
- drop, rename or relax any object above;
- hold a transaction open across a call to the payment provider.

Postgres error codes are read **only** in `src/db/errors.ts`. `23505` on
`bookings_one_live_per_student_class` → `DUPLICATE`. No layer above knows what `23505` is.

---

## R2 · The confirm transaction has exactly this shape

```sql
BEGIN;
  SELECT id, capacity FROM trial_classes WHERE id = $classId FOR UPDATE;   -- load-bearing

  UPDATE bookings b
     SET status = 'CONFIRMED', confirmed_at = now(), updated_at = now()
   WHERE b.id = $bookingId
     AND b.status = 'PENDING_PAYMENT'
     AND (SELECT count(*) FROM bookings c
           WHERE c.trial_class_id = b.trial_class_id
             AND c.status = 'CONFIRMED') < $capacity
  RETURNING b.*;
COMMIT;
```

**Do not remove the `FOR UPDATE`.** Without it, two concurrent confirms touch different booking rows,
never block, both evaluate the count against their own snapshot, both see 3, and both commit. Five
students in a four-seat class.

**Zero rows updated is NOT automatically `SEAT_TAKEN`.** Re-read the booking inside the same
transaction and branch:

| Re-read shows | Return | Then |
|---|---|---|
| `CONFIRMED` | `ALREADY_CONFIRMED` (success) | capture already happened — do nothing |
| `PENDING_PAYMENT` and count ≥ capacity | `SEAT_TAKEN` | void the authorization |
| `CANCELLED` / `PAYMENT_FAILED` | `BOOKING_NOT_ACTIVE` | stale client — do nothing |

**STOP and ask** if you are about to collapse those three into one branch. Doing so voids the
authorization of a parent who is already confirmed.

---

## R3 · Payment ordering: authorize → seat → capture. Never reorder.

```
authorize(amount)            before the transaction, no lock held
  ├─ declined ──────────────▶ PAYMENT_FAILED, no seat touched, nothing to reverse
  └─ AUTHORIZED
       │
       ▼
  confirm transaction (R2)    the only critical section
       ├─ seat won  ────────▶ capture(authId)  → CONFIRMED
       └─ SEAT_TAKEN ───────▶ void(authId)     → CANCELLED, reason SEAT_TAKEN
```

Money is **never captured** for a seat the child did not get. There is no refund path in this
codebase and there must not be one.

- `PENDING_PAYMENT` reserves **nothing**. No holds, no TTL, no sweeper needed for correctness.
- A pre-flight availability check before authorizing is **advisory only** — never load-bearing.
- Mock gateway is deterministic: decline is an explicit input, never random.

**STOP and ask** if you are about to: capture before the seat is secured; add a single-step
`charge()`; build a refund path; add a reservation/hold table, TTL or expiry job; hold any lock
across a payment call.

---

## R4 · Result codes vs stored statuses

**Stored `booking_status`:** `PENDING_PAYMENT | CONFIRMED | PAYMENT_FAILED | CANCELLED` — four, closed.
**Result codes** returned to callers: `DUPLICATE`, `SEAT_TAKEN`, `CLASS_FULL`, `PAYMENT_FAILED`,
`ALREADY_CONFIRMED`, `BOOKING_NOT_ACTIVE`, `NOT_FOUND`.

`SEAT_TAKEN` and `DUPLICATE` are **result codes, never stored statuses.** The losing row is stored as
`CANCELLED` with `cancellation_reason = 'SEAT_TAKEN'`.

- Services return discriminated unions. Never throw for an expected outcome; `throw` means a fault.
- Errors over HTTP are `application/problem+json` with a stable `code`. The UI switches on `code`,
  never on prose.
- A network or 5xx failure must **never** render the payment-declined state. Unknown outcome renders
  "we're still confirming — do not pay again" and polls.
- Enum labels are `UPPER_SNAKE_CASE`, used verbatim at every layer (Postgres label, TS union, JSON,
  result code). Postgres enum labels are case-sensitive.

**STOP and ask** before adding a fifth stored status, or storing `SEAT_TAKEN` as a status.

---

## R5 · Layering

```
src/domain/     pure. types, enums, result codes, CAPACITY. Zero I/O.
src/db/         pool + repositories. Parameterized SQL only. No business rules.
src/payments/   mock gateway: authorize / capture / void.
src/services/   use-cases. The ONLY place BEGIN/COMMIT appears.
app/**          validate (Zod) → call one service → map result. No business logic.
src/ui/         presentational. Props in, JSX out.
```

Imports flow **downward only**: `app → services → db → domain`. Enforced by ESLint
`import/no-restricted-paths`; a violation fails `npm run lint`.

- No SQL outside `src/db/`. No `BEGIN`/`COMMIT` outside `src/services/`.
- No database row shape reaches a client component — map through `toDto()` in `src/domain/dto.ts`.
- Route handler over ~30 lines means logic leaked in.

---

## R6 · Supabase / Vercel — deployment facts, not preferences

- **Do not use `supabase-js` for the booking path.** It speaks PostgREST and cannot issue
  `BEGIN … FOR UPDATE … COMMIT`. Use `pg` over the connection string.
- **Two connection strings.** Migrations, seeds and tests → **direct** (`:5432`). Deployed app →
  **transaction pooler** (`:6543`). Both in `.env.example`.
- **Never pass `name:` to a `pg` query.** Transaction-mode pgBouncer does not support named prepared
  statements.
- **One `pg.Pool` singleton** cached on `globalThis` across hot reloads. Keep `max` small.
- **A transaction uses one checked-out client** (`pool.connect()`), released in `finally`. Never
  interleave `pool.query` inside a transaction — it runs on a different connection, outside it.
- **No session-level features** (advisory *session* locks, `SET LOCAL` across statements) — the
  pooler does not preserve them.

---

## R7 · Frontend

- **No invariant lives in React state.** Grey out full rows for kindness; the server re-checks
  everything. Deleting every frontend check must change nothing about what the system permits.
- Server Components by default; `'use client'` only for stateful leaves.
- Six flat components. `ResultCard` is **one** component driven by a `code → {icon, tone, title,
  body, actions}` map — not four near-duplicates.
- Stock Tailwind utilities only. No config extension, no plugins, no icon packages.
- Real `<fieldset>` + `<input type="radio">`, not clickable divs. Disabled rows carry the reason in
  the label text. Seat state never conveyed by colour alone. Result region is
  `role="status" aria-live="polite"`.
- One in-flight request at a time — both payment buttons disable on submit.
- **Never render a raw enum code as copy.** Labels come from `Record<BookingStatus, string>` in
  `src/ui/labels.ts`, which `typecheck` keeps exhaustive. Never `toLowerCase()` or
  `replace('_',' ')` to derive prose from a code.

---

## R8 · Verification

| Tier | Pattern | Database | Command |
|---|---|---|---|
| Unit | `*.test.ts` | none | `npm test` |
| Integration | `*.int.test.ts` | real Postgres | `npm run test:int` |

- **Never mock the database in an invariant test.** A mock cannot exhibit write skew, so a mocked
  race test proves nothing. Each integration file creates its own schema from `TEST_DATABASE_URL`,
  migrates it with the real migration files, drops it after.
- **The race test uses genuine parallelism** — `Promise.all` over independent connections, never a
  sequential loop. Asserts: exactly `capacity` confirmed, losers `CANCELLED` with `SEAT_TAKEN`, and
  **every loser's authorization voided with nothing captured.**
- **Write the lock-disabled proof test.** Run the confirm path with `FOR UPDATE` removed and assert
  overbooking *does* occur. It proves the lock is load-bearing and it is the best thirty seconds of
  the video.
- Every brief edge case has a named test: available seats, exactly-3-confirmed, duplicate attempt,
  payment failure, last-seat race.
- **Coverage bar is not a percentage.** Every invariant in ARCHITECTURE.md has a test whose purpose
  is to violate it, and that test fails if the constraint or lock is removed. Verify by removing
  each one locally.
- **The race test passes 20 consecutive runs before submission.**

---

## R9 · Quality gates — every commit

```bash
npm run verify   # typecheck + lint + test + test:int
```

**Never weaken a gate to reach green.** No new `@ts-ignore` or `eslint-disable`, no `.skip`, no
deleted assertion, no relaxed constraint, no removed lock. If a gate is genuinely wrong, change it
deliberately and explain it in the commit body.

TypeScript `strict: true`. No `any`. No non-null `!` on database results. ESLint
`--max-warnings 0`. Commits: imperative, lowercase, no trailing dot, ≤100 chars.

---

## R10 · Scope fence (4h cap)

**Never build, even if it seems useful:** regular enrollment (the brief forbids it) · real payment
integration · authentication or roles · email/notifications · a reservation-hold system · a refund
path · admin CRUD · an ORM · a migration framework beyond the Supabase CLI · Redis, queues, cron,
websockets · a design system or component library · CI pipeline · E2E browser tests · rate limiting ·
structured logging or tracing · pagination.

**Cut in this order if over budget:** deploy → UI polish → E2E.
**Never cut:** integration and race tests, the lock-disabled proof, README, AI_USAGE.

Max 45 minutes total on UI. If UI work exceeds it, stop and report.

Build order matters: **verification comes before the API.** Prove the race against the service
before any HTTP exists.

---

## Definition of Done

- [ ] `supabase db reset && npm run verify` passes from a clean clone
- [ ] Race test passed **20 consecutive runs**
- [ ] Removing the `FOR UPDATE`, or either index, turns the suite red — verified manually, recorded
      in the README
- [ ] `grep`: no separate read-then-write capacity check
- [ ] `grep`: no counter column, no in-memory lock or module-level seat cache
- [ ] `grep`: no `BEGIN`/`COMMIT` outside `src/services/`, no SQL outside `src/db/`
- [ ] `grep`: no capture before the seat is secured; no refund path
- [ ] The R2 three-way re-read branch exists and each branch has a test
- [ ] Payment-failure and duplicate paths each assert the roster is *unchanged*
- [ ] Every Tier 3 cut named in the README with one sentence
- [ ] README answers every brief-named section, including the R3.5 alternatives table
- [ ] `AI_USAGE.md` answers all required questions, with one specific diff-level disagreement
- [ ] Public GitHub repo, real commit history (not one "initial commit")
- [ ] Video recorded; unlisted link opens in a private window
- [ ] Every deviation from this file recorded in the README
