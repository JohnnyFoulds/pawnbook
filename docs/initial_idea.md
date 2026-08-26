# pawnbook — Self-hosted play + analyse + drill

## Context

Goal: a Docker container on this Mac that serves a browser chess app where you play
against engines, and every game is automatically analysed to generate personalised
puzzles from your own mistakes, resurfaced on a spaced-repetition schedule. The
training loop is modelled on Noctie (app.noctie.ai): **play → analyse → quiz your
worst moves → drill them over time**.

Decisions already taken:
- **Web app only.** Lucas Chess is dropped (there is a clone at `~/code/lucaschess`,
  but it would be a parallel system with its own separate stats, and its Mac-from-source
  path is unsupported). Engines stay reachable so an external GUI could attach later.
- **Single user, no login.** One ELO, one puzzle queue, bound to localhost.
- **Hybrid move grading.** Stockfish centipawn loss is the primary signal; Maia is used
  as a "would a player at my level have found the better move?" filter so puzzles are
  instructive rather than engine-only subtleties. This is the concrete, implementable
  version of Noctie's undocumented "most instructive mistakes" selection.
- **Two clients, one server.** A browser UI, plus a `chess` terminal client for play,
  drill and stats. The TUI is a pure WebSocket/REST client — no engines, no database, no
  duplicated grading or scheduling — so the two can never disagree. Review stays
  browser-only.
- **Governed by the AIBooster+ GenAI standards** at `~/code/aib-genai/aib-genai-standards`
  — specification-driven development, TDD, three-layer architecture, the error-handling
  taxonomy, structured logging, and the commit/branch conventions. Stack stays **Node.js**,
  so the standards' Python-specific rules are mapped rather than applied literally; the
  mapping and every deviation are recorded below.
- **Optional time control, untimed by default.** Clocks are offered (`10+0 · 5+3 · 3+2`) and
  the server owns them; untimed is the training default. See *Time control*.
- **No external game import.** Only games played here become puzzles, so every card's
  provenance is real. The cost is a slow cold start, named explicitly in
  *Will it be popular?* rather than glossed.
- **Full scope in one pass, phased execution.** No MVP staging — every feature above ships.
  But SDD forbids implementation before a reviewed spec, so delivery is sequenced as
  numbered TDD phases, one branch per phase.
- **This plan has already been reviewed against itself.** 43 findings (six from running the
  engines, thirty-seven from internal consistency) are resolved in the text below and indexed
  in *Design review*. Phase 0's spec review therefore looks for **new** defects, not these.

---

## Governing standards, and the Node mapping

Read from `~/code/aib-genai/aib-genai-standards`: `process/spec-driven-development.md`,
`process/sdd-case-study-session-manager.md`, `architecture/architectural-standards.md`,
`coding/{coding-standards,error-handling,docstring-standards,cicd-standard}.md`,
`logging/{logging-standard,telemetry-standard}.md`.

The **language-agnostic** rules apply unchanged and drive the restructuring below: SDD's
five spec components (R, I, P, Q, N) and RFC 2119 vocabulary; the three-layer architecture
with one-way dependencies; an abstraction at every infrastructure boundary with **two
implementations each**; domain exceptions never crossing into the transport layer;
single-responsibility components; conventional commits; TDD with traceable tests.

The **Python-specific** rules are mapped:

| Standard's rule | Node equivalent used here |
|---|---|
| Pydantic models = SDD `I` component | **Zod** schemas — runtime-validated, and the single source for both WS/REST payload validation and the spec's interface contract |
| Python ABC per infrastructure boundary | A `ports/` module per boundary: a JSDoc `@interface` typedef + a factory contract, with **two implementations** (real + in-memory fake) |
| `pytest`, `pytest-cov`, `fail_under = 90`, `branch = true` | **vitest** + `@vitest/coverage-v8`, `thresholds: { branches: 90 }` |
| `@pytest.mark.xfail(strict=True)` | `test.fails(...)` — vitest asserts the test *does* fail, so a deferred test that unexpectedly passes breaks the build. Same enforcement property |
| `regression` pytest marker | test name prefix `regression:` + a vitest `--project` filter |
| `ruff check` (E,W,F,I,UP,S) | **eslint** (`eslint:recommended` + `import/order` + `eslint-plugin-security`) — the closest available cover for the `I` and `S` rule sets |
| Sphinx field-list docstrings, mandatory everywhere | **JSDoc** on every module, class and function: `@param`, `@returns`, `@throws`, `@example` on public entry points. Field-list semantics preserved, syntax native |
| `logging` + `%s` lazy formatting + `extra={}` | **pino** — structured by construction; a child logger per module replaces `getLogger(__name__)`, and the bound-object argument replaces `extra={}`. Lazy formatting is inherent (pino serialises only if the level is enabled) |
| `pyproject.toml` single config file | `package.json` for deps/scripts; `vitest.config.js` and `eslint.config.js` where the tool requires its own file |
| `requirements.txt` / `requirements_dev.txt` split, `>=` pinning | `dependencies` / `devDependencies`, caret ranges (`^`) as the `>=` equivalent, `package-lock.json` committed |
| `pip-audit` | `npm audit --audit-level=high` |
| `pipdeptree --json` | `npm ls --all --json` |
| `make setup/test/lint/format` | Same `Makefile` targets, delegating to npm scripts |

### Documented deviations

Per the standards' own RFC 2119 framing, a **SHOULD** may be deviated from with
justification. These are the deviations, stated up front rather than discovered later:

| Standard | Deviation | Justification |
|---|---|---|
| `telemetry-standard.md` — full OTel traces + metrics | **Traces yes, metrics no.** OTel JS tracing wraps the analysis pipeline and engine calls; no `MeterProvider` | The standard's own §1 rule is "start with traces, do not add metrics until traces confirm the need". Single user, one process — nothing to aggregate across |
| `telemetry-standard.md` §5 context propagation | Not implemented | One process, no service boundary to propagate across |
| `architectural-standards.md` §7.1 per-session `asyncio.Lock` | One serialised analysis queue instead of per-session locks | Single user means no concurrent sessions to unblock; the contention the rule prevents cannot arise. The engine job queue is the real constraint |
| `architectural-standards.md` §8 — LLM via Bedrock | Not applicable | No LLM. The `EngineClient` port is the structural analogue and follows the same isolation rule |
| `cicd-standard.md` — GitLab `.gitlab-ci.yml`, `python:3.12-slim` | Local `make verify` + a GitHub Actions workflow on `node:22-bookworm` | No GitLab remote for this project. Same three stages, same required jobs, same coverage gate |
| `coding-standards.md` — 1–2 MR approvals | Self-review, no approval gate | Solo project; inventing an approver would be theatre. The **mandatory per-commit diff review** the case study calls essential is kept |
| `logging-standard.md` §6.1 `dictConfig` | pino transport config in `src/config.js` | Direct equivalent; `dictConfig` has no Node analogue |

**One direct conflict, resolved in favour of the standard:** `CLAUDE.md` and
`coding-standards.md` both state *"Never include AI/Claude co-authorship attribution in
commit messages."* My default behaviour is to append a `Co-Authored-By: Claude` trailer.
The standard wins — **no co-authorship trailers on any commit in this project.**

---

## SDD artefacts and workflow

**Nothing is implemented until the spec exists and has been reviewed.** The full artefact
set from the case study, in `~/code/pawnbook/docs/`:

| Artefact | Type | Contents |
|---|---|---|
| `docs/initial_idea.md` | **Frozen** — written once, never updated | The informal brief **plus this entire plan document, verbatim**: the requirements as stated, the Noctie loop, the opponent roster, the UI/TUI designs, the palette validation runs, the Fritz findings, the engine build research, **the 43-finding design review with the defective original text preserved**, and the open questions. See below |
| `docs/features/pawnbook/feature_spec.md` | **Living** — authoritative | R, I, P, Q, N in RFC 2119 language. The permanent reference. Everything below is derived from it |
| `docs/features/pawnbook/feature_steps.md` | **Living** — TDD tracker | Every phase, every method signature, **every test name written before any code**, spec refs (FR/NFR IDs) per phase, a DoD checklist per phase |
| `docs/features/pawnbook/implementation_plan.md` | **Living**, archived on completion | Session-by-session pseudocode, the exact test list each session turns green, suggested commit message, DoD |
| `docs/claude_code/prompts.md` | Reusable | The prompt library: Initial Planning, Spec Format, Error Handling, Steps Document, Piece Plan, Next Piece Planning, Verify Implementation, Design Changes, Production Readiness |
| `CLAUDE.md` | AI operating instructions | Branching, TDD, commit format, JSDoc style, the no-co-authorship rule, pointers to the standards repo |

### What goes into `initial_idea.md`, and why it is frozen

`initial_idea.md` is **this plan document in full**, committed once as the first commit of
Phase 0 and never edited again. Structure:

```
docs/initial_idea.md
├─ 1. The brief as stated          verbatim requests, in order, with the decisions
│                                  taken at each fork and who chose what
├─ 2. The plan                     this entire document, verbatim — architecture,
│                                  opponent roster, formulas, DB schema, UI, TUI,
│                                  Dockerfile stages, phases, verification
├─ 3. Research findings            the engine-build investigation (arm64, Maia protobuf
│                                  header decode, lc0 0.32 policyhead), the lichess
│                                  formula sources, the Noctie analysis, the Fritz
│                                  screenshot inspection, the library surveys
├─ 4. Validation runs              the palette validator output for the move-quality
│                                  arms and the TUI board table, including the runs
│                                  that FAILED and what was changed
├─ 5. Design review                the 43 findings (E1–E6, R1–R37) with severity and
│                                  resolution — INCLUDING the defective original text,
│                                  because "the thresholds were ambiguous by 2x" is only
│                                  a useful record if the ambiguous version is still there
└─ 6. Open questions               unresolved at planning time: ECO table source,
                                   whether --graphics ships, whether board mirroring is
                                   needed (depends on the suspect_recall playtest)
```

Two reasons this matters more than it looks:

**It preserves the failures.** Three TUI palettes and two move-quality palettes were
rejected by the validator before the current ones passed. A living spec records only the
survivor. Freezing the plan keeps the rejected candidates and the reason each failed — which
is the difference between "these hexes" and "these hexes, and here is why the obvious
alternatives don't work." Without it, someone re-derives `#7a4540` in six months and ships
a board that fails contrast.

**It makes the spec review honest.** The Phase 0 review compares `feature_spec.md` against
`initial_idea.md` to find requirements that were dropped, softened, or invented during
formalisation. That comparison only works if the earlier document cannot be quietly edited
to match — a frozen artefact is a fixed reference point, and an editable one is a mirror.
This is why the standard calls for freezing rather than merging the two.

Where the spec later contradicts the plan, **the spec wins** and the plan is not corrected;
the divergence is recorded as a labelled finding in the spec. The plan is evidence of intent,
not a competing source of truth.

The pipeline, per `spec-driven-development.md` §5:

```
Problem statement (initial_idea.md)
      ↓
Normative spec  (feature_spec.md — R, I, P, Q, N, RFC 2119)
      ↓
Schemas         (Zod schemas in src/schemas/ — elaborates I)
      ↓
Test oracles    (vitest tests, written before implementation)
      ↓
Implementation  (code)
```

**Spec completeness gate.** Before Phase 1 begins, the §9 checklist must pass: every
requirement in MUST/SHOULD/MAY, every schema defined, preconditions enumerated, post-
conditions and invariants enumerated, every error condition named with its code and status,
and every non-functional constraint given a **measurable** bound.

This project's `N` component, **with the arithmetic actually done** — the previous version was
internally contradictory (finding R4): "≤ 4 s/move" × the 81 positions in a 40-move game is
5.4 minutes, which cannot fit "≤ 3 min end-to-end", and that budget also had to absorb passes
2 and 3. The bound is therefore restated as a **budget that sums**:

| `N` | Bound | Derivation |
|---|---|---|
| `NFR-A1` pass 1 per position | ≤ 2.0 s (depth 18, `Threads=6`, `Hash=1024`) | 81 positions × 2.0 = **162 s** |
| `NFR-A2` pass 2 per candidate | ≤ 6.0 s (`MultiPV=3`, deeper) | ≤ 8 candidates × 6.0 = **48 s** |
| `NFR-A3` Maia probe per candidate | ≤ 0.5 s (`go nodes 2`, one NN eval) | 8 × 0.5 = **4 s** |
| `NFR-A4` 40-move game end-to-end | **≤ 4 min** | 162 + 48 + 4 = 214 s ≈ 3.6 min, with headroom |
| `NFR-ENG` UCI handshake timeout | 10 s | |
| `NFR-WS` reconnect backoff cap | 30 s | |
| `NFR-TUI` full board frame redraw | ≤ 16 ms | |
| `NFR-IMG` image size | ≤ 500 MB | ~400 MB expected |
| `NFR-COV` branch coverage | ≥ 90% | scope defined in Phase 1 — see finding R22 |

If a measurement misses `NFR-A1`, the lever is pass-1 depth (the risk table already names
it), **not** a quiet edit to the number.

Because there is no second engineer, the spec review is a **self-conducted production
readiness review against the 8-section checklist** (`sdd-case-study` §8) *before* Phase 1,
not only at the end. The case study's central finding is that reviewing the spec caught 22
defects before any code existed; that is the step being reproduced.

**Branch and commit model.** `git init` with `development` and `master`. One branch =
one phase = one review unit (`feat/phase-3-analysis`). Granular conventional commits with
bullet bodies. Spec/steps/plan updates land as `docs(...)` commits **on the same branch,
before** the phase is closed. Findings from each review are labelled (`D1`, `A-2`, …) and
tracked to resolution, per the case study's labelled-finding system. Design changes go
into the spec **first**, then the code — never the reverse.

---

## GitHub repository

**`github.com/JohnnyFoulds/pawnbook`** — public, MIT. Name verified free (404 on the API);
`gh` is authenticated as `JohnnyFoulds`. Created in Phase 0, before the spec commit.

```bash
gh repo create pawnbook --public \
  --description "Play chess engines locally, then drill your own mistakes with spaced repetition" \
  --license mit
gh repo edit pawnbook --add-topic chess,stockfish,maia-chess,leela-chess-zero,\
spaced-repetition,fsrs,chess-training,docker,nodejs,terminal-ui \
  --enable-issues --enable-wiki=false --enable-projects=false \
  --delete-branch-on-merge
```

### Blocker found: the token lacks the `workflow` scope

`x-oauth-scopes: gist, read:org, repo`. GitHub **rejects any push that adds or edits a file
under `.github/workflows/`** when the OAuth token has no `workflow` scope — the push fails
with `refusing to allow an OAuth App to create or update workflow`. Since `ci.yml` is part
of Phase 1, this stops the first real push, not something late and recoverable.

Fix before Phase 0, interactively (it opens a browser, so it has to be run by you):

```
! gh auth refresh -h github.com -s workflow
```

Verify with `gh auth status` showing `workflow` in the scope list.

**Decided: widen the token.** GitHub Actions runs `lint` + `test` + `audit` on every PR, and
those two contexts are the `required_status_checks` in the branch-protection call above — so
the ≥ 90% coverage gate is *enforced* rather than trusted. The considered alternative — drop
`ci.yml`, keep `make verify` as the only gate — was rejected because branch protection would
then have no required check to hold a merge, which makes the coverage gate advisory and
weakens Phase 1's DoD to nothing mechanical. This is therefore **step 0 of Phase 0** and it
blocks the first push, not something late and recoverable.

### Going public changes two decisions in this plan

**1. Maia weights must NOT be committed.** Confirmed via the API: `CSSLab/maia-chess` is
**GPL-3.0**. Committing 12 MB of GPL-3 weight files into an MIT-licensed public repo is a
licence conflict, and binary blobs in git history are permanent. So `weights/` is
`.gitignore`d and `scripts/fetch-weights.sh` becomes **required setup**, not a convenience:
copy from `~/code/lucaschess` if present, else download from the CSSLab release. `make setup`
runs it. This was the right structure anyway — going public just made it non-optional.

**2. The licence boundary needs stating, because all three engines are GPL-3.**
Stockfish, lc0, Drawfish and the Maia weights are **all GPL-3.0**; our code is MIT. That
combination is fine, and the reason is worth writing in the README rather than leaving
implicit:

- We **never link** engine code. Engines are separate processes spoken to over UCI on
  stdin/stdout — the arm's-length arrangement every chess GUI uses. GPL-3 does not reach
  across a process boundary of that kind, so `pawnbook`'s own source stays MIT.
- We **do not vendor or redistribute** engine source or binaries. The Dockerfile clones
  upstream at build time; the repo ships no GPL-3 bytes.
- **The built Docker image is a combined work** and carries GPL-3 obligations. So the plan
  is explicit: the image is built locally and **not published** to a registry. If it were
  ever published, the offer-of-source obligation would attach — a `LICENSES.md` noting this
  keeps the decision visible instead of accidental.

### Repository files (professional baseline)

| File | Contents |
|---|---|
| `README.md` | What it is in one line, an animated GIF of the TUI board and a screenshot of the review page, the training loop in four steps, quickstart (`make setup && docker compose up`), the opponent roster table, architecture diagram, `chess` TUI usage, and a **Licensing** section carrying the boundary above |
| `LICENSE` | MIT, `Copyright (c) 2026 Johannes Foulds` |
| `LICENSES.md` | Third-party inventory: every engine and library with its SPDX id and why the combination is sound; the "image is not published" decision |
| `CONTRIBUTING.md` | The branch model, conventional commits, TDD expectation, `make verify` before pushing, and the no-AI-attribution rule |
| `SECURITY.md` | Honest scope: single-user, no auth, **binds to localhost by design** — do not expose port 3000 to an untrusted network. Where to report |
| `CODE_OF_CONDUCT.md` | Contributor Covenant 2.1 |
| `.github/ISSUE_TEMPLATE/{bug_report,feature_request}.yml` | Issue forms; bug form asks for terminal + `COLORTERM` + `docker version`, since the alignment and colour bugs are environment-specific |
| `.github/pull_request_template.md` | Mirrors the standards' MR requirements: intent, linked issue, **test evidence**, deployment notes |
| `.github/dependabot.yml` | `npm` weekly, `github-actions` weekly, grouped minor/patch |
| `.editorconfig` | LF, UTF-8, 2-space JS, trim trailing whitespace |
| `.gitattributes` | `* text=auto eol=lf`; `*.pb.gz binary` |
| `.gitignore` | `node_modules/`, `data/`, **`weights/`**, `.env`, coverage output |
| `docs/` | The SDD artefact set above |

Badges in the README: CI status, licence, Node version. No coverage badge until it reports a
real number — a badge that lies is worse than none.

### Branch protection, for a solo public repo

The standards forbid direct pushes to `development` and `master`. With one developer that
still earns its keep, because it forces the diff review that the case study calls essential:

```bash
gh api -X PUT /repos/JohnnyFoulds/pawnbook/branches/master/protection \
  -F required_status_checks[strict]=true \
  -F 'required_status_checks[contexts][]=lint' \
  -F 'required_status_checks[contexts][]=test' \
  -F enforce_admins=false \
  -F required_pull_request_reviews[required_approving_review_count]=0 \
  -F allow_force_pushes=false -F allow_deletions=false
```

`required_approving_review_count=0` is the documented deviation: PRs are still mandatory and
CI still gates the merge, but a solo project cannot self-approve. `enforce_admins=false`
leaves a deliberate escape hatch for a genuinely broken `master`. Phase branches merge into
`development` by PR; `development` → `master` by PR at the end.

### Hard platform constraint driving the whole build

Host is an **Apple M4 (arm64)**; Docker runs aarch64 Linux natively (10 CPU, 8 GB).
**Every prebuilt Linux engine binary in this space is x86-64 only** — Drawfish's shipped
`drawfish-linux-64bit`, all `stockfish-ubuntu-x86-64-*` release tars, and lc0 (which
ships *no* Linux binary at all). No prebuilt arm64 lc0 or lc0+Maia image exists.
**All three engines must be compiled from source in a multi-stage arm64 build.** Verified
buildable:

| Engine | Source | arm64 build | Verified how |
|---|---|---|---|
| Stockfish 18 | `sf_18` tag | `make ARCH=armv8-dotprod COMP=gcc` | Makefile inspected; M4 is ARMv8.6, has dotprod |
| lc0 0.32.1 | `v0.32.1` tag | meson/ninja, `eigen`+`blas` backends | build docs + `meson.build` guards `-mfpu=neon` behind `get_supported_arguments()` |
| Drawfish | `master` | `make ARCH=general-64 COMP=clang` | Makefile has no armv8 target, but `general-64` sets `arch=any bits=64` and passes `config-sanity` |

**Maia weights load on modern lc0 — confirmed by decoding the protobuf header** of
`maia-1100.pb.gz`: `min_version 0.21.0`, `LINEAR16` encoding,
`INPUT_CLASSICAL_112_PLANE` / `OUTPUT_WDL` / `NETWORK_SE_WITH_HEADFORMAT` /
`POLICY_CONVOLUTION` / `VALUE_WDL`, no moves-left head. lc0 0.32.1's
`MakeBlasNetwork` accepts exactly that combination. **Since confirmed empirically** — see
*Assets already on this machine*: a Maia net loads and moves on a real 0.32.1 arm64 binary.
0.32 also added a `policyhead` mode — single policy evaluation, no search — which is exactly
right for Maia *playing*, but which turns out to emit no per-move probabilities, so the
findability probe uses `classic` instead. See *Analysis pipeline → Pass 3*.

### Assets already on this machine

The lucaschess clone is not just a weights donor. It contains a **completed macOS port**
(`tools/engine-report.md`, 2026-08-26: **90 of 91 engines working**) built on a host-side
bridge — and **two of this project's three engines already run natively on arm64**:

| Asset | Path | Verified how |
|---|---|---|
| **Stockfish 18, native arm64** | `/opt/homebrew/opt/stockfish/bin/stockfish` (symlinked in-tree as `Engines/stockfish/stockfish-18-arm64`) | `Mach-O 64-bit executable arm64`; `uci` → `id name Stockfish 18`; **`option name UCI_Elo type spin default 1320 min 1320 max 3190`** |
| **lc0 0.32.1, native arm64** | `/opt/homebrew/Cellar/lc0/0.32.1/libexec/lc0` | `uciok`; backends `metal blas eigen trivial …`; BLAS vendor **Apple vecLib** |
| **10 Maia weights** | `bin/OS/darwin/Engines/maia/maia-{1100…1900,2200}.pb.gz` | `maia-1500.pb.gz` **loads and returns a legal move** on lc0 0.32.1 |
| Full-strength lc0 net | `Engines/lc0/791556.pb.gz`, 18 MB | present; not needed here |
| Drawfish | `bin/OS/linux/Engines/drawfish/drawfish` | **x86-64 ELF** — runs only via the bridge's `linux/amd64` container |
| The bridge | `tools/lc-engine` + `tools/docker/Dockerfile.engines` | `direct`/`qemu64`/`wine`/`wine32` modes over one long-lived amd64 container |

**Three consequences, one of which closes a sequencing gap in this plan.**

1. **`UCI_Elo min 1320 max 3190` is now measured, not read out of `src/search.h`.** The
   roster's Stockfish range is confirmed against a real Stockfish 18 binary.
2. **Maia-on-modern-lc0 is settled empirically.** This plan previously rested on a protobuf
   header decode (`min_version 0.21.0`). A Maia net now demonstrably loads on 0.32.1, so the
   risk row "Maia weights unexpectedly rejected at runtime" is struck.
