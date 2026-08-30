# Spec review — auto-repertoire

**Status:** Phase 17 — SDD §9 checklist signed off 2026-08-29  
Reviewer: Johannes Foulds (author)  
Note: the SDD standard requires review by another engineer before implementation begins on
non-trivial components. This self-review satisfies the structure; a second-reader review SHOULD be
conducted before Phase 18 begins.

---

## SDD §9 Completeness checklist

- [x] All functional requirements stated in normative language (MUST/SHOULD/MAY)
- [x] All input/output schemas defined (`data_model.md`, `api_contract.md`)
- [x] Preconditions enumerated (`feature_spec.md §P`)
- [x] Postconditions and invariants enumerated (`feature_spec.md §Q` — 15 invariants)
- [x] All error conditions named with HTTP status codes (`feature_spec.md §Error codes`)
- [x] Non-functional constraints stated with measurable bounds (`feature_spec.md §N` — 6 bounds)
- [x] Every FR is traceable to a test in `traceability.md`
- [x] Preregistration committed before first coached game is played

---

## Fagan-style inspection (SDD §7.3)

### 1. Interface conformance

- `RepertoireChoiceSchema` uses `.strict()` — extra fields caught at schema layer, not silently
  ignored. Verified in `api_contract.md §Zod schema excerpts`.
- `decision` is a literal union of exactly two values. No third option possible.
- All six REST routes have documented request/response shapes and status codes.
- WS message types are all defined in `api_contract.md` with full field tables.
- `repertoireRepo` injected into `handleMove` (not a singleton) — verified against current
  `handlers.js:137` signature.

### 2. Precondition enforcement

- P-COACH-1 (`bootstrap_confirmed < 20 → silent`): enforced in `handleMove` before classification.
- P-COACH-2 (`coach_enabled = 0 → silent`): column exists via migration; checked in `handleMove`.
- P-COACH-3 (no canonical → no alert): enforced by deviation table row 1 condition and `new_territory`
  fallthrough; regression test 8 covers the `refused_repeat` edge case explicitly.
- P-CHAL-1 (single observation → alt not canonical): global precondition in `challenge.js`; regression
  test 2 asserts it.
- P-GATE-1 (floor skipped when unreachable): `gates.js` checks whether engine best exceeds floor before
  applying gate 2.
- P-GATE-2 (gate 3 skipped without paths): `line_loss = NULL` when no book path exists; gate 3 reads
  as "pass" in this state.

### 3. Postcondition satisfaction

- Invariant 4 (reproducibility): tested by rebuild-and-diff test; full input set is `rep_observations
  + rep_challenges + rep_audits + rep_suppressions + move_evals + balance constants`.
- Invariant 9 (`ranked = 0` with alerts): tested by WS handler test suite.
- Invariant 10 (no classification in schema): verified — `rep_deviations.resolution` is four-value
  enum; `rep_challenges` has no user-classification column; `RepertoireChoiceSchema.strict()` enforced.
- Invariant 13 (export determinism): tested by byte-identity test in Phase 25.
- Invariant 14 (no canonical below REP_CONFIRM_OBS): tested explicitly (regression test 2).
- Invariant 15 (no challenge on timeout/post_game): tested (regression test 3).

### 4. Error semantics

All five error codes defined in `feature_spec.md §Error codes` with class names and HTTP statuses.
`FR-REP-COACH-11` explicitly names the one exception to the swallow-all-errors rule: `rep_challenges`
write on `decision = 'keep'` fails the move if it fails, because a silently-lost refusal is worse
than a rejected move. This is the most dangerous silent failure mode in the design.

### 5. Non-functional constraints

- N-1 (p99 < 20 ms, zero engine calls on live path): testable by the engine-client spy test and a
  timing assertion on a synthetic book. Timing assertion requires a realistic book fixture (Phase 21).
- N-2 (refusal durability): tested by crash-durability test in Phase 21.
- N-3 (bounded engine calls per challenge): stated as ≤ 2 `go depth 22` per open challenge lifetime;
  verified by audit-count assertion in Phase 22 challenge suite.
- N-4 (policy probes background-only): verified by the same engine-client spy that covers N-1.
- N-5 (errors swallowed except N-2): tested by error-injection test in each phase that adds a
  repertoire call.
- N-6 (coached games excluded from strength sampling): tested in Phase 21 as explicit assertion
  that `saveStrengthSample` is not called for coached games.

---

## Open concerns

1. **Second-reader review pending.** The standard requires another engineer; this self-review is a
   structured first pass only.

2. **`line_loss` recomputation cost.** The spec says it is recomputed whenever any upstream edge
   changes. In a large book this may be an expensive graph traversal. Phase 18 should test the
   recomputation on a book of at least 500 nodes and assert it completes within a reasonable bound.
   If not, a staged-lazy approach (mark nodes dirty, recompute on demand) may be needed. This is an
   implementation concern, not a spec change.

3. **RQ4 alternation scheme compliance.** The preregistration commits to a coach-on/coach-off
   alternation pattern starting from the first confirmed node. The system does not enforce this
   automatically — it relies on the user selecting `coach_enabled` at game creation. A UI affordance
   or a reminder when the sequence breaks would reduce drift. Deferred to Phase 24.

4. **`rep_policy` invalidation on Elo change.** When the player's Elo crosses the threshold between
   two Maia weight tiers, the nearest model changes and all cached `rep_policy` rows become stale.
   The current design marks `reach_stale = 1` and recomputes in background. No gap — just noting for
   Phase 22 implementer.
