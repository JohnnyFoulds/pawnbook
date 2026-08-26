# CLAUDE.md — pawnbook AI operating instructions

## Project overview

pawnbook is a self-hosted chess trainer: play engines locally, get every game analysed,
drill your own mistakes with FSRS spaced repetition. Stack: Node 22, SQLite via
better-sqlite3, WebSocket + REST server, cm-chessboard browser client, terminal-kit TUI.

Governed by the AIBooster+ GenAI standards at `~/code/aib-genai/aib-genai-standards`.

## Branching

- `master` — never push directly
- `development` — integration branch; never push directly
- One feature branch per phase: `feat/phase-N-<topic>`, `docs/phase-N-<topic>`
- Branches target `development`; `development` → `master` at phase completion

## Commits

Conventional Commits: `type(scope): subject`

Non-trivial commits MUST include a bullet-list body.

**Never include AI/Claude co-authorship attribution in commit messages.**

## TDD

- Tests are written before implementation (see `docs/features/pawnbook/feature_steps.md`)
- Deferred tests use `test.fails(...)` with a dynamic `await import()` inside the body — never a top-level import of a non-existent module
- `make verify` must pass before any PR

## Architecture

Three layers, one-way dependencies:

```
Layer 3  Interface   src/api/, public/, tui/
Layer 2  Domain      src/domain/
Layer 1  Ports       src/ports/  (contracts only)
         Adapters    src/adapters/  (injected at src/server.js)
```

No domain code may import from `express`, `ws`, `better-sqlite3`, or `child_process`.
No interface code may contain business logic.

## Coverage scope

Declared in `vitest.config.js`. The gate (≥ 90% branches) applies to:
- `src/domain/**`, `src/adapters/**`, `src/api/**`, `src/shared/**`

Excluded from the percentage: `src/server.js`, `src/telemetry.js`, `tui/**`, `public/**`.
Changing the exclusion list requires a `docs(...)` commit.

## Key constants

All balance parameters live in `src/shared/balance.js` and are documented with rationale
in `docs/game/balance.md`. A balance change is a `docs(balance):` commit plus a config
change — never a silent edit.

## Standards mapping (Python → Node)

| Standard | Node equivalent |
|---|---|
| Pydantic models | Zod schemas in `src/schemas/` |
| pytest + fail_under=90 | vitest + @vitest/coverage-v8, thresholds.branches=90 |
| @pytest.mark.xfail(strict=True) | test.fails(...) |
| ruff | eslint (recommended + import/order + security) |
| Sphinx docstrings | JSDoc on every module, class, public function |
| logging + % formatting | pino, child logger per module |
| pyproject.toml | package.json + vitest.config.js + eslint.config.js |
| pip-audit | npm audit --audit-level=high |
| pipdeptree | npm ls --all --json |

## Deviations from the standard

See the full table in `docs/initial_idea.md` § Documented deviations.