3. **An `ENGINE_MODE=native|container` switch is added.** In `native` mode the composition
   root points `UciEngineClient` at the Homebrew binaries on the host; in `container` mode at
   the in-image builds. Same port, same adapter, different paths — no new abstraction. Worth
   it on its own (a 15-minute image build is a bad inner loop), but it also **fixes finding
   R5**: `tests/fixtures/engine-output/` must hold *recorded real* UCI output, and nothing
   could record it before Phase 8's image existed. It can now be recorded on the host in
   Phase 4.

The image still needs the from-source Linux/arm64 builds — Mach-O binaries cannot be copied
into a Linux container — so *Dockerfile stages* stands unchanged. Native mode is a
development, fixture-recording and fallback path, not a replacement.

**Weights.** `make setup` copies from `bin/OS/darwin/Engines/maia/` (preferred — all ten,
including `maia-2200`), else `bin/OS/linux/Engines/maia/`, else the CSSLab release
(1100–1900 only). Weights are **architecture-independent** neural nets, 12 MB total.
**`weights/` stays gitignored** — GPL-3.0 must not enter an MIT public repo, so fetching is
required setup rather than an optimisation.

**Two traps re-confirmed:** the `nn-*.nnue` files beside the clone's Stockfish build are
**132-byte git-lfs pointer stubs**, so the in-image Stockfish build still needs network
access; and every Linux engine binary in that tree is **x86-64 ELF**, which is what forces
compile-from-source for the arm64 image.

**Do not disturb this tree.** It holds in-progress port work. This project reads from it
(weights, and the Homebrew binaries it symlinks) and writes nothing to it.

---

## Opponent roster

Strength comes from two mechanisms, both exact rather than guessed:

