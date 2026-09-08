# AI usage

## What I used

Claude Code (Opus 5) for the whole build, in one session, driven by three documents I wrote before
any code existed: `SPEC.md` for scope and acceptance criteria, `ARCHITECTURE.md` for the reasoning,
and `.claude/RULES.md` for the enforceable version of those rules. The visual design came from a
Claude Design canvas I had built separately.

Everything in the repository was written in that session. There is no hand-written baseline
underneath it.

## How I used it

The rule documents did most of the work. `.claude/RULES.md` is written as a checklist with explicit
"STOP and ask" clauses — do not add a counter column, do not collapse the three-way re-read branch,
do not hold a transaction open across a payment call. Handing the model a specification with named
prohibitions produced far better output than describing the feature and reviewing what came back.

The build order was fixed in advance and it mattered more than I expected: **verification before the
API.** The race test and the lock-disabled proof were written and passing against the service layer
before a single HTTP handler existed. That ordering meant the model could not quietly satisfy a test
by changing the test, because the tests were the deliverable and the HTTP layer was not yet
available to hide behind.

Every task followed the same loop: write a failing test, implement, run the full suite, commit. One
commit per task, seventeen commits, each leaving `npm run verify` green.

## What worked

**Specifying invariants as database objects, not as instructions.** "The duplicate rule is a partial
unique index" is checkable. "Prevent duplicate bookings" is not, and an agent will happily satisfy
it with an `if` statement.

**Making the proof adversarial.** The instruction that earned the most was: write a test that
removes the lock and asserts overbooking *does* happen. A test that only asserts correct behaviour
would pass just as well if the lock were unnecessary.

**Grep-able rules.** "No `BEGIN`/`COMMIT` outside `src/services/`" is a rule you can verify with one
command, and I did, repeatedly. It also caught a real placement error: the transaction helper was
first written into `src/db/tx.ts`, which the grep immediately flagged. It moved to `src/services/`.

**The layer rule as a lint error.** `import/no-restricted-paths` turned "imports flow downward" from
a convention into a build failure. I verified it by deliberately writing a `domain → db` import and
watching lint reject it.

## What did not work

**The model's first instinct on error handling was to check before writing.** Left alone it wrote a
`SELECT` for an existing booking followed by a conditional `INSERT`. That has a window between the
read and the write; the partial unique index does not. This needed an explicit prohibition in the
rules, not a code review comment.

**Tests written after the implementation were weaker.** In the two places I let the implementation
land first, the tests asserted what the code did rather than what the requirement was. I rewrote
both. The order is load-bearing, not ceremonial.

**The design document contained three things the architecture forbids.** The Claude Design canvas
specified a refund on a lost seat, a ten-minute hold expiry with a sweeper, and an admin table
listing pending and failed bookings. All three are reasonable in isolation and all three contradict
decisions in `ARCHITECTURE.md` — there is no refund path because nothing is captured for a seat that
was not given, and a pending booking reserves nothing so there is nothing to expire. I applied the
design's visual system and dropped those three, which is recorded in the commit and in the README.

## A specific instance where I rejected the output

The `pg.Pool` singleton has to be cached across Next.js hot reloads. The model wrote the idiomatic
version:

```ts
declare global {
  // eslint-disable-next-line no-var
  var __ottodotPool: Pool | undefined;
}

export function getPool(): Pool {
  if (!globalThis.__ottodotPool) {
```

This is the pattern you find everywhere, and it works. `declare global` requires `var`, `var` trips
`no-var`, so the suppression goes in.

I rejected it, because `.claude/RULES.md` §R8.5 says never weaken a gate to reach green — no new
`@ts-ignore`, no new `eslint-disable`. The suppression was not load-bearing for the feature. It was
load-bearing for the *syntax the model happened to choose first*, which is a different thing, and
accepting it would have put the first suppression into a codebase whose rule is that there are none.

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

I am reporting this one rather than a logic bug because it is the failure mode I find hardest to
catch: the output was *correct*, *conventional*, and would have passed review anywhere else. It only
failed against a rule this project had written down in advance. Without that rule I would have
merged it.

## What the tests caught that I did not

Two bugs I wrote and the tests found, both worth naming because neither would have shown up in a
manual walkthrough:

**`to_jsonb` in the roster query.** Collapsing the joined rows with `to_jsonb(b.*)` returns
timestamps as ISO *strings*. They satisfied the TypeScript `BookingRow` type — which claims `Date` —
so `typecheck` passed, `lint` passed, and the roster page rendered. It would have thrown the first
time anything called `.toISOString()` on a booking from that query, in the DTO layer, far from the
query that caused it. A test asserting `toBeInstanceOf(Date)` caught it. The fix aliases the columns
so Postgres returns real dates.

**Non-deterministic seed ids.** The seed let Postgres generate booking UUIDs. Row counts matched
between runs, the classes had the right seat counts, and every functional test passed. But the ids
changed on every reseed, which breaks a reviewer rerunning the seed and breaks a recorded
walkthrough. The idempotency test compared the id lists, not just the counts, and failed. I fixed
the seed rather than relaxing the assertion.

Both are the same category: the type system and the happy path agreed, and only an assertion about
something a human would not think to check disagreed.

## What I would tell someone doing this next

Write the prohibitions before the feature description. "Do not add a counter column" and "do not
collapse these three branches" produced better code than any amount of describing what the booking
flow should do. An agent is very good at satisfying a requirement and very willing to satisfy it the
cheapest way, so the value is in closing off the cheap ways first.
