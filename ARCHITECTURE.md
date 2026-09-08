# ARCHITECTURE — Ottodot Trial Booking

Rules for a 3–4 hour take-home graded on *backend and data-model judgment, correctness under edge
cases, sensible verification, scope control, and communication*.

Every rule below earns its place by mapping to one of those five criteria. Rules that would look
impressive but do not move a grading criterion are in **§10 Tier 3: Cut** — named, not silently
dropped, because "what you deliberately cut" is itself a graded README section.

**Stack (fixed):** Next.js (App Router) · React · TypeScript · Tailwind · Supabase Postgres ·
Vercel. Data access is hand-written parameterized SQL over `pg`. No ORM.

**Trust order:** the brief → `SPEC.md` → `.claude/RULES.md` → the source tree → prose in this file.
`package.json` scripts and the current source tree win over any prose that contradicts them.

---

## 0. The one-paragraph version

The database is the only authority on whether a seat exists. Every invariant is a constraint or a
lock inside one transaction. The service layer owns transactions; repositories own SQL; React owns
nothing but rendering whichever result code the server returned. Deleting every frontend check
would degrade UX and change nothing about what the system permits — that property is what the tests
assert.

---

## 1. Layering and the one-way import rule

Adapted from JHipster's generated-app layout (`domain → repository → service → web.rest`), which is
the transferable part of JHipster. Its own `ARCHITECTURE.md` documents Yeoman generator internals
(priorities, blueprints, EJS) — not applicable here and deliberately ignored.

```
src/domain/      pure types, status enums, result codes, CAPACITY. Zero I/O, zero imports from below.
src/db/          pool + repositories. Parameterized SQL only. No business rules.
src/payments/    mock gateway. authorize / capture / void. Deterministic.
src/services/    use-cases. Owns BEGIN/COMMIT. The only place invariants are enforced.
app/api/, app/   route handlers, server actions, React. Validate input, call a service, render.
src/ui/          presentational components. Props in, JSX out.
```

**R1.1** Imports flow strictly downward: `app → services → db → domain`. `domain` imports nothing
internal. Enforced by ESLint `import/no-restricted-paths`; a violation fails `npm run lint`.

**R1.2** No SQL outside `src/db/`. No `BEGIN`/`COMMIT` outside `src/services/`.

**R1.3** Route handlers contain no business logic. Parse → validate (Zod) → call service → map
result to HTTP. If a handler grows a conditional about seats or statuses, that logic belongs in a
service.

**R1.4** No database row shape crosses into a client component. Repositories return row types;
services map them through explicit `toDto()` functions in `src/domain/dto.ts`. This is JHipster's
`service/dto` boundary, minus the codegen.

---

## 2. Data model and invariants

**R2.1 — Migrations are timestamped, immutable and forward-only.**
`supabase/migrations/<timestamp>_init.sql`, applied in filename order. Once committed, a migration
is never edited; a correction is a new file. Liquibase changelog discipline without shipping
Liquibase.

**R2.1a — Migration tooling is the Supabase CLI.** `supabase migration new <n>` authors,
`supabase db push` applies to the linked project, `supabase db reset` rebuilds local from zero and
re-runs the seed. Chosen because the files stay plain SQL, the CLI is a dev dependency rather than a
runtime one, and `supabase start` provides a local Dockerized Postgres that doubles as
`TEST_DATABASE_URL`.

*Rejected:* **Flyway** — a JVM tool; adding a Java or Docker-wrapper dependency to a TypeScript repo
costs the grader setup friction and buys nothing over ordered `.sql` files. **node-pg-migrate** or a
hand-rolled runner — both fine, but they duplicate a capability the chosen database already ships,
and neither gives `db reset` or a local stack for free.

**R2.1b — Migrations never hardcode a schema qualifier.** Write `create table bookings (…)`, never
`public.bookings`, and rely on `search_path`. This keeps a migration relocatable, which is what lets
the integration harness replay the exact same files into a throwaway schema per test file (R9.2)
instead of maintaining a second copy of the schema. Enum types are per-schema and behave correctly
under this rule.

**R2.2 — Schema is the single source of truth.** TypeScript types are written to match the schema by
hand. No schema-from-TS, no generated client.

**R2.3 — Seed is separate from schema and lives in code.** `db/seed.ts` exports one `seed()`
function. Integration tests and `POST /api/dev/reset` both call **that same function**, so demo
state and test fixtures cannot drift.

