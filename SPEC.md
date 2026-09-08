# SPEC — Ottodot Trial Booking

Companion to [ARCHITECTURE.md](./ARCHITECTURE.md), which holds the binding rules (`R*` references
below point into it). This file holds *what we are building and how we know it works*.

**Source brief:** Ottodot Full-Stack Take-Home — "Trial Booking Reliability", timeboxed 3–4 hours.
**Stack:** Next.js (App Router) · React · TypeScript · Tailwind · Supabase Postgres · `pg` with raw
parameterized SQL · deployed to Vercel.

---

## 1. Objective

Build the smallest working slice of a trial-class booking system that stays correct under
concurrency and payment failure.

**Users.** A *parent* books one trial for one child. An *admin/teacher* reads a roster before class.
No authentication — the parent is a query param, the admin page is unauthenticated (Tier 3).

**In scope.** Trial booking only: choose child → choose class → mock payment → booking status →
roster. **Out of scope:** regular enrollment, auth, real payments, notifications.

**Success is not "it works."** Success is that the four required failure modes are provably handled:
duplicate confirmed bookings, overbooking past 4, payment failure that must not roster a child, and
the last-seat race between two parents.

**The differentiator.** The brief grades *judgment and verification over feature breadth*. So the
deliverable is weighted: a correct transactional core, a race test with genuine parallelism, and a
README that explains the tradeoff — not four polished screens.

---

## 2. Assumptions

State these now so they can be corrected before code exists.

1. **"Child" in the brief == `students` row.** The suggested model names both; they are one entity.
2. **Payment is mocked, not integrated.** A deterministic in-process provider exposing `authorize`,
   `capture`, `void`, forceable to succeed, decline, or succeed-slowly (needed to widen the race
   window on demand).
3. **No auth.** The brief never asks for it. Named in the README as a deliberate cut.
4. **Capacity is per-class data, not a constant.** `trial_classes.capacity` defaults to 4 so the
   invariant is testable at other values.
5. **Reviewers get a live URL** if the budget allows; otherwise a local run with two commands.
6. **One capability, not a capability map.** Booking, payment and roster cannot ship or be cut
   independently — a change to booking rewrites both.

→ Correct any of these now.

---

## 3. Capability map

Build order is top to bottom. **M9 deliberately precedes M5:** the race is proven against the
service before any HTTP exists.

| ID | Module | Depends on | Done when |
|----|--------|-----------|-----------|
| M0 | `db-schema` — Supabase CLI migrations, enums, partial unique index, RLS, `seed()` | — | `supabase db reset` runs clean twice in a row |
| M1 | `domain` — statuses, result codes, `CAPACITY = 4`, DTO mappers | — | pure, zero imports from below (R1.1) |
| M2 | `repository` — parameterized SQL, transaction helper | M0, M1 | every query typed, none outside `src/db/` (R1.2) |
| M4 | `payment-mock` — authorize / capture / void, forced decline | M1 | deterministic; decline is an explicit input, never random |
| M3 | `booking-service` — `createBooking` · `confirmBooking` · `failPayment` | M2, M4 | **the graded core**; owns all transactions |
| M9 | `verification` — unit + integration + parallel race + lock-disabled proof | M3 | all five brief edge cases named and green |
| M5 | `api` — route handlers, Zod, problem+json | M3 | handlers hold no business logic (R1.3) |
| M8 | `dev-reset` — `POST /api/dev/reset` via the same `seed()` as tests | M0 | 404s in production (R4.5) |
| M6 | `ui-parent` — screens 1–3 | M5 | renders server result codes only (R7.1) |
| M7 | `ui-admin` — screen 4 roster | M5 | count reflects `CONFIRMED` only |
| M10 | `docs` — README, AI_USAGE | all | every Tier 3 cut named with one sentence |

---

## 4. Acceptance criteria

