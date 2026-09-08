-- Ottodot trial booking — initial schema.
--
-- Forward-only and immutable once committed (R2.1): a correction is a new
-- migration file, never an edit to this one.
--
-- No schema qualifiers anywhere (R2.1b). Every object relies on search_path,
-- which is what lets the integration harness replay this exact file into a
-- throwaway schema per test file instead of maintaining a second copy of the
-- schema that could drift.

-- --------------------------------------------------------------------------
-- Enums. Closed sets are enums, not free text, and every label is
-- UPPER_SNAKE_CASE used verbatim at every layer (R2.6). Postgres enum labels
-- are case-sensitive: 'confirmed' will not match 'CONFIRMED'.
-- --------------------------------------------------------------------------

create type booking_status as enum ('PENDING_PAYMENT', 'CONFIRMED', 'PAYMENT_FAILED', 'CANCELLED');
create type payment_status as enum ('AUTHORIZED', 'CAPTURED', 'VOIDED', 'FAILED');
create type class_subject as enum ('SCIENCE', 'MATH');

-- --------------------------------------------------------------------------
-- Tables. Every table carries created_at and updated_at (R2.4).
-- --------------------------------------------------------------------------

create table parents (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table students (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid not null references parents (id) on delete cascade,
  name        text not null,
  grade_level text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table trial_classes (
  id           uuid primary key default gen_random_uuid(),
  subject      class_subject not null,
  title        text not null,
  teacher_name text not null,
  starts_at    timestamptz not null,
  -- Capacity is per-class data, not a hardcoded constant, so the invariant
  -- stays testable at values other than 4.
  capacity     int not null default 4 check (capacity > 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table bookings (
  id                  uuid primary key default gen_random_uuid(),
  student_id          uuid not null references students (id) on delete cascade,
  trial_class_id      uuid not null references trial_classes (id) on delete cascade,
  status              booking_status not null,
  -- Set to 'SEAT_TAKEN' when a booking loses the last-seat race. SEAT_TAKEN is
  -- a result code, never a stored status (R3.4) - the row goes CANCELLED and
  -- carries the reason here.
  cancellation_reason text,
  -- Admin display only. PENDING_PAYMENT reserves nothing (R2.9), so nothing
  -- depends on this expiring and no sweeper is needed for correctness.
  hold_expires_at     timestamptz,
  confirmed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table payment_attempts (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references bookings (id) on delete cascade,
  -- Money is integer cents plus a currency column, never a float (R2.5).
  amount_cents int not null check (amount_cents > 0),
  currency     text not null,
  status       payment_status not null,
  provider_ref text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- Invariants. These are database objects, never `if` statements (R1).
-- --------------------------------------------------------------------------

-- One live booking per child per class. PAYMENT_FAILED and CANCELLED rows fall
-- out of the index, so a parent can rebook after a decline while the failed row
-- survives as an audit trail (R2.7). A 23505 from this index is mapped to the
-- DUPLICATE result code in src/db/errors.ts and never surfaced as a 500.
create unique index bookings_one_live_per_student_class
  on bookings (student_id, trial_class_id)
  where status in ('PENDING_PAYMENT', 'CONFIRMED');

-- Supports the derived capacity count. There is no seats_taken counter column
-- to drift out of sync: count(*) where status = 'CONFIRMED' is the only
-- definition of how many seats are gone (R2.8).
create index bookings_confirmed_by_class
  on bookings (trial_class_id)
  where status = 'CONFIRMED';

-- --------------------------------------------------------------------------
-- Deny-all RLS on every table (R2.10). Supabase auto-exposes the public schema
-- through PostgREST with the anon key. This app connects with a direct Postgres
-- role and never uses that key, so enabling RLS with no policies costs nothing
-- and stops the roster leaking publicly.
-- --------------------------------------------------------------------------

alter table parents enable row level security;
alter table students enable row level security;
alter table trial_classes enable row level security;
alter table bookings enable row level security;
alter table payment_attempts enable row level security;