**R2.4 — Every table carries `created_at` and `updated_at` `timestamptz not null default now()`.**
JHipster's `AbstractAuditingEntity`, trimmed to what an unauthenticated demo can honestly populate.

**R2.5 — Money is integer cents plus a currency column.** Never a float.

**R2.6 — Closed sets are Postgres enums, not free text, and every label is `UPPER_SNAKE_CASE`.**

```sql
booking_status : PENDING_PAYMENT | CONFIRMED | PAYMENT_FAILED | CANCELLED
payment_status : AUTHORIZED | CAPTURED | VOIDED | FAILED
class_subject  : SCIENCE | MATH
```

The same uppercase literal is used verbatim at every layer — Postgres enum label, TypeScript union
member, API JSON, result code (R4.1). One string, no translation step, so a value can be grepped end
to end and a typo is a type error rather than a silent mismatch. Uppercase also makes a raw code
visually obvious if it ever leaks into rendered output, which R7.8 forbids.

Two consequences to respect: Postgres enum labels are case-sensitive, so `'confirmed'` will not
match `'CONFIRMED'`; and renaming a label later needs `ALTER TYPE … RENAME VALUE` in a new
migration (R2.1).

**R2.6a — Codes are for machines; the database stores no display text.** No `label`, `display_name`
or `description` column on an enum-backed field. Wording is a presentation concern and belongs in
R7.8's label map, where it can change without a migration.

**R2.7 — The duplicate invariant is a partial unique index, not application code.**

```sql
create unique index bookings_one_live_per_student_class
  on bookings (student_id, trial_class_id)
  where status in ('PENDING_PAYMENT', 'CONFIRMED');
```

`PAYMENT_FAILED` and `CANCELLED` rows fall out of the index, so a parent can rebook after a decline
while the audit row survives. A `23505` from this index is caught and mapped to the `DUPLICATE`
result code — never surfaced as a 500.

**R2.8 — Capacity is derived, never stored.** No `seats_taken` counter column to drift out of sync.
`count(*) where status='CONFIRMED'` is the only definition, supported by a partial index:

```sql
create index bookings_confirmed_by_class on bookings (trial_class_id) where status = 'CONFIRMED';
```

**R2.9 — `PENDING_PAYMENT` does not reserve a seat.** A hold is intent, not a reservation; only
`CONFIRMED` consumes capacity. Two parents may hold and pay for the same last seat — the database
decides at confirm time and the loser's authorization is voided.
*Buys:* no abandoned checkout can strand a seat; no expiry job is needed for correctness.
*Costs:* the confirm path must be able to void an authorization. Because of R3.3 it never has to
reverse a capture.
`hold_expires_at` exists for admin display only; a lazy sweep may cancel stale holds, and if it
never runs nothing breaks.

**R2.10 — Enable RLS with no policies on every table.** Supabase auto-exposes the `public` schema
through PostgREST using the anon key. The app connects with a direct Postgres role and never uses
the anon key, so deny-all RLS costs nothing and stops the roster leaking publicly. Two lines per
table.

---

## 3. The last-seat race — the graded core

**R3.1 — Confirmation happens in exactly one transaction, and takes a lock on the class row first.**

```sql
BEGIN;
  SELECT id, capacity FROM trial_classes WHERE id = $classId FOR UPDATE;   -- serializes this class

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

**The `FOR UPDATE` is load-bearing and must not be removed.** Without it, under PostgreSQL's default
`READ COMMITTED`, two concurrent confirms operate on *different* booking rows, never block each
other, each evaluates the count subquery against its own snapshot, both observe 3, and both commit —
five confirmed students. Locking the parent `trial_classes` row makes confirms for one class strictly
serial, so the count is accurate when it is read. Lock scope is a single 4-seat class; contention is
irrelevant at this size.

**R3.2 — Zero rows updated is not automatically `SEAT_TAKEN`.** Re-read the booking in the same
transaction and branch on what it actually says:

| Re-read shows | Result code | Why |
|---|---|---|
| `CONFIRMED` | `ALREADY_CONFIRMED` (success) | idempotent retry / double-submit |
| `PENDING_PAYMENT`, count ≥ capacity | `SEAT_TAKEN` | genuinely lost the race → void the authorization |
| `CANCELLED` / `PAYMENT_FAILED` | `BOOKING_NOT_ACTIVE` | stale client |

Collapsing these into one branch voids the authorization of a parent who is already confirmed. This
is the bug the test suite exists to catch.

**R3.3 — Authorize → seat → capture. Void on loss.** Payment runs in two phases around the
transaction, and the transaction holds no lock across either network call:

```
authorize(amount)            network call, before the transaction
  ├─ declined ──────────────▶ PAYMENT_FAILED, no seat touched, nothing to reverse
  └─ AUTHORIZED
       │
       ▼
  confirm transaction (R3.1)  the only critical section
       ├─ seat won  ────────▶ capture(authId)  → CONFIRMED
       └─ SEAT_TAKEN ───────▶ void(authId)     → CANCELLED, reason SEAT_TAKEN