| # | Criterion | Verified by |
|---|---|---|
| A1 | Parent selects a child and an available trial class | integration |
| A2 | Parent submits a booking; a `PENDING_PAYMENT` row is created | integration |
| A3 | Payment outcome recorded in `payment_attempts` regardless of result | integration |
| A4 | Booking status visible after submission | integration + manual |
| A5 | Roster readable at `/roster/[classId]` and `GET /api/roster/[classId]` | route test |
| B1 | Duplicate live booking for same child+class is impossible | raw-SQL constraint test, app removed |
| B2 | A 5th confirmed booking on a 4-seat class is impossible | integration |
| B3 | Declined authorization never produces a confirmed booking, and rosters nobody | integration |
| B4 | Last-seat race: N concurrent confirms → exactly 1 winner, `count(CONFIRMED) === capacity` | parallel race test |
| B5 | Every loser's authorization is voided and **nothing is captured** | race test assertion |
| B6 | An already-confirmed retry returns `ALREADY_CONFIRMED` and does **not** void anything | integration (the R3.2 branch) |
| B7 | Removing `FOR UPDATE` makes overbooking occur | lock-disabled proof test (R9.4) |
| C1 | README covers approach, why, tradeoffs, cuts, monitoring, next steps | manual |
| C2 | AI_USAGE.md covers all required points, incl. one real rejection | manual |

---

## 5. Data model

Four required entities plus `payment_attempts`. Full DDL rules in R2.

```
parents(id, name, email unique, created_at, updated_at)
students(id, parent_id -> parents, name, grade_level, created_at, updated_at)
trial_classes(id, subject class_subject, title, teacher_name, starts_at timestamptz,
              capacity int not null default 4, created_at, updated_at)
bookings(id, student_id -> students, trial_class_id -> trial_classes,
         status booking_status not null, cancellation_reason text,
         hold_expires_at timestamptz, confirmed_at timestamptz, created_at, updated_at)
payment_attempts(id, booking_id -> bookings, amount_cents int not null, currency text not null,
                 status payment_status not null, provider_ref text, created_at, updated_at)
```

**Enums (R2.6), `UPPER_SNAKE_CASE`, used verbatim at every layer:**

```
booking_status : PENDING_PAYMENT | CONFIRMED | PAYMENT_FAILED | CANCELLED
payment_status : AUTHORIZED | CAPTURED | VOIDED | FAILED
class_subject  : SCIENCE | MATH
```

**Invariants and the objects that carry them:**

```sql
-- one live booking per child per class; failed/cancelled rows fall out so retry works
create unique index bookings_one_live_per_student_class
  on bookings (student_id, trial_class_id)
  where status in ('PENDING_PAYMENT', 'CONFIRMED');

-- supports the derived capacity count; there is no counter column (R2.8)
create index bookings_confirmed_by_class
  on bookings (trial_class_id) where status = 'CONFIRMED';

-- deny-all RLS on every table (R2.10)
alter table bookings enable row level security;
```

**Retry after decline.** Reuses a fresh booking row rather than resurrecting the failed one; the
`PAYMENT_FAILED` row survives as an audit trail and is outside the partial unique index, so it does
not block.

---

## 6. Backend surface

Server Actions for the write path; one read-only route handler because the brief asks for "a simple
roster API/output".

| Operation | Kind | Signature |
|---|---|---|
| List classes with derived seat counts | Server Action | `listTrialClasses(parentId): ClassView[]` |
| Create a booking | Server Action | `createBooking(studentId, classId): Result<Booking>` |
| Authorize + confirm (**the core**) | Server Action | `confirmBooking(bookingId, simulate): Result<Booking>` |
| Record a decline | Server Action | `failPayment(bookingId): Result<Booking>` |
| Booking status | Server Action | `getBooking(bookingId): BookingView` |
| Roster | Route handler | `GET /api/roster/[classId]` |
| Dev reset | Route handler | `POST /api/dev/reset` — 404 in production |

Result codes: `DUPLICATE` · `SEAT_TAKEN` · `CLASS_FULL` · `PAYMENT_FAILED` · `ALREADY_CONFIRMED` ·
`BOOKING_NOT_ACTIVE` · `NOT_FOUND`.

---

