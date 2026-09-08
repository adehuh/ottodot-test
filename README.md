# Ottodot Trial Booking

A trial-class booking system where the database is the only authority on whether a seat exists.
Four seats per class, enforced by a row lock and a partial unique index rather than by application
code — deleting every check in the React tree would degrade the experience and change nothing about
what the system permits.

## How to run

```bash
npm install
npx supabase start                          # local Postgres on :54322
cp .env.example .env.local
npm run db:reset                            # migrations + deterministic seed
npm run verify                              # typecheck + lint + 31 unit + 94 integration tests
```

Then `npm run dev` and open <http://localhost:3000/book>.

Requires Node 20.9+ (developed on 22.23) and Docker for the local Supabase stack. No cloud project
is needed — everything runs locally.

## The last-seat race

Two parents pay for the same last seat. One gets it, the other is not charged.

Confirmation happens in exactly one transaction, and it takes a lock on the *class* row before it
touches any booking:

```sql
BEGIN;
  SELECT id, capacity FROM trial_classes WHERE id = $1 FOR UPDATE;   -- serialises this class

  UPDATE bookings b
     SET status = 'CONFIRMED', confirmed_at = now(), updated_at = now()
   WHERE b.id = $2
     AND b.status = 'PENDING_PAYMENT'
     AND (SELECT count(*) FROM bookings c
           WHERE c.trial_class_id = b.trial_class_id
             AND c.status = 'CONFIRMED') < $3
  RETURNING b.*;
COMMIT;
```

The `FOR UPDATE` is load-bearing. Without it, under PostgreSQL's default `READ COMMITTED`, two
concurrent confirms touch *different* booking rows, so they never block each other. Each evaluates
the count subquery against its own snapshot, each sees 3, and both commit — five students in a
four-seat class. Locking the parent `trial_classes` row makes confirms for one class strictly
serial, so the count is accurate at the moment it is read. The lock scope is a single four-seat
class; contention at that size is irrelevant.

The seat count lives *inside* the `UPDATE`'s `WHERE` clause. A separate `SELECT count(...)` followed
by a conditional write leaves a window between deciding and writing. Here the decision and the write
are one statement.

**Zero rows updated is not automatically "seat taken."** The booking is re-read inside the same
transaction and the outcome branches three ways:

| Re-read shows | Result code | What happens to the money |
|---|---|---|
| `CONFIRMED` | `ALREADY_CONFIRMED` | nothing — the parent already paid |
| `PENDING_PAYMENT`, count ≥ capacity | `SEAT_TAKEN` | the authorisation is voided |
| `CANCELLED` / `PAYMENT_FAILED` | `BOOKING_NOT_ACTIVE` | nothing — stale client |

The three *result codes* stay distinct — a parent who is already confirmed must not be told they
lost the seat. The *release* is uniform: after a successful authorisation, every exit path either
captures or voids, written once rather than once per branch, so a branch added later cannot leak a
hold. Each branch has its own test.

### Considered and rejected

| Approach | Why not |
|---|---|
| `SERIALIZABLE` isolation + retry on `40001` | Correct, but every caller needs a retry loop for one hot row. |
| Denormalised `seats_taken` counter + `CHECK (seats_taken <= capacity)` | Genuinely attractive — it puts the invariant in the schema where a reviewer sees it without reading TypeScript. Rejected because the counter is a second source of truth that can drift from the bookings table and needs a reconciliation story. A derived count has nothing to reconcile. |
| `unique(class_id, seat_index)` seat table | Lock-free, and the invariant is visible in the schema. Rejected because it adds seat-allocation logic and a retry loop on `23505` — more machinery than a four-seat class earns. |
| Optimistic locking on a version column | Wrong tool: the contended resource is an aggregate count across sibling rows, not one row's version. |
| Advisory locks | Same serialisation as `FOR UPDATE`, with no schema meaning and no foreign-key safety. |
| Application mutex, `Map`, or Redis | Wrong on Vercel: N isolates, N mutexes. A new dependency and a new failure mode for a problem Postgres already solves. |

### The tradeoff I accepted

A `PENDING_PAYMENT` booking holds no seat. Only `CONFIRMED` consumes capacity.

The cost is real: a parent can authorise payment and still lose the seat to someone who confirms
first. I accepted that because holding seats requires a TTL and a sweeper job, and at four seats per
class the starvation from abandoned checkouts is the worse failure. It also means no background job
is required for correctness — there is nothing to expire and no seat to reclaim.

What it buys in exchange: capacity is derivable from one query at any instant, and no abandoned
checkout can strand a seat.

## What I built

