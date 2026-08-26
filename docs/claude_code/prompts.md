# Claude Code prompt library

Reusable prompts for implementing pawnbook. Reference these in session starts.

---

## Initial planning

"Read `docs/initial_idea.md`, `docs/features/pawnbook/feature_spec.md`, `docs/features/pawnbook/feature_steps.md`, and `CLAUDE.md`. Summarise the current phase, the tests that must be written before implementation starts, and any unresolved findings from the last review."

## Spec format check

"Review `feature_spec.md` against the AIBooster+ SDD standards at `~/code/aib-genai/aib-genai-standards/process/spec-driven-development.md`. Check: every requirement uses RFC 2119 vocabulary, every error has a named code and HTTP status, every NFR has a measurable bound, the coverage scope table is present."

## Error handling review

"Read `src/errors.js` and check: every specific class extends `PawnbookError`, `ErrorCode` is frozen, every message names the resource, every catch site logs with the error attached, no swallowed errors, no bare 'not found' strings."

## Steps document update

"Open `feature_steps.md`. For Phase N, mark completed tests and add any new test names discovered during implementation. A deferred test MUST use dynamic `await import()` inside the body, never a top-level import."

## Piece plan

"I am about to implement [module]. Read [relevant files]. Plan the implementation: function signatures, JSDoc, error cases, and which tests from `feature_steps.md` this covers. Do not write code yet."

## Next piece planning

"The previous piece [X] is done and tests are green. What is the next piece in Phase N? List the tests it needs to satisfy from `feature_steps.md`."

## Verify implementation

"Run `make verify`. If anything fails, investigate the root cause. Do not use --no-verify or lower the coverage threshold. Fix the underlying issue."

## Design changes

"A design change is needed: [description]. Before touching any code: (1) update `feature_spec.md` with the new/changed requirement, (2) update `feature_steps.md` with any affected test names, (3) record the change as finding D[N] in the spec. Then implement."

## Production readiness (Phase 11)

"Run the 8-section production readiness review from `~/code/aib-genai/aib-genai-standards/process/sdd-case-study-session-manager.md` against the current implementation. Label each finding A-1…A-n. Resolve each in the spec or explicitly defer with a reason."
