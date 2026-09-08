# TODO — Ottodot Trial Booking

Full reasoning, dependency graph, risks and time budget: [`tasks/plan.md`](./plan.md).

**Standing bar on every task:** `npm run verify` green. Never weaken a test, type, lint rule,
database constraint, or the `FOR UPDATE` lock to reach it (RULES R8.5).

---

## Phase 0 — Scaffold

- [x] **T1 · Repo scaffold and quality gates** — M · deps: none
  - Next.js App Router + TS `strict` + Tailwind; ESLint flat config with `import/no-restricted-paths`
    (`app → services → db → domain`); Prettier + `.editorconfig`; vitest unit/int/race projects;
    SPEC §7 npm scripts; `.env.example`; `supabase init`; `git init` + first commit.
  - AC: `typecheck`, `lint --max-warnings 0`, `build` all green · `supabase start` yields a direct
    connection string · a deliberate `domain → db` import **fails** lint · `.env.example` documents
    direct `:5432` vs pooler `:6543` (R5.1).
  - Verify: run all three gates; add the scratch import, watch lint fail, remove it.

## Phase 1 — Foundation

- [x] **T2 · `src/domain` — pure types, result codes, DTOs** — S · deps: T1
  - Status/payment/subject unions verbatim from the enum labels; 7 result codes; `Result<T>`;
    `CAPACITY = 4`; hand-written row types (R2.2); `toDto()`.
  - AC: zero internal imports · every label the same `UPPER_SNAKE_CASE` string at every layer ·
    `toDto()` unit-tested, no `Date` or raw column name leaks into a DTO.
  - Verify: `npm test`

- [x] **T3 · Initial migration + raw-SQL duplicate proof (B1)** — M · deps: T1, T2
  - 3 enums, 5 tables + audit columns, partial unique index, partial confirmed index, RLS enabled
    no-policies on every table, no schema qualifiers (R2.1b). Plus the per-file throwaway-schema
    harness.
  - AC: `supabase db reset` clean **twice** · duplicate live booking → `23505` **in raw SQL, app
    removed** · a `PAYMENT_FAILED` row does not block a fresh `PENDING_PAYMENT` · **both indexes
    asserted by name via `pg_indexes`** · RLS confirmed on all 5 tables.
  - Verify: `supabase db reset && npm run test:int`

- [x] **T4 · `db/seed.ts` — every case the brief names** — S · deps: T3
  - One `seed()` shared by tests and `/api/dev/reset`. Fixed UUIDs, idempotent, deterministic.
  - AC: Volcanoes 1/4 · Fractions **3/4** · Circuits 4/4 · Geometry 2 confirmed + 1 `PAYMENT_FAILED` ·
    a `CONFIRMED` booking for one child in Volcanoes · seeding twice gives identical counts **and ids**.
  - Verify: `npm run test:int`

- [x] **T5 · `src/db` infrastructure — pool, errors, transaction helper** — M · deps: T2, T3
  - `pg.Pool` singleton on `globalThis`, small `max`, never `name:` (R5.2/R5.3). `errors.ts` is the
    only file that knows `23505` (R4.6). `withTransaction` = one checked-out client, released in
    `finally` (R5.4).
  - AC: `23505` on `bookings_one_live_per_student_class` → `DUPLICATE` · rollback on throw, client
    always released · no `pool.query` reachable inside a transaction body.
  - Verify: `npm test && npm run test:int`

- [x] **T6 · Repositories — all SQL, typed and parameterized** — M · deps: T4, T5
  - Classes with **derived** seat counts (R2.8, no counter column), students by parent, bookings
    (insert · get · guarded confirm · cancel with reason), payment attempts. Confirm SQL is an
    **exported constant** with `FOR UPDATE` hardcoded — T11 reads it.
  - AC: every query parameterized and typed, no `any`, no `!` on a database result · grep: no SQL
    outside `src/db/`, no `BEGIN`/`COMMIT` anywhere yet · grep: no counter column, no separate
    read-then-write capacity check · each query integration-tested.
  - Verify: `npm run test:int` + both greps

### ══ Checkpoint A ══
- [x] `supabase db reset && npm run verify` green from clean
- [x] B1 proven at the database level with zero application code involved
- [x] Layer lint rule green; SQL/`BEGIN` placement greps clean