```

**Money is never captured for a seat the child did not get.** There is no refund path in this
codebase and there must not be one — a void on an uncaptured authorization is not a refund.

*Rejected: capture-then-void.* Capturing before the seat is secured means the loser of the race has
genuinely been charged and is owed money back, which introduces a refund state, a reconciliation
concern, and a real support burden. *Rejected: confirm-then-capture.* Leaves a confirmed booking
with no money behind it. The two-phase ordering above avoids both.

**R3.4 — `DUPLICATE` and `SEAT_TAKEN` are result codes, never stored booking statuses.** The stored
row goes `CANCELLED` with `cancellation_reason = 'SEAT_TAKEN'`. The result screen keys off the result
code; the admin table keys off the stored status. Keeping them separate is what stops the UI
inventing state the database does not have.

**R3.5 — Considered and rejected**, recorded in the README:

| Approach | Why not |
|---|---|
| `SERIALIZABLE` isolation + client retry on `40001` | Correct, but every caller needs a retry loop for one hot row. |
| Denormalised `seats_taken` counter + `CHECK (seats_taken <= capacity)` | Puts the invariant in the schema where a reviewer sees it without reading TypeScript — genuinely attractive. Rejected because the counter is a second source of truth that can drift from the bookings table and needs a reconciliation story. R2.8 has nothing to reconcile. |
| `unique(class_id, seat_index)` seat table | Elegant and lock-free, but adds seat-allocation logic and a retry on `23505`. More machinery than a 4-seat class earns. |
| `@Version`-style optimistic locking (JHipster's default) | Wrong tool: the contended resource is an aggregate count across sibling rows, not one row's version. |
| Advisory locks | Same serialization as `FOR UPDATE`, with no schema meaning and no FK safety. |
| Application mutex, `Map`, or Redis | Wrong on Vercel: N isolates, N mutexes. A new dependency and failure mode for a problem Postgres already solves. |

---

## 4. Errors and API contract

**R4.1 — Services return discriminated unions, never throw for expected outcomes.**

```
{ ok: true, ... } | { ok: false, code: 'DUPLICATE' | 'SEAT_TAKEN' | 'CLASS_FULL'
                                     | 'PAYMENT_FAILED' | 'ALREADY_CONFIRMED'
                                     | 'BOOKING_NOT_ACTIVE' | 'NOT_FOUND' }