- Parent picks a child and a trial class, sees live seat counts.
- Mock payment with a forced-decline button, so the failure path is demonstrable on purpose.
- Booking status screen driven by result codes, not by prose.
- Teacher roster: an admin index of every class with expandable rows showing the full booking
  history, plus a per-class page. The count is confirmed bookings only; pending and failed rows sit
  below the line where you can see them not being counted.
- `POST /api/dev/reset`, which reseeds through the same `seed()` the tests use and 404s in production.
- A race test with genuine parallelism, and a test that removes the lock and proves overbooking happens.

## Backend and design

### Data model

```
parents(id, name, email unique, …)
students(id, parent_id → parents, name, grade_level, …)
trial_classes(id, subject, title, teacher_name, starts_at, capacity default 4, …)
bookings(id, student_id → students, trial_class_id → trial_classes,
         status, cancellation_reason, hold_expires_at, confirmed_at, …)
payment_attempts(id, booking_id → bookings, amount_cents, currency, status, provider_ref, …)
```

Three invariants, each carried by a database object rather than by code:

| Invariant | Enforced by |
|---|---|
| One live booking per child per class | `bookings_one_live_per_student_class` — partial unique index `WHERE status IN ('PENDING_PAYMENT','CONFIRMED')` |
| No fifth confirmed booking in a four-seat class | the guarded `UPDATE` above, under `SELECT … FOR UPDATE` |
| The roster cannot leak through PostgREST | RLS enabled with no policies on all five tables |

Capacity is derived, never stored. `count(*) WHERE status = 'CONFIRMED'` is the only definition,
supported by `bookings_confirmed_by_class`. Money is integer cents plus a currency column.

`hold_expires_at` exists for display only. Nothing depends on it expiring.

### Endpoints and actions

| Operation | Kind | Signature |
|---|---|---|
| List classes with derived seat counts | Server Action | `listTrialClassesAction(): TrialClassView[]` |
| List a parent's children | Server Action | `listChildrenAction(parentId): StudentView[]` |
| Create a booking | Server Action | `createBookingAction({studentId, trialClassId}): Result<BookingView>` |
| Authorise + confirm (**the core**) | Server Action | `confirmBookingAction({bookingId, simulate}): Result<BookingView>` |
| Booking status | Server Action | `getBookingAction(bookingId): Result<BookingView>` |
| Roster (per class) | Route handler | `GET /api/roster/[classId]` |
| Dev reset | Route handler | `POST /api/dev/reset` — 404 in production |

Services return discriminated unions and never throw for an expected outcome; a `throw` means a
fault. Over HTTP, errors are `application/problem+json` with a stable `code`, and the UI switches on
the code rather than the prose.

### Booking statuses

Four stored statuses, closed: `PENDING_PAYMENT`, `CONFIRMED`, `PAYMENT_FAILED`, `CANCELLED`.

`SEAT_TAKEN` and `DUPLICATE` are **result codes, never stored statuses.** A booking that loses the
race is stored as `CANCELLED` with `cancellation_reason = 'SEAT_TAKEN'`.

That distinction is deliberate and worth stating: the result screen keys off the result code, the
roster keys off the stored status. Keeping them separate is what stops the UI inventing state the
database does not have. It is also why `PAYMENT_FAILED` and `SEAT_TAKEN` stay distinguishable — one
means the card was refused, the other means the card was fine and someone else was faster, and a
parent needs to be told which.

### Preventing duplicate bookings

A partial unique index on `(student_id, trial_class_id)` restricted to the two live statuses. There
is no read-then-write check anywhere, because a read-then-write check has a window and an index does
not. The `23505` is caught in exactly one file, `src/db/errors.ts`, and mapped to `DUPLICATE`; no
layer above knows what `23505` means.

`PAYMENT_FAILED` and `CANCELLED` rows fall outside the index, so a parent can rebook after a decline
while the failed row survives as an audit trail.

### Handling payment failure

```
authorize(amount)            network call, before the transaction, no lock held
  ├─ declined ──────────────▶ PAYMENT_FAILED, no seat touched, nothing to reverse
  └─ AUTHORIZED
       ▼
  confirm transaction         the only critical section
       ├─ seat won  ────────▶ capture(authId)  → CONFIRMED
       └─ SEAT_TAKEN ───────▶ void(authId)     → CANCELLED, reason SEAT_TAKEN
```

Money is never captured for a seat the child did not get. That ordering is what removes the refund
path from this codebase entirely — a void on an uncaptured authorisation is not a refund, and the
mock gateway throws if you try to void a captured authorisation, so the refund path cannot be added
by accident.

Capture-then-void was rejected: capturing before the seat is secured means the loser of the race has
genuinely been charged and is owed money back, which introduces a refund state, a reconciliation
concern and a support burden. Confirm-then-capture was rejected too: it leaves a confirmed booking
with no money behind it.