---

## Phase 2 — The graded core

- [x] **T7 · `src/payments` — deterministic mock gateway** — S · deps: T2
  - `authorize` / `capture` / `void`; `simulate: 'SUCCESS' | 'DECLINE' | 'SLOW'` (SLOW widens the
    race window). The gateway records nothing; the service writes `payment_attempts`.
  - AC: decline is an explicit input, never random · `capture` on a voided auth **throws** (a fault,
    not a result code) · all three outcomes unit-tested, no database.
  - Verify: `npm test`

- [x] **T8 · `createBooking(studentId, classId)`** — M · deps: T6, T7
  - Insert `PENDING_PAYMENT`; `23505` → `DUPLICATE` via `errors.ts`; `CLASS_FULL` **advisory only**;
    `NOT_FOUND` for a missing student or class.
  - AC (A1, A2, B1): duplicate live booking → `DUPLICATE`, never a 500 · retry after decline creates
    a **fresh** row while the `PAYMENT_FAILED` row survives as audit · `PENDING_PAYMENT` consumes no
    capacity, asserted by a seat count before and after.
  - Verify: `npm run test:int`

- [x] **T9 · `confirmBooking(bookingId, simulate)` — THE GRADED CORE** — M–L · deps: T8
  - `authorize` (no lock held) → DECLINE writes `payment_attempts FAILED` + booking `PAYMENT_FAILED`
    and returns `PAYMENT_FAILED`; AUTHORIZED enters `withTransaction { SELECT … FOR UPDATE; guarded
    UPDATE }`. Zero rows → **re-read inside the same transaction, branch three ways** (R3.2).
    Capture/void happen **after COMMIT** — R1 forbids holding a transaction across a payment call.
  - AC (B2, B3, B6): a 5th confirm on a 4-seat class is impossible · a declined authorization never
    confirms and **rosters nobody**, roster asserted *unchanged* · an already-confirmed retry returns
    `ALREADY_CONFIRMED` and **voids nothing** · stale row → `BOOKING_NOT_ACTIVE` · **each of the
    three re-read branches has its own test** · grep: no capture before the seat is secured, no
    refund path, no lock across a payment call.
  - Verify: `npm run test:int` + the greps

- [x] **T10 · The race test (B4, B5)** — M · deps: T9
  - Genuine parallelism: `Promise.all` over independent connections, never a sequential loop. Two
    scenarios — last seat (Fractions 3/4) and an empty 4-seat class with N=8.
  - AC: exactly one winner on the last seat · `count(CONFIRMED) === capacity` exactly · every loser
    `CANCELLED` with `cancellation_reason = 'SEAT_TAKEN'` · **every loser's auth VOIDED and zero
    losers CAPTURED** · passes **20 consecutive runs** (R9.7), recorded in the README.
  - Verify: `npm run test:race` (`--no-file-parallelism`), then a 20× loop

- [x] **T11 · The lock-disabled proof (B7)** — S · deps: T10
  - Derive the lock-free statement from the exported production SQL constant by stripping
    `FOR UPDATE`; assert the strip changed the string; run the same concurrency.
  - AC: overbooking **does** occur without the lock · the test fails loudly if `FOR UPDATE` is ever
    removed from production · `src/db/` contains no lock-disabling branch or runtime toggle.
  - Verify: `npm run test:int`

### ══ Checkpoint B ══ — human review, before any HTTP exists
This is the gate the submission is graded on.
- [x] B2–B7 all green; every brief edge case has a named test
- [x] Race test passed **20/20** consecutive runs
- [x] **Invariant-removal sweep (R9.6)** — each verified by actually removing the object:
  - [x] remove `FOR UPDATE` → **9 integration + 8 race tests fail**
  - [x] drop `bookings_one_live_per_student_class` → **7 integration tests fail**
  - [x] drop `bookings_confirmed_by_class` → **1 integration test fails** (the `pg_indexes` assertion)
  - [x] all three restored, suite back to 31 unit + 83 integration + 9 race, green
- [x] `npm run verify` green
- [x] Results surfaced to the user. This was a human gate in the original plan; `/build auto`
      collapses it into the single up-front approval, so the build continued after reporting.