```

Exceptions are reserved for genuine faults. Adapted from JHipster's `errorKey` pattern, minus the
exception control flow.

**R4.2 — Error responses are `application/problem+json`** (RFC 7807, which JHipster also emits) with
a stable machine-readable `code`. The UI switches on `code`, never on prose.

**R4.3 — A network or 5xx failure must never render the `PAYMENT_FAILED` card.** Transport failure
and payment decline are different states. Unknown outcome renders "we're still confirming — do not
pay again" and polls the booking.

**R4.4 — All input validated with Zod at the boundary.** UUIDs are validated before touching SQL.

**R4.5 — `POST /api/dev/reset` returns 404 when `NODE_ENV === 'production'`.**

**R4.6 — Postgres error codes are read in exactly one file**, `src/db/errors.ts`. `23505` on
`bookings_one_live_per_student_class` → `DUPLICATE`. No layer above knows what `23505` is.

---

## 5. Supabase / Vercel operational rules

**R5.1 — Two connection strings, deliberately.** Migrations, seeds and tests use the **direct**
connection (`:5432`). The deployed app uses the **transaction-mode pooler** (`:6543`), required for
serverless. Documented in `.env.example`.

**R5.2 — Never pass `name:` to a `pg` query.** Transaction-mode pgBouncer does not support named
prepared statements. `pg` is unnamed by default; keep it that way.

**R5.3 — One pooled `pg.Pool` module singleton**, cached across hot reloads via `globalThis`. Pool
`max` stays small — Vercel scales horizontally and a large per-isolate pool exhausts Supabase's
connection limit under exactly the concurrency this design targets.

**R5.4 — A transaction uses one checked-out client** (`pool.connect()`), released in `finally`.
Never interleave `pool.query` inside a transaction — it takes a different connection and silently
runs outside it.

**R5.5 — `supabase-js` is not used for the booking path.** It speaks PostgREST and cannot issue
`BEGIN … FOR UPDATE … COMMIT`.

**R5.6 — No session-level features** (advisory *session* locks, `SET LOCAL` spanning statements) —
the pooler does not preserve them.

---

## 6. Nothing needs a background job

The brief asks which checks belong in a background job. The answer here is **none**, and saying so
confidently scores better than inventing one.

Because `PENDING_PAYMENT` holds no seat (R2.9), there is nothing to expire and no seat to reclaim.
A lazy sweep marking stale holds `CANCELLED` is cosmetic; if it never runs, no invariant breaks.
With a real gateway, a reconciliation job against the provider would be mandatory — named in Tier 3,
not built.

**R6.1** Whatever job exists later must be able to be down indefinitely without any invariant
breaking. It reclaims and reports; it never guards.

---

## 7. Frontend rules

The brief says a polished frontend is not required. These rules keep the UI cheap and honest rather
than elaborate.

**R7.1 — No invariant lives in React state.** Full and already-booked rows are greyed for kindness;
the server re-checks everything.

**R7.2 — Six flat components:** `ChildPicker`, `ClassList`/`ClassRow`, `BookingSummary`,
`PaymentPanel`, `ResultCard`, `StepHeader`, plus `RosterTable`/`RosterRow`. `ResultCard` is one
component driven by a `code → {icon, tone, title, body, actions}` map, not four near-duplicate
components.

**R7.3 — Server Components by default.** `'use client'` only for the stateful leaves: child/class
selection, payment submit, roster expand.

**R7.4 — Stock Tailwind utilities only.** No config extension, no plugins, no icon packages.

**R7.5 — Selection is a real `<fieldset>` + `<input type="radio">`**, not clickable divs. Disabled
rows use the `disabled` attribute with the reason in the label text. Seat state is never conveyed by
colour alone — "1 seat left" and "FULL" carry the meaning in words. The result region is
`role="status" aria-live="polite"`; the submitting button sets `aria-busy` and keeps its accessible
name. Focus rings stay visible.

**R7.6 — One in-flight request at a time.** Both payment buttons disable on submit. Double-submit is
a duplicate source, and this is the UX half of the guard whose real half is R2.7.

**R7.7 — Every list has a loading, empty and error state.** Skeleton rows, not a blank panel.

**R7.8 — The frontend never renders a raw enum code; it renders a label.** All display strings live
in one map in `src/ui/labels.ts`:

```ts
export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  PENDING_PAYMENT: 'Pending payment',
  CONFIRMED:       'Confirmed',
  PAYMENT_FAILED:  'Payment failed',
  CANCELLED:       'Cancelled',
};
```

`Record<BookingStatus, string>` makes the map exhaustive — adding a status without a label fails
`typecheck`. Components switch on the code and display the label; they never `toLowerCase()`,
`replace('_', ' ')` or otherwise derive prose from a code, because that silently invents copy for
codes nobody has written wording for yet.

One deliberate exception: the small monospace code line on the result card (`CONFIRMED · ON ROSTER`)
shows the literal code *as* technical detail, next to the human label — never instead of it.

**R7.9 — `ResultCard` and the admin status badge key off the code, not the label.** Sorting,
filtering and test selectors also use codes, so reworded copy can never break behaviour or a test.

---

## 8. Code quality gates

**R8.1** `npm run verify` = `typecheck` + `lint` + `test` + `test:int`. Green before every commit.

**R8.2** ESLint runs with `--max-warnings 0`. Prettier + `.editorconfig` are committed; formatting is
never a review topic.

**R8.3** TypeScript `strict: true`. No `any`, no non-null `!` on database results, no `@ts-ignore`.
A suppression requires a comment naming why.

**R8.4** Conventional commits, imperative mood, lowercase, no trailing period. Commits are small and
each leaves `verify` green, so the history reads as the build order.

**R8.5 — Never weaken a gate to reach green.** No new suppression, no `.skip`, no deleted assertion,
no relaxed constraint. If a gate is genuinely wrong, change it deliberately and say so in the commit
body.

---

## 9. Testing rules

**R9.1 — Two tiers, distinguished by filename**, adapted from JHipster's `*Test.java` (unit) vs
`*IT.java` (integration against a real database):

| Tier | Pattern | Database | Command |
|---|---|---|---|
| Unit | `*.test.ts` | none — pure functions | `npm test` |
| Integration | `*.int.test.ts` | real Postgres | `npm run test:int` |

**R9.2 — Invariant tests run against real Postgres, never a mock.** A mocked database cannot exhibit
write skew, so a mocked race test proves nothing. Each integration file creates its own schema from
`TEST_DATABASE_URL`, migrates it with the real migration files (R2.1b), and drops it after.

**R9.3 — The race test uses genuine parallelism**: N `Promise.all` confirms against real
connections, asserting `confirmedCount === capacity` exactly, losers `CANCELLED` with `SEAT_TAKEN`,
and **every loser's authorization voided and nothing captured.** Not a sequential simulation.

**R9.4 — Prove the lock earns its place.** One test runs the confirm path with `FOR UPDATE` disabled
and asserts overbooking *does* occur. It documents the failure mode, guards against a future
"simplification", and is the strongest thirty seconds of the video walkthrough.

**R9.5 — Every edge case in the brief has a named test**: available seats, exactly-3-confirmed,
duplicate attempt, payment failure, last-seat race. Test names read as behaviour, not method names.

**R9.6 — The coverage bar is not a percentage.** It is: *every invariant named in this file has a
test whose purpose is to violate it, and that test fails if the corresponding constraint or lock is
removed.* Verified by dropping each one locally and confirming the suite goes red. Recorded in the
README.

**R9.7 — The race test passes 20 consecutive runs before submission.** A race that passes once has
not been tested.

---

## 10. Tiers — what is in, what is cut

**Tier 1 — non-negotiable (directly graded).** Schema + partial unique index + derived capacity ·
transactional confirm with `FOR UPDATE` · the R3.2 re-read branch · result-code taxonomy ·
authorize-seat-capture ordering · seed shared by tests and reset · integration + race tests on real
Postgres · the lock-disabled proof test · README + AI_USAGE.

**Tier 2 — cheap, high signal.** Layer lint rule · problem+json errors · deny-all RLS ·
pooler-vs-direct split · audit columns · `/api/dev/reset` · four screens · the accessibility rules
in R7.5 · the label map in R7.8.

**Tier 3 — deliberately cut, named in the README.** Auth and roles (parent is a query param, admin
is unauthenticated) · real payment provider · webhooks and idempotency keys · email/notifications ·
regular enrollment · background workers and cron (hold expiry is lazy) · timezones beyond one fixed
locale · rate limiting · structured logging and tracing · CI pipeline · E2E browser tests ·
waitlists, refund policy, reschedule · pagination on the roster.

Each Tier 3 line gets one sentence in the README saying what it would take and when it would matter.
Naming a cut is scope control; leaving it unmentioned is an omission.

---

## 11. Conventions inherited from generator-jhipster

Adopted because they are cheap and they scale:

- **Trust order when docs disagree** (top of this file).
- **Layering with a one-way import rule** (§1), lint-enforced.
- **Immutable forward-only migrations** (R2.1) — Liquibase discipline, no Liquibase.
- **Audit columns on every table** (R2.4).
- **`UPPER_CASE` enum constants with display text outside the enum** (R2.6, R7.8).
- **Unit vs integration split by filename** (R9.1).
- **Tests required for every feature and every fix**, and never weaken the artifact that proves
  correctness (R8.5).
- **Commit style**: imperative, lowercase, no trailing dot (R8.4).

**Deliberately not adopted:** the generator lifecycle, blueprint system, snapshot testing, JDL, and
MapStruct codegen. They solve code-generation problems this repository does not have.