- **Maia** — the weight file *is* the rating (that is Maia's design). Run with a single
  policy evaluation, no search, so it plays human-shaped moves including human-shaped
  errors. 9 opponents, ELO 1100–1900.
- **Stockfish 18** — `UCI_LimitStrength=true` + `UCI_Elo=N`. Range confirmed from
  `src/search.h`: `LowestElo = 1320`, `HighestElo = 3190`. Far better than the older
  `Skill Level` mapping because the requested ELO *is* the configured value.
- **Drawfish** — novelty: a Stockfish fork that scores stalemate as a win, so it hunts
  stalemates and avoids being stalemated, throwing away wins to do so. `movetime`-limited,
  and **unrated** — see below.

```
maia-1100 … maia-1900      elo = 1100…1900   REQUIRED  human-like, policy head, 1 eval
maia-2200                  elo = 2200        OPTIONAL  present only in the lucaschess tree
sf-1400 sf-1700 sf-2000
sf-2300 sf-2600 sf-2900    elo = as named    REQUIRED  UCI_LimitStrength + UCI_Elo
sf-max                     elo = 3190        REQUIRED  unlimited, full strength
drawfish                   elo = null        REQUIRED  novelty, UNRATED, casual-only
```

Maia covers 1100–1900 (+2200) with human-shaped play; Stockfish covers 1320–3190 with
engine-shaped play. The overlap is deliberate — same rating, very different feel.

**`maia-2200` is declared optional, and the roster is static** (finding R8). The plan said
both "fail loud when a weight file is missing" *and* "maia-2200 if present" — mutually
exclusive as written, and a roster that varies with the filesystem also makes
`roster: every opponent id resolves to a binary and options` untestable. Resolution: the
roster is a **static table** with an `optional: true` flag. Startup verifies every
non-optional weight and throws `WeightsMissingError` naming the file if one is absent;
a missing *optional* weight logs `warn` once and the opponent is filtered out of
`GET /api/opponents`. `scripts/fetch-weights.sh` from the CSSLab release (1100–1900 only)
is therefore a fully supported install, not a degraded one.

**Drawfish is unrated, and its ranked opt-in is dropped** (finding R9). The plan rated it
2200 and let you opt into ranked. Both are wrong, and not marginally: games are adjudicated
by **standard rules** (chess.js), so Drawfish plays *to reach stalemate* while the scorer
records stalemate as a draw. Its 2200 is a strength estimate under its own scoring, and
under ours it deliberately discards winning positions — so `expected = f(2200 - myElo)` is
computing an expectation against a rating that does not describe the opponent you actually
faced, and every such game would inject noise straight into the one number the whole game
layer rests on. So `opponent_elo` is `NULL`, `ranked` is forced `0` with no override, and the
picker labels it *unrated · novelty*. It still produces puzzles (its blunders are real
blunders under standard rules) — it just cannot move the rating.

The opponent picker highlights opponents near your current ELO.

---

## ELO tracking

Standard Elo against the opponent's known rating:

```
expected = 1 / (1 + 10^((oppElo - myElo) / 400))
newElo   = myElo + K * (score - expected)          score ∈ {1, 0.5, 0}
K = 40  if gamesPlayed < 15      (provisional)
    20  if myElo < 2100
    10  otherwise
```

Starting ELO configurable, default 1200. Only `ranked` games move the rating, and a game
can only be `ranked` if `opponent_elo IS NOT NULL` — which is the mechanical form of the
Drawfish rule above. Every change appends to `elo_history` so the stats page can draw a
real curve.

**Two hygiene rules the plan was missing:**

- **Extreme mismatches are clamped, not honoured** (finding R28). At 1200 vs `sf-max`
  (3190), `expected = 0.0000006`, so a *loss* costs `40 × 0.0000006 ≈ 0` and a fluke win
  pays the full `+40`. That is a one-way ratchet: play `sf-max` a hundred times, lose
  ninety-nine, and the rating still only goes up. Fix: the rating difference fed to
  `expected` is clamped to **±400** (`expected ∈ [0.09, 0.91]`), which is the standard FIDE
  treatment of the same problem and keeps a loss to a far stronger opponent genuinely
  costly. The picker's *Even match* band and the dashboard suggestion make this rare, but
  "rare" is not "handled".
- **`settings.elo` is a cache of `elo_history`, never an independent counter** (finding R29).
  Two stores for one number drift, and after a restore or a failed transaction they disagree
  silently. So: the Elo update writes the `elo_history` row and the `settings.elo` value in
  **one better-sqlite3 transaction**, and a startup check asserts
  `settings.elo === last(elo_history).elo`, logging `error` and re-deriving from history if
  not. History is authoritative; `settings.elo` exists only so the dashboard is one read.

---

## Analysis pipeline (`src/analysis/`)

Runs automatically in the background when a game ends, streaming progress to the client
over the existing WebSocket. Two-tier depth keeps it fast: a cheap full-game pass for the
eval graph, then a deep pass only where it matters.

**Pass 1 — full game, every ply.** Long-lived full-strength Stockfish, `Threads=6`,
`Hash=1024`, `MultiPV=1`, depth 18 with a `movetime` ceiling. Replay the PGN with chess.js
to get FENs; for each position record `cp` (normalised to White's POV), mate distance,
`bestmove`, and `pv`. N moves needs N+1 evaluations because each position's "after" eval
is the next position's "before" eval.

**Pass 2 — candidate mistakes only.** Re-run those positions at higher depth with
`MultiPV=3`, giving the engine line plus the runner-up, so the review can say "your move
was third best" and the quiz can accept a second good move.

**Grading — lichess's published formulas** (confirmed in `lichess-org/scalachess`
`core/src/main/scala/eval.scala` and `lila` `modules/tree/src/main/Advice.scala`).
Mind the two scales:

```js
// winningChances ∈ [-1, +1]; cp clamped to ±1000, mate scores map to ±1000
winningChances(cp) = clamp(2 / (1 + exp(-0.00368208 * cp)) - 1, -1, 1)
winPct(cp)         = 50 + 50 * winningChances(cp)            // 0..100

// ONE unit only. Every threshold in this project is stated in WIN% POINTS (0..100),
// because "0.30" was ambiguous by a factor of two between the two scales below and would
// have made the classifier 2x stricter than lichess -- see finding R1.
winLoss = winPct(before) - winPct(after)          // win% POINTS, the mover's POV

winLoss >= 30 -> Blunder      winLoss >= 20 -> Mistake      winLoss >= 10 -> Inaccuracy
// below that, grade by cp loss: ==0 Best · <25 Great · <50 Good · else OK
// 7 symmetric tiers so the review's breakdown bar is a true diverging scale (see UI section)

// per-move accuracy takes the same winLoss, in win% POINTS
moveAccuracy = winAfter >= winBefore ? 100
  : clamp(103.1668100711649 * exp(-0.04354415386753951 * (winBefore - winAfter))
          - 3.166924740191411, 1, 100)
```

Game accuracy = mean of (harmonic mean of move accuracies) and (volatility-weighted mean),
volatility being stddev of win% over sliding windows sized by game length. White's first
move is preceded by a synthetic `+0.15` eval. Mate-specific rules: losing or missing a
forced mate is a Blunder, downgraded to Mistake if the position was already worse than
∓700cp.

**Pass 3 — Maia findability (the "human check").** For each candidate mistake, probe the
Maia model nearest your ELO for its policy distribution over legal moves:

```
findability   = P_maia(stockfish_best_move)   // could someone at my level find it?
temptation    = P_maia(move_I_actually_played) // is my error a natural one at my level?
instructiveness = winLoss * findability        // winLoss in win% POINTS (R1)
```

This drives puzzle selection, and is the whole reason the hybrid grading was chosen:

- `findability >= 0.04` → make it a puzzle. Ranked by `instructiveness`, capped ~6/game.
- `findability < 0.04` → tag `engine_only`; shown in the review, **not** drilled. This is
  what stops the queue filling with moves no human at your level would ever find.
- `temptation` high → tag `common_trap`: Maia at your level would likely have blundered
  the same way. These are the highest-value drills.

**How the policy distribution is actually obtained — measured on lc0 0.32.1, and not what
this plan originally said.** Three corrections, all verified by running the binary:

- **`--verbose-move-stats` does not exist.** lc0 0.32.1 rejects it outright
  (`Unknown command line flag`). It is the **UCI option `VerboseMoveStats value true`**.
- **`policyhead` mode cannot produce the distribution.** It returns only
  `info depth 1 seldepth 1 nodes 1 score cp 5` + `bestmove e2e4` — one move, no per-move
  probabilities, and it has no `VerboseMoveStats` option at all. So lc0 is run in **two
  distinct roles**, which the plan had conflated:

  | Role | Invocation | Why |
  |---|---|---|
  | Maia **plays** a move | `lc0 policyhead --weights=maia-N.pb.gz --backend=blas` | single policy eval, no search — exactly Maia's intended use |
  | Maia **findability probe** | `lc0 classic --weights=maia-N.pb.gz` + `VerboseMoveStats=true` + `go nodes 2` | `classic` is the only mode that prints the per-move priors |

- **`go nodes 1` prints nothing.** The root's children must be expanded before the priors are
  emitted, so the probe needs `nodes >= 2`. `P` is the raw policy prior and is *not* affected
  by node count, so a 2-node search is sufficient and costs one NN evaluation.

Confirmed output format, `maia-1500` from the start position:

```
info string e2e4  (322 ) N:      32 (+ 0) (P: 50.22%) (WL:  0.03060) (D: 0.038) ...
info string d2d4  (293 ) N:      18 (+ 0) (P: 23.34%) (WL:  0.05464) (D: 0.040) ...
info string b1a3  (34  ) N:       0 (+ 0) (P:  0.04%) (WL:  -.-----) ...
info string node  (  20) N:      51 (+ 0) (P: 73.56%) ...        <-- NOT a move: skip
bestmove e2e4 ponder e7e5
```

Parser contract: match `^info string (\S+)\s+\(\s*\d+\s*\)`, take `(P:\s*([\d.]+)%)`, and
**discard the line whose move field is `node`** — it is the root summary and including it
corrupts the distribution. The count of surviving lines must equal the legal-move count
(20 at the start position, verified), and `P` must sum to ~100%. Resolution is 2 dp, so
`FINDABILITY_MIN = 0.04` sits far above the noise floor.

**New balance parameter, discovered here: `POLICY_TEMPERATURE`.** lc0 defaults
`PolicyTemperature = 1.359`, which *reshapes* the printed `P` values — and `P` is the sole
input to `findability`, so this constant silently scales the whole puzzle-selection gate.
It must be pinned explicitly rather than inherited: **`POLICY_TEMPERATURE = 1.0`** for the
findability probe (raw softmax, matching how the Maia paper reports move-matching
probabilities), while Maia's *playing* invocation keeps lc0's default so its move choice
stays human-shaped. Pinning them differently is deliberate: one is a measurement, the other
is an opponent. Both values go in `balance.md`, and `FINDABILITY_MIN` is only meaningful
relative to them — changing one requires re-validating the other.

**Risk + fallback (retained, now narrower):** the format above is verified, so the parse risk
is low. If it regresses on an lc0 upgrade, degrade to a binary signal — run Maia for one move
via `policyhead` and set `findability = 1.0` when Maia's choice equals Stockfish's best, else
a floor of `0.25`. The feature keeps working, just coarser, and the degradation logs `warn`.

**Deduplication.** Puzzles are keyed by FEN. A repeated position (the same opening
blunder twice) bumps `times_seen` instead of inserting a duplicate — without this the
queue degenerates into repeats of one pet mistake.

---

## Quiz + spaced repetition

**Post-game quiz** — fires while the game is fresh, which is the mechanic worth copying
from Noctie. The board reloads each mistake position in turn: *"You played Nf3 here —
find something better."* You attempt a move on the real board. Correct → `✓`, show the
engine line and eval swing. Wrong → show the best move, its line, and the win% you gave
up. Each position is written to `puzzles` with an FSRS card initialised.

**The quiz is not a review, and this is a substantive scheduling decision** (findings R14,
R26). You have just played the game and just been shown the position's eval — the quiz is
where the card is *created and taught*, not where memory is *tested*, so treating it as review
#1 would feed FSRS a measurement taken with the answer still on screen. Every card would look
easier than it is and the first real interval would be inflated. So:

- The quiz attempt writes a `reviews` row with **`practice = 1`, `rating = NULL`** — logged as
  evidence, visible in stats, excluded from the FSRS rating distribution.
- **It does not call the scheduler.** The card is created with `due = tomorrow` (the FSRS
  new-card default), whether you found the move or not.
- **The first *spaced* review is the honest one**, and it is the only place
  `suspect_recall` is evaluated. Checking it in the quiz would flag every position you
  correctly remembered from thirty seconds ago, which is not recall, it is short-term memory.
- Drill-ahead on an empty queue takes the same path: `practice = 1`, no scheduling. Practising
  a card that is not due must not push its next review further away — that would punish extra
  work, and it is the reason FSRS has a concept of same-day practice at all.

Finding the move in the quiz still *matters*: it is retrieval practice, it is logged, and the
batch summary counts it. It just does not get to move a schedule it wasn't a fair test of.

**Scheduler** — `ts-fsrs@5.4.1` (MIT), not hand-rolled SM-2. FSRS is Anki's current
default, needs the same integration work, is actively maintained, and its target-retention
knob suits chess drilling. Its four-button rating maps naturally onto quiz behaviour:

| Outcome | FSRS rating |
|---|---|
| Wrong move (either attempt), **or a hint was used** | `Again` |
| Correct first move, wrong follow-up | `Hard` |
| Correct, slow (> 25 s) | `Hard` |
| Correct within 25 s | `Good` |
| Correct + correct follow-up within 6 s, first try | `Easy` |

**A hint gives `Again`, not `Hard`** (finding R31). The plan said both, in two different
tables — *"Correct, but slow (>25 s) **or after a hint** → `Hard`"* here, and *"Wrong, **or
hint used** → `Again`"* in the UI and TUI sections, with the mechanics table and the
verification list (*"confirm a hint forces `Again`"*) siding with the latter. `Again` is
correct and is the version kept: a hint means you did not retrieve it, and the whole point of
the drill is retrieval. `Hard` would let a hinted card's interval keep growing, which is how a
queue quietly fills with cards you can only solve with help. The single source is
`src/domain/review/rating.js`; the tables in the docs are generated from its cases so they
cannot disagree again.

**Daily queue** — `/puzzles` serves cards due now, same board interaction, entirely from
your own games.

---

## Database — SQLite via `better-sqlite3`

Single file at `/app/data/chess.db`, bind-mounted to `./data` so it survives rebuilds.
Synchronous API is a genuine simplification for a single-user app.

```sql
settings(key TEXT PRIMARY KEY, value TEXT)          -- current elo, prefs

games(id, started_at, played_at, opponent_id, opponent_elo, player_color,
      status,                                        -- in_progress|finished|abandoned  (R18)
      result, termination, pgn, ranked,
      time_control_initial_sec, time_control_inc_sec, -- NULL,NULL = untimed        (R34)
      clock_white_ms, clock_black_ms,                 -- live remainder, for resume
      elo_before, elo_after, accuracy, opponent_accuracy,                        -- (R3)
      analysis_state,                                -- pending|running|done|failed
      analysed_at)

game_moves(game_id, ply, uci, san, ms_taken)         -- PK(game_id, ply); written as played
                                                     -- so an in-progress game can RESUME (R18)

move_evals(game_id, ply, fen, move_uci, move_san,    -- PK(game_id, ply)
           cp_white, mate_in, best_move_uci, pv,
           mover,                                    -- 'player' | 'opponent'
           win_before, win_after,                    -- mover's POV, populated for BOTH (R3)
           cp_loss, classification, move_accuracy,
           alt_moves_json)                           -- MultiPV 2..3 lines from pass 2 (R25)

puzzles(id, fen UNIQUE, side_to_move,
        best_move_uci, best_move_san, pv,
        accepted_moves_json,                         -- ALL moves within NEAR_MISS (R25)
        followup_uci,                                -- derived from pv; the anti-memo check
        played_move_uci, played_move_san,
        cp_loss, win_loss_pts, classification,       -- win% POINTS, one unit only (R1)
        findability, temptation, instructiveness, tags,
        maia_model, policy_temperature,              -- WHICH model produced findability (R16)
        elo_at_creation,
        source_game_id, source_ply, phase,           -- opening|middlegame|endgame
        was_timed,                                   -- clock pressure produced it (R34)
        times_seen, created_at)

fsrs_cards(puzzle_id PK, due, stability, difficulty,
           elapsed_days, scheduled_days, reps, lapses, state, last_review,
           graduated)                                 -- retired from the active queue

reviews(id, puzzle_id, reviewed_at, correct, rating,  -- rating NULL when practice=1
        ms_taken, attempted_move_uci, interval_before, interval_after,
        attempt_no,                                   -- 1 or 2; a retry is still Again
        followup_correct,                             -- the anti-memorisation check
        practice,                                     -- 1 = post-game quiz or drill-ahead:
                                                      --   logged, but does NOT schedule (R14/R26)
        suspect_recall)                                -- correct + <2s on first SPACED review

elo_history(id, recorded_at, elo, game_id)
activity(day PRIMARY KEY, games, reviews)             -- local-day rows; the streak is derived
                                                      --   from this, never stored as a counter (R27)
```

**Schema findings, and why each column is not padding:**

- **`games.status` + `game_moves`** (R18). The plan required "kill the server mid-game →
  reconnect, then **resume cleanly**" in the verification list, but nothing persisted an
  unfinished game: `pgn` was written at game end and engines are killed on socket close. A
  resume was therefore impossible. Moves are now appended as played, so the session is
  reconstructible, and a game that is never finished ends as `abandoned` rather than sitting
  in limbo forever.
- **`opponent_accuracy` + `move_evals.mover`** (R3). The review mockup shows
  `You 84% / Maia 1300 71%` — which **cannot be computed** while opponent plies carry null
  `win_before`/`win_after`, as the old schema mandated. Both sides are graded (it is the same
  pass-1 data, mover's-POV normalised); only *puzzle generation* stays restricted to the
  player's own plies.
- **`accepted_moves_json`** (R25). `alt_good_move_uci` was singular, but `MultiPV=3` can
  legitimately yield **two** near-miss moves, and the "second-best within margin is accepted"
  promise would then mark a genuinely good move wrong — the exact trust failure the design
  says is fatal.
- **`maia_model` + `policy_temperature` + `elo_at_creation`** (R16). `findability` is defined
  relative to "the Maia model nearest your ELO", so it is only interpretable alongside *which*
  model, at *what* temperature, at *what* rating. Without this the review copy "Maia 1300
  finds it 31% of the time" has no source, and a card created at 1200 and re-seen at 1700
  silently compares across models. Dedupe keeps the original snapshot and **recomputes
  findability only when the nearest model has changed**, recording both.
- **`reviews.practice`** (R14, R26). Carries the answer to two separate questions: the
  post-game quiz (which primes you, so it must not schedule) and drill-ahead on an empty
  queue. Both are logged as evidence and neither moves an interval.
- **`activity`** (R27). The streak had no definition and no storage. Defined as: **consecutive
  local calendar days** (host timezone, day boundary 04:00 local so a late-night session
  counts as the previous day) with at least one game or one review. Derived, never
  incremented — an incremented counter drifts and cannot be recomputed after a restore.

---

## Architecture — three layers, ports and adapters

The standard's layering rule (`architectural-standards.md` §1) is the biggest change to the
original sketch, which had `analysis/` reaching straight into `db.js` and spawning engines
inline. Dependencies point **one way only**:

```
Layer 3  Interface   express routes · ws handlers · Zod validation · error→HTTP mapping
   │                 (no business logic, no state, no persistence)
   ▼
Layer 2  Domain      grading · findability · puzzle selection · elo · scheduling
   │                 (depends on Layer 1 ports ONLY — never on express, ws, sqlite, or a
   │                  child_process; fully testable with no engine and no database)
   ▼
Layer 1  Ports       EngineClient · GameRepository · PuzzleRepository · ReviewRepository
                     SettingsRepository · Clock · Scheduler
   │
   ▼        adapters injected at the composition root (src/server.js)
   ├── UciEngineClient  → stockfish / lc0 / drawfish over stdin-stdout
   ├── SqliteRepository → better-sqlite3
   ├── SystemClock      → Date.now()
   └── FsrsScheduler    → ts-fsrs
```

**Every port gets two implementations**, as §2 requires — and here that rule pays for
itself rather than being ceremony:

| Port | Production adapter | Test adapter | Why the fake matters |
|---|---|---|---|
| `EngineClient` | `UciEngineClient` | `ScriptedEngineClient` | Returns canned evals/policies from a fixture. **The entire analysis pipeline, grading and puzzle selection become unit-testable with no engine binary at all** — which is what makes TDD possible before the Docker image even builds |
| `GameRepository` etc. | `SqliteRepository` | `InMemoryRepository` | Domain tests run with no file I/O; the fake is a first-class implementation, not a stub, and the same contract test suite runs against both |
| `Clock` | `SystemClock` | `FixedClock` | FSRS due-date arithmetic and the quiz's 6 s/25 s rating thresholds are otherwise untestable |
| `Scheduler` | `FsrsScheduler` | `FakeScheduler` | Lets scheduling assertions be about *our* rating inference, not about ts-fsrs internals |

`ScriptedEngineClient` and `FixedClock` are the two that make the difference: without them,
every test of the grading formulas would need a real Stockfish and a real wall clock.

Frontend stays as designed — `cm-chessboard` (view) + `chess.js` (rules) + Chart.js — and
is a Layer 3 concern only. The TUI is a second Layer 3 client over the same contract.

**Single responsibility** (§5) forces two splits the original sketch had merged: `analyse.js`
was going to both drive the engine passes *and* decide which positions become puzzles —
those are now `analysis/pipeline.js` (produce evals) and `puzzles/select.js` (choose and
rank). Likewise `elo.js` computes ratings and does not write them; the repository does.

## Error taxonomy

Per `error-handling.md`. A base class exported from the package, one shallow level of
specific errors, and **no transport concerns in the domain**:

```js
class PawnbookError extends Error {}              // base, exported  (R32: was ChessTrainerError)

class GameNotFoundError      extends PawnbookError {}
class GameAlreadyOverError   extends PawnbookError {}
class GameNotResumableError  extends PawnbookError {}   // R18 — abandoned or already finished
class IllegalMoveError       extends PawnbookError {}
class PuzzleNotFoundError    extends PawnbookError {}
class EngineUnavailableError extends PawnbookError {}
class EngineTimeoutError     extends PawnbookError {}
class WeightsMissingError    extends PawnbookError {}
class AnalysisFailedError    extends PawnbookError {}
class HintNotAllowedError    extends PawnbookError {}   // ranked game — see below
```

Rules carried over verbatim: messages **must** name the resource (`` `Game '${id}' not
found` ``, never `"not found"`); wrapping uses `{ cause }` — the JS equivalent of
`raise ... from exc` — and never drops the original; the maximum catch scope is `catch
(err)` at a top-level handler which **always** logs with the error attached; no `catch {}`
that swallows. A deliberately non-critical catch site must carry a comment saying why plus
an error-level log — the one place this applies is the OTel exporter, whose failure must
never fail a game.

`ErrorCode` is an enum-like frozen object, never scattered literals:

```js
const ErrorCode = Object.freeze({
  GAME_NOT_FOUND: 'game_not_found',      ENGINE_UNAVAILABLE: 'engine_unavailable',
  GAME_ALREADY_OVER: 'game_already_over', ENGINE_TIMEOUT: 'engine_timeout',
  GAME_NOT_RESUMABLE: 'game_not_resumable', ANALYSIS_FAILED: 'analysis_failed',
  ILLEGAL_MOVE: 'illegal_move',          HINT_NOT_ALLOWED: 'hint_not_allowed',
  PUZZLE_NOT_FOUND: 'puzzle_not_found',  VALIDATION_FAILED: 'validation_failed',
  WEIGHTS_MISSING: 'weights_missing',
});
```

A **single express error-handling middleware** maps domain errors to the standard body
shape — not per-route try/catch:

```json
{ "error_code": "game_not_found", "message": "Game '42' not found", "detail": {} }
```

Status mapping follows §4.1 exactly: not found → 404, invalid input → 400, conflict → 409,
semantic validation → 422, unhandled → 500. `HintNotAllowedError` → **403**: it is an
authorisation decision, not a validation failure, and it is the enforcement point for the
integrity rule that a ranked game exposes no eval.

The WS channel is the SSE analogue of §4.4, so it needs the same two-channel split, stated
on the endpoint: **pre-stream** failures (unknown opponent, weights missing) reject the
`new_game` message before a game exists; **mid-stream** failures emit a structured event:

```json
{ "type": "error", "error_code": "engine_timeout", "message": "...", "detail": {} }
```

Retry policy (§6) applies to engine spawn and the analysis queue: 3 attempts, 2 s initial,
2× backoff **with jitter**, transient only — never retry an `IllegalMoveError` or a
`WeightsMissingError`. Exhausted retries mark `games.analysis_state = 'failed'` and surface
it in the UI; silent exhaustion is prohibited, which is exactly why the review page keeps a
visible `failed` row with a `Retry` action.

## Observability

**Logging** — pino, one child logger per module (`logger.child({ mod: 'analysis' })`) as
the `getLogger(__name__)` equivalent. Levels per the standard: `info` for lifecycle (game
started, analysis complete), `warn` for retries and fallback paths (Maia policy parse
degraded to binary findability — a real fallback that must be visible), `error` at every
catch site with the error object attached, `debug` for per-ply detail. Per-ply evaluation
logs are `debug`, never `info` — §1's "no INFO for high-frequency per-item events in loops".
Every record carries the identifiers: `game_id`, `puzzle_id`, `opponent_id`, `ply`.

**Tracing** — OTel JS, `service.name = 'pawnbook'` (R32), `BatchSpanProcessor` when
`OTEL_EXPORTER_OTLP_ENDPOINT` is set and `SimpleSpanProcessor` + console only when
`OTEL_TRACE_CONSOLE=1`, both honoured without code changes. Spans at operation boundaries,
not statements: `analyse_game` (root, carrying `game.id`, `game.ply_count`, `game.opponent`)
→ `engine_pass_1` → `engine_pass_2` → `maia_findability` → `select_puzzles`, plus
`engine_eval` per position at `debug`-equivalent granularity so a slow game shows *which*
positions cost the time. Failures call `recordException` and set `StatusCode.ERROR`.
Attributes use `namespace.attribute` snake_case with native types — `analysis.ply_count`
as an int, never stringified. The OTel log bridge is wired so pino records carry `trace_id`
and `span_id`.

This is the one place the telemetry work is genuinely justified rather than dutiful: the
analysis pipeline is the only slow path in the system, and "why did that game take four
minutes" is answerable from spans alone.

**Frontend library choice: `cm-chessboard@8.13.0` (MIT), not chessground.** Chessground
does work from a CDN as pre-bundled ESM, but it is GPL-3 and ships **no promotion dialog**
(lichess implements that outside the library). cm-chessboard is MIT, pure ES modules with
no build step, and includes promotion dialog, arrows, and markers as bundled extensions —
all three of which this app needs. Paired with `chess.js@1.4.0` (BSD-2) for rules.
No framework, no bundler: plain ES modules from CDN keeps the image small and the code
readable.

**Not forking an existing project.** Surveyed candidates are all wrong-fit: `Chesskit`
(414★) and `listudy` (391★) are AGPL and bring React/Next or Elixir; `dockfish` is a
12★ reference-sized script. The actual bridge is ~100 lines over `node-uci@1.3.4` (MIT).
Building fresh avoids importing AGPL and a framework we do not want.

**Local prior art worth reading (not importing).** `~/code/lucaschess/bin/Code/Engines/
EngineRun.py` and `EngineManagerAnalysis.py` are the most complete UCI client in any
project on this machine — worth reading before writing `engines/uci.js`, particularly for
engine-option handling and analysis lifecycle. Its `Dockerfile` is a reasonable reference
for the engine-`chmod`/non-root/healthcheck pattern. `~/code/uci-screen-bridge` implements
the *server* side of UCI (declaring options, the `uciok`/`readyok` handshake) which is a
useful mirror for what our client must speak; its `tests/conftest.py` Playwright + ephemeral
`http.server` fixture is a ready-made pattern if we later want browser-driven board tests.
Note the lucaschess clone has **uncommitted macOS port work in progress** (`EngineRun.py`,
`Z/Util.py`, `tools/build_fastercode_macos.sh`) — this plan touches none of it; only the
Maia weights are copied out, read-only.

**Engine process management** — one persistent full-strength Stockfish for analysis with
a serialised job queue; one engine spawned per active game and killed when it ends; a
pooled lc0 for Maia probes. Guards: UCI handshake timeout, max concurrent processes, kill
on socket close.

---

## Files

Directory structure follows the layering, so a wrong-direction import is visible in a
diff rather than buried in a function body.

```
~/code/pawnbook/                    # R32: was chess-trainer everywhere; the repo is pawnbook
├── README.md                       # + Licensing section (GPL-3 engines / MIT source)
├── LICENSE  LICENSES.md            # MIT; third-party SPDX inventory
├── CONTRIBUTING.md  SECURITY.md  CODE_OF_CONDUCT.md
├── CLAUDE.md                       # AI operating instructions (branching, TDD, commits)
├── Makefile                        # setup test lint format verify — delegates to npm
├── package.json  package-lock.json
├── vitest.config.js                # thresholds: { branches: 90 }, projects for regression
├── eslint.config.js                # recommended + import/order + security
├── Dockerfile                      # 3 stages, all Debian bookworm (glibc-aligned)
├── docker-compose.yml              # platform: linux/arm64, ./data volume, port 3000
├── .dockerignore  .gitignore  .gitattributes  .editorconfig
├── .github/
│   ├── workflows/ci.yml            # node:22-bookworm — lint · test+coverage · audit
│   ├── dependabot.yml
│   ├── pull_request_template.md
│   └── ISSUE_TEMPLATE/{bug_report,feature_request}.yml
│
├── docs/
│   ├── initial_idea.md             # FROZEN — the brief + this plan, never updated
│   ├── claude_code/prompts.md      # reusable prompt library
│   ├── game/                       # the WHY — design intent, not normative
│   │   ├── design_document.md      # pillars, loops, session shapes, anti-goals
│   │   ├── mechanics.md            # each mechanic → the FR that implements it
│   │   ├── balance.md              # tuning table + dated changelog
│   │   ├── progression.md          # cold start, pacing, queue economy
│   │   ├── player_experience.md    # tilt, feedback, retention ethics
│   │   ├── art_direction.md        # look & feel; board spec + validator output
│   │   ├── voice_and_tone.md       # copy rules + the shared string table
│   │   └── playtest_log.md         # dated observations; cited by balance commits
│   └── features/pawnbook/
│       ├── feature_spec.md         # LIVING, authoritative — R I P Q N, RFC 2119
│       ├── feature_steps.md        # LIVING — phases, signatures, every test name
│       └── implementation_plan.md  # LIVING — per-session pseudocode; archived at end
│
├── data/                           # SQLite (gitignored)
├── weights/                        # 10 Maia .pb.gz, 12 MB — GITIGNORED, GPL-3, fetched
├── scripts/
│   ├── fetch-weights.sh            # REQUIRED setup: lucaschess darwin, linux, else CSSLab
│   ├── smoke.sh                    # engine acceptance tests (native AND in-container)
│   ├── record-fixtures.sh          # R5: replays canned positions against the HOST engines
│   │                               #   to produce tests/fixtures/engine-output/
│   ├── validate_palette.js         # chart palettes; its output is committed
│   └── validate_board.js           # R24: board squares + ALPHA-COMPOSITED tints + piece
│                                   #   contrast. The bundled chart validator cannot do
│                                   #   this — it has no compositing step — so the board
│                                   #   numbers in this plan came from a throwaway script.
│                                   #   This makes them reproducible and CI-checkable.
│
├── src/
│   ├── server.js                   # COMPOSITION ROOT — the only place adapters are
│   │                               #   constructed and injected. No logic.
│   ├── config.js                   # env parsing, pino config, thresholds, depths, paths
│   ├── errors.js                   # PawnbookError tree + ErrorCode (frozen)
│   ├── telemetry.js                # OTel SDK init, tracer, pino↔trace bridge
│   ├── shared/                     # R20/R21 — consumed by server, TUI *and* browser.
│   │   ├── strings.json            #   THE string table. One file. voice_and_tone.md
│   │   │                           #   documents it; a regression test asserts they agree.
│   │   ├── quality.js              #   tier -> glyph + hex + label. Was public/-only, but
│   │   │                           #   the API and the TUI both need it -> it was going to
│   │   │                           #   be duplicated three ways.
│   │   └── balance.js              #   the tuning table, imported by config.js
│   │
│   ├── api/                        # LAYER 3 — interface only
│   │   ├── routes/{opponents,games,puzzles,stats,state}.js
│   │   ├── ws/{connection,handlers}.js
│   │   └── error-middleware.js     # the single domain-error → HTTP mapper
│   │
│   ├── schemas/                    # Zod — the spec's I component, executable
│   │   ├── messages.js             # WS in/out payloads
│   │   ├── entities.js             # Game, MoveEval, Puzzle, Card, Review
│   │   └── api.js                  # REST request/response bodies
│   │
│   ├── domain/                     # LAYER 2 — no express, ws, sqlite, child_process
│   │   ├── game/{session,elo,roster}.js
│   │   ├── analysis/{pipeline,grade,findability}.js
│   │   ├── puzzles/{select,dedupe,attempt}.js
│   │   └── review/{queue,rating}.js   # rating.js owns the 6 s / 25 s thresholds
│   │
│   ├── ports/                      # LAYER 1 — contracts only, zero implementation
│   │   ├── engine-client.js        # @interface + JSDoc typedefs
│   │   ├── repositories.js         # Game / Puzzle / Review / Settings
│   │   ├── clock.js
│   │   └── scheduler.js
│   │
│   └── adapters/
│       ├── engine/{uci-engine-client,pool,scripted-engine-client}.js
│       ├── sqlite/{schema,repositories}.js
│       ├── memory/repositories.js  # in-memory impl — a peer, not a stub
│       ├── clock/{system-clock,fixed-clock}.js
│       └── scheduler/{fsrs-scheduler,fake-scheduler}.js
│
├── tests/
│   ├── unit/{grade,elo,findability,select,rating,queue}.test.js
│   ├── contract/repositories.test.js   # ONE suite run against sqlite AND memory
│   ├── api/{rest,ws}.test.js
│   ├── tui/{board,input,theme}.test.js
│   └── fixtures/{games,engine-output}/ # recorded UCI output feeds ScriptedEngineClient
│
├── bin/chess.js                    # #!/usr/bin/env node — args, subcommands
├── tui/                            # LAYER 3, second client — pure WS/REST
│   ├── client.js  theme.js  board.js  input.js
│   └── screens/{play,drill,stats}.js
│
└── public/                         # LAYER 3, browser client
    ├── index.html play.html review.html quiz.html puzzles.html games.html stats.html
    ├── js/{dashboard,play,review,quiz,puzzles,games,stats}.js
    ├── js/lib/board.js             # shared cm-chessboard setup — play + quiz + drill AND
    │                               #   review's read-only scrub board (R30: 4 pages, not 3)
    ├── js/lib/chart.js             # chart helpers: tokens, marks, tooltip, table twin
    │                               # NOTE: quality + strings are NOT here — they live in
    │                               # src/shared/ and are served as static ES modules, so
    │                               # server, TUI and browser read one copy (R20/R21)
    ├── css/{tokens,app}.css        # tokens.css holds the validated palettes
    ├── favicon.svg  favicon-32.png # drawn pawn — NOT the U+265F glyph
    └── sfx/*.ogg                   # 6 CC0 samples, off by default, droppable
```

Two things this layout buys that the flat one did not: `tests/contract/repositories.test.js`
is a **single** suite parameterised over both repository implementations, so the in-memory
fake cannot drift from SQLite; and `tests/fixtures/engine-output/` holds recorded real UCI
output, so `ScriptedEngineClient` replays authentic engine text rather than idealised text
someone invented — the fake stays honest about `info` line quirks and `(P: xx.xx%)` format.

### Dockerfile stages

All stages on **Debian bookworm** so lc0 links against the same glibc the Node runtime
provides — mixing trixie build with a bookworm-based Node image is a real breakage risk.

1. `debian:bookworm` → build lc0 `v0.32.1`: `git build-essential ninja-build meson
   pkg-config python3 zlib1g-dev libeigen3-dev libopenblas-dev`, then
   `./build.sh release -Dgtest=false -Dnative_arch=false -Dispc=false -Dcudnn=false`.
   `-Dgtest=false` skips the gtest wrap download; `-Dnative_arch=false` avoids
   `-march=native`. Both eigen and blas backends compile in, selectable at runtime.
2. `debian:bookworm` → build Stockfish `sf_18` (`make -j profile-build ARCH=armv8-dotprod
   COMP=gcc`) and Drawfish (`make -C src build ARCH=general-64 COMP=clang`).
   **Stockfish needs network at build time**: `make` depends on the `net` target, which
   downloads two `.nnue` files; they are then INCBIN-embedded, so nothing is needed at
   runtime.
3. `node:22-bookworm-slim` → runtime. Copy the three binaries, `apt install libopenblas0`,
   and `COPY weights/ /app/weights/` (12 MB — no download needed). Expected image ~400 MB;
   first build ~15 min, cached thereafter.

**`COPY weights/` needs a guard, and this is a trap the plan created for itself** (finding
R33). `weights/` is gitignored and populated by `make setup`, so a fresh clone that runs
`docker compose build` before `make setup` gets a `COPY` of an **empty directory** — which
Docker performs happily — and produces an image with no Maia at all. The failure then surfaces
much later as `WeightsMissingError` on the first game, pointing at a path that exists. Three
cheap defences, all of them:

- `docker-compose.yml`'s build step is fronted by `make build`, which runs
  `fetch-weights.sh` first (idempotent: it exits 0 immediately if the files are already there).
- Stage 3 asserts inside the image:
  `RUN test "$(ls -1 /app/weights/*.pb.gz | wc -l)" -ge 9 || (echo 'weights/ is empty or short — run make setup' && exit 1)`
  — nine because `maia-2200` is optional. A build that would produce a broken image fails at
  build time with the fix in the message.
- `smoke.sh` loops the full roster and loads every non-optional weight, so the assertion is
  checked behaviourally too, not just by count.

Note `COPY weights/` requires `weights/` to be **absent from `.dockerignore`** even though it
is present in `.gitignore` — two different files with two different jobs, and conflating them
is the other half of this trap.

### API surface

```
WS  /ws
  → new_game {opponentId, color, ranked, timeControl}   timeControl: null | {initialSec, incSec}
  → move {uci} · resign · hint · resume {gameId}
  ← game_started {gameId, fen, youPlay, legalMoves, clock?}
  ← engine_move {uci, san, fen, legalMoves, check, clock?, gameOver?}
  ← hint_result {pieceSquare}                    -- casual only; 403-equivalent when ranked
  ← clock_update {whiteMs, blackMs, turn}        -- only when timeControl != null
  ← game_over {result, termination, eloBefore, eloAfter}
  ← analysis_progress {gameId, phase, done, total, overallPct} · analysis_done {gameId}
  ← error {type:'error', error_code, message, detail}

GET  /api/opponents · /api/state · /api/games · /api/puzzles/due · /api/stats
GET  /api/games/:id/review        evals, classifications, accuracy, mistakes
GET  /api/games/:id/quiz          ordered quiz positions
POST /api/puzzles/:id/attempt     {move, msTaken, hintUsed, attemptNo, phase} -> verdict
```

**Three corrections to what this surface used to be** — each was a real defect, not a
tidy-up:

- **`POST /attempt` no longer accepts `correct` or `rating`** (finding R2). It used to take
  `{correct, rating, msTaken, move}`, which is **impossible for the TUI to send**: the TUI
  ships no chess rules engine and holds no eval data, so it cannot decide whether a move is
  correct, and if the client computed `rating` then "the server owns the thresholds" was
  false and the two clients could silently diverge. The server now derives *both* from
  `{move, msTaken, hintUsed, attemptNo}` and returns
  `{correct, rating, bestMoveSan, pv, winLoss, nextDue, followupRequired}`. This is what
  makes the cross-client integrity check in the verification list actually provable.
- **`offer_draw` is removed** (finding R6). UCI has no draw-offer concept, so acceptance
  would have to be synthesised from the engine's eval — and the *outcome of the offer* then
  leaks that eval, defeating the ranked-game integrity rule the whole design rests on.
  Draws happen by rule only (stalemate, threefold repetition, fifty-move, insufficient
  material), all of which chess.js adjudicates.
- **`hint` gains a reply type** (`hint_result`) and `analysis_progress` gains `phase` +
  `overallPct` (finding R13). `{done, total}` alone was a lie across pass boundaries: progress
  spans three passes whose candidate counts are unknown until pass 1 finishes, so the bar would
  reach 100%, reset, and climb again — twice. `phase ∈ {pass1, pass2, maia, select}` names what
  is happening, and `overallPct` is weighted by the NFR budget itself
  (`162 / 48 / 4 / ~0` seconds → **76% / 22% / 2%**), so it is monotone by construction and its
  rate roughly matches real time. Pass 1's `total` is known exactly (`plies + 1`); passes 2–3
  contribute their share proportionally once their candidate count is known.

---

# Game design

Everything above specifies a *system*. This section specifies the *game*, because most of
the decisions that determine whether this gets used daily or abandoned in a week are game
design decisions, not engineering ones — and several numbers already in this plan
(`findability >= 0.04`, 6 puzzles/game, the near-miss margin, 6 s/25 s, K-factors) are **balance
values**, not constants. They deserve documented rationale and tuning ranges.

## Is this a game, or a tool?

It is a **single-player progression game whose content is generated by your own failures.**
That framing is a real decision with consequences, so it is stated rather than assumed:

- If it were a *tool*, the right design would be maximum information density, no streaks,
  no celebration, and a rating would be pointless.
- If it were a *game*, the temptation is to reward engagement over improvement — streak
  guilt, easy-opponent farming, dopamine on every correct answer.

The resolution: **the game layer exists to get you to do the boring thing repeatedly, and
is never allowed to distort the signal.** Every mechanic is checked against that. When
engagement and honest measurement conflict, measurement wins — which is why a ranked game
shows no eval, a hint forces FSRS `Again`, and a retry still counts as a failure.

## Design pillars

Four pillars. Anything that does not serve one of these does not ship.

1. **Your mistakes are the content.** No generic puzzle set — every drill traces back to a
   game you played and a move you chose. Provenance is always one click away. This is the
   whole product; everything else supports it.
2. **Honest feedback, always.** The rating is real, the accuracy is computed from published
   formulas, and nothing is inflated to make you feel good. A trainer that flatters you is
   worse than no trainer.
3. **Human-shaped difficulty.** Maia opponents lose the way people lose. Beating a 3190
   Stockfish handicapped down to 1400 teaches you to punish engine-shaped nonsense; beating
   Maia-1400 teaches you to punish what actually happens at 1400.
4. **Respect the player's time and attention.** Sessions have a defined end. The queue never
   becomes a guilt pile. No mechanic manufactures urgency.

## The core loop, and the loops around it

Game design is nested loops; each needs its own reward or the outer ones never engage.

```
MOVE loop      (seconds)   consider → play → see the reply
   reward: the position changes; in drill, immediate correct/incorrect

GAME loop      (10–30 min) pick opponent → play → result card → rating moves
   reward: win/loss, ELO delta, accuracy %, "4 puzzles found"

SESSION loop   (15–40 min) drill what's due → play a game → review it
   reward: batch summary (solved / missed / next due), queue visibly shrinks

IMPROVEMENT loop (weeks)   rating curve rises, mistake mix shifts phase,
                           old puzzles stop coming back
   reward: the stats page — the only place the long arc is visible
```

The **improvement loop is the one that actually matters and the hardest to make felt**,
because chess improvement is slow and noisy. Three mechanics exist purely to make it
legible: the rating curve with a real trendline, `mistakes by phase` shifting over time
(your blunders migrating from opening to endgame *is* progress), and puzzles graduating out
of the queue as FSRS intervals stretch. Without those, weeks of work look like noise.

## Mechanics reference

| Mechanic | Rule | Design intent |
|---|---|---|
| **Rating** | Elo vs the roster's known ratings; K 40/20/10 by games and level; rating diff clamped to ±400 | A single legible number for "am I better than last month" |
| **Opponent ladder** | 9 Maia (1100–1900, +2200 optional) · 7 Stockfish (1400–3190) · Drawfish (unrated) | Overlapping ratings with different *feel* is the point, not redundancy |
| **Ranked toggle** | Default on; **impossible** for Drawfish (no rating to play against); no eval/hint while ranked | Protects both the rating and the training signal |
| **Optional time control** | Untimed by default; `10+0 · 5+3 · 3+2` offered. Flag-fall is a real loss; puzzles from timed games are tagged `was_timed` | Untimed is the *training* default — a clock changes what a mistake means. But time pressure is where most real blunders live, so it has to be available and it has to be marked |
| **Move grading** | 7 tiers from lichess formulas, in win% points | Vocabulary for talking about your own play |
| **Findability gate** | `P_maia(best) >= 0.04` becomes a puzzle | **The core mechanic.** Filters engine-only subtleties so the queue holds moves a human at your level could actually have found |
| **Temptation tag** | high `P_maia(played)` → `common_trap` | Surfaces the errors your peers make too — highest transfer value |
| **Puzzle cap** | ≤ 6 per game, ranked by instructiveness | One catastrophic game must not flood a week of drilling |
| **One retry, then teach** | wrong → "one more try" → reveal | Retrieval attempt beats being told; two failures means you don't know it, so teach |
| **Near-miss acceptance** | any `MultiPV` move within **2.0 win% points** of best accepted | Being marked wrong for a good move destroys trust faster than anything else |
| **Behavioural FSRS rating** | inferred from correctness + time + hint | Self-rating is unreliable and adds friction; behaviour is honest and free |
| **Drill batches** | 10 puzzles, then a summary card | A defined end. An infinite queue is a chore; a batch is a session |
| **Dedup by FEN** | repeat position bumps `times_seen` | One pet opening blunder must not become the whole queue |

## Balance parameters — the tuning table

These live in `config.js` as named constants, are documented in `docs/game/balance.md` with
rationale and range, and a test asserts the two agree (same pattern as
`tokens.css` ↔ `quality.js`). **A balance change is a `docs(balance):` commit plus a config
change, never a silent edit.**

| Parameter | Start | Range | If it's wrong you'll see |
|---|---|---|---|
| `FINDABILITY_MIN` | 0.04 | 0.01–0.15 | Too low: queue fills with moves you'd never find, drilling feels arbitrary. Too high: barely any puzzles from a bad game |
| `POLICY_TEMPERATURE` | 1.0 | 0.8–1.359 | Silently rescales every `findability`; `FINDABILITY_MIN` is meaningless without it. lc0's own default is 1.359 |
| `PUZZLES_PER_GAME_MAX` | 6 | 3–10 | Too high: one disaster game floods the week. Too low: real mistakes go undrilled |
| `NEAR_MISS_WIN_PTS` | 2.0 | 1.0–5.0 | Too low: correct moves marked wrong. Too high: sloppy moves pass |
| `RATING_FAST_MS` | 6000 | 3000–10000 | `Easy` firing on lucky guesses, or never firing at all |
| `RATING_SLOW_MS` | 25000 | 15000–45000 | Everything rated `Hard`, so intervals never grow |
| `SUSPECT_RECALL_MS` | 2000 | 1000–4000 | Never flags, or flags every easy card |
| `BLUNDER/MISTAKE/INACCURACY` | 30 / 20 / 10 **win% points** | lichess defaults | Deviating breaks comparability with lichess — change only with a reason |
| `ELO_DIFF_CLAMP` | 400 | 300–800 | Unclamped, `sf-max` becomes a free-roll (finding R28) |
| `K_PROVISIONAL / K_MID / K_HIGH` | 40/20/10 | standard | Rating too jumpy or too sticky in the first 15 games |
| `DRILL_BATCH` | 10 | 5–20 | Sessions that never end, or end before warming up |
| `DUE_SOFT_CAP` | 40 | 20–100 | See queue economy below |
| `TARGET_RETENTION` (FSRS) | 0.90 | 0.80–0.95 | Too high: same puzzles constantly. Too low: things fall out of memory |
| `GRADUATE_REPS / _INTERVAL_D` | 5 / 180 | 3–8 / 90–365 | Cards never retire (queue only grows), or retire while still shaky |
| `TIME_CONTROLS` | `[null, 10+0, 5+3, 3+2]` | — | The offered set; `null` (untimed) is the default (finding R34) |

**`NEAR_MISS_CP` became `NEAR_MISS_WIN_PTS`** (finding R12). The plan abandoned centipawns
for classification precisely because a cp margin means different things in different
positions — and then used a raw `20cp` margin for *accepting* a near-miss answer, which is
the same mistake at the point where it costs the most trust. Converted at the derivative of
the win% curve near equality (`dWin%/dcp = 50 × 0.00368208 / 2 ≈ 0.092`), 20cp ≈ **1.84 win%
points**, so `2.0` is the faithful translation, not a re-tune. The sub-inaccuracy quality
tiers (`Great < 25cp`, `Good < 50cp`) **stay in cp deliberately**: they distinguish degrees
of "fine", where win% points would give them a range of 2.3 and 4.6 — too coarse a
resolution to label with, and nothing downstream gates on them.

## Time control (finding R34)

The plan drew a clock in both mockups and specified nothing behind it — no field, no
protocol message, no flag-fall, no termination value. Resolved as **optional time control,
untimed by default**, because untimed is the honest training default (you cannot claim a
move was your best thinking if you had four seconds) while time pressure is where most real
blunders actually come from, so it must be available and it must be *labelled* when it is on.

**The server is the only clock.** A client-side timer would let a slow WebSocket or a paused
laptop award or steal a win, and two clients with two timers is two answers. So:

| Concern | Rule |
|---|---|
| Offered controls | `TIME_CONTROLS = [null, {600,0}, {300,3}, {180,2}]`; `null` preselected |
| Authority | Server debits the mover's remainder on each accepted move, using the `Clock` port — so `FixedClock` makes every clock test deterministic |
| Increment | Added **after** the move is accepted (Fischer), never before |
| Engine time | The engine's own thinking is debited from *its* clock; `sf-max` is given `movetime = min(its remainder − 300 ms, cap)` so it cannot flag itself |
| Flag-fall | Detected server-side when the remainder hits 0 → `result` to the opponent, `termination = 'timeout'` |
| Broadcast | `clock_update {whiteMs, blackMs, turn}` on every move and at most every 1 s while thinking; emitted **only** when `timeControl != null` |
| Disconnect | Clock **pauses** on socket close and resumes on `resume` — the game is against an engine, so there is no opponent to defend against stalling, and losing on time to a dropped Wi-Fi connection is the single most infuriating possible outcome |
| Grading | Unchanged. A timed blunder is graded exactly like an untimed one; the clock changes *why* you blundered, not *how bad* the move was |
| Puzzles | `puzzles.was_timed = 1`, and `games.time_control_*` gives the exact control. Timed games are expected to produce more and worse mistakes; without the tag the balance data is polluted and `FINDABILITY_MIN` gets tuned against a moving target |
| Untimed games | Store `NULL, NULL`; **no clock UI at all** — an empty clock panel implies a broken feature. The rail shows elapsed time only |

Both clients render it, both refuse to own it: the browser shows two clocks with a filled pip
on the mover (already in the mockup); the TUI's rail already reserves the two-clock block
Fritz used. Neither counts down locally beyond interpolating between `clock_update` events
for display, and the displayed value is corrected to the server's on every event.

`termination` is therefore a **closed enum** (finding R19), which the plan never stated:
`checkmate · resignation · stalemate · threefold · fifty_move · insufficient_material ·
timeout · abandoned`. All but the last two come straight from chess.js; a SQLite `CHECK`
constraint enforces the set, and the string table has one line per value so the two clients
cannot phrase a loss differently.

## Three design problems, stated because they are real

These are the failure modes I expect. Naming them now is cheaper than discovering them in
week three.

### 1. Position memorisation — the validity problem

**Puzzles keyed by FEN from your own games test recognition, not understanding.** The second
time you see a position from your own game, you may recall *"the answer is Nd5"* without
recalling *why* — and FSRS will happily grow the interval on a card you have memorised
rather than learned. This is the central validity risk of the entire "drill your own
mistakes" premise, and it is not solved by tuning.

Mitigations, cheapest first:

- **Ask for the follow-up.** After a correct first move, require the continuation 1–2 plies
  deep from the stored `pv`. Remembering a move is easy; remembering the *line* means you
  understood the idea. This is the highest-value single addition and it reuses data already
  stored.
- **Colour/board mirroring.** Re-present a card occasionally with colours reversed and the
  board flipped — same idea, different pixels. Cheap to compute, defeats visual recall.
  Needs care: castling and pawn direction make this unsound for some positions, so gate it
  on "no castling rights, no en-passant".
- **Track suspicion.** A card answered correctly in under 2 s on its first review is flagged
  `suspect_recall` rather than trusted. Visible in stats, not silently acted on.

Decision: **ship the follow-up requirement, log `suspect_recall`, and treat mirroring as
optional.** Recording it here so a later "why do my drills feel too easy" has an answer
already written down.

**The follow-up needs its own rating rule, and the plan didn't have one** (finding R15). It
required the follow-up and asserted only `attempt: a wrong follow-up after a correct first
move does not infer Easy` — which leaves `Hard` and `Good` both consistent with that test and
so leaves the scheduler undefined. The full rule, stated once and shared by both clients:

| First move | Follow-up | FSRS rating | Reasoning |
|---|---|---|---|
| wrong (either attempt), or hint used | not asked | `Again` | unchanged |
| correct | correct, total < 6 s, first try | `Easy` | found the move *and* the idea, instantly |
| correct | correct | `Good` | the normal success path |
| correct | **wrong** | `Hard` | you found the move but not the idea — the exact signal the follow-up exists to catch. **Not `Again`**: you did produce the best move, and demoting that to a total failure would re-queue it at day one and make the anti-memorisation check feel like a punishment for engaging with it |
| correct | position has no stored follow-up (mate, or `pv` shorter than 2 plies) | as if correct with no follow-up | never penalise the player for missing data |

`ms_taken` for the `Easy` window is measured **from the position appearing to the follow-up
landing**, not to the first move — otherwise the follow-up is free time and `Easy` fires on
cards you only half-know. `reviews.followup_correct` is `NULL` in the last row above, which is
what distinguishes "not asked" from "failed", and a `NULL` there must never be counted as a
failure in stats.

**And `phase` needs a stated derivation, because a test asserts it** (finding R17).
`select: phase is derived as opening|middlegame|endgame` was listed with no rule to test
against. Defined by material and ply, evaluated in order: **endgame** if the total non-king,
non-pawn material of both sides is ≤ 13 points (queen 9, rook 5, bishop/knight 3 — i.e. at
most a queen or two rooks and a piece remain in total); else **opening** if `ply <= 20`
(move 10) *and* at least one side still has castling rights or an undeveloped back rank;
else **middlegame**. Two properties make this the right shape rather than the obvious
ply-only cut: a queenless position on move 14 is an endgame however early it is, and a
32-piece position on move 30 is not. The thresholds go in `balance.md` as
`ENDGAME_MATERIAL_MAX = 13` and `OPENING_PLY_MAX = 20`.

### 2. Rating meaning and opponent farming

The rating is Elo **against this roster**, and it will not match lichess or FIDE. Two
consequences to design around:

- **State it plainly in the UI.** "1247 vs engines" — not a bare number implying transfer.
  An honest number that's clearly scoped beats an impressive one that misleads.
- **Farming is possible.** Beating Maia-1100 repeatedly at 1400 gains almost nothing per
  win (expected score ≈ 0.85) but is pleasant and safe, and it produces *few useful puzzles*
  because you rarely get punished. Rather than police it, the design makes the good choice
  the easy one: the picker preselects a near-rating opponent, marks ±150 as *Even match*,
  and the dashboard's `Play` button names a suggested opponent. **No mechanic punishes
  farming** — this is a game played alone, and a system that nags is a system that gets
  closed. Nudge, don't enforce.

### 3. Queue economy — flood, then starvation

6 puzzles/game × a few games a day compounds fast, and FSRS due-counts grow superlinearly
before intervals stretch. An unbounded `Drill 240` badge reads as debt and is the single most
likely reason this gets abandoned.

- **`DUE_SOFT_CAP = 40`.** Above it, the badge shows `40+` and drill batches prioritise by
  `instructiveness × overdue`, so the most valuable cards surface first. FSRS state is never
  discarded — only presentation is capped.
- **Retirement.** A card with `reps >= 5`, no lapses, and interval > 180 days is marked
  `graduated` and leaves the active queue. Graduating puzzles is a *reward*, and the stats
  page counts them — "you have retired 112 mistakes" is the most motivating number the
  system can honestly produce.
- **Starvation is the opposite state** and needs its own answer: an empty queue is a **win
  state**, not an empty state. "Nothing due — you're clear. Play a game or drill ahead."

## Progression and pacing

**No XP, no levels, no unlocks.** Chess supplies its own progression and a parallel
artificial one would compete with it. The only progression currencies are rating, retired
puzzles, and streak.

Session shapes the design supports explicitly:

| Shape | Length | Path |
|---|---|---|
| **Drill-only** | 3–8 min | `chess drill` or Drill from home; one batch of 10, summary, done |
| **One game** | 15–30 min | Play → result card → review → quiz. The canonical loop |
| **Deep session** | 45+ min | Drill batch → game → review → quiz → second game |
| **Glance** | 30 s | Dashboard: rating, due count, streak. No obligation |

The **glance** shape matters more than it looks: a system that demands a full session or
nothing gets opened less often. The dashboard is designed to be worth 30 seconds.

### The cold-start problem

A brand-new install has **no rating, no puzzles, and nothing to drill** — the entire loop is
dark, and the first session is "play a game, wait three minutes for analysis." That first
session determines whether there's a second one.

Designed opening:

1. **First-run screen states the loop in one screen** — play, get analysed, drill your
   mistakes. Not a tutorial, not a carousel; one screen with the four steps and a Play button.
2. **Calibration, not a guess.** Default 1200 with `K_PROVISIONAL = 40` for 15 games means
   the rating converges fast, and the UI labels it **`provisional`** until then so an early
   wobble doesn't read as failure. The opponent picker starts at Maia-1300 (slightly above
   default, since most beginners under-rate themselves).
3. **The first analysis is the demo.** Analysis runs behind the result card with a real
   progress bar; the review page is where the product sells itself. So the *first* game
   should be against Maia — human-shaped mistakes produce far more interesting review
   content than a handicapped Stockfish's alien ones.
4. **Do not gate drill behind volume.** Even 2 puzzles from one game is a valid first batch.
   The batch summary must read sensibly at n=2.

## Failure, frustration, and tilt

The player loses roughly half the games by design, and every drill starts from a position
where they already failed once. **This game is mostly made of being wrong**, so the handling
of being wrong is the design, not a detail.

- **Frame errors as content, not judgement.** "You played Nf3 here and lost 22% win chance.
  Find something better." — describes, then hands over agency. No "Blunder!" as a verdict.
- **Never stack failure.** A missed drill shows the answer *and* the line *and* the eval
  swing, then moves on. No score penalty, no combo break, no streak loss.
- **Loss aversion is the reason `Play again` keeps the same opponent and colour** — the
  friction after a loss is choosing, and a rematch is one click.
- **Resignation needs no justification** and is not counted as anything but a loss. A
  "are you sure? you're only down 3 points!" dialogue is exactly the kind of nagging that
  gets an app closed.
- **Tilt guard, gently.** After three losses in a row the result card offers "Drill instead?"
  once — a suggestion, never a block, never repeated in the same session.

## Retention without dark patterns

The player is the author, and dark patterns aimed at yourself are simply self-harm with
extra steps. The streak is the one mechanic with genuine risk, so it gets an explicit stance:

- **The streak counts days you did *anything*** — one drill or one game. It is a
  participation marker, not a performance one.
- **No streak-loss notification, no "your streak is at risk", no freeze economy.** It resets
  quietly and the number starts again. If it makes you feel bad, it can be hidden — see below.
- **Never gate content on the streak** and never let it influence what is drilled.

**Hiding the streak is a persisted setting, not a CLI flag** (finding R36). The plan offered
`--no-streak`, which only silences the terminal — the dashboard's stat tile would keep showing
it, so the one mechanic explicitly acknowledged as psychologically risky would be
un-disableable in the client you use most. So `settings.show_streak` (default `1`) is a stored
preference honoured by **both** clients; the browser has a toggle in the top-bar settings and
the TUI's `--no-streak` becomes a *session override* of it, consistent with how `--no-sound`
and `--hatch=none` work. When it is off, the streak tile is absent from the dashboard, the
drill summary card omits the streak line, and `activity` rows are still written — the data is
never destroyed by a display preference, so turning it back on restores a true number rather
than restarting from zero.

FSRS is the real retention mechanic and it is the honest one: the reason to come back is that
cards are genuinely due, computed from memory research rather than from an engagement target.
That is the difference between a schedule and a slot machine.

## Anti-goals

Explicitly out of scope, so they don't get argued about later:

**No multiplayer or human opponents** (a solved problem — lichess exists). **No opening book
memorisation trainer** (different game, different loop). **No engine-vs-engine spectating.**
**No cloud sync, accounts, or leaderboards** — single user is a pillar, not a limitation.
**No monetisation, ads, or telemetry-for-engagement** — the only telemetry is OTel traces for
debugging, local. **No generic puzzle packs** — if the puzzle didn't come from your game, it
doesn't belong. **No coach persona or LLM commentary** — the eval, the line and the
findability number say more than generated prose, and honestly.

## Game design documents

Added to `docs/`, alongside the SDD artefacts. These are the *why*; `feature_spec.md`
remains the normative *what*, and where they disagree the spec wins.

| Artefact | Type | Contents |
|---|---|---|
| `docs/game/design_document.md` | Living | Pillars, the game/tool framing, core + nested loops, session shapes, anti-goals |
| `docs/game/mechanics.md` | Living | Formal spec of each mechanic: inputs, rule, edge cases, which FR implements it |
| `docs/game/balance.md` | Living | The tuning table with rationale, range, and a **dated changelog of every change and the observation that caused it** |
| `docs/game/progression.md` | Living | Cold start, calibration, pacing, queue economy, retirement and graduation |
| `docs/game/player_experience.md` | Living | Failure/tilt handling, feedback and game feel, retention ethics, the streak stance |
| `docs/game/playtest_log.md` | Living | Dated session observations: what felt wrong, what was tuned, what happened next |

`playtest_log.md` is the one that earns its keep. Balance cannot be validated by unit tests
— `FINDABILITY_MIN = 0.04` is either right or wrong only in play — so the log is the evidence
trail, and every `docs(balance):` commit cites an entry in it.

## Playtest protocol

Balance verification is empirical and belongs in the verification list as its own item:

1. **20 games across the ladder** (Maia low/mid/high, Stockfish mid, one Drawfish), logging:
   puzzles generated per game, how many felt *instructive* vs *arbitrary* on review, and how
   many were tagged `engine_only`.
2. **Target: ≥ 70% of generated puzzles feel worth drilling.** Below that, `FINDABILITY_MIN`
   is too low. Zero `engine_only` tags across 20 games means it is too high — the filter
   isn't filtering.
3. **Two weeks of daily drilling**, watching: due-count trajectory against `DUE_SOFT_CAP`,
   FSRS rating distribution (if `Easy` is >50% or <5%, the time thresholds are wrong), and
   `suspect_recall` frequency — high means position memorisation is real and the follow-up
   requirement needs to be stricter.
4. **Cold-start rehearsal on a wiped database** — because it can only be tested once
   honestly, and it is the session that decides everything.

---

# Art direction — look and feel

Written in Phase 0 alongside the other game design docs, because look and feel is decided
once and then referenced a hundred times; deciding it per-screen is how an app ends up with
four blues. This section is the *intent*; the token tables that follow are its implementation.

## The one-line statement

> **A quiet, unlit room with a well-made board in it.** Warm neutral wood tones on a near-
> black surface, no ornament, no glow. The only saturated colour on screen is information.

Everything follows from that sentence. It rules out: gradients, glassmorphism, glows,
drop shadows, gamified badges, rounded cartoon pieces, neon accents, and any decorative
illustration. It rules *in*: flat fills, hairline rules, generous negative space, and one
accent used sparingly.

The **reference that actually informed this** is the Fritz for DOS screenshots inspected
earlier — four colours, texture instead of tone, permanent key bar, zero ornament. Not
nostalgia: it is a demonstration that a chess interface needs almost nothing, and that
constraint-driven design ages better than styling. The modern half of the brief is simply
"do that, but with correct contrast and real type."

## The board — the hero object, now specified and validated

The board appears on **four of the seven pages** — `play`, `quiz`, `puzzles`, and `review`
(the scrub board beside the eval graph) — and is the largest element on the first three
(finding R30: the plan said "three of seven" and then specified a scrubbable board on the
review page, which makes four; the miscount matters because `js/lib/board.js` was scoped as
"play + quiz + drill" and the review board would then have been built twice. It is one
component with a **read-only mode**: no drag, no click-to-move, no promotion dialog, driven
entirely by `setPosition(fen)` from the graph's hover ply). Computed for the dark theme,
pieces as sprites (so, unlike the TUI, squares are not constrained by pure
`#ffffff`/`#000000` piece pins):

| Role | Value | Notes |
|---|---|---|
| Light square | `#b0a89d` | warm neutral — boxwood, desaturated for a dark UI |
| Dark square | `#63666b` | cooler gray-blue, the traditional warm/cool pairing |
| Last move | `#d9b310` @ **46%** | composites to `#c3ad5c` / `#998941` |
| Check | `#d03b3b` @ **45%** | composites to `#be7771` / `#945355` |
| Selected | `#3987e5` @ **44%** | composites to `#7c99bd` / `#5175a1` |
| Legal destination | `•` marker, not a tint | consistent with the TUI; keeps tints for state |
| Board frame | 1px `--hairline` ring, 8px radius, **no shadow** | |
| Coordinates | outside the board, `--ink-muted`, 11px | never overlaid on squares |

**Validation results — ALL PASS:**

- Base squares light↔dark **ΔE 22.7** — unmistakable.
- **Dark square clears 3:1 against both surfaces** (3.37:1 vs `--surface-page`, 3.16:1 vs
  `--surface-1`), so the board reads as a distinct object rather than dissolving into the
  card it sits on. This was the binding constraint and it eliminated two earlier candidates
  (`#5c5f63` at 2.84:1, `#565a5f` at 2.63:1 — both too dark to separate from the card).
- Every tint is **ΔE ≥ 8 from its own base square** (worst: last-move on light, 8.9) and
  **every tint pair is ΔE ≥ 12.9** on both square colours.
- Piece legibility on every composite: black pieces 3.63–9.45:1, white pieces 2.22–5.79:1.
  The white-on-light-last-move case (2.22:1) is the weakest and is **why the piece set must
  have an outline** — see below. It is not a bare-fill glyph, so this is sound.

Two failures found and fixed, recorded so they are not re-tried: **`premove` was dropped
again** — a gray premove tint lands ΔE 5.6 from `selected` on both squares, the identical
failure that killed it in the TUI, and no alpha fixes it because gray-over-gray has nowhere
to go. And `last move` at 30% alpha was **ΔE 6.0** from the light square — visually a
nothing — which is why it ended at 46%.

### Piece set: `staunty`, not `standard`

`cm-chessboard@8.13.0` (MIT) ships exactly two sprite sheets — `standard.svg` (Cburnett,
the lichess default) and `staunty.svg`. **Staunty is chosen**: heavier silhouettes and
thicker outlines, which hold up better at small board sizes and against mid-luminance
squares, and crucially the outline is what carries the white piece at 2.22:1 on a
last-move-tinted light square. Cburnett's thinner lines are more elegant on a bright board
and slightly weaker on this one. It is a one-line swap, so both get eyeballed during Phase 9
— but staunty is the default and the contrast maths above assumes an outlined set.

**Piece rendering rules:** SVG sprites only, no raster; pieces sized to ~86% of the square
so the checkerboard stays visible under them; no piece shadows; drag renders the piece at
1.0 scale with no tilt or enlargement.

### Deliberate divergence from the TUI board

The web board (`#b0a89d` / `#63666b`) and the TUI board (`#8f8b84` / `#5f6166`) use
**different hexes on purpose**, and this is documented so it does not read as drift: the TUI
pins pieces to pure white and pure black, which forces every square into luminance
[0.10, 0.30]; the web board uses outlined sprites and is free of that ceiling, so its light
square can be genuinely light. Same *logic* — warm light, cool dark, tints for state,
markers for affordances — different numbers because the constraints differ.

## Typography

System sans throughout (`system-ui, -apple-system, "Segoe UI", sans-serif`) — no webfont, no
display face, no serif, including the hero figure. A webfont would be the single largest
asset in a 400 MB image for zero functional gain.

| Role | Size | Weight | Notes |
|---|---|---|---|
| Hero figure | 48–56px | 600 | proportional figures, `-0.02em` tracking |
| Stat value | 28px | 600 | proportional |
| Section heading | 20px | 600 | sentence case |
| Body | 15px | 400 | |
| Move list / tables | 14px | 400 | **`tabular-nums`** |
| Caption / axis | 13px | 400 | `--ink-muted` |
| Board coordinates | 11px | 400 | `--ink-muted` |

**Weight 400 is the floor** — 300 on a near-black surface reads thin and haloed. Only 400 and
600 are used; no 500, no 700. Line height 1.5 body, 1.2 headings.

## Motion language

Motion exists to show *causality* — what moved, and why — never for delight.

| Event | Duration | Easing |
|---|---|---|
| Piece move (yours) | 0 ms | instant; you know what you did |
| Piece move (engine) | 200 ms | `cubic-bezier(.2,.7,.3,1)` — decelerate |
| Capture | 200 ms | move, then captured piece fades 120 ms |
| Drill correct flash | 400 ms | hold, then auto-advance after 1.2 s |
| Panel / card enter | 150 ms | opacity + 4px rise |
| Chart refetch | 200 ms | previous render holds at 40% — never a skeleton |
| Thinking pulse | 1.4 s loop | opacity 0.4↔1.0 on the dot only |

The asymmetry in the first two rows is the design: **your own moves are instant** because
animating them adds latency to your input, while the **engine's move animates** because you
did not cause it and need to see it happen. `prefers-reduced-motion: reduce` sets every
duration to 0 and disables the pulse and auto-advance.

## Sound

Currently absent from the plan and worth having, because move audio is a large part of how a
chess interface feels, and in drilling, **audio correct/incorrect feedback registers faster
than visual** — it arrives while your eyes are still on the board.

Six samples, ≤ 60 ms each, dry and percussive — a wooden click, not a UI chime:
`move`, `capture`, `check`, `game-end`, `drill-correct`, `drill-wrong`.

- **Off by default**, one toggle in the top bar, persisted in `settings`. Sound that starts
  playing unasked is the fastest way to get muted permanently.
- Sourced **CC0 only** and listed in `LICENSES.md` with provenance. Lichess's samples are
  not CC0, so they are not an option — this is a real constraint, not a preference.
- `--no-sound` in the TUI; the terminal client otherwise uses a single `BEL`-free approach
  (no terminal bell — it is unmutable and rude).
- Fully droppable: it is the last thing built and nothing depends on it.

## Iconography

No icon library. The glyph set is small enough to be literal, and chess supplies most of it:

```
result      ✓ won    ✗ lost    = drew
quality     ?? ? ?!  –  ! !!         (notation, not decoration)
nav         ♟ home   ▶ play   ◈ drill   ▤ games   ◔ stats
state       ● on move / thinking   ○ waiting   ▲▼ delta   + check
steppers    ◀ ▶      collapse ⌄
```

Every one is a text glyph in `--ink-secondary`, sized with the text. **Status colour never
travels alone** — `✓`/`✗` carry the meaning and `--good`/`--critical` only reinforce it.

## Identity

`pawnbook` — lowercase wordmark, weight 600, tracking `-0.02em`, with a drawn pawn mark to
its left. Text-first; no illustration, no mascot.

**The mark must be an SVG, not the `♟` character** — U+265F is exactly the glyph found
earlier to have acquired emoji presentation in Unicode 11, so a browser tab or top bar using
it may render a full-colour emoji pawn instead of a monochrome one. Same bug as the TUI, same
root cause, different surface. So: `favicon.svg` with a drawn pawn silhouette in
`--ink-primary` on transparent, plus a 32px PNG fallback. Where a glyph is unavoidable in
text, append VS15 `U+FE0E`.

## Voice and tone

The copy carries the fourth design pillar, and it is the cheapest thing to get wrong. Rules:

- **Describe, then hand over agency.** *"You played Nf3 here and lost 22% win chance. Find
  something better."* — not *"Blunder!"*. State the fact, name the cost, give the task.
- **Numbers instead of adjectives.** *"Maia 1300 finds it 31% of the time"*, never *"most
  players miss this"*. The number is the whole reason the position was chosen.
- **No exclamation marks in prose.** `!` and `!!` are chess notation and are reserved for
  that meaning; using them for enthusiasm makes the annotation glyphs ambiguous.
- **No praise.** No *"Great job!"*, no *"Nice find!"*. The eval swing and the rating are the
  feedback, and manufactured encouragement undermines pillar 2.
- **Second person, present tense, sentence case, no trailing colons on labels.**
- **Errors say what happened, what it affects, and what to do:** *"Analysis failed — the
  engine stopped responding. Your game and rating are saved. [Retry]"*
- **Empty states are never dead ends** — each carries exactly one action, and an empty drill
  queue is phrased as an achievement: *"Nothing due — you're clear."*

A **string table lives in `docs/game/voice_and_tone.md`** so both clients emit identical
wording. The TUI and browser must never phrase the same event differently.

## Cross-client family resemblance

Two clients, one game. Shared and non-negotiable: the seven-tier glyph vocabulary, the
warm-light/cool-dark board logic, the tint-for-state and marker-for-affordance split, the
string table, the *describe-don't-judge* tone, and the board-left / rail-right composition.
Different by necessity: the TUI's `░` texture channel and its own validated palette; the
browser's charts, animation and sprite pieces. Someone using both should recognise the second
one immediately without it feeling like a port.

## State art

No spinners-as-decoration and no illustrated empty states.

- **Loading:** content-shaped placeholders at 40% opacity for first paint only; on *refetch*
  the previous render holds instead (no skeleton flash, no layout jump).
- **Analysis in progress:** a real determinate bar driven by `analysis_progress`. Never
  indeterminate — the total ply count is known, so a spinner would be a lie.
- **Empty:** one line of copy plus one action, in `--ink-secondary`. No art.
- **Failed:** the reason, the reassurance about what survived, and a `Retry`.

## Documents

| Artefact | Type | Contents |
|---|---|---|
| `docs/game/art_direction.md` | Living | This section: the statement, board spec + validation output, piece set, type scale, motion table, sound, iconography, identity, state art |
| `docs/game/voice_and_tone.md` | Living | The copy rules plus the **string table** both clients read from |

`art_direction.md` carries the **validator output verbatim**, including the two failures
(`premove` ΔE 5.6, last-move-at-30% ΔE 6.0), for the same reason `initial_idea.md` keeps the
rejected palettes: the next person to reach for a gray premove tint should find out it was
already tried and why it cannot work.

---

# User interface & experience

Applying the art direction above. Theme: **dark, calm, board-as-hero**. One accent, generous
spacing, and the only saturated colour on screen is data. Eval reds and blues therefore read
vividly without the UI competing.

## Design tokens

```css
--surface-page:  #0d0d0d;   /* app background          */
--surface-1:     #151517;   /* cards, chart surface    */
--surface-2:     #1e1e21;   /* raised: modals, tooltip */
--ink-primary:   #ffffff;
--ink-secondary: #c3c2b7;
--ink-muted:     #898781;   /* axis labels, captions   */
--gridline:      #2c2c2a;   /* hairline, solid         */
--baseline:      #383835;
--accent:        #3987e5;
--hairline:      rgba(255,255,255,0.10);
--good:          #0ca30c;   /* status only, with icon+label */
--critical:      #d03b3b;

/* board — validated above; all pairs PASS */
--sq-light:      #b0a89d;
--sq-dark:       #63666b;
--sq-lastmove:   rgba(217,179,16,0.46);
--sq-check:      rgba(208,59,59,0.45);
--sq-selected:   rgba(57,135,229,0.44);
```

Type: `system-ui, -apple-system, "Segoe UI", sans-serif` throughout — no display or
serif face anywhere, including the hero number. Proportional figures on hero and stat
values; `font-variant-numeric: tabular-nums` **only** in columns that align vertically
(move list, tables, axis ticks). Spacing on a 4px grid; cards `border-radius: 12px` with
a `--hairline` ring, no drop shadows except modals.

## Move quality — a diverging ordinal scale, validated not eyeballed

Move quality is an **ordered scale with polarity** (bad → neutral → good), so the colour
job is **diverging**, not categorical. Assigning it arbitrary categorical hues would be
wrong, and a red↔green scale — the chess convention — is the textbook colour-vision
failure. The diverging pair is therefore **red ↔ blue with a neutral gray midpoint**.

Seven symmetric tiers, three per arm, ramping in intensity away from neutral:

| Tier | Glyph | Dark hex | Rule (win% points) |
|---|---|---|---|
| Blunder | `??` | `#dd7065` | winLoss >= 30 |
| Mistake | `?` | `#b85a50` | winLoss >= 20 |
| Inaccuracy | `?!` | `#8f4a45` | winLoss >= 10 |
| OK | *(none)* | `#6f6f69` | neutral midpoint (gray by design) |
| Good | *(none)* | `#256abf` | cp loss < 50 |
| Great | `!` | `#3987e5` | cp loss < 25 |
| Best | `!!` | `#6da7ec` | matches engine best |

**Two tiers legitimately have no glyph, and that creates an a11y hole the plan had missed**
(finding R10). Standard chess notation has no symbol for "good" — inventing one would make
the glyph vocabulary non-standard, which is worse. So `OK` and `Good` would be separated by
**colour alone** (gray chip vs blue chip, no glyph), which is precisely what the
never-colour-alone rule forbids. Resolution: **the move list annotates only the five glyph
tiers.** `OK` and `Good` get no chip at all — a distinction of no consequence in a dense
move list — and the full seven tiers appear only in the review's breakdown bar, where every
segment is **directly labelled with its tier name**. Colour is then never the sole channel
anywhere: glyph in the list, text label in the bar.

`scripts/validate_palette.js` results, run against `--surface #151517 --mode dark`:

- Red arm `#8f4a45,#b85a50,#dd7065` and blue arm `#256abf,#3987e5,#6da7ec` — **all
  `--ordinal` checks PASS** (monotone lightness, adjacent ΔL >= 0.06, light end clears
  the surface, single hue).
- The first attempt **failed** and was fixed: `#ef7a72`/`#86b6ef` fell outside the dark
  lightness band, `#86b6ef` dropped under the chroma floor, and two red steps sat at
  normal-vision ΔE 8.8 — too close to tell apart as discrete badges.

**Colour never carries meaning alone, and never carries seven levels in a dense list.**
Chess already supplies the secondary channel: the standard annotation glyphs above. So:

- **Move list** — the SAN stays in `--ink-primary`; a small filled chip beside it carries
  the glyph, its text white-or-ink by the fill's luminance. Only the **five glyph tiers**
  get a chip; `OK` and `Good` get none, so an unannotated move reads as "unremarkable" and
  colour is never the only difference between two annotated states. Colour collapses to a
  **2-way** distinction here (bad `#dd7065` / good `#3987e5`), which validates all-pairs
  with a very large margin. Text never wears the data colour.
- **Breakdown bar** — the full seven tiers appear only in the review's diverging stacked
  bar, centred on neutral, **each segment directly labelled with its tier name**, plus a
  legend and a table-view twin.

## App shell

Persistent top bar, four destinations. The due-count badge is the one piece of
always-visible nudge.

```
┌────────────────────────────────────────────────────────────────┐
│ ♟  Home    Play    Drill ⑫    Games    Stats        ELO 1247 ▲12│
└────────────────────────────────────────────────────────────────┘
```

Multi-page (`play.html`, `review.html`, …), no client router — each page is a small ES
module. State that must survive navigation lives in SQLite, not the client.

## Dashboard (`index.html`) — the landing screen

Leads with the training loop so drilling actually happens. **Exactly one hero figure**:
ELO. Puzzles-due and streak are stat tiles, not heroes.

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   1247            ┌──────────────┐  ┌──────────────┐         │
│   ▲ 12 vs last    │ Puzzles due  │  │ Day streak   │         │
│   Rating          │      12      │  │      5       │         │
│                   │  ▁▂▅▃▆▄▂ ▁   │  │  ▁▂▃▄▅▆▇█    │         │
│                   └──────────────┘  └──────────────┘         │
│                                                              │
│   ┌────────────────────────┐  ┌────────────────────────┐     │
│   │  ▶  Play               │  │  ◈  Drill 12 puzzles   │     │
│   │  Suggested: Maia 1300  │  │  from your own games   │     │
│   └────────────────────────┘  └────────────────────────┘     │
│                                                              │
│   Rating over time                          [30d] [90d] [all]│
│   1250┤                            ╭──╮  ╭───●1247           │
│   1200┤              ╭─────────────╯  ╰──╯                   │
│   1150┤    ╭─────────╯                                       │
│       └──────────────────────────────────────────────────    │
│                                                              │
│   Recent games                                               │
│   ✓ Won   Maia 1300   84%   3 puzzles   2h ago               │
│   ✗ Lost  SF 1400     71%   5 puzzles   yesterday            │
│   = Drew  Maia 1200   79%   2 puzzles   yesterday            │
└──────────────────────────────────────────────────────────────┘
```

Stat tiles follow the contract: label (sentence case), value (semibold, proportional
figures), delta (signed, vs a named period), 12-point sparkline in the de-emphasis hue
with the current point in accent. Time-range filter sits in **one row above** the chart
it scopes — never inside the card.

## Play (`play.html`)

**Setup** is an inline panel, not a modal — opponent grid grouped `Human-like (Maia)` /
`Engine (Stockfish)` / `Novelty`, each chip showing name, ELO, and a one-line character
note ("plays like a real 1300 — including the mistakes"). Opponents within ±150 of your
rating are marked *Even match*; the suggested one is preselected. Colour picker
White / Black / Random. A `Ranked` toggle, default on — **absent entirely for Drawfish**,
replaced by the line *"unrated · plays for stalemate, so a rating against it would mean
nothing"* (R9), which is more honest than a disabled control with no explanation.

**Time control** sits beside the colour picker as four chips — `Untimed · 10+0 · 5+3 · 3+2` —
with `Untimed` preselected (R34). Choosing untimed renders **no clock at all** in the game
screen, not a blank one; the rail shows elapsed time instead. Timed games mark their puzzles
`was_timed`, and the review page says so, because a blunder with eight seconds left is a
different fact about you than the same blunder with all day.

**In game** — board centred and as large as the viewport allows; right rail carries
opponent identity, move list, clock (timed games only), and actions.

```
┌──────────────────────────────────────────────────────────────┐
│                                    Maia 1300      ELO 1300   │
│      ┌────────────────────────┐    ● thinking…               │
│      │ ♜ ♞ ♝ ♛ ♚ ♝ ♞ ♜        │    ──────────────────────    │
│      │ ♟ ♟ ♟ ♟ ♟ ♟ ♟ ♟        │     1. e4      e5            │
│      │                        │     2. Nf3     Nc6           │
│      │         ·   ·          │     3. Bb5     a6            │
│      │                        │    ──────────────────────    │
│      │ ♙ ♙ ♙ ♙ ♙ ♙ ♙ ♙        │    [ ⤺ Flip ]  [ Resign ]    │
│      │ ♖ ♘ ♗ ♕ ♔ ♗ ♘ ♖        │                              │
│      └────────────────────────┘    Think time  ▁▃▅▇  2.0s    │
│         You · White   00:04:12                               │
└──────────────────────────────────────────────────────────────┘
```

Board interaction, all via cm-chessboard: drag **or** click-click to move; legal
destinations shown as dots on hover/select; last move and check highlighted; promotion
uses the library's built-in dialog; illegal drops snap back with no error text. The
engine's move animates and its origin/destination stay highlighted so you can never miss
what just happened. **No eval, no hint, no move quality during a ranked game** — that
would corrupt both the rating and the training signal. Casual games may opt into a hint
button.

Thinking state is honest: a pulsing dot plus the engine name, because Maia answers almost
instantly while `sf-max` may take seconds, and silence otherwise reads as a hang.

**Result card** — appears over the board; analysis is already running behind it, so
choosing review is instant.

```
        ┌─────────────────────────────┐
        │      ✓  You won             │
        │      by checkmate           │
        │                             │
        │   ELO  1235 → 1247   ▲ 12   │
        │                             │
        │   Analysing…  ▓▓▓▓▓▓▓▓░░ 74%│
        │   4 mistakes so far         │
        │                             │
        │  ┌───────────────────────┐  │
        │  │  Review & quiz  (4)   │  │
        │  └───────────────────────┘  │
        │  [ Play again ]  [ Home ]   │
        └─────────────────────────────┘
```

The progress bar is a real percentage from `analysis_progress` over the existing socket.
`Play again` keeps the same opponent and colour. Dismissing does not cancel analysis —
puzzles still land in the queue.

## Review (`review.html`)

```
┌──────────────────────────────────────────────────────────────┐
│  vs Maia 1300 · you were White · won by checkmate            │
│                                                              │
│  Accuracy  84%          You ████████░░  84%                  │
│                    Maia 1300 ███████░░░  71%                 │
│                                                              │
│  Evaluation                                    ⓘ table view  │
│   +3 ┤          ╭─╮                    ╭────╮                │
│    0 ┼──────────╯ ╰────╮   ╭───────────╯    ╰──              │
│   -3 ┤                 ╰───╯                                 │
│      └───5────10────15────20────25────30────35───            │
│              ?!      ??            ?                         │
│                                                              │
│  Your moves · 30 graded                        ⓘ table view  │
│  ▏blunder 1▏mistake 2▏inaccuracy 1▏ok 5▏good 7▏great 8▏best 6│
│   all seven tiers, each segment directly labelled  (R10)      │
│                                                              │
│  Worth drilling (4)                                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ?? 18. Nf3    lost 22% win        common trap        │   │
│  │    Best was Nd5 — Maia 1300 finds it 31% of the time │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │ ?  24. Bxc6   lost 14% win                           │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │ ?! 31. h3     lost 11% win                           │   │
│  └──────────────────────────────────────────────────────┘   │
│  Not drilled · engine-only (2)                          ⌄   │
│  ┌───────────────────────────────────┐                       │
│  │  Start quiz  (4 positions)        │                       │
│  └───────────────────────────────────┘                       │
└──────────────────────────────────────────────────────────────┘
```

The **eval graph** is the diverging case: a single line (2px) with a ~10% opacity area
wash, blue `#3987e5` above the zero baseline (White better) and red `#dd7065` below
(Black better), gray zero rule, solid hairline gridlines. Crosshair + tooltip by default;
hovering scrubs the board beside it. Mistake plies are marked with their glyph under the
axis — labelled **selectively**, never a number on every point.

The **findability line is the feature made visible**: "Maia 1300 finds it 31% of the
time" is exactly why a position was chosen to drill. The `engine-only` group is collapsed
but present — it explains what was deliberately *not* added to your queue, so the filter
feels like judgement rather than omission.

Two charts, never one: accuracy and rating are different scales, so they never share a
plot — a dual-axis chart invents correlations that are not in the data.

## Quiz & drill (`quiz.html`, `puzzles.html`)

Identical board component; the only difference is where the queue comes from. Flow is
**one retry, then teach**.

```
Attempt 1 wrong ──▶ ✗  "Not the best. One more try."   (no answer shown)
Attempt 2 wrong ──▶ ✗  reveal best move + engine line + eval swing
Correct         ──▶ ✓  line shown, --good flash behind the glyph, auto-advance after 1.2s
```

The `✓`/`✗` glyph and the word are the signal; the flash colour reinforces it and never
carries it alone (finding R37).

```
┌──────────────────────────────────────────────────────────────┐
│  Position 1 of 4        from your game vs Maia 1300          │
│   ┌────────────────────┐                                     │
│   │        ♚           │   Move 18 · White to play           │
│   │    ♟     ♟         │                                     │
│   │          ♞         │   You played Nf3 here and           │
│   │      ♗             │   lost 22% win chance.              │
│   │            ♙       │                                     │
│   │    ♔               │   Find something better.            │
│   └────────────────────┘                                     │
│                             [ Show hint ]   [ Skip ]         │
└──────────────────────────────────────────────────────────────┘
```

A retry still records FSRS `Again`, so scheduling stays honest even though the experience
is forgiving. `Show hint` names the piece to move and also forces `Again`. **Any** move within
`NEAR_MISS_WIN_PTS` (2.0 win% points) of best is accepted as correct — all of them, from
`accepted_moves_json`, not just the single runner-up (R25) — because being marked wrong for
finding an equally good move is the fastest way to lose trust in a trainer. Rating is inferred
from behaviour by the **server**, never asked as four buttons and never computed by the client
(R2):

| Behaviour | FSRS |
|---|---|
| Wrong, or hint used | `Again` |
| Correct first move, **wrong follow-up** | `Hard` (R15) |
| Correct, > 25 s | `Hard` |
| Correct, <= 25 s | `Good` |
| Correct + correct follow-up, < 6 s total, first try | `Easy` |
| Post-game quiz, or drill-ahead | **none** — `practice = 1`, no scheduling (R14/R26) |

Drill sessions run in batches of ten with a progress pip row, then a summary card
(solved, next due, streak). Every puzzle carries a back-link to the game and ply it came
from — provenance is the point.

## Games (`games.html`) and Stats (`stats.html`)

**Games** is a table (tabular figures): date, opponent, colour, result, accuracy,
puzzles generated, ELO delta. Filter row above. Rows link to their review.

**Stats** — one filter row scoping every chart below it:

| Panel | Form | Why |
|---|---|---|
| Rating over time | line, single series, no legend | trend; title names it |
| Accuracy trend | line, one series per opponent family, legend + direct end-labels | 2–3 series → categorical slots 1–3 (pre-validated all-pairs) |
| Results | W/L/D counts | three numbers, so stat tiles, not a pie |
| Mistakes by phase | horizontal bar, sequential single hue | magnitude across opening/middlegame/endgame |
| Queue health | meter (same-ramp track) | one ratio against a limit — **`due / DUE_SOFT_CAP`**, not `due / total` (R11) |
| **Mistakes retired** | stat tile: hero-adjacent value + 12-point sparkline | (R35) The design calls this "the most motivating number the system can honestly produce" and then gave it no home. It is a single cumulative count with a trend, so it is a **tile**, not a chart |
| Quality mix over time | diverging stacked bar, centred on neutral | ordered-scale share |

Marks throughout: bars <= 24px with 4px rounded data-ends, 2px lines, >= 8px end markers
with a 2px surface ring, 2px surface gaps between stacked segments (never a border drawn
around a mark), hairline solid grid. Every chart has a **table-view twin** so no value is
gated behind a tooltip. On refetch the previous render holds at reduced opacity rather
than flashing a skeleton.

## Keyboard, states, and accessibility

Shortcuts: `←/→` step moves, `f` flip board, `n` new game, `r` resign (confirm),
`Enter` accept/advance in quiz, `h` hint, `1`–`9` pick opponent in setup, `?` shortcut
overlay.

Empty states each carry one action: no games → "Play your first game"; no puzzles due →
"Nothing due — play a game or drill ahead"; analysis failed → the reason plus `Retry`
(a failed analysis must never silently swallow a game, so the row stays with a visible
`failed` state).

Accessibility: every quality tier is glyph + colour, never colour alone; the board is
keyboard-operable with square announcements; focus rings on all interactive elements;
`prefers-reduced-motion` disables piece animation and the auto-advance delay; hit targets
>= 24px including the 2px ring; charts pass contrast against `--surface-1` (validated
above) and each has a table twin.

Responsive: the layout is desktop-first for a Mac browser but collapses to a single
column under 900px, board first, rails stacking beneath — so it stays usable from a phone
on the same network.

---

# Terminal interface (`chess`)

A second client over the **same server**, not a second app. It speaks only the public
WebSocket + REST surface — no engine spawning, no SQLite access, no duplicated grading or
FSRS logic. That is the whole design constraint: the TUI can never disagree with the
browser, because it holds no state of its own.

```
   ┌─ browser  ──┐
   │             ├── WS /ws + REST /api ──▶ Node server ──▶ engines + SQLite
   └─ chess TUI ─┘
```

**Scope: play + drill + stats.** Review stays in the browser — the eval graph, the
diverging breakdown bar and the scrubbable board are genuinely better with pixels, and
reimplementing them in cells would be the one part of this that felt like a downgrade. The
TUI prints `Review in browser: http://<host>:3000/review.html?game=<id>` instead, which
kitty/iTerm2/WezTerm render as a clickable OSC-8 link.

## Launch

Declared as an npm `bin`, so `npm link` (or `npm i -g .`) puts `chess` on `$PATH`.

```
chess                          # connects to ws://localhost:3000
chess --host dragon:3000       # remote-friendly — plain WebSocket, nothing local needed
chess drill                    # jump straight into the due queue
chess stats
chess --ascii                  # letters instead of chess glyphs
chess --no-mouse  --plain      # escape hatches: no SGR mouse, 16-colour only
chess --hatch=none             # colour-only squares, no ░ texture
chess --no-sound  --no-streak  # session overrides of the stored settings (R36)
```

`--host` is the point of the pure-client design: the container runs on this Mac, and the
TUI runs over SSH from anywhere on the network with zero engine or database dependency.
Because it is a pure WebSocket client it also works through `ssh -L`.

**Which contradicted the security posture, and needed resolving rather than glossing**
(finding R7). The plan simultaneously promised `SECURITY.md`: *"binds to localhost by design"*
and a verification step *"`chess --host <mac>:3000` from another machine plays a game"*. Both
cannot be true. Resolution, in favour of the safe default:

- **`BIND_ADDR` defaults to `127.0.0.1`.** The app has **no authentication of any kind** — a
  pillar, not an oversight — so a LAN-wide bind is an unauthenticated write-capable service
  with a database and a process spawner behind it. That is not a default anyone should get by
  accident.
- **`ssh -L 3000:localhost:3000 <mac>` is the documented remote path**, and it is the one the
  verification step uses. It needs no server change, needs no new port, and is already how
  this machine is reached.
- **`BIND_ADDR=0.0.0.0` is an explicit opt-in** in `docker-compose.override.yml`, and the
  server logs `warn` at startup naming the bind address whenever it is not loopback, so an
  exposed instance is never silent. `SECURITY.md` documents the opt-in and its cost instead of
  claiming the bind is immovable.

## Library choice: `terminal-kit@3.1.4` (MIT)

Chosen after surveying the field, and this is the decision most likely to be got wrong:

| Candidate | Verdict |
|---|---|
| **terminal-kit 3.1.4** | **chosen** — `ScreenBuffer` gives per-cell 24-bit fg/bg with double-buffered diff redraw, plus `grabInput({mouse:'motion'})` for keys **and** mouse. Actively released. |
| `blessed` | dead — last publish 2015, no truecolor |
| `neo-blessed` | dead — last publish 2018 |
| `ink` | React reconciler for **flowing text**; absolute cell addressing is against its grain and it has **no mouse support at all** |
| `@opentui/core` | promising but pre-1.0, and ships prebuilt native binaries with an x64-Linux-only gap — unacceptable for an arm64-first project |

`ScreenBuffer` is the right primitive: build the whole frame off-screen, `.draw()` diffs
it, so a board redraw on every keystroke does not flicker.

## Prior art: Fritz for DOS (ChessBase, 1992–95)

Screenshots of **Fritz 2.08 and Fritz 3.00** were pulled and inspected directly. The
layout is identical across both versions, and it solved the same problem this TUI has —
a chess board under a hard rendering constraint. The shipped images are **640×480 at a
2-bit colormap: four colours total.** Four decisions are worth taking:

1. **Dark squares are a 45° diagonal hatch, not a tone.** With no palette to spend, Fritz
   separated the squares by *texture*. This is the single most useful borrowing here and it
   is adopted below — it dissolves the luminance-band problem rather than fighting it.
2. **The square under the pointer is a hollow outline box, never a fill.** The piece stays
   fully readable inside it. This independently confirms the glyph-overlay cursor decided
   above, and gives it a better shape.
3. **A permanent labelled key bar** — `Fritz=F1  Moves=F2  Board=F3  Levels=F4
   Database=F5  Options=F6` — pinned to the top line at all times. Discoverability with
   zero chrome; better than contextual hints that change under you.
4. **Board left, narrow right rail, full-width strip along the bottom.** The rail stacks
   logo, `◁ ▷` clickable move steppers, **both clocks**, an engine-memory readout, the move
   list, then an opening-code strip; the bottom strip is the engine's analysis output. My
   mockups had one clock and a contextual hint line — both are corrected below.

## Board rendering — 4×2 cells

Board is `32 × 16` cells, plus a 3-column rank gutter and a file label row: **35 × 18**.
At the standard 80×24 terminal that leaves a 45-column right rail and 6 rows of
status/input. Below 80×24 the renderer drops to **2×1 cells** (`16 × 8`) automatically and
prints a one-line note saying why.

A 4-wide × 2-tall cell cannot centre a glyph vertically, so the two rows have distinct
jobs — which turns out to be an advantage:

```
 row 0:  · ♞ ·    piece glyph (double-width) flanked by one blank column
 row 1:  ·   ·    affordance row: legal-move dot, check marker, nothing
```

### Square colour is a *texture* channel first (the Fritz borrowing)

Dark squares are filled with `░` (U+2591 light shade) in every cell the piece glyph does
not occupy; light squares are left blank. An empty dark square is eight `░`; an occupied
one is `░░` either side of the glyph plus a hatched affordance row:

```
   light, empty     dark, empty      dark, knight     light, knight
      ....             ░░░░             ░░♞░░            . ♞ .
      ....             ░░░░             ░░░░             ....
```

This matters more than it looks. **Texture and colour become orthogonal channels**, and
that changes the constraint that three earlier palettes died on:

- The checkerboard survives with **no colour at all** — so `--plain`, `--ascii`, 16-colour
  terminals, and piped/CI output all get a real board instead of a degraded one. The
  monochrome path is now the same renderer, not a fallback.
- The luminance band no longer has to seat *four* distinguishable tints. Squares carry
  their identity in texture, which frees colour to mean **state** — last move, check,
  cursor. The two base tints stay (they are validated and they look better in truecolor),
  but nothing now depends on telling them apart by colour.
- The one close pair, `dark` vs `check` at ΔE 9.7, stops mattering: a check square differs
  from a dark square by hatch presence, the `+` marker, *and* the status line.

Per the dataviz method's texture rule this is a legitimate use — it is the accessibility
channel, ordered where it needs to be, at 45°-equivalent, and it is carrying an actual
distinction rather than decorating. Fritz's `▨` hatch is approximated by `░` because a true
diagonal has no reliable single-cell glyph; `--hatch=none` turns it off for anyone who
finds it busy, falling back to colour-only.

### The Unicode glyph trap, and the fix

The obvious approach — `♔♕♖♗♘♙` for White and `♚♛♜♝♞♟` for Black — is broken:
**U+265F ♟ acquired emoji presentation in Unicode 11**, so several terminals render it
double-width while `♙` stays single-width, and the file silently shifts by a column
([microsoft/terminal#13110](https://github.com/microsoft/terminal/issues/13110)). Three
mitigations, all applied:

1. **Use only the filled set** `♚♛♜♝♞♟` (U+265A–265F) for *both* colours, distinguishing
   White from Black by **foreground colour** (`#ffffff` vs `#000000`). This is what
   `chess-tui` does. It also removes the outline glyphs' font-coverage problem, and makes
   the piece/square contrast maths above exact rather than approximate.
2. Append **VS15 `U+FE0E`** (text presentation selector) to force text rendering.
3. Reserve **two columns** per glyph unconditionally, so a terminal that renders them
   single-width still aligns — the extra column is just padding.
4. `--ascii` prints `K Q R B N P` (White uppercase, Black lowercase) for any font that
   still fails. This is also the CI-safe mode.

### Board palette — computed, not eyeballed

Piece colours are pinned at pure `#ffffff` / `#000000`, which forces an analytic
constraint: **every square colour must sit in luminance [0.10, 0.30]**, or one of the two
piece colours drops below 3:1 on it. Validated:

| Role | Hex | Y | White pc | Black pc |
|---|---|---|---|---|
| Light square | `#8f8b84` | 0.260 | 3.39:1 | 6.19:1 |
| Dark square | `#5f6166` | 0.119 | 6.20:1 | 3.39:1 |
| Last move | `#78753f` | 0.171 | 4.76:1 | 4.41:1 |
| Check | `#96564d` | 0.137 | 5.62:1 | 3.74:1 |

All four in band; **worst piece/square pair 3.39:1 (PASS)**. Square-vs-square OKLab ΔE:
light↔dark 14.7, light↔last 10.7, light↔check 13.9, dark↔last 10.2, last↔check 10.5 — all
clear. The single close pair is **dark↔check at ΔE 9.7**, already covered by the hatch and
the `+` marker above. (Three earlier candidate sets failed the band outright and were
discarded — pinning pieces to pure white/black leaves very little room.)

**Cursor and legal destinations use glyphs, not background colour** — following Fritz, and
because there is no room left in [0.10, 0.30] for two more distinguishable tints anyway:

| Affordance | Rendering |
|---|---|
| Cursor square | hollow outline: `▏` and `▕` in cols 0 and 3 of both rows, `--ink-primary` — Fritz's outline box, never a fill, so the piece stays readable |
| Legal destination | `•` on the affordance row (a capture reads as dot + piece above it) |
| Check | background tint + `+` on the affordance row + status line |
| Last move | background tint + hatch unchanged; the move list also highlights the SAN |

Because texture and colour are orthogonal, a square can be dark **and** the last move
**and** under the cursor with all three still legible: hatch, tint, outline.

### Colour capability downgrade

Read `COLORTERM`; if it is not `truecolor`/`24bit`, map every hex to the nearest ANSI-256
entry (6×6×6 cube plus the 24-step grayscale ramp, pick by smaller distance) — the same
`adapt_color()` pattern `chess-tui` uses. `--plain` forces the 16-colour path, which drops
`last move`/`check` tints to reverse-video and glyph markers only. The palette table above
is the truecolor source of truth; the downgrade is derived from it at startup, never
hand-maintained as a second table.

## Play screen

Chrome follows Fritz: a permanent key bar on the top line, board left, narrow rail right,
full-width strip along the bottom. `░` is the dark-square hatch.

```
 F1 help   F2 play   F3 drill   F4 stats   F5 flip   F10 quit
┌────────────────────────────────────┬─────────────────────────────────┐
│  8  ▏♜▕░░♞░░ ♝  ░░♛░░ ♚  ░░♝░░ ♞  │        Maia 1300  ·  ELO 1300   │
│     ▏ ▕░░░░░     ░░░░░     ░░░░░  │        ● thinking   d14  1.2M/s  │
│  7  ░░♟░░ ♟  ░░♟░░ ♟  ░░♟░░ ♟  ░░ │   ◀  ▶     ───────────────────  │
│     ░░░░░     ░░░░░     ░░░░░     │             1. e4        e5     │
│  6        ░░░░░  •  ░░░░░     ░░░ │             2. Nf3       Nc6    │
│           ░░░░░     ░░░░░     ░░░ │             3. Bb5       a6     │
│  5  ░░░░░     ░░░░░     ░░░░░     │             4. Ba4              │
│     ░░░░░     ░░░░░     ░░░░░     │   ───────────────────────────   │
│  4        ░░░░░     ░░░░░  ♟  ░░░ │   Maia 1300  ○      00:03:58    │
│           ░░░░░     ░░░░░     ░░░ │   You · White ●     00:04:12    │
│  3  ░░░░░     ░░░░░     ░░░░░     │   ───────────────────────────   │
│     ░░░░░     ░░░░░     ░░░░░     │   Think time  ▁▃▅▇▂▄     2.0s   │
│  2  ░░♙░░ ♙  ░░♙░░ ♙      ░░♙░░ ♙ │                                 │
│     ░░░░░     ░░░░░       ░░░░░   │                                 │
│  1  ░░♖░░ ♘  ░░♗░░ ♕  ░░♔░░ ♗  ░░ │                          C44    │
│     ░░░░░     ░░░░░     ░░░░░     │                                 │
│     a    b    c    d    e    f    │                                 │
├────────────────────────────────────┴─────────────────────────────────┤
│ move › Nf3▏         Nf3  Nf6  Nc3  Nh3  Nxe5      ↹ cursor  ⏎ play  │
└──────────────────────────────────────────────────────────────────────┘
```

Rail contents, Fritz's order: opponent identity and live search stats (`d14 1.2M/s` —
depth and nodes/sec are **not** eval, so they are safe to show even in a ranked game, and
they replace Fritz's memory readout as the honest "it is working" signal); clickable
`◀ ▶` move steppers; the move list; **both clocks with a filled pip marking who is on
move**; think-time sparkline; and an ECO opening code in the strip position where Fritz put
`A00_E99` (optional — needs an ECO table, so it degrades to blank).

**Input: type SAN, cursor as backup.** The bottom line is a single-line input; as you
type, legal moves matching the prefix are listed to its right and the first is
`⏎`-acceptable. Case-insensitive, `Tab` completes to the common prefix, `Esc` clears. An
unambiguous prefix (`Nf` when only `Nf3` is legal) submits on `Enter`. This is why the WS
protocol change below matters: the client cannot generate SAN without a rules engine, so
the **server sends `legalMoves` as `[{uci, san}]`** — which the web client's move list
wants anyway. The TUI ships no chess rules at all; the server stays authoritative.

Cursor mode is the backup: arrows or `hjkl` move the cursor, `Enter`/`Space` picks up a
piece (legal destinations light up with `•`), `Enter` again drops it, `Esc` cancels.
Promotion opens a four-item inline chooser (`q b n r`).

**Mouse is a free bonus.** `terminal-kit` reports SGR mouse coordinates; store the board's
`originX/originY/cellW/cellH` at render time and invert — `file = (col - originX) / 4`,
`rank = 7 - (row - originY) / 2` — so click-to-select and click-to-move work with about
fifteen lines. Guarded by `--no-mouse` for terminals that eat it or for tmux setups where
it steals text selection.

Same integrity rule as the browser: **no eval, no hint, no move quality during a ranked
game.** The `hint` message is refused by the server for ranked games, so the TUI cannot
cheat even if a future version tries.

## Drill screen

```
┌ drill · 3 of 10 ─────────────────────────────── from vs Maia 1300 ┐
│                                                                    │
│  8                ♚                    Move 18 · White to play     │
│                                                                    │
│  7        ♟       ♟                    You played Nf3 here and     │
│                                        lost 22% win chance.        │
│  6                    ♞                                            │
│                                        Find something better.      │
│  5            ♝                                                    │
│                                        ● ● ○ ○ ○ ○ ○ ○ ○ ○         │
│  4                        ♟            2 solved · 0 missed         │
│                                                                    │
│  3        ♚                                                        │
│                                                                    │
│     a   b   c   d   e   f   g   h                                  │
├────────────────────────────────────────────────────────────────────┤
│ move › ▏                               h hint   s skip   q quit    │
└────────────────────────────────────────────────────────────────────┘
```

Identical **one retry, then teach** flow as the browser, identical FSRS rating inference
(wrong-or-hint → `Again`, >25 s → `Hard`, ≤25 s → `Good`, <6 s first try → `Easy`) — but
none of it lives here, and **the TUI could not implement it even if it wanted to**: it ships
no chess rules engine and holds no eval data, so it cannot decide whether a move is correct.
It `POST`s `{move, msTaken, hintUsed, attemptNo, phase}` to `/api/puzzles/:id/attempt`
exactly as the browser does, and the *server* derives `correct` and `rating` and calls the
scheduler, returning `{correct, rating, bestMoveSan, pv, winLoss, nextDue, followupRequired}`
to render. This is finding R2 in its most concrete form: the old payload
(`{correct, rating, msTaken, move}`) was unsendable from here. A drill done in the terminal
and one done in the browser are indistinguishable in the database, and the verification list
proves it by doing one of each.

Feedback in-cell, **glyph first** (finding R37): correct → a `✓` prints on the destination
square's affordance row and the rail leads with `✓ correct`, the square tinting `--good`
behind it for 400 ms as reinforcement only; second failure → `✗` on the square you played,
the best move's from/to squares get the `last move` tint, and the rail leads with
`✗ best was Nd5 !!` plus the eval swing. The colour is never the message — a red/green flash
alone is the textbook deuteranopia failure, it is *the* moment in the app where the reader is
under time pressure and least able to compensate, and in a 16-colour or `--plain` terminal
there may be no distinguishable green at all. Same rule in the browser: the correct/incorrect
card leads with `✓`/`✗` and the word, and the flash reinforces it.

## Stats screen

Ratings and trends only — no dual-axis, no faked precision:

```
┌ stats ───────────────────────────────────── 30d | 90d | all ┐
│                                                              │
│   ELO 1247   ▲ 12 vs last                                    │
│   ▁▂▂▃▃▄▅▄▅▆▆▇█  30 days                                     │
│                                                              │
│   Rating over time                                           │
│   1250 ┤                              ▁▄█▆▇                  │
│   1200 ┤            ▂▄▅▆▇███████████████                     │
│   1150 ┤   ▁▃▅▇████                                          │
│        └──────────────────────────────────────               │
│                                                              │
│   Mistakes by phase                                          │
│   opening     ████████████████  24                           │
│   middlegame  ██████████████████████████  41                 │
│   endgame     ███████  11                                    │
│                                                              │
│   Queue    32 due of 40 comfortable  ████████████████░░░░  80%│
│            240 active · 112 retired                          │
│                                                              │
│   Results  ✓ 42 won   ✗ 31 lost   = 9 drew                   │
│                                                              │
│   Full charts: http://localhost:3000/stats.html               │
└──────────────────────────────────────────────────────────────┘
```

**The queue meter was measuring the wrong ratio** (finding R11). `32 due / 240 total = 13%`
is not a health figure — it *falls as the collection grows*, so the meter reads "healthier"
the more undrilled debt accumulates, which is exactly backwards, and a meter's whole contract
per the dataviz method is "one ratio **against a limit**". The limit is `DUE_SOFT_CAP`, so the
meter is `due / DUE_SOFT_CAP`, clamped and marked `40+` above 100% with the fill in
`--warning`. Total-active and retired counts move to a caption line, where they belong: they
are collection size, not load. The retired count is the motivating number and is deliberately
kept adjacent.

`chartscii@4.0.3` draws the bar charts and the rating column chart; `sparkly@6.0.1` draws
the sparklines. Both actively maintained; `asciichart` was rejected (unpublished since
2020). Same form rules as the web UI apply and are cheap to honour here: mistakes-by-phase
is a horizontal bar in one hue, queue health is a meter, results are three numbers not a
pie, the time-range selector is one row above everything it scopes. Values are always
printed beside the bars — a terminal has no tooltip, so the "never gate a value behind
hover" rule is satisfied by construction.

## Optional: full-resolution board in kitty

Behind `chess --graphics`. `terminal-image@5.0.1` emits the kitty graphics protocol when
supported and silently falls back to ANSI half-blocks otherwise, so one code path covers
kitty, WezTerm and everything else. Deferred to last and explicitly droppable: images are
placed at the cursor and do not participate in `ScreenBuffer`'s diff, so it needs manual
image-id placement and delete on every redraw. The 4×2 glyph board is the primary
renderer; this is a flourish, not a dependency. (Note: the machine already runs kitty with
remote control configured, so this is testable here.)

## Additions to the earlier sections

**WS protocol change** — `legalMoves` becomes `[{uci, san}]` in `game_started` and
`engine_move`. Needed by the TUI's SAN input, and used by the web move list.

**New deps** — `terminal-kit@3.1.4`, `chartscii@4.0.3`, `sparkly@6.0.1`, and
`terminal-image@5.0.1` only if `--graphics` ships.

**New files**

```
├── bin/chess.js                # #!/usr/bin/env node — arg parsing, subcommands
└── tui/
    ├── client.js               # WS + REST client; reconnect with backoff
    ├── theme.js               # validated hex table + COLORTERM downgrade + hatch mode
    ├── board.js               # 4x2 renderer, glyph/ascii modes, mouse hit-test
    ├── input.js                # SAN line editor w/ completion; cursor mode; keymap
    └── screens/{play,drill,stats}.js
```

`package.json` gains `"bin": { "chess": "./bin/chess.js" }`. Everything in `tui/` is
plain Node with no build step, matching the frontend's no-bundler choice.

---

---

# Design review — findings and resolutions

This section is the artefact of a full internal-consistency review of the plan above, run
before Phase 0 rather than discovered during implementation. It is the same exercise the SDD
case study credits with catching 22 defects before any code existed; here it found **43** —
six by running the engines, thirty-seven by reading the plan against itself.

Every finding below is **already resolved in the text above**; this is the index, so a later
reader can see what changed and why rather than re-deriving it. `initial_idea.md` carries this
section verbatim, which is the point of freezing that document: the plan's *errors* are part of
the planning record, not something to quietly overwrite.

## Engine findings — from running the binaries, not reading about them

| # | Finding | Resolution |
|---|---|---|
| **E1** | `lc0 --verbose-move-stats` **does not exist** in 0.32.1 — the flag the entire findability mechanism was specified against is rejected outright | It is the UCI option `VerboseMoveStats value true` |
| **E2** | `policyhead` mode emits **no per-move policy** — only `bestmove`. The plan had chosen it *because* it is a single policy eval, then asked it for a distribution it cannot produce | lc0 split into two roles: `policyhead` for Maia **playing**, `classic` for the **findability probe** |
| **E3** | `classic` + `VerboseMoveStats` + `go nodes 1` prints **nothing** — root children are not expanded | `go nodes 2`. `P` is a prior, so node count does not affect it |
| **E4** | The output contains an `info string node (...)` line that is **not a move** — parsing it as one corrupts the distribution | Parser discards it; surviving line count must equal the legal-move count (20 at startpos, verified) |
| **E5** | `PolicyTemperature` defaults to **1.359** and *reshapes* the printed `P` — so an inherited default was silently scaling the sole input to `FINDABILITY_MIN` | Promoted to a pinned balance parameter: `POLICY_TEMPERATURE = 1.0` for probes, lc0's default for play |
| **E6** | Two assumptions were verifiable and were verified: Stockfish 18's real range is `UCI_Elo 1320–3190`, and a Maia net **loads and moves** on lc0 0.32.1 arm64 | Roster range confirmed; the "Maia weights unexpectedly rejected" risk row struck; `ENGINE_MODE=native\|container` added, which also unblocked R5 |

## Plan findings

Severity: **⛔ blocking** (would have shipped wrong behaviour or made a stated requirement
impossible), **⚠ gap** (undefined where something downstream depends on it), **· hygiene**.

| # | Sev | Finding | Resolution |
|---|---|---|---|
| R1 | ⛔ | Classification thresholds `0.30/0.20/0.10` were **ambiguous by 2×** — the plan defined both `winningChances ∈ [-1,+1]` and `winPct ∈ [0,100]` and then stated the thresholds unitless. Read against `winningChances`, the classifier is **twice as strict as lichess**; read the other way it floods. Everything downstream (puzzle count, queue economy, all balance tuning) inherits it | One unit only: **win% POINTS**, thresholds 30/20/10, plus a regression test that `0.30` classifies as `OK` |
| R2 | ⛔ | `POST /attempt` accepted client-computed `{correct, rating}` — **unsendable from the TUI** (no rules engine, no eval), and it falsified "the server owns the thresholds", so the two clients could silently diverge | Server derives both from `{move, msTaken, hintUsed, attemptNo, phase}` and returns the verdict. Static test that the TUI computes neither |
| R3 | ⛔ | The review mockup shows `You 84% / Maia 1300 71%`, but the schema **mandated null** win% on opponent plies — the number could not be computed | Both sides graded (same pass-1 data), `move_evals.mover` added; only *puzzle generation* stays player-only |
| R4 | ⛔ | NFR arithmetic contradicted itself: 4 s/position × 81 positions = **5.4 min** vs a stated "≤ 3 min end-to-end", before passes 2 and 3 | Replaced with a budget that sums: `NFR-A1…A4`, 214 s ≈ 3.6 min, bound stated as ≤ 4 min |
| R5 | ⛔ | `tests/fixtures/engine-output/` had to hold **recorded real** UCI output, but Phase 4 precedes the Phase 8 image — nothing could record it | `ENGINE_MODE=native` + `scripts/record-fixtures.sh` records against the Homebrew binaries in Phase 4 |
| R6 | ⛔ | `offer_draw` — UCI has no draw offer, so acceptance must be synthesised from the engine's eval, and **the outcome of the offer leaks that eval**, defeating the ranked-integrity rule the design rests on | Removed. Draws by rule only |
| R7 | ⛔ | `SECURITY.md` promised a localhost bind; the verification list required `chess --host <mac>:3000` from another machine. An unauthenticated service cannot do both | `BIND_ADDR` defaults to `127.0.0.1`; `ssh -L` is the documented remote path; `0.0.0.0` is an explicit opt-in that logs `warn` |
| R8 | ⛔ | "Fail loud on a missing weight file" and "maia-2200 if present" are mutually exclusive, and a filesystem-dependent roster makes `roster: every opponent id resolves` untestable | Static roster with `optional: true`; required weights throw, optional ones log `warn` and are filtered out |
| R9 | ⛔ | Drawfish rated **2200** and opt-in-rankable — but it plays *to reach stalemate* while we score stalemate as a draw, so its rating does not describe the opponent faced, and Elo would take real noise | `opponent_elo = NULL`, `ranked` forced 0 with no override, labelled *unrated · novelty* |
| R10 | ⛔ | `OK` and `Good` both legitimately have **no chess glyph**, so they were separated by **colour alone** — exactly what the plan's own never-colour-alone rule forbids | Move list annotates only the five glyph tiers; all seven appear only in the breakdown bar, each segment directly labelled |
| R11 | ⛔ | Queue-health meter showed `due / total`, which **falls as debt grows** — it reads healthier the worse things get, and a meter's contract is a ratio against a *limit* | `due / DUE_SOFT_CAP`, `40+` above the cap; totals demoted to a caption |
| R12 | ⚠ | `NEAR_MISS_CP = 20` used centipawns for the *acceptance* gate, the same unit the plan had just abandoned for classification because it is position-dependent — at the one point where being wrong costs the most trust | `NEAR_MISS_WIN_PTS = 2.0`, derived from the win% curve's slope at equality (20cp ≈ 1.84 pts). Sub-inaccuracy tiers stay in cp, deliberately |
| R13 | ⚠ | `analysis_progress {done, total}` spans **three passes** whose totals are not known upfront, so `done/total` would jump backwards | Added `phase` + a monotone `overallPct`; test asserts monotonicity across all three |
| R14 | ⛔ | The post-game quiz was written as an FSRS review — but it happens **seconds after you were shown the eval**, so every card would measure as easier than it is and the first real interval would be inflated | `reviews.practice = 1`, `rating` NULL, no scheduler call; card created `due = tomorrow` |
| R15 | ⚠ | The follow-up requirement's FSRS rating was **undefined** — the only test said "does not infer Easy", which leaves `Hard` and `Good` both conforming | Wrong follow-up → **`Hard`** (never `Again`, never `Easy`), with the `Easy` window measured to the follow-up; missing `pv` → not asked, `NULL`, never a failure |
| R16 | ⚠ | `findability` is defined relative to "the Maia model nearest your ELO" — with none of that recorded, the review copy *"Maia 1300 finds it 31%"* has no source, and a card made at 1200 and re-seen at 1700 compares across models | `maia_model`, `policy_temperature`, `elo_at_creation` stored; dedupe recomputes only when the nearest model changed, keeping both |
| R17 | ⚠ | `select: phase is derived as opening\|middlegame\|endgame` was a **test with no rule to test** | Material-then-ply rule: endgame if non-king non-pawn material ≤ 13; else opening if `ply ≤ 20` with castling/undeveloped back rank; else middlegame |
| R18 | ⛔ | "Kill the server mid-game → **resume cleanly**" was a verification requirement, but `pgn` was written only at game end and engines die on socket close — resume was **impossible** | `games.status` + `game_moves` written as played; unfinished games end `abandoned`; `GameNotResumableError` |
| R19 | ⚠ | `termination` was an unconstrained string, so nothing stopped two clients writing `"mate"` and `"checkmate"` | Closed eight-value enum with a SQLite `CHECK`, one string-table line each |
| R20 | · | `quality.js` (tier → glyph + hex) lived in `public/js/lib/` but the API and the TUI both need it — it was going to be duplicated **three ways** | Moved to `src/shared/`, served as a static ES module; one copy for all three consumers |
| R21 | · | The string table lived only in `docs/game/voice_and_tone.md` — a docs file cannot be imported, so both clients would retype it | `src/shared/strings.json` is the table; a regression test asserts the doc agrees |
| R22 | ⚠ | `NFR-COV ≥ 90%` named no scope; the v8 default would include `public/` and `tui/`, which vitest never executes — the gate could only be met by lowering it | Declared scope table; changing the exclusion list requires a `docs(...)` commit |
| R23 | ⚠ | `test.fails` only catches **runtime** failures. A deferred test importing a not-yet-existent module fails at **collection** — the marker never runs and the whole file's real tests go unreported, so the strict-xfail guarantee was silently void | Dynamic `await import()` inside the test body; any collection error fails `make verify` regardless of markers |
| R24 | · | The board contrast numbers came from a throwaway script — the bundled chart validator has **no alpha-compositing step**, so they were unreproducible and uncheckable | `scripts/validate_board.js`, output committed and re-run in verification |
| R25 | ⛔ | `alt_good_move_uci` was **singular** while `MultiPV=3` can yield two near-misses — so a genuinely good move would be marked wrong, the exact trust failure the design calls fatal | `accepted_moves_json` holds every move within margin; the attempt check accepts any of them |
| R26 | ⚠ | Drill-ahead on an empty queue would have **rescheduled a not-due card**, pushing its next review further away as a punishment for extra work | `practice = 1`, logged, no scheduling — same path as the quiz |
| R27 | ⚠ | The streak was displayed in three places with **no definition and no storage** | `activity(day, games, reviews)`, local days with an **04:00 boundary**, streak **derived** — never an incremented counter, which drifts and cannot be recomputed after a restore |
| R28 | ⛔ | At 1200 vs `sf-max`, `expected ≈ 0.0000006` — a loss costs ~0 and a fluke win pays `+40`. A **one-way ratchet**: lose 99 of 100 and the rating still rises | Rating difference clamped to **±400** before `expected` (standard FIDE treatment) |
| R29 | ⚠ | `settings.elo` and `elo_history` were two stores for one number, updated separately | One transaction; startup asserts they agree, logs `error` and re-derives from history if not. History is authoritative |
| R30 | · | The art direction said the board is on "three of seven screens", then specified a **scrubbable board on the review page** — four. `js/lib/board.js` was scoped to "play + quiz + drill", so review's board would have been built twice | One component with a **read-only mode**; count corrected |
| R31 | ⛔ | A hint mapped to **`Hard` in one table and `Again` in three others**. Under `Hard`, a hinted card's interval keeps growing — which is how a queue fills with cards you can only solve with help | `Again`. `src/domain/review/rating.js` is the single source; the doc tables are generated from its cases |
| R32 | · | The repo is `pawnbook` but the plan said `chess-trainer` in paths, the error base class, `docs/features/`, and `service.name` | Renamed throughout: `~/code/pawnbook/`, `PawnbookError`, `docs/features/pawnbook/`, `service.name = 'pawnbook'` |
| R33 | ⛔ | `weights/` is gitignored and populated by `make setup`, so `COPY weights/` on a fresh clone copies an **empty directory** — Docker succeeds and the failure surfaces much later as a missing-file error pointing at a path that exists | `make build` fronts the build with `fetch-weights.sh`; stage 3 asserts ≥ 9 `.pb.gz` and fails with the fix in the message; a negative build test in verification |
| R34 | ⛔ | Both mockups drew a **clock** and nothing behind it existed — no column, no message, no flag-fall, no `termination` value | **Optional time control** (your decision): untimed default, `10+0 / 5+3 / 3+2`, server-authoritative via the `Clock` port, pauses on disconnect, `termination='timeout'`, `puzzles.was_timed` |
| R35 | · | *"You have retired 112 mistakes"* is called "the most motivating number the system can honestly produce" — and had **no panel anywhere** | A stat tile with a sparkline on `stats.html`, beside the queue meter |
| R36 | ⚠ | The streak is the one mechanic the plan admits is psychologically risky, and its escape hatch was `--no-streak` — a **TUI-only flag**, so it was un-disableable in the client you use most | `settings.show_streak`, honoured by both clients; the flag becomes a session override. `activity` rows still written, so it can be turned back on truthfully |
| R37 | ⛔ | Drill feedback was a **green/red flash** — colour alone, at the one moment the reader is under time pressure, and in `--plain` there may be no distinguishable green at all | `✓`/`✗` glyph and word lead; colour reinforces. Same rule in both clients |

**What the review did not change.** Three things were checked and left alone, which is worth
recording so they are not "fixed" later by someone assuming they were missed: the hybrid
engine+Maia grading (you chose it over my centipawn-only recommendation, and E1–E5 make it
*more* clearly worth the complexity, since the mechanism is now measured rather than assumed);
Node.js over Python (your call, and the standards-mapping table is the cost of it, paid once);
and **no external game import** (your call — the loop stays closed, so every puzzle traces to a
game played here, which is pillar 1 taken literally).

---

# Will it be popular? — an honest assessment

You asked whether the game design is good and whether it will be popular. Those are two
questions and they have different answers.

**The design is good, and one mechanic is genuinely novel.** The findability gate —
`P_maia(best move at your rating)` as the filter on what becomes a puzzle — is the real idea
here. Every "learn from your games" tool on the market drills your worst *engine* mistakes,
which is why they so often feel arbitrary: the engine's best move is frequently one no human
at your level would find, so the drill teaches nothing and the queue fills with noise. Filtering
by a human-behaviour model at *your* rating is a better answer than centipawn loss, it is
computable, and now — after E1–E5 — it is specified against verified engine behaviour. The
`common_trap` tag is the same idea inverted and is arguably even more valuable. I do not know
of another tool that does this, and the review page's *"Maia 1300 finds it 31% of the time"*
line makes the mechanic visible instead of hiding it behind a score.

**Popular is a different question, and the honest answer is: not as it stands, and that is
mostly by choice.** Four barriers, in descending order of severity:

1. **It requires Docker, a build, and a terminal.** The addressable audience is chess players
   who self-host, which is a very small intersection. A hosted instance would remove this
   instantly — and cannot, because the *image* is a GPL-3 combined work and because there is no
   auth model, no multi-tenancy, and one SQLite file. Those are pillar-level decisions, not
   omissions. This alone caps it at "a few hundred GitHub stars if it gets written up well".
2. **The cold start is a wall, and you declined the thing that fixes it.** No import means the
   first session is *"play a 20-minute game, wait ~4 minutes, get 3 puzzles"* — a slow first
   run for a stranger, and 30 seconds if a Lichess username were enough to seed 200 puzzles
   from real games. I raised it, you chose the closed loop, and I think the reasoning holds for
   **you**: every puzzle tracing to a game you actually played is the entire premise, and
   imported games break the provenance link that makes pillar 1 true rather than marketing. But
   it is the single largest adoption cost in the plan and it should be named as a deliberate
   trade, not left to be discovered.
3. **The improvement loop is slow and the design knows it.** Rating curves move over weeks.
   Three mechanics exist to make that legible (curve + trendline, mistakes-by-phase migrating,
   retired-puzzle count) and they are the right three, but no interface makes chess improvement
   feel fast, because it isn't.
4. **The anti-dark-pattern stance costs reach and is correct anyway.** No notifications, no
   streak guilt, no freeze economy, no leaderboards. Those are precisely the mechanics that
   drive DAU in every competitor. Removing them is the right call for a tool you are building
   for yourself, and it will measurably reduce retention against anything that keeps them.

**Where it will genuinely land.** As a personal trainer for one committed player it is better
than what is commercially available, because it is not optimising for your engagement. As an
open-source project it has one strong hook — the findability gate — and that hook is *portable*:
"filter your mistakes by whether a human at your rating could have found them" is a good blog
post and a good README paragraph independent of whether anyone installs it.

**Two cheap changes would raise the ceiling materially, and neither is in scope now.** A
`docker run` one-liner with a prebuilt image (blocked by GPL-3 on the image, not by effort),
and an optional read-only PGN import that seeds puzzles while marking them
`source = imported` so provenance stays honest and the closed loop stays the default. Both are
recorded here as future options rather than smuggled into the plan, because you decided
otherwise on the second one and I would rather the decision stay visible than get reversed by
implication.

**The one design risk I would still watch.** Position memorisation (§Three design problems) is
the real threat to validity, not popularity. The follow-up requirement and `suspect_recall` are
good mitigations, but they are untested hypotheses — the two-week playtest in the verification
list is what tells you whether drilling your own positions teaches understanding or just
recognition. If `suspect_recall` comes back high, board mirroring stops being optional.

---

## Implementation phases (TDD)

Every phase is one branch, one review unit. Within a phase the cycle is strictly
**red → green → refactor**: the test names below are written into `feature_steps.md`
*before* Phase 1 starts, and no phase is closed until its tests are green, branch coverage
is ≥ 90%, `make lint` is clean, and the spec/steps docs are updated on the same branch.

Tests for behaviour a later phase provides are committed **now** as
`test.fails('...')` — vitest asserts they *do* fail, so the day the behaviour lands the
build breaks until the marker is removed. That is the `xfail(strict=True)` property, and it
is why the deferred tests are listed in the phase that *writes* them rather than the phase
that satisfies them.

**One caveat that makes the difference between this working and quietly not working**
(finding R23): `test.fails` only catches a *runtime assertion* failure. If the deferred test
imports a module that does not exist yet, vitest fails at **collection** time — the whole file
errors, `test.fails` never runs, and the phase's own passing tests in that file are not
reported either. So a deferred test may not import anything that does not exist. The pattern
is a dynamic import inside the test body:

```js
test.fails('attempt: a correct first move still requires the follow-up', async () => {
  const { attempt } = await import('../../src/domain/puzzles/attempt.js');  // throws → fails
  expect(attempt(/* ... */).followupRequired).toBe(true);
});
```

This fails for the right reason today (the module is missing) and for the right reason
tomorrow (the assertion), with no edit in between. A deferred test written with a top-level
import is a defect, and `make verify` treats any *collection* error as a hard failure
regardless of markers — otherwise the strict-xfail guarantee is silently void.

**Coverage scope is declared, not inherited** (finding R22). `NFR-COV ≥ 90%` branch coverage
was stated without saying over what, and the default `v8` provider would include `public/` and
`tui/` — which are not exercised by vitest at all and would drag the measured figure so far
below 90% that the gate could only ever be met by lowering it. Declared explicitly in
`vitest.config.js`:

| Path | In coverage? | Why |
|---|---|---|
| `src/domain/**`, `src/adapters/**`, `src/api/**`, `src/shared/**` | **yes**, ≥ 90% branches | the gate's real subject; runs with no engine and no database |
| `src/server.js` (composition root), `src/telemetry.js` | **excluded** | wiring only, no branches worth asserting; §the standard's own carve-out for composition |
| `tui/**`, `public/**` | **excluded from the percentage**, but tested | covered by `tests/tui/` and the palette/board/copy checks, which assert *behaviour and values* rather than lines. Counting their lines would measure the wrong thing and make the number negotiable |
| `tests/**`, `scripts/**` | excluded | |

The exclusion list lives in one place and a `docs(...)` commit is required to change it — the
easiest way to fake a coverage gate is to widen the exclusions, so widening them is a reviewed
act.

### Phase 0 — Spec (no code)

Strict order, because the freeze only means something if it happens first:

0. **Prerequisite, run by you:** `! gh auth refresh -h github.com -s workflow` — without
   the `workflow` scope the Phase 1 push of `ci.yml` is rejected outright.
1. `gh repo create pawnbook --public --license mit`, topics and settings as above.
   `git init`, `master` then `development`, branch `docs/phase-0-spec`.
2. Repo baseline: `README.md` (stub is fine — real content lands in Phase 9 when there are
   screenshots), `LICENSES.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`,
   `.gitignore` (**including `weights/`**), `.gitattributes`, `.editorconfig`, issue and PR
   templates, `dependabot.yml`.
3. **`docs/initial_idea.md`** — the brief, this plan verbatim, the research findings, the
   validation runs including the failures, **the design review (E1–E6, R1–R37) with the
   defective original text preserved**, and the open questions. Committed as its own commit
   (`docs(spec): capture initial idea and planning record`) and **not touched again**.
4. **`docs/game/`** — the eight game design documents, including `art_direction.md` (with the
   board validator output pasted in) and `voice_and_tone.md` (with the string table stubbed).
   Look and feel is settled here, in the first steps, rather than per-screen in Phase 9 —
   which is how an app ends up with four blues. These come **before** the spec, because
   the spec's requirements are derived from design intent: `FINDABILITY_MIN` is a balance
   decision first and a constant second. `balance.md` opens with the tuning table and an
   empty changelog.
5. `feature_spec.md` — R, I, P, Q, N in RFC 2119 language, derived from steps 3–4. Every
   mechanic in `mechanics.md` maps to at least one FR, and every balance parameter appears
   as a named `N`-component value.
6. `feature_steps.md` — the phases and every test name below, written before any code.
7. `CLAUDE.md`, `docs/claude_code/prompts.md`.
8. **Self-conducted production readiness review of the spec** against the 8-section
   checklist, plus a diff of `feature_spec.md` against `initial_idea.md` looking for
   requirements dropped, softened, or invented in formalisation, plus a check that every
   mechanic and balance value has a home in the spec. Findings labelled `D1…Dn`, each
   resolved in the spec. **E1–E6 and R1–R37 are already closed** — this review's job is to
   find what the *formalisation* broke, plus a checklist pass confirming each prior finding
   survived the move into the spec (a resolution that exists only in the frozen plan and not
   in the living spec is itself a `D` finding).
9. Branch protection on `master` and `development` (after the first push, since protection
   needs the branch to exist).

Exit gate: the §9 completeness checklist passes. **DoD:** every FR is MUST/SHOULD/MAY;
every error named with its code and HTTP status; every NFR has a number; every requirement
in `initial_idea.md` is either in the spec or explicitly listed as out of scope with a
reason.

### Phase 1 — Scaffold, errors, config

`package.json`, `Makefile`, `vitest.config.js`, `eslint.config.js`, `errors.js`,
`config.js`, `ports/*` contracts, CI workflow. No domain logic.

```
errors: every error class extends PawnbookError
errors: ErrorCode is frozen and every class maps to exactly one code
errors: wrapping preserves cause chain
config: missing required env throws with the variable named
config: BIND_ADDR defaults to 127.0.0.1
config: a non-loopback BIND_ADDR logs a warn naming the address       (R7)
coverage: the exclusion list matches the one documented in feature_spec.md  (regression, R22)
```

**DoD:** `make verify` runs green on an empty-ish repo; CI passes; the coverage gate is
armed (it will fail if wired wrong, which is the point of arming it first).

### Phase 2 — Domain: grading and Elo (FR-GRADE, FR-ELO)

Pure functions, zero I/O. This is where the published formulas get locked down, and it is
deliberately first because it is the highest-value, lowest-dependency code in the project.

```
grade: winningChances(0) === 0
grade: winningChances is monotone increasing and clamps at ±1
grade: cp is clamped to ±1000 before conversion
grade: mate score maps to ±1000
grade: winLoss of 30 win% POINTS classifies Blunder                    (R1)
grade: winLoss of 20 win% POINTS classifies Mistake                    (R1)
grade: winLoss of 10 win% POINTS classifies Inaccuracy                 (R1)
grade: a winLoss of 0.30 (the OLD unit) classifies as OK, not Blunder  (regression, R1)
grade: cpLoss 0 classifies Best; <25 Great; <50 Good; else OK
grade: moveAccuracy returns 100 when winAfter >= winBefore
grade: moveAccuracy is clamped to [1, 100]
grade: known lichess game reproduces published per-move accuracies (fixture)
grade: losing a forced mate is a Blunder
grade: missing a forced mate below -700cp downgrades to Mistake
grade: White's first move uses the synthetic +0.15 prior eval
grade: game accuracy is the mean of harmonic and volatility-weighted means
elo: expected score is 0.5 for equal ratings
elo: hand-computed win at K=20 matches
elo: K is 40 under 15 games, 20 under 2100, else 10
elo: a draw between equal ratings leaves the rating unchanged
elo: score outside {0, 0.5, 1} throws
elo: a rating difference beyond ±400 is clamped before expected()          (R28)
elo: losing to sf-max at 1200 costs a non-trivial number of points         (R28)
elo: an opponent with a null rating cannot produce a ranked game           (R9)
phase: a queenless position on ply 28 is endgame, not middlegame           (R17)
phase: a full-material position on ply 60 is middlegame, not endgame       (R17)
phase: ply <= 20 with castling rights available is opening                 (R17)
```

### Phase 3 — Persistence (FR-STORE)

SQLite schema + `SqliteRepository` + `InMemoryRepository`, driven by **one** contract suite.

```
contract: [sqlite|memory] saving then loading a game round-trips every field
contract: [sqlite|memory] unknown game id raises GameNotFoundError naming the id
contract: [sqlite|memory] puzzle FEN is unique; re-inserting bumps times_seen
contract: [sqlite|memory] move_evals PK (game_id, ply) rejects duplicates
contract: [sqlite|memory] elo_history append is ordered by recorded_at
contract: [sqlite|memory] due-card query returns only cards with due <= clock.now()
contract: [sqlite|memory] game_moves round-trips a partial game for resume        (R18)
contract: [sqlite|memory] an elo update writes elo_history and settings.elo atomically (R29)
contract: [sqlite|memory] activity rows use a 04:00 local day boundary            (R27)
contract: [sqlite|memory] the streak is derived from activity, never stored       (R27)
sqlite: schema is idempotent — applying it twice is a no-op
sqlite: analysis_state only accepts pending|running|done|failed
sqlite: games.status only accepts in_progress|finished|abandoned                  (R18)
sqlite: termination only accepts the eight enum values                           (R19)
sqlite: startup re-derives settings.elo and logs error when it disagrees          (R29)
```

`FixedClock` is what makes the due-card test deterministic; it lands here.

### Phase 4 — Engine client (FR-ENGINE)

`UciEngineClient` over `node-uci`, plus `ScriptedEngineClient` replaying
`tests/fixtures/engine-output/`. The one phase that needs real binaries — and thanks to
`ENGINE_MODE=native` it gets them **on the host**, from Homebrew, without waiting for Phase 8's
image. `scripts/record-fixtures.sh` runs a fixed list of positions against the native
Stockfish 18 and lc0 0.32.1 and writes their raw stdout into
`tests/fixtures/engine-output/`, which is what makes "recorded real output" achievable at this
point in the sequence rather than a promise deferred past the phase that depends on it
(finding R5).

```
uci: handshake sends uci then isready and resolves on readyok
uci: handshake exceeding 10 s raises EngineTimeoutError
uci: a non-existent binary raises EngineUnavailableError naming the path
uci: info lines parse into {depth, cp, mate, bestmove, pv}
uci: cp scores are normalised to White's POV regardless of side to move
uci: VerboseMoveStats lines parse into a policy map summing to ~1.0
uci: the 'info string node' summary line is discarded from the policy map
uci: the parsed policy map size equals the legal-move count (20 at startpos)
uci: policyhead mode returns a bestmove and no policy map
uci: a missing weights file raises WeightsMissingError naming the file
uci: socket close kills the child process
uci: ENGINE_MODE=native resolves binaries to the host paths, container to /usr/local/bin
roster: a missing REQUIRED weight throws WeightsMissingError naming the file      (R8)
roster: a missing OPTIONAL weight logs warn once and drops the opponent           (R8)
pool: the analysis queue serialises jobs — never two go commands in flight
pool: spawn retries 3 times with backoff, then raises
pool: IllegalMoveError is never retried
scripted: replays fixture output identically to the parsed real output
```

### Phase 5 — Game session and WS play (FR-PLAY, FR-RANKED)

Session lifecycle, opponent roster, WS handlers, Zod validation, the error middleware.

```
session: an illegal move raises IllegalMoveError and does not advance the game
session: moving in a finished game raises GameAlreadyOverError
session: checkmate sets result and termination
session: stalemate against drawfish is scored as a draw by standard rules
session: legalMoves is returned as [{uci, san}]
session: a ranked game's hint request raises HintNotAllowedError
session: only ranked games write elo_history
session: a drawfish game is forced unranked and writes no elo_history            (R9)
session: termination is one of the eight enum values for every ending            (R19)
roster: every opponent id resolves to a binary and options
roster: an unknown opponent id is rejected before a game row is created

resume: moves are appended to game_moves as each is accepted                     (R18)
resume: resuming reconstructs the position from game_moves alone                 (R18)
resume: resuming a finished game raises GameNotResumableError                    (R18)
resume: an in_progress game never resumed is marked abandoned                    (R18)

clock: an untimed game emits no clock_update and stores NULL time_control        (R34)
clock: the mover's remainder is debited by the elapsed FixedClock time           (R34)
clock: the increment is added after the move is accepted, not before             (R34)
clock: reaching zero ends the game with termination='timeout' and the opponent wins (R34)
clock: the engine is given movetime below its own remainder so it cannot flag    (R34)
clock: the clock pauses on socket close and resumes on resume                    (R34)
clock: an invalid timeControl payload is rejected by Zod before a game exists    (R34)

ws: a malformed payload returns validation_failed without creating a game
ws: a mid-stream engine failure emits {type:'error', error_code:...}
api: GameNotFoundError maps to 404 with {error_code, message, detail}
api: HintNotAllowedError maps to 403
api: GameNotResumableError maps to 409
api: an unexpected throw maps to 500 and is logged with the error attached
```

`session: a ranked game's hint request raises HintNotAllowedError` is the single most
important test in the project — it is the mechanical enforcement of the integrity rule that
both clients depend on.

### Phase 6 — Analysis pipeline (FR-ANALYSE, NFR-PERF)

Entirely against `ScriptedEngineClient`, so it runs in CI with no engines.

```
pipeline: N moves produces N+1 position evaluations
pipeline: each move's winBefore equals the previous position's winAfter
pipeline: BOTH sides' plies are graded, mover's-POV normalised                    (R3)
pipeline: opponent_accuracy is computed from the opponent's plies only            (R3)
pipeline: puzzle candidates are drawn from the player's plies only                (R3)
pipeline: progress events are emitted monotonically to total
pipeline: progress carries phase and a monotone overallPct across all 3 passes    (R13)
pipeline: pass 2 re-runs only candidate mistakes
pipeline: MultiPV=3 records every runner-up into alt_moves_json                   (R25)
pipeline: engine failure sets analysis_state='failed' and does not throw to the caller
pipeline: analysis_state transitions pending→running→done
findability: findability is P_maia of the stockfish best move
findability: temptation is P_maia of the played move
findability: instructiveness is winLoss * findability
findability: the probe uses classic mode with VerboseMoveStats, never policyhead
findability: POLICY_TEMPERATURE is passed explicitly, never left at lc0's default
findability: the maia_model and policy_temperature used are recorded on the puzzle (R16)
findability: unparseable policy output falls back to binary 1.0/0.25 and logs a warning
```

### Phase 7 — Puzzle selection and scheduling (FR-PUZZLE, FR-DRILL)

```
select: findability >= 0.04 becomes a puzzle
select: findability < 0.04 is tagged engine_only and excluded from the queue
select: high temptation is tagged common_trap
select: puzzles are ranked by instructiveness and capped at 6 per game
select: phase is derived as opening|middlegame|endgame
select: every accepted move within NEAR_MISS_WIN_PTS is stored in accepted_moves_json (R25)
select: puzzles from a timed game are tagged was_timed                            (R34)
dedupe: a repeated FEN bumps times_seen instead of inserting
dedupe: findability is recomputed only when the nearest maia_model has changed     (R16)
dedupe: a recompute records both the old and the new maia_model                    (R16)

attempt: the server derives correct and rating from {move, msTaken, hintUsed, attemptNo} (R2)
attempt: the client cannot influence rating — a rating field in the body is rejected (R2)
attempt: ANY accepted_moves_json entry is correct, not just the single runner-up    (R25)
attempt: a move 2.0 win% points worse than best is accepted as correct             (R12)
attempt: a move 5 win% points worse than best is not accepted                      (R12)
rating: wrong or hinted infers Again
rating: correct over 25 s infers Hard
rating: correct within 25 s infers Good
rating: correct under 6 s on the first try infers Easy
rating: a retry before success still infers Again
scheduler: Again yields a nearer due date than Good
scheduler: an attempt writes a reviews row and moves fsrs_cards.due

followup: a correct first move still requires the follow-up from the stored pv
followup: a wrong follow-up after a correct first move infers Hard                 (R15)
followup: a wrong follow-up is never Again and never Easy                          (R15)
followup: a pv shorter than 2 plies asks no follow-up and writes NULL              (R15)
followup: a NULL followup_correct is not counted as a failure in stats             (R15)
followup: the Easy window is measured to the FOLLOW-UP, not to the first move      (R15)

practice: the post-game quiz writes practice=1, rating NULL, and does not schedule (R14/R26)
practice: the post-game quiz creates the card with due = tomorrow                  (R14/R26)
practice: drill-ahead on an empty queue also writes practice=1 and does not schedule (R26)
practice: suspect_recall is only evaluated on the first SPACED review, never on practice (R26)
attempt: correct under 2 s on the first spaced review sets suspect_recall
queue: a card with reps>=5, no lapses, interval>180d is graduated out of the queue
queue: a graduated card keeps its FSRS state and is counted in stats
queue: above DUE_SOFT_CAP the queue orders by instructiveness x overdue
queue: the due badge reports "40+" rather than the true count above the cap
queue: an empty queue is reported as a win state, not an error
balance: every parameter in config.js matches docs/game/balance.md   (regression)
```

The last one is the same trick as `tokens.css` ↔ `quality.js`: balance values are documented
in one place and consumed in another, so a test asserts they agree. It is what stops
`FINDABILITY_MIN` being tweaked in code while the documented rationale silently rots.

### Phase 8 — Docker build and engine acceptance

The three-stage build, `fetch-weights.sh`, `smoke.sh`. Gated by the Verification section
below, including the Drawfish identity test. First point at which real engines run.

### Phase 9 — Web UI

Pages, `tokens.css` from the validated palette, `quality.js` as the single tier source,
chart helpers with table-view twins. `validate_palette.js` output committed.

```
quality: every tier maps to exactly one glyph and one hex
quality: only the five glyph tiers are annotated in the move list          (R10)
quality: OK and Good are never distinguished by colour alone anywhere      (R10)
quality: every breakdown-bar segment carries its tier name as a label      (R10)
regression: tokens.css hex values match src/shared/quality.js exactly      (R20)
board: every square tint composites to dE >= 8 from its base square
board: every tint pair is dE >= 8 on both light and dark squares
board: the dark square clears 3:1 against surface-page and surface-1
board: no piece/square composite drops below 2.2:1
board: review's board is read-only — no drag, no click-to-move handlers    (R30)
meter: queue health is due / DUE_SOFT_CAP and reads 40+ above the cap      (R11)
stats: the retired-mistakes tile renders at zero without looking broken    (R35)
clock: an untimed game renders no clock panel at all                       (R34)
streak: settings.show_streak=0 removes the tile and the summary line       (R36)
drill: correct/incorrect feedback leads with a glyph, not a colour         (R37)
copy: every user-facing string comes from src/shared/strings.json          (R20/R21)
copy: strings.json and voice_and_tone.md agree                (regression, R21)
copy: no prose string contains an exclamation mark            (regression)
copy: every termination enum value has exactly one string      (R19)
motion: prefers-reduced-motion zeroes every duration and disables auto-advance
```

`copy: no prose string contains an exclamation mark` is the mechanical enforcement of the
voice rule — it keeps `!` and `!!` unambiguous as chess notation, which they cannot be if the
UI also shouts.

### Phase 10 — TUI

```
board: the start position renders 32 columns per rank in glyph mode
board: --ascii renders 8 single-width letters per rank
board: piece glyphs are all from U+265A-265F with VS15 appended
board: every glyph reserves 2 columns regardless of reported width
board: a dark empty square is filled with U+2591 and a light one is blank
board: --hatch=none emits no U+2591
board: mouse hit-test inverts render coordinates back to the right square
theme: --check reports every square colour in luminance [0.10, 0.30]
theme: --check reports every piece/square contrast >= 3:1
theme: no COLORTERM downgrades every hex to an ANSI-256 index
input: an unambiguous SAN prefix resolves to one legal move
input: an ambiguous prefix does not submit
input: Tab completes to the longest common prefix
input: the TUI imports no chess rules engine  (static check on the import graph)
input: the TUI computes no correctness and no FSRS rating   (static check, R2)
clock: the TUI displays the server's clock and never decides a flag-fall   (R34)
streak: --no-streak overrides settings.show_streak for the session only    (R36)
drill: feedback leads with a glyph and survives --plain and --ascii        (R37)
```

`input: the TUI imports no chess rules engine` is a structural test, not a behavioural one
— it is what stops the TUI slowly growing its own duplicate of the domain layer.

### Phase 11 — Production readiness review

The 8-section review of the **implementation**, findings labelled `A-1…A-n`, each resolved
or explicitly deferred with a reason. `implementation_plan.md` archived; `feature_spec.md`
stays living.

---

## Risks and fallbacks

| Risk | Fallback |
|---|---|
| lc0 arm64 build fails | drop to eigen-only (`-Dblas=false`); if still failing, build `v0.31.2` |
| Maia policy parsing unreliable | binary findability (Maia move == SF best ? 1.0 : 0.25) |
| Stockfish PGO build slow on arm64 | `make -j build` instead of `profile-build` |
| Analysis too slow on 40-move games | lower pass-1 depth, keep deep pass for mistakes only; already backgrounded with progress |
| ~~Maia weights unexpectedly rejected at runtime~~ | **Struck (E6).** A Maia net demonstrably loads and moves on lc0 0.32.1 arm64 on this machine — no longer a risk |
| lc0's policy output format changes on upgrade | the parser contract has a self-check (line count == legal moves, `P` sums to ~100%); on failure, degrade to binary findability and log `warn` |
| Analysis backlog after several games in a row | one serialised queue, `analysis_state` visible per game, and the result card never blocks on it — puzzles simply land later |
| Chess glyphs render double-width or missing | filled-set-only + VS15 + 2-col reservation already applied; `--ascii` is the guaranteed floor |
| Terminal is 16-colour or has no `COLORTERM` | ANSI-256 downgrade at startup; and the `░` hatch means the checkerboard needs no colour at all, so `--plain` is a real board, not a degraded one |
| `░` hatch reads as busy or clashes with a font | `--hatch=none` reverts to the two validated colour tints |
| `terminal-kit` mouse conflicts with tmux/SSH | `--no-mouse`; SAN typing is the primary input, so mouse loss costs nothing |
| kitty graphics fight `ScreenBuffer` diffing | `--graphics` is opt-in and last; the 4×2 glyph board is the primary renderer |

---

## Verification

Layered, cheapest first — engines are proven before any app code is trusted. Two rules
from the standards apply: every check below traces to a requirement ID in `feature_spec.md`
(a check that traces to nothing means either the check or the spec is wrong), and the
automated gates run before any manual check.

**0. Automated gates — `make verify`, and the same three stages in CI.**
   - `make lint` — eslint clean, zero warnings tolerated
   - `make test` — vitest green, **branch coverage ≥ 90%** over the declared scope (`NFR-COV`,
     scope table under *Implementation phases*); the build fails on the threshold, not on a
     warning
   - **no `test.fails` unexpectedly passing** — the strict-xfail equivalent; a deferred
     test that starts passing is a build failure until its marker is removed
   - **zero collection errors** — a deferred test whose top-level import does not resolve
     never runs its `test.fails`, so the marker silently guarantees nothing (R23). Any
     collection error fails `make verify` regardless of markers
   - `npm audit --audit-level=high` clean; `npm ls --all --json` archived as the dependency
     record (`pipdeptree` equivalent)
   - the **contract suite passes against both** repository implementations — this is the
     check that proves the in-memory fake has not drifted

1. **Build** — `docker compose build` completes; `docker images` shows a sane size
   (`NFR-IMG`: ≤ 500 MB). Then the **negative** build test (R33): `mv weights weights.bak &&
   docker compose build` must **fail at stage 3** with the "run make setup" message rather than
   producing a Maia-less image. Restore, rebuild, confirm green.
2. **Engine smoke tests** (`scripts/smoke.sh`, run in-container):
   - each of stockfish / lc0 / drawfish answers `uci` → `uciok` and `isready` → `readyok`
   - `file` on each binary reports `ARM aarch64`
   - Maia returns a legal move: `lc0 policyhead --weights=maia-1500.pb.gz --backend=eigen`
   - **all 10 Maia weights load** (loop the roster) — catches a truncated copy and
     confirms the 0.21-vs-0.32 format finding holds at runtime, not just on paper
   - Stockfish accepts `UCI_LimitStrength`/`UCI_Elo=1400` without error, and reports a
     real NNUE net is embedded (guards against the lfs-stub trap)
   - **Drawfish identity test** (deterministic, from its own README): position
     `4k3/4P3/8/4K3/8/8/8/8 w - - 0 1`, `go depth 6` must return `bestmove e5e6` with
     `score mate 1`. A stock Stockfish does *not* — so this proves the stalemate-as-win
     fork actually built.
3. **Unit and contract suites** — the named tests in Phases 2–7 above, all green. The
   grading and Elo suites (`domain/analysis/grade.js`, `domain/game/elo.js`) are the ones to
   check by hand against the published formulas, since everything downstream inherits their
   errors. Note these run **without engines or a database** — that is the payoff of the
   ports, and it means a formula regression is caught in seconds rather than after a build.
4. **Play** a short game vs `maia-1100` in the browser — legal move enforcement,
   promotion dialog, checkmate detection, result recorded.
   - **untimed** first: confirm no clock panel renders and `time_control_*` is `NULL`
   - then **3+2**: confirm the increment lands after each move, both clocks agree with the
     server after a deliberate 5-second tab freeze, and a **deliberate flag-fall** ends the
     game with `termination = 'timeout'` and the win to the engine
   - kill the socket mid-timed-game, reconnect: the clock **paused** and did not run down
   - a game vs `drawfish` offers no ranked toggle at all and writes no `elo_history`
5. **Analysis** — confirm `move_evals` is populated for every ply, accuracy % is
   plausible, and one classification checks out against the formula computed by hand.
6. **Quiz + puzzles** — mistakes become puzzles; solving/failing writes `reviews` and
   moves `fsrs_cards.due`; replaying the *same* opening blunder bumps `times_seen`
   instead of inserting a duplicate row.
7. **Findability filter** — verify at least one position is tagged `engine_only` and
   excluded from the queue; sanity-check that its Maia probability really is low.
8. **ELO + stats** — after several ranked games, `elo_history` matches the hand-computed
   sequence and the stats page renders curve, trend, and queue health.
9. **Persistence** — `docker compose down && up`, confirm ELO, games, and queue survive.
10. **UI checks** — re-run `validate_palette.js` against the shipped values in
    `tokens.css` (both arms `--ordinal`, badge pair all-pairs) **and the board check**
    (squares, composited tints, piece contrast) and keep both outputs in the repo; then open
    each page and eyeball what a validator cannot see: label collisions, axis bands not
    clipped by fixed card heights, board sizing at 900px and below, and — the one thing only
    an eye can judge — **staunty vs standard pieces on the real board** at 480px and 720px.
11. **Trust checks on the quiz** — confirm an equally good second-best move is accepted
    rather than marked wrong (and a *third*-best one too, if `MultiPV=3` produced one within
    margin — R25); confirm a hint forces `Again` and not `Hard` (R31); confirm the post-game
    quiz writes `practice = 1` with `rating` NULL and leaves the card due tomorrow regardless
    of whether you solved it (R14/R26); confirm a wrong follow-up after a correct first move
    yields `Hard` (R15); confirm no eval or move quality is visible anywhere during a ranked
    game.
12. **TUI** — `npm link`, then `chess`:
    - **Alignment is the make-or-break check.** Render the start position and confirm every
      file lines up in kitty, Terminal.app and (over SSH) tmux. Any drift means the glyph
      width assumption failed → `--ascii` must be alignment-perfect as the floor.
    - board palette: keep `node tui/theme.js --check` output in the repo (the band +
      contrast + ΔE run above), so a later colour tweak cannot silently break it
    - play a full game vs `maia-1100` **entirely from the terminal**; confirm SAN
      completion, an ambiguous prefix, promotion, and mouse click-to-move
    - resize below 80×24 mid-game → falls back to 2×1 cells with a note, no crash
    - `COLORTERM= chess` (unset) renders via ANSI-256; `chess --plain` renders in 16
      colours; `chess --ascii` renders letters — all three still legible
    - **monochrome check**: `chess --plain --ascii | cat` piped to a file must still show a
      correct checkerboard purely from the `░` hatch, with the cursor outline and legal-move
      dots intact. This is the Fritz test — if the board only works in colour, the texture
      channel is not doing its job. `--hatch=none` then confirms the colour-only path.
    - **cross-client integrity**: solve one drill in the terminal and one in the browser,
      then confirm both wrote to `reviews` and moved `fsrs_cards.due` identically — the
      TUI must own no scheduling logic
    - `ssh -L 3000:localhost:3000 <mac>` then `chess` from another machine plays a game with
      no local engines and **no change to `BIND_ADDR`** — the documented remote path (R7)
    - kill the server mid-game → reconnect backoff, then **resume from `game_moves`** with the
      position, move list and (if timed) the paused clocks intact (R18/R34); `q` restores the
      terminal (no leftover alternate screen, no mouse-mode escape residue)
13. **Non-functional bounds measured, not assumed** (`NFR-*`) — every number in the spec's
    `N` component gets an actual measurement recorded in the repo, because an unmeasured
    NFR is a wish:
    - the `NFR-A1…A4` budget above: pass 1 ≤ 2.0 s/position, pass 2 ≤ 6.0 s/candidate, Maia
      probe ≤ 0.5 s/candidate, and a 40-move game end-to-end ≤ 4 min — measured per stage,
      not just end-to-end, so a miss points at the stage that caused it
    - engine handshake against a deliberately hung binary times out at 10 s, not later
    - WS reconnect backoff caps at 30 s (verified by leaving the server down)
    - TUI redraw ≤ 16 ms for a full board frame
14. **Error handling and observability, exercised deliberately** — each failure mode is
    *induced*, since error paths that are never run are error paths that do not work:
    - delete a Maia weight file → `WeightsMissingError`, 404-equivalent WS rejection
      **before** a game row is created, and the file named in the message
    - `chmod -x` an engine → `EngineUnavailableError`, 3 retries with jitter visible in the
      logs, then `analysis_state='failed'` and a `Retry` action in the review UI
    - kill the analysis engine mid-pass → the game survives, the mid-stream WS error event
      arrives, and nothing is silently swallowed
    - request a hint in a ranked game from **both** clients → 403 both times
    - `OTEL_TRACE_CONSOLE=1` and analyse a game → confirm the span tree
      `analyse_game → engine_pass_1 → engine_pass_2 → maia_findability → select_puzzles`,
      that attributes are native types, and that pino records carry `trace_id`
    - grep the shipped logs for a bare `"not found"` with no identifier — must find none
15. **Spec traceability closure** — every FR/NFR in `feature_spec.md` names at least one
    test or check above, and every check names a requirement. Gaps are findings, labelled
    and resolved. This is the step that makes the spec authoritative rather than decorative.
16. **Repository hygiene** — checked at the close of Phase 1 and again before `development`
    → `master`, because a public repo makes these mistakes permanent:
    - `git log --all --numstat | grep -c '\.pb\.gz'` returns **0** — no Maia weight ever
      entered history. If one did, the fix is a rewrite, so this is checked early
    - `du -sh .git` stays small (single-digit MB); `git count-objects -vH` shows no
      surprise pack
    - the repo contains **no GPL-3 source or binaries** — engines are cloned at build time,
      never vendored; `LICENSES.md` matches what is actually present
    - `gh api /repos/JohnnyFoulds/pawnbook/branches/master/protection` returns the expected
      required checks; a direct push to `master` is rejected
    - CI green on a real PR, and the README badge points at the right workflow
    - `git log --format=%B | grep -ci 'co-authored-by: claude'` returns **0** — the
      standards' no-AI-attribution rule, verified rather than assumed
    - no `.env`, no `data/*.db`, no absolute `/Users/johannes` paths committed
17. **Playtest — balance validation** (`docs/game/playtest_log.md`). The one part of this
    that cannot be unit-tested, and the part most likely to be wrong on first attempt:
    - **20 games across the ladder**, logging puzzles/game, how many felt instructive vs
      arbitrary, and how many were tagged `engine_only`. Gate: **≥ 70% worth drilling**; if
      *no* position across 20 games is `engine_only`, the filter is not filtering and
      `FINDABILITY_MIN` is too high. **Keep the 20 untimed**, and log timed games separately:
      time pressure produces more and worse mistakes, so mixing them moves the puzzles/game
      figure without `FINDABILITY_MIN` changing, and the filter would then be tuned against a
      moving target. `puzzles.was_timed` is what makes the split possible after the fact (R34)
    - **two weeks of daily drilling** — due-count trajectory stays under `DUE_SOFT_CAP`;
      FSRS rating distribution has `Easy` between 5% and 50% (outside that, the 6 s/25 s
      thresholds are wrong); `suspect_recall` frequency low enough that position
      memorisation isn't hollowing out the drills
    - **cold-start rehearsal on a wiped database** — first-run screen, provisional rating
      label, first game vs Maia, first analysis, and a drill batch that reads sensibly at
      **n=2 puzzles**. This can only be tested honestly once, so it is done deliberately
      rather than stumbled into
    - every tuning change lands as a `docs(balance):` commit citing the log entry that
      justified it — the changelog is the evidence that balance was reasoned about rather
      than fiddled with