---

## Phase 3 — API surface

- [ ] **T12 · Server actions + roster route handler** — M · deps: T9
  - `app/actions.ts`: `listTrialClasses` · `createBooking` · `confirmBooking` · `getBooking`, Zod at
    the boundary, UUIDs validated before touching SQL. `GET /api/roster/[classId]` read-only.
  - AC (A4, A5): handlers hold no business logic, route handler under ~30 lines (R1.3) · errors are
    `application/problem+json` with a stable `code` · roster counts `CONFIRMED` only · Node runtime
    forced (`pg` cannot run on edge).
  - Verify: `npm run test:int` route test

- [ ] **T13 · `POST /api/dev/reset`** — S · deps: T4, T12
  - Calls the **same** `seed()` as the tests (R2.3).
  - AC: 404 when `NODE_ENV === 'production'`, asserted by test (R4.5) · reset restores the exact seed
    state including ids.
  - Verify: `npm run test:int`

### ══ Checkpoint C ══
- [ ] `npm run verify` green · A1–A5 all satisfied · handlers thin, layer lint rule green

---

## Phase 4 — UI · hard 45-minute cap (R10)

If this phase exceeds 45 minutes total, **stop and report**. Ship unstyled.

- [ ] **T14 · `/book` — pick child and class** — S · deps: T12
  - `StepHeader`, `ChildPicker`, `ClassList`/`ClassRow`, `BookingSummary`. Real `<fieldset>` +
    `<input type="radio">`, not clickable divs. Disabled rows carry the reason in the label text;
    "1 seat left" / "FULL" carry meaning in words, never colour alone.

- [ ] **T15 · `/pay/[bookingId]` and `/status/[bookingId]`** — S · deps: T12
  - `PaymentPanel` (Pay + Simulate decline, both disable on submit). `ResultCard` is **one**
    component driven by a `code → {icon, tone, title, body, actions}` map. `src/ui/labels.ts` holds
    an exhaustive `Record<BookingStatus, string>`. A network or 5xx failure renders "we're still
    confirming — do not pay again" and polls; it **never** renders the declined card (R4.3).

- [ ] **T16 · `/roster/[classId]` — admin roster** — S · deps: T12
  - `RosterTable`/`RosterRow`. Count reflects `CONFIRMED` only.

**AC, all three**
- [ ] No invariant lives in React state — deleting every frontend check changes nothing the system permits
- [ ] Loading, empty and error states on every list
- [ ] Result region `role="status" aria-live="polite"`; focus rings visible
- [ ] No raw enum code rendered as copy; no `toLowerCase()` / `replace('_',' ')` to derive prose
- [ ] Stock Tailwind only — no config extension, no plugins, no icon packages

### ══ Checkpoint D ══
- [ ] Manual walkthrough: happy path → forced decline with roster unchanged → full class rejected →
      duplicate rejected
- [ ] `npm run verify` green

---

## Phase 5 — Documentation

- [ ] **T17 · `README.md`** — written against `.claude/README_STYLE.md`
  - [ ] How to run, ≤5 commands, first section
  - [ ] **The last-seat race second**, not buried — mechanism, the two SQL fragments, the R3.5
        alternatives table, and the accepted tradeoff stated plainly
  - [ ] Schema · endpoints · statuses · duplicate prevention · payment failure · where each check
        lives (UI / backend / database / **background job: deliberately none**, with the reason)
  - [ ] Concrete monitoring: `count(bookings WHERE status='CONFIRMED') > capacity` for any class —
        must be zero, page immediately
  - [ ] Every Tier 3 cut, one sentence each — **including deploy**, cut to protect the graded core
  - [ ] The three deviations recorded: `failPayment` folded into `confirmBooking`; deploy cut;
        capture occurs after `COMMIT`, leaving a confirmed-but-uncaptured gap a reconciliation job
        would close
  - [ ] The Checkpoint B invariant-removal results and the 20-run race result

- [ ] **T18 · `AI_USAGE.md`** — all required points, including one specific **diff-level** instance
      where AI output was rejected

### ══ Checkpoint E — Definition of Done ══
- [ ] Run the full `.claude/RULES.md` Definition of Done checklist. Every unchecked box is a defect.
