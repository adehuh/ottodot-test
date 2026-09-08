# AI usage

| The brief asks | Section |
|---|---|
| Which AI tools I used | [Which tools](#which-tools) |
| What I used AI for | [What I used it for](#what-i-used-it-for) |
| One place it helped me move faster | [Where it moved me faster](#where-it-moved-me-faster) |
| One place I disagreed with, corrected, or rejected the output | [Where I overrode it](#where-i-overrode-it) |
| What I would change about my AI workflow | [What I would change next time](#what-i-would-change-next-time) |
| How I verified the final implementation | [How I verified the final implementation](#how-i-verified-the-final-implementation) |

## Which tools

Claude Code (Opus 5) for the implementation, in one session. A Claude Design canvas, built
separately, for the four screens.

## What I used it for

Writing the code. Not deciding what the code should be.

Before any code existed I wrote three documents, and they are the part of this submission that
carries the engineering judgment:

- `SPEC.md` (275 lines) — scope, capability map, acceptance criteria, time budget, seed data.
- `ARCHITECTURE.md` (442 lines) — the reasoning. The confirm transaction's exact shape, the
  three-way re-read branch, the authorize/seat/capture ordering, and the six rejected alternatives
  to the row lock with the reason each was rejected.
- `.claude/RULES.md` (248 lines) — the same decisions as an enforceable checklist, with explicit
  "STOP and ask" clauses: do not add a counter column, do not collapse the three-way branch, do not
  hold a transaction open across a payment call.

The agent implemented against those. It did not choose the locking strategy, the status taxonomy,
the payment ordering, or the layering — those were settled in `ARCHITECTURE.md` first, along with
why each alternative lost.

Two things about the workflow mattered more than the prompting.

**Build order was fixed in advance: verification before the API.** The race test and the
lock-disabled proof were written and passing against the service layer before a single HTTP handler
existed. That ordering meant the agent could not quietly satisfy a test by changing the test,
because the tests *were* the deliverable and there was no HTTP layer to hide behind yet.

**One commit per task.** Nineteen code commits, each leaving `npm run verify` green, each a clean
rollback point. When something was wrong I could see exactly which slice introduced it.

## Decisions I made, not the model

Four points where I overruled or directed it. The first is a rejection of a recommendation, which I
think is stronger evidence than catching a bug.

**The lock-disabled proof had to not exist in production.** R9.4 requires a test that runs the
confirm path with `FOR UPDATE` removed and proves overbooking happens. The agent recommended a
shared SQL builder — `buildConfirmSql({ lock })` — with production passing `true` and only the test
passing `false`. Its argument was good: one source of truth, so the proof can never drift from the
real statement.

I rejected it. A flag that disables the invariant is a thing someone can flip, and it would live in
`src/db/` next to the statement it defeats. One duplicated string in a test file is a smaller risk
than a switch in production that turns off the guarantee the whole design exists to provide. Told to
find a version that kept my constraint, the agent produced the better answer: the test derives its
lock-free statement from the exported production constant by stripping `FOR UPDATE`, and asserts the
strip actually changed the string. No flag in `src/db/`, and the proof still cannot drift.

**`failPayment` was folded into `confirmBooking`.** The agent found a genuine contradiction —
`SPEC.md` §6 lists `failPayment` as its own server action, while `RULES.md` R3.3 handles a decline
inside the confirm path — and offered three ways to resolve it rather than picking one. I folded it
in. The option I rejected kept `failPayment` for a parent abandoning checkout, and that has no
caller: nothing invokes a server action after the tab closes. An action with no caller is a status
the database can never actually reach, and a status nothing can reach is worse than no status. The
deviation from the spec is recorded in the README.

**Deploy was cut.** A scope judgment, not a code one. The brief grades verification, so the twenty
minutes deploy would have cost went to the race test running 20 consecutive times and the
invariant-removal sweep instead. I kept the pooler-vs-direct connection split documented in
`.env.example` — the decision stands and is defensible even though nothing in production exercises
it.

**Three things in my own design canvas were dropped.** The design specified a refund on a lost seat,
a ten-minute hold expiry with a sweeper, and pending rows counted toward capacity. All three
contradict `ARCHITECTURE.md`: nothing is ever captured for a seat that was not given, so there is
nothing to refund; a pending booking reserves nothing, so there is nothing to expire. I applied the
design's visual system and dropped those three. The card says "voided", not "refunded", because
"refunded" describes a money movement that did not happen.

## Where it moved me faster

The mechanical surface, which is most of the line count and almost none of the thinking: the
migration DDL from a schema I had already specified, seventeen parameterized repository queries
with their row types, the Zod schemas, the problem+json status map, the exhaustive label
map, and four screens translated from an existing design canvas.

The clearest single case is the integration harness, `tests/helpers/schema.ts`. Every integration
test file creates its own Postgres schema, replays the real migration files into it, and drops it
afterwards. It is 77 lines — `search_path` on a pooled connection, ordered migration replay,
teardown that still runs when a test throws — and it is the kind of code I write slowly and get
subtly wrong on the first attempt. It came out correct immediately, and eleven test files now rest
on it.

What made that possible was not the model. It was R2.1b, which bans schema qualifiers in
migrations — `create table bookings`, never `public.bookings`. That rule exists so the same
migration files can be replayed into a throwaway schema instead of maintaining a second copy of the
DDL that would drift. I wrote the rule for a correctness reason; the speed was a consequence of it.

The honest summary: the specification took longer to write than the implementation took to produce.
That is the right ratio, and it is only available if the specification is precise enough to be
executed rather than interpreted.

## Where I overrode it

Beyond the lock-flag rejection above, the instructive one is smaller and easier to miss.

The `pg.Pool` singleton has to survive Next.js hot reloads. The agent wrote the idiomatic version:

```ts
declare global {
  // eslint-disable-next-line no-var
  var __ottodotPool: Pool | undefined;
}

export function getPool(): Pool {
  if (!globalThis.__ottodotPool) {
```

This is the pattern you find everywhere and it works. `declare global` requires `var`, `var` trips
`no-var`, so the suppression goes in.

I rejected it, because R8.5 says never weaken a gate to reach green — no new `@ts-ignore`, no new
`eslint-disable`. The suppression was not load-bearing for the feature. It was load-bearing for the
*syntax the model happened to reach for first*, which is a different thing, and accepting it would
have put the first suppression into a codebase whose rule is that there are none.

The replacement drops `declare global` entirely:

```ts
// Widened rather than declared global: `declare global` would need `var`,
// and that needs an eslint suppression. A suppression to reach green is
// exactly what R8.5 forbids, so the cast is the honest way to do this.
const globalForPool = globalThis as { __ottodotPool?: Pool };

export function getPool(): Pool {
  if (!globalForPool.__ottodotPool) {
```

Same behaviour, no suppression. `grep -rn "eslint-disable\|@ts-ignore" src app db tests` returns
nothing across the repository.

I report this one because it is the failure mode I find hardest to catch: the output was correct,
conventional, and would have passed review anywhere else. It only failed against a rule this project
had written down in advance. Without that rule I would have merged it.

## What the tests caught that neither of us did

Two bugs that shipped into the working tree and were caught by assertions, not by review:

**`to_jsonb` in the roster query.** Collapsing joined rows with `to_jsonb(b.*)` returns timestamps
as ISO *strings*. They satisfied the TypeScript `BookingRow` type — which claims `Date` — so
`typecheck` passed, `lint` passed, and the page rendered. It would have thrown the first time
anything called `.toISOString()` on one of those rows, in the DTO layer, far from the query that
caused it. A `toBeInstanceOf(Date)` assertion caught it; the fix aliases the columns.

**Non-deterministic seed ids.** The seed let Postgres generate booking UUIDs. Row counts matched
between runs, seat counts were right, every functional test passed — but the ids changed on every
reseed, which breaks a reviewer rerunning the seed and breaks a recorded walkthrough. The
idempotency test compared the id lists rather than just the counts, and failed. I fixed the seed
rather than relaxing the assertion.

Both are the same category: the type system and the happy path agreed with each other, and only an
assertion about something a human would not think to check disagreed.

## How I verified the final implementation

Nothing here trusts the agent's report of its own work. Each item is a command whose output I read.

**The gate, on every commit.** `npm run verify` — typecheck, `eslint --max-warnings 0`, 31 unit
tests, 94 integration tests against real Postgres — green on all nineteen code commits. Integration
tests never mock the database; a mock cannot exhibit write skew, so a mocked race test proves
nothing.

**The race test, 20 consecutive runs.** `npm run test:race`, twenty times in a loop, 20/20. A race
that passes once has not been tested. It uses `Promise.all` over independent pooled connections, not
a sequential loop, and asserts more than "no overbooking": exactly `capacity` confirmed, every loser
`CANCELLED` with reason `SEAT_TAKEN`, every loser's authorisation voided, zero losers captured.

**Removing each invariant to confirm the suite goes red.** This is the check I trust most, because a
passing test proves nothing about whether the thing it names is load-bearing:

| Removed | Result |
|---|---|
| `FOR UPDATE` from the class lock | 9 integration + 8 race tests fail |
| `bookings_one_live_per_student_class` | 7 integration tests fail |
| `bookings_confirmed_by_class` | 1 integration test fails |

The third one is worth admitting. That index is a performance object — no behavioural test would
notice it missing — so I added an explicit `pg_indexes` assertion. Without it, the claim "removing
either index turns the suite red" would have been false, and I would rather add the assertion than
make the claim.

**Structural greps, because layering rules are only real if they are checkable.** No `BEGIN`/`COMMIT`
outside `src/services/`. No SQL outside `src/db/`. No counter column, no seat cache, no
read-then-write capacity check. No `eslint-disable`, no `@ts-ignore`, no `.skip`. Capture occurs
after the transaction closes, verified by line number. No refund function anywhere. The layer rule
is a lint error, not a convention — I confirmed that by writing a deliberate `domain → db` import
and watching `npm run lint` reject it.

**A browser walkthrough of every screen**, because the integration tests cannot see client wiring:
happy path, forced decline with the roster provably unchanged at 3 of 4, retry after the decline
creating a fresh booking, roster reaching 4 of 4, full class not selectable, duplicate rejected.
Console clean.

## What I would change next time

**No exceptions to test-first, including for code that looks obvious.** In two places I let the
implementation land before the test. Both times the test came out asserting what the code did rather
than what the requirement was, and I rewrote both. The ordering is load-bearing, not ceremonial, and
the two places I skipped it are exactly the two places it cost me time.

**Reconcile the design against the rules before handing both to the agent.** My own design canvas
contradicted my own architecture in three places — refund, hold expiry, pending-counts-toward-
capacity. I found them during implementation instead of before it, which meant deciding under time
pressure what should have been settled while writing `ARCHITECTURE.md`.

**Read every screen of a design before implementing any of it.** I applied the design tokens after
reading two of four screens and assumed the rest followed. They did not: one screen specified a
two-part status line the architecture had already named, and another needed per-state actions I had
flattened into one generic link. A element-by-element diff caught it, but only after I had already
called that work finished. The diff should have come first.

**Write the prohibitions before the feature description.** This one worked and I would do more of
it. "Do not add a counter column" and "do not collapse these three branches" produced better code
than any amount of describing what the booking flow should do. An agent is good at satisfying a
requirement and willing to satisfy it the cheapest way, so the value is in closing off the cheap
ways first — and in stating them as objects that can be checked, not intentions that must be
trusted.