## 7. Commands

```bash
# database
supabase start              # local Dockerized Postgres
supabase db reset           # rebuild from migrations + run seed()
supabase migration new <n>  # author a migration
supabase db push            # apply to the linked project

# development
npm run dev
npm run build

# gates
npm run typecheck
npm run lint                # --max-warnings 0
npm run verify              # typecheck + lint + test + test:int

# tests
npm test                    # unit only, no database
npm run test:int            # integration, real Postgres
npm run test:race           # race test, --no-file-parallelism
```

Reviewer path is two commands: `supabase db reset && npm run verify`.

---

## 8. Project structure

```
app/
  book/page.tsx                     pick child + class
  pay/[bookingId]/page.tsx          mock payment
  status/[bookingId]/page.tsx       result
  roster/[classId]/page.tsx         admin/teacher
  api/roster/[classId]/route.ts     GET, read-only
  api/dev/reset/route.ts            POST, 404 in production
  actions.ts                        thin server actions
src/
  domain/       types, enums, result codes, CAPACITY, dto.ts
  db/           pool.ts, errors.ts, repositories
  payments/     mock gateway: authorize / capture / void
  services/     booking.ts — the graded core; owns transactions
  ui/           presentational components, labels.ts
supabase/
  migrations/<timestamp>_init.sql
db/
  seed.ts       one seed() used by tests AND /api/dev/reset
tests/
  *.test.ts     unit, no database
  *.int.test.ts integration, real Postgres
ARCHITECTURE.md        the rules, reviewer-facing
.claude/RULES.md       the same rules, agent-enforceable
.claude/README_STYLE.md
AGENTS.md              canonical agent instructions
CLAUDE.md              pointer to AGENTS.md
README.md · AI_USAGE.md
```

---

## 9. Seed data — every case the brief names

| Class | State | Exercises |
|---|---|---|
| Science — Volcanoes | 1 of 4 confirmed | available seats |
| Math — Fractions | **3 of 4 confirmed** | the last-seat race |
| Science — Circuits | 4 of 4 confirmed | full class rejection |
| Math — Geometry | 2 confirmed, 1 `PAYMENT_FAILED` | failure consumed no seat |
| — | a `CONFIRMED` booking for one child in Volcanoes | duplicate attempt rejected |

Plus two parents and three students. Seed is idempotent and deterministic (fixed UUIDs) — the
reviewer will run it more than once and the video depends on it.

---

## 10. Time budget (4h cap)

| Phase | Budget | Cut first if over |
|---|---|---|
| M0–M2: schema, migrations, seed, repositories | 50m | — |
| M4, M3: payment mock + booking service | 60m | — |
| M9: integration, race, lock-disabled proof | 55m | **never** |
| M5, M8: API + dev reset | 20m | — |
| M6, M7: four screens | 45m | yes — cut to unstyled |
| M10: README + AI_USAGE | 30m | **never** |
| Deploy to Vercel | 20m | yes — local-only + note |

Order of sacrifice: deploy → UI polish → E2E. Never the race test, the lock-disabled proof, or the
README. Record time per phase as you go; reconstructing it later is a lie.

---

## 11. Deliverables

- Public GitHub repo (no zip).
- `README.md` covering, in the brief's own words: how to run · what was built · time spent ·
  assumptions · key architecture and backend decisions · what was deliberately cut · what to monitor
  after release · what's next. Plus the backend section: schema · endpoints · statuses · duplicate
  prevention · payment failure · last-seat race · which checks live in UI / backend / database /
  background job.
- `AI_USAGE.md` covering all required points, including one specific, diff-level instance where AI
  output was rejected.
- A 5–8 minute video: happy path → forced decline with roster unchanged → **race test live** → the
  lock-disabled proof → schema walk → tradeoffs.

Write the README against `.claude/README_STYLE.md`.

---

## 12. Open questions

1. **Video walkthrough** is required but sits outside the 4h engineering cap. Confirm it is recorded
   separately.
2. **Supabase project** — does one exist, or should the deploy step create it?
