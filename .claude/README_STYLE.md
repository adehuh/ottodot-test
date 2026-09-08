# README writing rules — Ottodot take-home

The README is graded on "clear communication." It is read by an engineer who has read twenty
of these. Write for that person.

---

## The test for every sentence

**Does it tell the reader something they could not have guessed from the brief or the file tree?**

If not, cut it. A shorter README that only contains decisions beats a longer one padded with
description.

---

## Banned

**Restating the brief.** They wrote it. "Ottodot runs live online classes for kids and needs a
trial booking system capped at 4 students" tells them nothing. Start from your decisions.

**Marketing adjectives.** robust · seamless · comprehensive · elegant · powerful · cutting-edge ·
production-ready · battle-tested · best-in-class · leverages · utilises. Every one of these is a
claim with no evidence behind it. Say the specific thing instead.

**Narrating the code.** "The `confirmBooking` function first validates the input, then opens a
transaction, then queries for an available seat…" — they can read it. Explain *why* the seat is
assigned inside the lock, not the sequence of statements.

**Emoji headers, decorative dividers, badge rows.** Nothing that looks like a landing page.

**Hedging.** "I believe this should handle most concurrency scenarios." Either it holds or it
doesn't. If it holds under a stated assumption, state the assumption: "Holds under READ
COMMITTED; the row lock serialises confirms for a class."

**Apology and self-deprecation.** "Given the limited time, this is admittedly a fairly basic
implementation…" You had four hours and they set the cap. Scope decisions are judgment, not
excuses — write them as choices.

**Symmetrical AI cadence.** "Not just X, but Y." "It's not about A — it's about B." Rhetorical
questions as headers. Three-item lists where the third item is filler.

**Inflated numbers.** No "handles 10,000 concurrent bookings" unless you load-tested it.

---

## Required

**Lead with how to run.** Five commands or fewer, copy-pasteable, in a fenced block. A grader
who can't run it in two minutes stops reading.

**Then the last-seat race.** It's the thing they asked for. Second section, not buried at §9.

**Decisions with the rejected alternative attached.** This is the highest-value pattern in the
whole document:

> `seat_no` is assigned per confirmed booking, with a partial unique index on
> `(trial_class_id, seat_no) WHERE status = 'confirmed'`. I considered a denormalised
> `confirmed_seats` counter with a conditional `UPDATE`, which is one statement instead of two,
> but it creates a second source of truth that can drift from the bookings table and needs a
> reconciliation job to guard it. Seat numbers have nothing to reconcile.

Decision, alternative, reason. Three sentences. Do this for every non-obvious choice.

**Name the tradeoffs you accepted, unprompted.** Every design costs something. Saying what yours
costs is what separates a senior README from a confident one:

> A `pending_payment` booking holds no seat. The cost is that a parent can authorise payment and
> still lose the seat to someone who confirms first. I accepted that because holding seats
> requires a TTL and a sweeper job, and at four seats per class the starvation from abandoned
> checkouts is the worse failure.

**Concrete monitoring.** Not "monitor errors and performance." Name the query:

> `count(bookings where status='confirmed') > capacity` for any class — must be zero, page
> immediately. This is the invariant the whole design exists to protect, so it is also the alarm
> that says the design failed.

**Plain first person.** "I chose", "I cut", "I would add". Not "the solution was architected to".

---

## Tone

Write like a note to the engineer who will maintain this next week. Direct, specific, unhurried.
Short sentences. No throat-clearing before a point.

Confidence without overclaiming: state what holds, state the conditions it holds under, state
what you did not verify.

---

## Skeleton

Use the brief's own headings so a grader can tick them off.

```markdown
# Ottodot Trial Booking

[One or two sentences: what this is and what it guarantees. No preamble.]

## How to run

```bash
[≤5 commands]
```

Requires: [Node version, DATABASE_URL, anything else]

## The last-seat race

[The mechanism, in about 150 words: row lock serialises, seat assignment decides,
partial unique index proves. Include the two key SQL fragments.]

[The alternatives table from ARCHITECTURE §4.]

[The tradeoff you accepted, stated plainly.]

## What I built

[The six capabilities, one line each. Not prose.]

## Backend and design

### Data model
[Five tables, the relationships, and the three invariants — each named with the
constraint that enforces it.]

### Endpoints / actions
[Table: operation, kind, signature.]

### Booking statuses
[The state machine. Explain why `payment_failed` and `seat_unavailable` are
separate — that distinction is a deliberate signal, so make sure it's visible.]

### Preventing duplicate bookings
[Partial unique index. One paragraph.]

### Handling payment failure
[Authorize → seat → capture, void on seat loss. Why this ordering removes the
refund path entirely.]

### Where each check lives
[The UI / backend / database / background job table. Include the line: UI prevents
mistakes, the server prevents abuse, the database prevents corruption. And that
the background job is deliberately none, with the reason.]

## Verification

[How to run the tests. What each one proves. Say that the race test runs against
real Postgres with genuine parallelism, and that you ran it N consecutive times.]

## Time spent

[Honest number, with a rough breakdown.]

## Assumptions

[Bulleted. Identity is stubbed, payment is mocked, single Postgres primary, etc.]

## What I deliberately cut

[Bulleted, with a reason for each. This section is graded — it is the scope-control
evidence. Do not skip it or make it vague.]

## What I would monitor after release

[Concrete queries and thresholds, not categories.]

## What I would do next

[Ordered by what I'd do first, with why. Timed seat holds, real gateway with
authorize/capture, reconciliation job, etc.]
```

---

## Before you push

- Read it aloud. Anything you would not say out loud to a colleague gets rewritten.
- Delete the three weakest sentences. There are always three.
- Check every claim is either demonstrated by a test or marked as untested.
- Confirm nothing repeats between README and ARCHITECTURE.md. Ship one or fold them.