**A gap I did not close.** Capture happens after `COMMIT`, because a transaction is never held open
across a network call. If the capture fails after the commit, the child has a confirmed seat and an
uncaptured authorisation. With a real gateway this needs a reconciliation job against the provider —
named below, not built. The failure is in the safe direction: a child in a seat that was not paid
for, rather than money taken for a seat that was not given.

### Where each check lives

| Layer | What it does | What happens if you delete it |
|---|---|---|
| UI | Greys out full classes, disables already-booked rows, disables both payment buttons on submit | The experience degrades. Nothing the system permits changes. |
| Backend | Validates UUIDs with Zod, owns the transaction, orders the payment calls, maps result codes | Requests reach SQL unvalidated; the ordering guarantee is lost |
| Database | Partial unique index, the guarded `UPDATE` under `FOR UPDATE`, RLS | Duplicates and overbooking become possible — proven by removing them |
| Background job | **Nothing, deliberately** | Nothing. There is no job. |

The UI prevents mistakes, the server prevents abuse, the database prevents corruption.

The background job row is the interesting one. Because a pending booking holds no seat, there is
nothing to expire and no seat to reclaim. A lazy sweep marking stale holds `CANCELLED` would be
cosmetic; if it never ran, no invariant would break. Any job added later must be able to be down
indefinitely without breaking an invariant — it reclaims and reports, it never guards.

## Verification

```bash
npm test          # 31 unit tests, no database
npm run test:int  # 94 integration tests against real Postgres
npm run test:race # the race test and the lock-disabled proof, no file parallelism
```

Integration tests never mock the database. A mock cannot exhibit write skew, so a mocked race test
proves nothing. Each integration file creates its own schema from `TEST_DATABASE_URL`, replays the
real migration files into it, and drops it afterwards — not a hand-maintained copy of the DDL, which
would drift.

What the important tests prove:

- **`schema.int.test.ts`** — the duplicate invariant in raw SQL with the application removed. If it
  passes, the invariant also holds for someone connected with `psql`.
- **`confirm-booking.int.test.ts`** — the fifth booking is refused even when the advisory
  `CLASS_FULL` check is bypassed by inserting through the repository; a decline rosters nobody and
  leaves the roster list byte-for-byte unchanged; an already-confirmed retry returns
  `ALREADY_CONFIRMED` and voids nothing.
- **`race.int.test.ts`** — eight parents, one empty four-seat class, `Promise.all` over independent
  connections. Exactly four confirmed, four cancelled with reason `SEAT_TAKEN`, four authorisations
  voided, zero losers captured. Also runs at capacity 2, so nothing is hardcoded to four.
- **`lock-proof.int.test.ts`** — the same eight contenders with `FOR UPDATE` stripped from the
  statement, asserting overbooking *does* happen.

The lock-free statement is derived from the exported production constant by removing `FOR UPDATE`,
never hand-copied, and the test asserts the removal actually changed the string. A hand-copy drifts
the moment the real statement changes, and a drifted proof still passes while proving nothing.

**The race test passed 20 consecutive runs.** A race that passes once has not been tested.

**Every invariant has a test whose purpose is to violate it.** I verified this by removing each
object and watching the suite go red:

| Removed | Result |
|---|---|
| `FOR UPDATE` from the class lock | 9 integration + 8 race tests fail |
| `bookings_one_live_per_student_class` | 7 integration tests fail |
| `bookings_confirmed_by_class` | 1 integration test fails |

The last one deserves a note. That index is a performance object — no behavioural test would notice
it missing. So the schema test asserts both indexes exist by name via `pg_indexes`. Without that
assertion, the claim "removing either index turns the suite red" would have been false, and I would
rather add the assertion than make the claim.

## Time spent

47 minutes of wall-clock for the code, plus this document. Roughly:

| Phase | Time |
|---|---|
| Scaffold, strict TypeScript, the layer lint rule | 6m |
| Schema, migration, seed, repositories | 11m |
| Payment mock and the booking service | 7m |
| Race test, lock-disabled proof, 20 consecutive runs | 5m |
| Server actions, roster route, dev reset | 3m |
| Four screens, then the design system pass | 15m |

That is not a human figure and I am not going to present it as one. This was built in a single
Claude Code session; `AI_USAGE.md` covers what that involved, including where I rejected the model's
output. The brief's 3–4 hour budget shaped the scope decisions regardless — the cut list below is
real, and deploy was cut to protect the verification work.

## Assumptions

- "Child" in the brief and a `students` row are the same entity.
- Payment is mocked, not integrated. The gateway is deterministic: a decline is an explicit input,
  never random, because a flaky test guarding a money invariant is worse than no test.
- No authentication. The parent is a query param defaulting to a seeded parent; the roster is
  unauthenticated.
- Capacity is per-class data with a default of 4, not a constant, so the invariant is testable at
  other values. The race test exercises capacity 2 for exactly this reason.
- One Postgres primary. The design relies on row locks being meaningful, which they are on a single
  primary and would not be across a multi-writer topology.
- Timestamps are rendered in one fixed locale (Asia/Singapore).
- **A rule I wrote was wrong, and the code that followed it leaked money.** My own
  `.claude/RULES.md` R2 said that on `ALREADY_CONFIRMED` and `BOOKING_NOT_ACTIVE` the confirm path
  should "do nothing", reasoning that the capture had already happened. It had not. `capture()` runs
  only in the won-seat arm of the *same* invocation, so the authorization in hand on those branches
  is the one that call created moments earlier — the confirmed parent's captured payment belongs to
  a different concurrent call and is never in scope. Following the rule left a live hold on a card
  that nothing would release. The rule is corrected in place with a dated note, and the release now
  happens once for any outcome that is not a won seat, so a branch added later cannot leak.

## What I deliberately cut

- **Deploy to Vercel.** Cut to protect the verification work, which is what the brief actually
  grades. Everything runs locally in five commands. The direct-vs-pooler connection split is still
  documented in `.env.example` — the decision stands even though it is not exercised.
- **Authentication and roles.** The brief never asks for it. It would be a session table and
  middleware, and it would matter the moment a second family can see another family's children.
- **A real payment provider.** Would need webhooks, idempotency keys and a reconciliation job. The
  authorize/capture/void shape is already correct, so swapping the mock is a contained change.
- **Reservation holds with a TTL.** Deliberate, and the central tradeoff above explains it.
- **A refund path.** Not an omission — an explicit design goal. Nothing is captured for a seat that
  was not given, so nothing needs refunding.
- **Background workers and cron.** Nothing needs one. Saying so confidently seemed better than
  inventing one.
- **Regular enrollment, waitlists, reschedule, notifications.** Out of scope in the brief.
- **Pagination on the roster.** Four rows.
- **Rate limiting, structured logging, tracing, a CI pipeline, E2E browser tests.** All cheap to add
  later and none of them move the correctness argument. I walked the four screens in a browser by
  hand instead.

## What I would monitor after release

The one that pages someone at 3am:

```sql
-- Must always be zero. This is the invariant the whole design exists to protect,
-- so it is also the alarm that says the design failed.
SELECT c.id, count(b.*) AS confirmed, c.capacity
  FROM trial_classes c
  JOIN bookings b ON b.trial_class_id = c.id AND b.status = 'CONFIRMED'
 GROUP BY c.id, c.capacity
HAVING count(b.*) > c.capacity;
```

Then, in order of how much they would worry me:

```sql
-- Money taken for a seat nobody got. Must be zero.
SELECT p.id FROM payment_attempts p
  JOIN bookings b ON b.id = p.booking_id
 WHERE p.status = 'CAPTURED' AND b.status <> 'CONFIRMED';

-- The mirror: a confirmed seat with no captured payment behind it. This is the
-- capture-after-commit gap above; a non-zero count is the reconciliation backlog.
SELECT b.id FROM bookings b
  LEFT JOIN payment_attempts p ON p.booking_id = b.id AND p.status = 'CAPTURED'
 WHERE b.status = 'CONFIRMED' AND p.id IS NULL;

-- Race pressure. A rising rate means seats are contended enough that holds might
-- start to be worth their cost.
SELECT count(*) FROM bookings
 WHERE status = 'CANCELLED' AND cancellation_reason = 'SEAT_TAKEN'
   AND updated_at > now() - interval '1 hour';
```

Plus the two operational numbers that would break this specific design: `pg_stat_activity` count
against the Supabase connection limit, since every Vercel isolate holds its own pool; and lock wait
time on `trial_classes`, which is the one place this design serialises and therefore the first place
it would show strain.

## What I would do next

1. **Reconciliation against the payment provider.** The capture-after-commit gap is the only place
   where the system can end up inconsistent with the money, and it is the first thing that becomes
   real with a live gateway.
2. **Idempotency keys on confirm.** The advisory pre-check makes a stale retry cheap, but two
   genuinely concurrent confirms of the same booking each take an authorisation and only one is
   captured. Today the redundant one is left to expire; an idempotency key makes the second request
   return the first one's outcome.
3. **Authentication**, at which point the parent query param becomes a session and the roster gets a
   role check.
4. **Timed holds**, but only if the monitoring above shows real contention. It is a genuine
   improvement for popular classes and pure cost for empty ones, so I would want the number first.
