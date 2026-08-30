# Design plan — auto-repertoire (archived)

**Date:** 2026-08-29  
**Status:** Descriptive provenance record — superseded by `feature_spec.md` where they differ.

This file is the plan document as it stood at Phase 17 gate. It captures the design rationale,
the prior-art survey, the Fagan-style review record, and the full schema and phase descriptions
as originally written, so the *why* behind every design decision is traceable.

**The normative artefact is `feature_spec.md`. For any conflict, the spec wins.**

---

*Contents: see `/Users/johannes/.claude/plans/i-want-us-now-witty-crab.md` — the full plan text
is maintained there and will be copied verbatim into this file at Phase 17 commit time.*

*The plan document is approximately 1,150 lines covering: Context, What the research settles,
Prior-art survey (6 subsections), Design §1–§10, Schema with 15 invariants and 6 NFR bounds,
Balance constants, SDD document set, Phases 17–26, Verification suite, Design review record
(18 defects found and closed), and Open items.*
# Auto-repertoire — a personal opening book that evolves with you

## Context

Johannes plays self-invented openings. Because he never drills them, three things go wrong:

1. **Move-order slips** — the right moves in the wrong order.
2. **Lapses** — a genuinely worse move than the one he normally plays.
3. **Drift** — no record of what "his" openings actually are, so nothing to compare a game against.

He does *not* want an engine-optimal book. His moves are deliberately a bit suboptimal to suit his
style, and that has to be preserved. But he also does not want a one-off stupid move canonised into
his repertoire.

The feature: pawnbook learns his repertoire from the games he plays in pawnbook, alerts him during
play when he leaves it, offers to take the move back, and grows line depth only where real games
have actually gone — with a soundness gate that keeps blunders out.

### The three objectives it balances

This is an **adaptive-learning** book, not a static one. Every decision it makes — admit, refuse,
promote, demote, drill — is a trade-off between three objectives, each with a concrete metric. They
genuinely conflict, and the system's job is to keep all three visible rather than collapse them into
one number. (This is Chessbook's Soundness / Learnability / Effectiveness triad, made normative.)

| Objective | Metric | Enforced by |
|---|---|---|
| **1. Keep bad moves out** | win% points lost vs engine best; absolute win% floor; cumulative line loss | the four gates (§3) — hard, non-negotiable |
| **2. Let in moves he likes and understands** | his own repeated play; refusals of the book (§9); FSRS retention on the card | candidate/confirm state machine (§2), the alert's one bit (§6), drill (§8) |
| **3. Play sound chess that leads to good outcomes** | per-line score (W/D/L vs opponent Elo), out-of-book eval trend, engine audit at depth 22 | line health report (§3), challenger promotion (§9) |

**Objective 1 is a hard veto that nothing overrides.** Within the gates, objectives 2 and 3 are
decided *automatically by the learning algorithm on accumulated evidence* — not by asking him.

This is a firm design constraint: **the only thing the system ever asks him is a decision he already
wants to make anyway** — "take that back and play my book move, or keep what I played?" Two buttons.
It never asks him to classify, tag, rate, explain or approve anything. Everything else — was that a
misclick, a lapse, an experiment, or a genuine change of mind; should the book change — is *inferred*
from data the system already has. Every automatic book change is logged with its reasoning and is
one-click reversible, but nothing ever waits on him.

Target: `~/code/pawnbook` (confirmed). Seeds come only from games played in pawnbook — no PGN
import, no hand-written lines. Live alert + takeback always; the first alert in a game flips it
unranked. Soundness gate: tolerant of style, hard-stop on blunders.

**Note on current state:** `data/chess.db` is empty (0 games). The book starts from nothing, so
the cold-start behaviour (§7) is load-bearing, not a nicety.

**Process:** full SDD, documents first — see §SDD document set. This plan is itself a deliverable and
gets committed as `docs/features/repertoire/design_plan.md` so the design rationale lives with the
feature rather than in a chat log.

---

## What the research settles

Recorded in full in a new `docs/research/auto-repertoire.md`; the design-relevant conclusions. (What
already exists in the world, and what is therefore actually novel here, is the separate prior-art
survey below — this table is about what we *borrow*, that one is about what we *claim*.)

| Source | What we take from it |
|---|---|
| Lincke, *Strategies for the Automatic Construction of Opening Books* (Computers and Games 2000) — **drop-out expansion** | Expand only lines where **your** side plays its book move and the *opponent* may deviate. Priority `−Σ errors(path) − c·depth`. We adopt both: cumulative line-error budget, and depth-aware priority. |
| Buro, *Toward Opening Book Learning* (ICCA J 22(2), 1999) | Book learning = find *reasonable alternatives* to deviate to, not just delete losers. Motivates keeping `alt` moves alongside a canonical one. |
| Hyatt, *Book Learning — a Methodology to Tune an Opening Book Automatically* (ICCA J 22(1), 1999) | **Result-driven** + **search-driven (trend)** learning: watch the eval trend for the first N moves out of book, and the game results, to judge a line. Becomes our per-line health report. |
| Hirsch, *Machine Learning in MChess Professional* (ACG9, 2001) | Add a move when the score just out of book is *not too low* **and** later score is satisfactory; delete when later score is worse. Different thresholds for add vs delete. This is exactly our admit/quarantine/refuse ladder. |
| Chessbook wiki (`publish.obsidian.md/chessbookwiki`) — **"1 in X games"** | Reach probability of a node = Π(opponent move probabilities); your own moves are probability 1 because you always play your book move. Cover every position expected at least 1-in-N games. Also: split repertoire quality into **Soundness** (engine) vs **Effectiveness** (real results) vs **Learnability** — they disagree usefully. |
| ChessAtlas *deviation detection workflow* | **Your** deviation = memory problem (drill it). **Opponent's** deviation = coverage gap (add a line). Different responses. Fix what recurs; ignore one-offs. |
| McIlroy-Young et al., Maia (KDD 2020) and *Learning Models of Individual Behavior in Chess* (arXiv 2008.10086) | A human-policy net gives a calibrated per-move probability distribution. pawnbook already probes it (`src/domain/analysis/findability.js`). |
| Lichess Win% / Accuracy (`lichess.org/page/accuracy`) | Gate on **win% points lost**, not centipawns — 300cp means nothing on its own. pawnbook already implements this (`grade.js`, `winPct`). |
| Sielecki, *My First Opening Repertoire* (New in Chess) | Build a **core repertoire** first, depth proportional to how often a line occurs, and *"after each game, compare it to your repertoire"* — the loop we are automating. |
| Nunn, *Secrets of Practical Chess* | Distinguish essential from optional knowledge when constructing a repertoire. Justifies the reach-probability frontier over a flat ply cap. |
| Colovic (3 GM methods) + Smith/Tikkanen woodpecker | Understanding before memorisation; then cycle-drill until automatic. Justifies reusing FSRS for book moves rather than inventing a new scheduler. |
| Chessdriller (OSS), Repertree, `chess-opening-tool` | Confirm the field standard: **position-keyed (transposition-aware), not line-keyed**. |

**Where we deliberately differ from the tools surveyed below:**

- **Reach probability comes from the Maia policy head, not crowd statistics.** pawnbook's opponents
  *are* Maia at a known Elo, so `p(opponent plays r | position)` is directly available and exactly
  calibrated to the pool actually played against. No Lichess crawl, no cold start on priors.
- **Expansion is encounter-driven, not search-driven.** A node enters the book only when a real game
  reached it. Reach probability is used for *prioritisation, coverage stats and gap reporting* — never
  to invent moves. This is the user's explicit requirement ("things I actually encountered").
- **Refusals are the training signal, and they cost the user nothing to produce.** No engine
  book-learning system in the literature has a human in the loop at the moment of deviation, so none
  can distinguish a memory failure from a change of mind — they infer it from results alone, over
  hundreds of games. We get one bit of ground truth per deviation ("take it back" vs "keep it"), free,
  because it is a decision he wants to make anyway. Everything richer than that one bit is inferred
  (§9), never asked.

---

## Has this been done before? — prior-art survey

Recorded in full in a new `docs/research/auto-repertoire-prior-art.md`. The short answer: **yes in
parts, no as a whole, and the missing part is missing for a structural reason rather than by
oversight.** The survey below is written so that the novelty claim can be checked rather than
believed, and so that the parts which are *not* novel are named explicitly.

### 1. Building a repertoire from your own games — thoroughly done

This is a crowded, mature space. Every tool below imports finished games and compares them to a
repertoire *after the fact*.

| Tool | What it does that overlaps with us | What it does not do |
|---|---|---|
| **chessdesk.app** (opening repertoire builder) | Closest commercial analogue. Imports ~100 of your Lichess/Chess.com games by username and *"seeds your repertoire from the openings you already play"*; shows the replies you will actually face **at your rating band**; flags "the lines your repertoire doesn't answer yet"; spaced repetition; *"check whether your real games followed your preparation."* | Reach probability from Lichess crowd statistics, not the opponent's own policy. Import is a one-off seed, not a continuous learning loop. Post-hoc only. No soundness gate. No record of deliberate deviation. |
| **Chessbook** | Soundness / Effectiveness / Learnability triad; "1 in X games" reach probability; recommended-move ordering. We adopt all three (§3, §4). | Repertoire is authored by the user; the engine and crowd stats advise. No learning from your play. |
| **ChessAtlas** | Deviation-detection workflow over imported games; the your-deviation-vs-opponent-deviation split we adopt in §5. | Post-hoc report. No book mutation. |
| **OpenBook Chess** | Free, Lichess-login; explorer at your rating band; "Find gaps", "Find weak moves", **"Review games"**; drip-feeds new lines into practice rotation; even has an eval-bar-off setting so the bar does not spoil a prepared trap. | Build-then-drill. Games are reviewed, not learned from. |
| **Chess Position Trainer** (c. 2010, still cited) | **"Run games against Repertoire"** — *"Learn from every game you play (including online blitz), because the key information is no longer more than one click away."* The idea of closing the game→repertoire loop is at least fifteen years old. | Manual, one click at a time, after the game. The user decides everything. |
| **Chessdriller** (OSS), **Repertree**, **chess-opening-tool**, **RecallChess**, **Openings Lab**, **Chessalyz**, **Chess Nexus**, **Listudy**, **Chessmadra**, Chessable/ChessTempo/Bookup | Confirm the field standard: position-keyed (transposition-aware) storage, spaced repetition over book moves, post-game preparation checks. | Same shape: author or import a book, drill it, review games afterwards. |
| **Lichess itself** | Opening explorer at rating bands; studies; a long-standing forum feature request for a repertoire editor asking for exactly the wrong half — *"we could see immediately where we went out of preparation … **after the game**."* | Even the *wished-for* feature on the largest chess site is post-game. |

**Conclusion:** post-hoc repertoire building from your own games is not novel and we should not claim
it. `chessdesk.app` in particular does the seeding-plus-gap-report part well, and our §4 coverage/gap
report is functionally a re-implementation of it on a different probability source.

### 2. Alerting *during* the game — this does not exist, and there is a reason

Searches specifically for in-game repertoire alerting return only two categories, and neither is
what we are building:

- **Engine-overlay cheating extensions** (ChessSolve, Chessist, Chess Assist, Chess Pro and similar).
  These do show a move suggestion during a live game — which is precisely why they are banned.
- **Chess.com and Lichess fair-play rules**, which prohibit any third-party assistance during a rated
  live game. This is not a gap in the market; it is a prohibition. And on chess.com,
  *"takebacks are not available in Live Chess"* — so the takeback half is impossible there even if the
  alert were permitted.

The structural point: **every tool in §1 runs on a platform it does not own.** It can only ever see
the game as a finished PGN. pawnbook owns its own game loop, against Maia bots, on the user's own
machine, and can flip a game to unranked the moment it intervenes — so it can do legitimately, and
without any fair-play question, the one thing none of them can. The absence of this feature elsewhere
is explained by platform ownership and rules, not by the idea being bad or already tried.

**The closest genuine prior art for the interaction is Lucas Chess's "tutor"** (open source, offline,
plays against UCI engines): when enabled it interrupts a game against an engine, shows the tutor's
suggested move beside the move you just played, and lets you retake. That is the same interaction
pattern — intervene at the moment of the mistake, offer the alternative, allow a retake — and it must
be credited rather than reinvented. Three differences matter:

1. Its reference move is **the engine's**, which is exactly what the user rejected: he wants his own
   deliberately-suboptimal moves preserved, not corrected toward the engine.
2. It has no memory. Declining the tutor is not recorded, so nothing is learned from it.
3. It never changes anything. There is no book that adapts.

So: intervene-and-retake exists; **intervene against a book learned from your own play, and treat
your refusal as training data, does not.**

### 3. Learning a book from played games — done for engines, not for people

| Source | Status as prior art |
|---|---|
| Lincke, *Strategies for the Automatic Construction of Opening Books* (Computers and Games 2000/LNCS 2001) | Drop-out expansion and `Σ errors(path)` priority. **Directly borrowed** (§3, §4). |
| Hyatt, *Book Learning* (ICGA J 22(1), 1999); Buro, *Toward Opening Book Learning* (ICCA J 22(2), 1999); Hirsch, *Machine Learning in MChess Professional* (ACG9, 2001) | Result-driven and search-driven book learning, add/delete asymmetry, "reasonable alternatives". **Directly borrowed** (§3, §9). |
| Donkers et al., opponent-model search (*Nosce hostem*, 2003) | Books tuned against a modelled opponent. Our reach probability is the same idea with a modern policy net. |
| Silver et al., AlphaZero (Science 2018) and successors | Self-play book construction. Opposite of our requirement: it converges on the strongest moves, we must preserve the user's weaker ones. |

Every one of these learns a book to make **the program** stronger, from **its own** games, with **no
human in the loop at the moment of deviation**. That last clause is the whole difference. These systems
cannot distinguish "I forgot my move" from "I have changed my mind about that move", because they have
only results to infer from — the distinction does not even exist for them. We get it as one bit, free,
per deviation.

### 4. Human chess behaviour and personalisation — adjacent, not overlapping

| Source | Relevance |
|---|---|
| McIlroy-Young et al., *Aligning Superhuman AI with Human Behavior* (Maia, KDD 2020) and *Learning Models of Individual Behavior in Chess* (KDD 2022 / arXiv 2008.10086) | The calibrated human-policy machinery we use for reach probability, and the closest thing in the literature to a *personal* chess model. But these model move choice; they do not build, evaluate or maintain a repertoire, and there is no intervention. |
| Chassy & Gobet, *Measuring Chess Experts' Single-Use Sequence Knowledge* (PLoS ONE 2011) — departure from theoretical openings | The one empirical study on players leaving known opening theory. Descriptive, over master databases; no per-player instrument. |
| Regan & Haworth, intrinsic performance ratings (AAAI 2011); Chessbase/Lichess accuracy models | The win%-loss scale our gates use (§3). Not repertoire work. |
| Gobet & Simon (1996); Chase & Simon (1973); Charness et al. (2005) on deliberate practice in chess; Einstellung-effect work (2007) | Expertise background for RQ4 and for the "understanding before memorisation" stance. |
| *Comparing Typical Opening Move Choices Made by Humans and Chess Engines* (2006) | Human/engine opening divergence, aggregate — the phenomenon our style-tolerant gate exists to accommodate, measured across players rather than within one. |
| Chess intelligent-tutoring-system literature | **Confined to endgames and to Chinese chess.** Repeated searches surface no opening-repertoire ITS at all. |

Searches for a personalised opening-repertoire recommender, for repertoire optimisation as a formal
problem, and for interactive chess error-correction feedback returned **nothing on topic** across
arXiv, OpenAlex and general web search. That null result is itself a finding and is recorded as such,
with the queries listed, so it can be re-run and contradicted later.

### 5. What is genuinely novel, stated narrowly enough to defend

1. **Repertoire deviation detected and resolved *in the position*, against a book learned from the
   player's own games** — combining Lucas Chess's intervene-and-retake with chessdesk-style learned
   books, which no tool does, and which platform rules prevent third-party tools from doing at all.
2. **The refusal as a labelled datum.** A declined takeback is a conscious, timestamped, in-position
   statement that the book move is no longer wanted. No chess dataset contains this, and no book-learning
   system — engine or human-facing — has a mechanism to collect it.
3. **Deliberately style-tolerant admission with a hard blunder floor** (§3), i.e. optimising for the
   player's own outcomes rather than engine agreement, with rule 5 of §9 promoting a move the engine
   dislikes when the results support it. Every tool in §1 treats engine agreement as the objective.
4. **Reach probability from the opponent's actual policy.** Because the opponents *are* Maia at a known
   Elo, `p(reply | position)` is exact rather than estimated from a crowd of different players — which
   also makes RQ5 a clean calibration study rather than an n-of-1 anecdote.
5. **Zero curation cost.** Confirmation is repetition and promotion is automatic within the gates, so the
   book forms with no approval queue, no tagging and no classification (§7, §9). The tools in §1 all
   require the user to author or approve the book.

### 6. What is *not* novel, and must not be claimed

Position/EPD keying; spaced repetition of opening moves; seeding a book from your own games; coverage
and gap reports at your rating band; "1 in X games" reach probability; the Soundness/Effectiveness/
Learnability split; result-driven and search-driven book learning; drop-out expansion; win%-based move
grading; intervening during a game against a bot and offering a retake. **All of these are prior art
and are cited as such.** The contribution is the specific combination in §5 and the instrument it
yields (§10) — not any single mechanism.

---

## Design

### 1. Position-keyed DAG, not a line tree

Nodes are keyed by **EPD** (first four FEN fields) — the convention already established for
`calibration/opening-elo-book.json` (`docs/research/opening-elo-book.md` § Position key). This makes
transpositions free: reaching a known position by a different move order is *not* a deviation, which
disposes of half of the user's move-order problem with zero extra logic.

A node also stores one representative full FEN (EPD lacks the halfmove/fullmove counters that
`chess.js` needs to construct a board).

### 2. Per-node move roles — the state machine

A node holds a *set* of the user's own moves, each with a role:

| Role | Meaning | Alerts if played? |
|---|---|---|
| `canonical` | the move he normally plays here | no |
| `alt` | a second move he genuinely also plays | no |
| `candidate` | seen once; not yet part of the book | no (invisible to the coach) |
| `challenger` | he was alerted here and **deliberately refused the takeback** — an open contest against the incumbent (§9) | no |
| `quarantined` | gate 1 puts it in `[10, 20)` win% pts lost; accepted (silent) but may never be `canonical` | no |
| `refused` | ≥20 win% pts lost, or fails a hard gate | **yes, strongly** |
| `retired` | was canonical, superseded | yes (as a lapse) |

Exactly one role per `(epd, side, move_uci)` — the role column is single-valued, so a move is never
both `challenger` and `alt`. The coach's **accepted set** at a node is
`{canonical, alt, challenger, quarantined}`; the **alerting set** is `{refused, retired}`; `candidate`
is invisible. That one definition, not a list of special cases, is what makes §5 and §9 rule 8 agree.

Transitions:

- New move observed → `candidate` (`observations = 1`). **A single move never enters the book.** This
  is what stops one stupid move hijacking the repertoire.
- `candidate` → `canonical`/`alt`/`quarantined` automatically when `observations ≥ REP_CONFIRM_OBS` (2)
  **and** the gates pass. No confirmation step: playing a move twice *is* the confirmation.
- **Only self-directed observations count** toward `observations` and toward the vote. An observation
  with `source = 'coach_corrected'` — he accepted the takeback, so the *book* chose the move, not him —
  is recorded for the audit trail and for RQ1, but is **excluded from confirmation counts and from the
  vote**. Without this exclusion the coach reinforces its own book every time it is obeyed: the
  incumbent's evidence grows purely because it is the incumbent, the vote freezes, and RQ2/RQ3 measure
  the coach rather than the player. This is the single most important line in §2.
- Canonical is chosen per node by a **recency-weighted vote** (`exp(-ln2 · ageDays / halflife)`), tie-broken
  by lower mean win% loss, then by results score. So an 8-observation established move still beats a
  freshly-repeated weak one, but the book genuinely follows him as his play changes.
- **Precedence between the two writers of `canonical`.** The vote (§2) and challenge resolution (§9)
  both set this field, so the rule is explicit: **while a challenge is open at a node the vote is
  suspended there** — the challenge owns the node. Resolving a challenge writes `canonical` directly and
  stamps `vote_frozen_until_encounter` on the node so the vote cannot immediately undo it (see
  `REP_REVERSAL_SUPPRESS_ENCOUNTERS`). Outside that window the vote governs. Without this, a promotion
  and the next vote pass can fight and the book oscillates.
- **Genuine alternation is not a contest.** If two moves both clear the gates and each holds ≥
  `REP_ALT_ALTERNATION_MIN` (3) self-directed observations inside one recency half-life, they settle as
  `canonical` + `alt` and *no* challenge is opened or reopened between them. He plays both on purpose;
  the book should hold both, not flip between them every few games.
- Demotion: a `canonical` move drops to `retired` when a rival move overtakes it on the weighted vote
  *and* passes the gate, or when the depth-22 audit reveals it fails a hard gate.
- **Quarantine has an exit.** A `quarantined` move is re-audited on each subsequent encounter at the
  node. A clean audit (`< REP_ADMIT_WIN_PTS`) moves it to `alt`; a worse one (`≥ REP_QUARANTINE_WIN_PTS`)
  moves it to `refused`. It is never `best_move_uci` on a drill card. Without an exit path, quarantine
  is a permanent limbo and the role is meaningless.
- **A node with no admissible move is silent.** If every move at a node is `refused`/`retired` and
  nothing is `canonical`, there is no book move to offer, so the coach MUST NOT alert there — an alert
  whose "Play book move" button has nothing to play is a dead end. Such nodes are reported in the gap
  list instead. This is reachable: a re-audit can retire the only canonical move a node had.

### 3. The soundness gate — four independent checks

Reuses the existing win%-points scale from `src/shared/balance.js`. All four inputs are already
persisted per ply in `move_evals` by the existing pass-1 — note the actual column names:
`win_before`, `win_after`, `cp_loss`, **`win_loss_pts`** (not `win_loss`), `classification`,
`best_move_uci` — so **evaluating the gates needs no engine work at all.** (The only engine calls the
feature ever adds are the bounded promotion audit and the challenge A/B below; the earlier claim that
the post-game update is engine-free applies to the *gate evaluation*, not to those two.)

`win_before`/`win_after` are stored from the **mover's point of view** (`src/domain/analysis/grade.js`),
so "his win% after his move" is read directly with no perspective flip. Every threshold below is in
win% points on that scale.

1. **Per-move loss** — win% lost vs the engine's best move. One boundary convention, used everywhere:
   `loss < 10` admit, `10 ≤ loss < 20` quarantine, `loss ≥ 20` refuse. (Mirrors `INACCURACY_WIN_PTS = 10`
   / `MISTAKE_WIN_PTS = 20`, both confirmed present in `balance.js`.) The half-open form matters — the
   earlier "`10–20` quarantine, `≥20` refuse" wording double-claimed exactly 20.
2. **Absolute floor** — refuse if `win_after` leaves him below `REP_MIN_ABS_WIN_PCT` (35). MChess's
   "score just out of book must not be too low". **Applied relative to what is achievable at that node:**
   if even the engine's best move cannot reach 35, the floor is skipped and only gate 1 applies. Otherwise
   the floor punishes him for damage done three plies earlier rather than for the decision in front of
   him, and would refuse every move at the node — including the best one — leaving a node that can never
   hold a book move.
3. **Cumulative line budget** — own-move win% loss accumulated along the line must stay
   `< REP_LINE_BUDGET_WIN_PTS` (20), counting the move being admitted. *This is the check that matters
   most*: it is what stops "each move only 8 points worse" compounding into a lost position ten plies
   down. Straight from Lincke's `Σ errors(path)`.

   **A DAG has no single path to a node, so "the line" must be defined.** `rep_nodes.line_loss` is the
   **minimum** cumulative own-move loss over all *observed book paths* from the initial position to that
   node — i.e. a node is admissible if *some* sound book line reaches it. Minimum, not the played path,
   because a node reached once via a sloppy move order should not be permanently poisoned; and not the
   maximum, because that would make transpositions harmful, defeating §1. It is recomputed whenever an
   edge or a move's loss changes, which is why it lives in the rebuildable projection rather than being
   accumulated incrementally.
4. **Tactical safety** — refuse anything that walks into a forced mate. Note that
   `classification`-based refusal of blunders and mistakes is *already implied by gate 1*, since
   `MISTAKE_WIN_PTS` is exactly the 20-point refuse threshold; the forced-mate case is the only thing
   this gate adds that gate 1 does not.

Promotion runs a **depth-22 MultiPV-3 audit** (same settings as analysis pass 2) before a move becomes
`canonical` — bounded, only on promotion candidates. Every audit is written to the append-only
`rep_audits` table with its provenance, so it is a recorded measurement rather than a transient value
(see Schema).

Separately, and *reporting only*: a per-line **health report** in Hyatt's spirit — games played,
score, mean own line loss, and the eval trend for the first plies out of book. A badly-scoring line is
information, not an instruction: the system will not delete or rewrite a whole line on results alone,
because a line is not a single decision and there is no well-defined replacement to swap in. Book
changes only ever happen move-by-move through the gates and the challenge rules.

### 4. Depth grows by encounter, prioritised by reach

Reach probability of a node = Π over the *opponent-to-move* positions on the path of
`maiaPolicy(reply)`, using the Maia weights nearest his Elo (`nearestMaiaModel` +
`getMaiaAnalysisWeights`, both already in the codebase). Displayed as Chessbook's **"1 in X games"**.

Used for:
- **Coverage %** — expected fraction of his own moves within the first `REP_PLY_MAX` plies of the next
  game that will find a `canonical` move waiting, i.e. `Σ reach(n) over covered nodes / Σ reach(n) over
  all nodes at that depth`. Stated that precisely because "coverage" is otherwise the kind of number
  that silently changes definition between the report, the UI and the paper. Reported alongside
  **expected in-book depth** (the expected ply at which the next game leaves the book), which is the
  figure that actually tracks the "slowly increasing depth" the feature exists to deliver.
- **Gap report** — opponent replies with high policy probability at book nodes he has *never faced*:
  "expect 5…Bf5, 1 in 12 games; you have no line here." Reporting only; no move is invented for him.
- **Drill order** — due cards sorted by reach (Chessbook's "Recommended moves").
- **Frontier definition** — a node is "worth covering" at `reach ≥ 1/REP_COVERAGE_GOAL`.

Computed lazily in the background after a game and cached per (EPD, model) in `rep_policy`. **Never
on the live path.**

### 5. Deviation classification

`src/domain/repertoire/deviation.js` — pure, given the node, the played move, and the book.
**The table is evaluated top to bottom and the first matching row wins** — several rows can match the
same move (a move can be in the accepted set *and* transpose into another book node), so the order is
part of the specification, not an implementation detail:

| # | Verdict | Condition | Live behaviour |
|---|---|---|---|
| 1 | `refused_repeat` | played move's role is `refused` **and** the node has a `canonical` move to offer | strong alert, with the win% cost |
| 2 | `in_book_canonical` / `in_book_alt` | played move is in the node's accepted set (`canonical`, `alt`, `challenger`, `quarantined` — §2) | silent |
| 3 | `transposition` | resulting EPD is already a book node | silent; record the new edge |
| 4 | `new_territory` | node absent, or node has no `canonical` move to offer | silent; record an observation |
| 5 | `order_slip` | played move is `canonical`/`alt` at a node **reachable from here within the book**, and this node's canonical move is still legal after it | gentle alert: "you usually play X first here" |
| 6 | `lapse` | novel move at a node whose drill card has review history | alert: memory failure |
| 7 | `novelty` | novel move at a node with no drill history | alert: is this your new move? |

`refused_repeat` is deliberately first: a refused move must alert even if it happens to transpose
somewhere known. But it carries the has-a-canonical-move condition *in the row itself*, because being
first means it cannot rely on falling through to row 4 for that check — a refused move at a node whose
only canonical move was retired would otherwise raise an alert whose "Play book move" button has
nothing to play. When the condition fails it falls through and classifies as `new_territory`, silent.
Rows 5–7 need no such condition: `new_territory` sits above them, so **a node with no `canonical` move
cannot reach them** (§2) — that ordering is what enforces it, rather than a special case inside each row.

`order_slip` is scoped to **book-reachable** nodes, not "one of his book moves anywhere". Moves like
`Nf3` are canonical at dozens of unrelated nodes, so an unscoped test fires constantly and the gentlest
alert becomes the noisiest one. Reachability is computed over the existing book DAG, bounded by
`REP_PLY_MAX`.

`order_slip` and `lapse`/`novelty` deliberately get different copy — the first is a *sequencing*
problem, the second a *memory or repertoire* problem, exactly the split the ChessAtlas workflow
insists on. **`lapse` is unreachable until Phase 23**, because it depends on drill-card history that
does not exist until opening cards do; until then every such deviation classifies as `novelty` and the
copy degrades gracefully. Worth stating so the Phase 21 tests do not assert a branch that cannot fire.

### 6. Live coach — pre-commit hold, not post-commit undo

The move is checked **before** `session.applyMove`, and held rather than applied. From the board it
looks and feels like a takeback (the piece snaps back), but it avoids rolling back the clock, the
persisted `game_moves` row, the queued pre-eval, and the engine turn. This is a deliberate deviation
from a literal takeback and should be recorded as such in the spec.

`handleMove` currently receives `{ gameRepo, settingsRepo, sessions }` (`src/api/ws/handlers.js:137`),
so Phase 21 adds `repertoireRepo` to that injected dependency object — the handler must not reach for a
module-level singleton, or the contract tests and the in-memory adapter stop being able to exercise it.

Flow:
1. Client sends `move` → server classifies against the book (**pure DB reads, no engine call**).
2. Off-book and alerts remain in budget → reply `repertoire_alert`, hold the move, freeze client input.
   **His clock is paused for the duration of the hold** and resumes when the choice arrives. The coach
   must not be able to cost him time; the game is unranked from this point anyway, so pausing is free.
3. First alert in the game → set `ranked = 0`, persist, send `ranked_changed { reason: 'repertoire_coach' }`.
4. Client replies `repertoire_choice { decision }` — **exactly two values, no other fields:**
   - `correct` → server applies the **book** move instead. Recorded as an observation with
     `source = 'coach_corrected'`, which is evidence *for* the incumbent in the challenge sense but is
     **excluded from confirmation counts and from the vote** (§2).
   - `keep` → server applies his move. Recorded as a **refusal**, which opens a challenge (§9).

   No reason tag, no free text, no "should this go in the book?" question. One bit, and it is a bit he
   wanted to express anyway.
5. Guards:
   - `REP_ALERTS_PER_GAME_MAX` (3) per game. **A deviation past the budget is not silently dropped**: it
     is still recorded as an observation and as a `rep_deviations` row with
     `resolution = 'post_game'`, it just does not interrupt him. It opens no challenge, because no
     conscious decision was taken.
   - Only within `REP_PLY_MAX`, and only at nodes that have a `canonical` move to offer (§2).
   - **A 60 s timeout applies his move but is emphatically NOT a refusal.** It records
     `resolution = 'alerted_timeout'` and **opens no challenge**. He walked away from the keyboard; that
     is not a judgement about the book move. Conflating the two would poison the exact signal the whole
     feature rests on — the one bit of ground truth in §9 — with absence-of-input, and it is the easiest
     way to silently destroy the novelty claim in §5 of the prior-art survey.
   - Resign/disconnect clears the pending move; same treatment as the timeout.
6. The coach stays **silent** until the book has `REP_BOOTSTRAP_CONFIRMED_MIN` (20) confirmed nodes.
7. **Per-game coach toggle.** A game may be started with the coach off, giving a clean ranked game.
   This is a real requirement (see Open items) so it needs a real home: a `games.coach_enabled` column
   defaulted to 1, set at game creation, and read by the live check. Not a client-side preference —
   the analyses in §10 must be able to tell a game where the coach was silent because it was disabled
   from one where it was silent because he stayed in book.

### 7. Bootstrap — silent, then it wakes up

With an empty database there is nothing to alert on, and the user rejected hand-written seed lines.
So the bootstrap path is entirely passive: play games → every own opening move becomes a `candidate`
→ the second time he plays the same move in the same position it confirms itself. Since openings
repeat by definition, that is roughly two or three games per line, with **nothing asked of him at
all**.

After each game a panel *reports* what happened — "3 positions confirmed into your book, 5 new
candidates" — and `/repertoire` shows the same as a feed. This is a notification with a reverse
button, **not an approval queue**; the book does not wait for it to be read.

The coach stays silent until the book has `REP_BOOTSTRAP_CONFIRMED_MIN` (20) confirmed nodes, so it
never nags during the period when it does not yet know anything.

Candidates expire, which is how one-off moves and misclicks disappear without anyone having to label
them — but the horizon is counted in **encounters at that node**, not in games played
(`REP_CANDIDATE_TTL_ENCOUNTERS`, 8). Counting global games was a bug: a node reached once every twelve
games would have its candidate expire before it could ever be seen a second time, so the rarer half of
the repertoire could never confirm — precisely the deep, infrequent lines the feature is supposed to
grow into. The cost of encounter-counting is that a misclick at a very rare node lingers as a
`candidate` more or less forever. That is harmless: candidates are invisible to the coach, never
drilled, and never promoted.

### 8. Drill reuses FSRS via `puzzles.kind`

Book moves become spaced-repetition cards by inserting `kind = 'opening'` rows into the existing
`puzzles` table. `best_move_uci` = the canonical move; `accepted_moves_json` = **canonical + alts +
any open challenger**, and *not* quarantined moves (invariant 2). Including the challenger matters:
while the system is deciding whether to adopt a move, marking him wrong for playing it would both
contradict §9 rule 8's promise that the node goes quiet and corrupt the drill signal RQ4 depends on.
The review row records which move he actually gave, so "he answered with the challenger" stays
distinguishable from "he answered with the incumbent" in the data even though both are graded correct.

Everything downstream — `fsrs_cards`, `reviews`, the review queue, the drill screens, stats — then works
unchanged. Requires one migration: `puzzles.fen` is currently `TEXT NOT NULL UNIQUE` (confirmed at
`src/adapters/sqlite/schema.js:132`), which must become `UNIQUE(fen, kind)`; done with the table-rebuild
pattern already used for `move_evals` in the same file.

`findability` is meaningless for opening cards, so they must be exempted from the
`FINDABILITY_MIN` filter — audit `src/domain/puzzles/select.js`, `src/domain/review/queue.js` and
`src/domain/review/rating.js` for that assumption.

### 9. Refusal points and challenger promotion — the adaptive core

**Every alert he refuses is recorded as a challenge, permanently, with full context.** These are the
highest-value rows in the whole database: unlike an ordinary observation, a refusal is a *conscious,
deliberate, in-the-moment judgement* that the book move is no longer the move he wants. That is
exactly the label a supervised system would pay for, and he generates it for free by playing.

A **challenge** is a head-to-head contest between the incumbent canonical move and the challenger at
one node. It is opened on refusal and resolves automatically once the evidence is decisive. Recorded
at open time, all of it already available — nothing asked of him:

- node (EPD, side, ply, representative FEN), incumbent move, challenger move
- the incumbent's stats *as of that moment* — observations, mean own win% loss, W/D/L, FSRS card
  state — so the comparison is never contaminated by later data
- `move_ms_taken` (how long he thought before playing the deviating move, from `game_moves.ms_taken`,
  already recorded) and `decision_ms_taken` (how long he took to answer the alert, which is new and must
  be measured by the handler). These are two different quantities and the earlier single `ms_taken`
  column conflated them — the first is the think-time signal, the second is a hesitation signal.
- the game and ply, so the eval trend and the result can be joined afterwards

**Evidence accrues from plays, not from alerts.** This is the correction that makes the rules below
work at all. Rule 8 silences the node while a challenge is open, so a *second* refusal at that node can
never happen — the coach will not alert there again. Any rule phrased as "refusals ≥ 2" would therefore
be unreachable, including what was meant to be the common path. So the counter is
**`challenger_plays`** — the opening refusal plus every later *unprompted* play of the challenger at that
node — and its mirror is `incumbent_plays`. That is also the better signal: an unprompted repeat with no
alert to react to is cleaner evidence of preference than a second button press would have been, and it
makes rules 3 and 6 exactly symmetric.

**What a refusal meant is inferred, never asked.** The four interpretations, and what distinguishes
them in data:

| Interpretation | Inferred from |
|---|---|
| **Misclick / mis-slip** | never repeated → the candidate expires at `REP_CANDIDATE_TTL_ENCOUNTERS` and the challenge closes `abandoned`. Corroborated by a very short `move_ms_taken` relative to his own distribution at that ply. **A single refusal never changes the book, so a misclick needs no special handling at all** — it simply fails to accumulate evidence. This is why no "misclick" button is needed. |
| **Experiment** | one play, long think time, no repetition yet → challenge stays `open`, book unchanged, node goes quiet. |
| **Genuine change of mind** | he plays the challenger again, unprompted, at the same node (`challenger_plays ≥ 2`) → the strongest single predictor, and it is free. |
| **Lapse he later regrets** | he refuses once, then in a later game plays the *incumbent* at the same node without prompting (`incumbent_plays ≥ 1` after the open) → challenge closes in the incumbent's favour automatically. |

Then three independent signals accumulate — deliberately mirroring the objectives:

| Signal | How it is measured | Counterfactual-safe? |
|---|---|---|
| **Engine** | depth-22 MultiPV-3 audit of both moves in the *same* position: `winPct(challenger) − winPct(incumbent)`, in win% points, **positive = challenger better** | **yes** — a direct A/B in an identical position |
| **Trend** (Hyatt) | own win% at +2, +4, +6 plies *forward* of the node, averaged over each move's games; is the position getting better or worse a few moves later? | partly — same node, different continuations |
| **Result** | Elo-adjusted performance: `score − expected`, where `score ∈ {1, 0.5, 0}` and `expected = 1/(1 + 10^((opponent_elo − elo_before)/400))`, averaged over games through the node. Both columns already exist on `games`. | **no** — confounded (§Open items) |

The sign convention above is stated because `REP_CHALLENGE_ENGINE_CLEAR` (+2) and
`REP_CHALLENGE_ENGINE_TOL` (3, a *cost*, i.e. −3) are deliberately asymmetric — the neutral band is
`engine_delta ∈ [−3, +2)`. The asymmetry is the whole point: the system is generous about adopting his
moves and stingy about overruling him on the engine's word. Getting the sign backwards silently inverts
the feature, so it is a spec clause and a test, not a comment.

**Resolution rule** (`src/domain/repertoire/challenge.js`, pure, evaluated at every book-learning
pass — i.e. after each game's analysis, and on demand via `--rebuild`).

**Precondition on every promotion rule:** no rule may make a move `canonical` on fewer than
`REP_CONFIRM_OBS` (2) self-directed observations. This is what keeps §2's promise — "a single move never
enters the book" — true of the challenge path as well. Without it, rule 2 would canonise a *misclick*
outright the moment the engine happened to like it, and the entire "no misclick button is needed"
argument collapses. A challenger with one observation that clears rule 2 is admitted as `alt`
immediately (so it never alerts and costs him nothing) and becomes `canonical` on its second play.

1. **Gate veto first.** A challenger failing any of the four gates (§3) closes `rejected_unsound`
   immediately, no matter how good the results look. Objective 1 is absolute. The stored
   `gate_reason` is what the log shows.
2. **Engine-clear promote.** `engine_delta ≥ REP_CHALLENGE_ENGINE_CLEAR` (+2) → promote as soon as the
   precondition is met. No reason to make him play six games to adopt a move that is simply better.
3. **Repeat-plus-neutral promote.** `challenger_plays ≥ REP_CHALLENGE_REPEAT_CONFIRM` (2) **and**
   `engine_delta ≥ −REP_CHALLENGE_ENGINE_TOL` → promote. Playing the move again unprompted *is* the
   statement, and it costs nothing measurable, so the book follows him. This is the common path and it
   needs no results data at all.
4. **Evidence promote.** `engine_delta` within tolerance **and** trend or Elo-adjusted performance
   favours the challenger over ≥ `REP_CHALLENGE_MIN_GAMES` (6) games at the node → promote.
5. **Style-call promote.** `engine_delta < −REP_CHALLENGE_ENGINE_TOL` but the challenger is still inside
   the four gates, **and** results favour it by ≥ `REP_CHALLENGE_RESULT_MARGIN` over ≥
   `REP_CHALLENGE_MIN_GAMES` → **promote anyway.** This is the case he described directly: a
   deliberately weaker move that suits how he plays and produces better outcomes. The gates already
   guarantee it is not disastrous, so preferring his results over the engine here is the whole point
   of the feature, not a risk to be escalated.
6. **Incumbent wins.** `incumbent_plays ≥ 1` after the challenge opened, or trend and results both
   favour the incumbent at full sample → close `rejected`. Symmetric with rule 3, deliberately.
7. **Abandoned.** No repetition within `REP_CHALLENGE_TTL_ENCOUNTERS` (8) encounters at the node →
   close `abandoned`. This is where misclicks and one-off experiments go, silently. Counted in
   encounters, not games, for the same reason as §7.
8. **While open**, the incumbent keeps role `canonical` and the challenger holds role `challenger`,
   which is in the accepted set (§2), so **neither move alerts.** Refusing an alert immediately stops
   the nagging at that node — he is never asked about the same position twice while the system is still
   working it out. (The challenger holds its own role rather than being relabelled `alt`, so that "is
   there an open contest here?" is answerable from the projection alone.)
9. **Alternation short-circuit.** If both moves qualify under §2's alternation rule, the challenge
   closes `settled_both` and the node holds `canonical` + `alt`. Neither move is retired. Without this,
   two moves he genuinely alternates between can promote and demote each other indefinitely, and every
   flip writes a changelog entry claiming the book improved.

Promotion is **automatic**: challenger → `canonical`, incumbent → `retired`, drill card
`accepted_moves_json` updated. Every resolution writes a log row with the rule that fired and the
numbers behind it, surfaced as a **"what changed in your book"** feed — a notification, not a
to-do list. He can reverse any change with one click, but nothing is ever queued for his approval.

**Reversal must actually stick.** `POST /changelog/:id/reverse` restores the previous roles, closes the
challenge `rejected` with `resolved_by = 'user_override'`, **and records a suppression on
`(epd, side, challenger_uci)` for `REP_REVERSAL_SUPPRESS_ENCOUNTERS` (10) encounters** during which no
rule may re-promote that move and the §2 vote is frozen at the node. Otherwise the next book-learning
pass sees the same unchanged evidence, fires the same rule, and the change he just rejected comes
straight back — a reverse button that visibly does nothing is worse than no reverse button, and it is
the only safeguard standing behind fully automatic promotion.

**Refusal analytics** (`GET /api/repertoire/refusals`, plus a page): every refusal ever, the two
moves, the three signals, the inferred interpretation, the rule that fired and the outcome. This is
the dataset he asked for. Its aggregate hit-rate — how often his refusals turned out to be
improvements — is a genuinely useful long-run number, and a later phase can use it to tune
`REP_ADMIT_WIN_PTS` and `REP_CHALLENGE_ENGINE_TOL` to *him* rather than to a default.

### 10. The system as a research instrument

Playing with this system produces a dataset that, as far as the prior-art survey can establish, does
not currently exist: a longitudinal, single-subject record of one player's opening repertoire forming,
with **ground-truth labels captured at the moment of deviation** rather than reconstructed afterwards.
Public chess datasets carry moves and results; none carries the player saying, in the position, "no, I
meant that" — and per §2 of the survey none plausibly could, because collecting it requires owning the
game loop. That one bit is the novel measurement, and the system collects it as a by-product of being
useful. (The claim is stated as a search result, not a fact: the survey records the queries behind it
so it can be contradicted.)

Because `data/chess.db` is empty today, the study can be **pre-registered before any data exists** —
which turns what would otherwise be post-hoc storytelling into confirmatory analysis. That window
closes the moment the first game is played, so the preregistration is a Phase 17 deliverable, not a
later one.

**Research questions** (each stated with its measure, so the instrumentation can be checked against
them now rather than discovered to be missing later):

| # | Question | Measure |
|---|---|---|
| RQ1 | Are a club player's *deliberate* deviations from their own book improvements, regressions, or neutral? | Refusal hit-rate: engine A/B win% delta and Elo-normalised outcome of challenger vs incumbent, per §9 |
| RQ2 | Can a usable personal repertoire be learned purely from encounter, with no curation? | Coverage growth curve: in-book ply depth and 1-in-X frontier vs games played; interaction cost (alerts per game) over time |
| RQ3 | Do Soundness and Effectiveness actually diverge for an individual — does a style-tolerant book outperform an engine-optimal one *for him*? | Per-node engine win% loss vs realised score, paired within node; the style-call promotions (§9 rule 5) are the natural experiment |
| RQ4 | Does spaced repetition of *self-authored* opening moves reduce move-order slips and lapses? | Deviation rate per node against FSRS card maturity; single-case interrupted time series around each card's introduction |
| RQ5 | Does Maia-policy reach probability predict actual encounter frequency? | Calibration: predicted 1-in-X vs observed frequency, reliability diagram + Brier score. Directly testable because the opponents *are* Maia; a second question is whether it transfers to human opponents |
| RQ6 | Is the learned book identifying — does it constitute a stylometric fingerprint? | Link to McIlroy-Young et al.'s individual behaviour modelling; compare the book against Maia-policy baselines |

**Methodological framing** (recorded properly in the research doc, not hand-waved): Design Science
Research — the artefact plus its evaluation (Hevner et al. 2004; Peffers et al. 2007 DSRM); n-of-1 /
single-case experimental design for the empirical questions; personal informatics and the
quantified-self tradition (Li, Dey & Forlizzi 2010) for the interaction claims; and for RQ4 the
spacing and testing-effect literature (Cepeda et al. 2006; Roediger & Karpicke 2006; Bjork's
desirable difficulties) alongside the chess-expertise line (Chase & Simon 1973; Gobet & Simon;
Charness et al. 2005 on deliberate practice in chess). The DSR framing is shared with the Afrikaans
AAC work, so the methods write-up largely transfers.

**What this demands of the engineering** — and this is the part that must be built in from the start,
because provenance cannot be retrofitted:

1. **Event-sourced, append-only history.** `rep_observations`, `rep_deviations`, `rep_challenges`,
   `rep_audits` and `rep_changelog` are never mutated or deleted (invariant 3 — the same five tables,
   named identically in both places so neither list can quietly drift). The derived projections are
   disposable; the log is the dataset.
2. **A monotonic `book_version` counter**, incremented on every book change and stamped on every
   observation, alert, and challenge row. Without it the analyses cannot condition on the book state
   at decision time — and since the book adapts *while* being measured, that is a real confound, not
   a nicety.
3. **Full provenance stamped on every datum**: `schema_version`, `balance_version` (hash of
   `src/shared/balance.js`), engine name + version + depth + MultiPV, Maia weights id, and the app
   git SHA. A result produced under different constants is a different measurement.
4. **Deterministic re-derivation.** Same log + same versions → same projections, byte for byte
   (invariant 4). This is what makes any published analysis reproducible.
5. **A citable export**: `scripts/export-research-dataset.js` → JSONL/CSV per table + PGN of every
   game + a data dictionary + a SHA-256 manifest, with an anonymisation flag. Same DB in, same bytes
   out.

**Ethics and scope:** this is self-study on the author's own data, so no human-subjects clearance is
required; that changes the moment a second participant is involved, which would need UNISA ethics
approval and is explicitly out of scope here. The export's anonymisation flag exists so the decision
to share is separable from the decision to record.

**Honest assessment of what is publishable.** The prior-art survey above is what bounds this, and it
bounds it usefully: the parts of the system that are prior art (§6 of the survey) contribute nothing
publishable no matter how well they are built, and the claim has to rest on the five items in §5 of the
survey. The transferable contribution is the **artefact and the
method** — an encounter-driven, style-tolerant, consent-free-yet-labelled repertoire builder, plus a
reproducible instrument for studying repertoire formation. The n-of-1 empirical results (RQ1, RQ3,
RQ4) are case-study evidence: the sample is one player, the book moves while being measured, and
opponent/form confounds are real (§Open items). RQ5 is the cleanest of the set, because the
opponent's policy is known exactly rather than estimated — it is a genuine calibration study and does
not depend on n-of-1 assumptions at all. Plausible outputs: an artefact/methods paper (ICGA Journal or
Advances in Computer Games; the interaction angle would suit CHI PLAY), the RQ5 calibration paper,
and a dataset paper. Claiming causal effects on playing strength from this design would not survive
review and should not be attempted.

---

## Schema

New tables in `src/adapters/sqlite/schema.js` (idempotent, same style as existing DDL). **Every
append-only table below also carries `provenance_id` and `book_version`** (invariant 11) — listed once
here rather than repeated in each column list.

Append-only (the dataset):

- **`rep_observations`** — source of truth: one row per own opening ply, PK `(game_id, ply)` to match
  `game_moves`. `game_id, ply, epd, side, move_uci, move_san, win_loss_pts, classification, played_at,
  source`, with `source ∈ ('game','coach_kept','coach_corrected')`. Note **`win_loss_pts`** — that is
  the actual column name in `move_evals`, not `win_loss`. Only `source ∈ ('game','coach_kept')` rows
  count toward confirmation and the vote (§2).
- **`rep_deviations`** — per-game log for the review page: `game_id, ply, epd, kind, played_uci,
  book_uci, resolution, decision_ms_taken`, with
  `resolution ∈ ('alerted_corrected','alerted_kept','alerted_timeout','post_game')`. The enum is
  deliberately four values: the earlier `alerted_kept_learn` / `alerted_kept_once` split was a leftover
  from the version that asked him to classify, and reintroducing it would put the classification back
  into the schema in violation of invariant 10.
- **`rep_challenges`** — **the refusal record; never deleted.**
  `id, epd, side, fen, incumbent_uci, challenger_uci, opened_game_id, opened_ply, opened_at`;
  incumbent snapshot at open time (`inc_observations, inc_mean_win_loss_pts, inc_score_w/d/l,
  inc_card_state`); inference inputs (`challenger_plays`, `incumbent_plays`, `encounters_since_open`,
  `move_ms_taken`, `move_ms_zscore`, `decision_ms_taken`); the three signals
  (`engine_delta_win_pts, engine_audit_id, trend_challenger, trend_incumbent,
  result_challenger_perf, result_challenger_n, result_incumbent_perf, result_incumbent_n`);
  `status ∈ ('open','promoted','rejected','rejected_unsound','abandoned','settled_both')`,
  `resolution_rule` (which numbered rule in §9 fired), `resolved_at`,
  `resolved_by ∈ ('algorithm','user_override')`.
  No user-supplied classification column exists anywhere in this table, by design.
- **`rep_audits`** — every depth-22 MultiPV-3 audit ever run: `id, epd, side, move_uci, depth, multipv,
  win_pct, cp, pv, run_at`. **This table is why it exists:** an audit is an engine measurement that
  cannot be recomputed from the observation log, so without it `rep_moves.audit_id` points at nothing a rebuild
  can only preserve by luck, and invariant 4 is false. Logging audits also makes invariant 8 checkable
  after the fact and gives RQ1/RQ3 their engine-side data with provenance attached. Challenges reference
  audits by id rather than copying win% values around.
- **`rep_changelog`** — the "what changed in your book" feed: `id, at, epd, side, kind
  ('promote'|'retire'|'confirm'|'refuse'|'settle'|'reverse'), from_uci, to_uci, challenge_id, rule,
  detail_json`. Drives the notification feed and the one-click reversal.
- **`rep_suppressions`** — reversal memory (§9): `epd, side, move_uci, until_encounters, created_at,
  changelog_id`. Small, but load-bearing: it is the difference between a reverse button that works and
  one that is undone by the next learning pass.

Derived projections (disposable, rebuildable):

- **`rep_nodes`** — `epd, side, fen, first_seen, last_seen, times_reached, encounters, min_ply,
  reach_prob, reach_stale, line_loss, vote_frozen_until_encounter`. `encounters` is the counter the TTLs
  in §7 and §9 are measured in; `line_loss` is the **minimum** over observed book paths (§3 gate 3).
- **`rep_moves`** — `epd, side, move_uci, move_san, role, observations, weighted_score,
  mean_win_loss_pts, worst_win_loss_pts, audit_id, gate_reason, score_w/d/l, first_played, last_played`.

Caches:

- **`rep_policy`** — Maia policy cache: `epd, maia_model, maia_weights_id, policy_json, computed_at`.
  `maia_weights_id` is in the key so a weights upgrade invalidates the cache instead of silently mixing
  two models' probabilities into one calibration curve (RQ5 would be quietly wrong otherwise).

Provenance:

- **`rep_provenance`** — one row per measurement *context*: `id, at, schema_version, balance_hash,
  app_git_sha, sf_version, sf_depth, sf_multipv, maia_weights_id`. Created once per distinct context and
  reused, so the cost is a foreign key rather than duplicated columns. **`book_version` is deliberately
  NOT a column here** — it changes on every book change, which is orders of magnitude more often than
  the engine/balance/git context, so including it would force a new provenance row per book change and
  destroy the reuse the table exists for. Rows carry `provenance_id` *and* `book_version` as two
  independent stamps. (§10.3 calls this `balance_version`; the column is `balance_hash` — one name, and
  the spec uses the column name.)
- **`rep_book_version`** — the monotonic counter (§10.2), one row, incremented in the same transaction
  as any book change; the value in force is stamped on every append-only row.

`rep_nodes`/`rep_moves` are **rebuildable** from the append-only tables — `rep_observations` +
`rep_challenges` + `rep_audits` + `rep_suppressions` + `move_evals` + the balance constants (the full
list is invariant 4; "from `rep_observations`" alone was an understatement). So recency half-life or gate
thresholds can be re-tuned without replaying games. Same "store sufficient statistics" posture as
`strength_samples` + `scripts/refit-strength.js`.

`side` is denormalised (derivable from the EPD's active colour) for query clarity, matching how
`move_evals.mover` is stored despite being derivable from `ply`.

One change to an existing table: **`games.coach_enabled INTEGER NOT NULL DEFAULT 1`** (§6.7), added with
the `ALTER TABLE ... ADD COLUMN` in-try pattern already used at `schema.js:15-17` for `win_loss_pts`,
`strength_elo` and `opponent_strength_elo`.

### Invariants (the `Q` component — each becomes a spec clause and a test)

1. At most one `canonical` move per `(epd, side)`; exactly one role per `(epd, side, move_uci)`.
2. A move whose role is `refused` or `retired` MUST NOT be in the accepted set; the accepted set is
   exactly `{canonical, alt, challenger, quarantined}` (§2). A `quarantined` move MUST NOT be
   `canonical`, and MUST NOT be any drill card's `best_move_uci`.
3. `rep_observations` is append-only; nothing but a game deletion (cascade) may remove a row. Same for
   `rep_deviations`, `rep_challenges`, `rep_audits` and `rep_changelog`.
4. `rep_nodes` and `rep_moves` MUST be byte-for-byte reproducible from `rep_observations` +
   `rep_challenges` + `rep_audits` + `rep_suppressions` + `move_evals` + the balance constants.
   Enforced by a test that rebuilds and diffs.
5. Every `rep_challenges` row references an existing `(epd, side)` node and a real incumbent move.
6. A challenge with `status != 'open'` MUST have `resolved_at`, `resolved_by` and `resolution_rule` set.
7. A node with a `canonical` move MUST have a `kind='opening'` puzzle row and an FSRS card. **Activates
   at Phase 23** — before drill integration exists there are no opening cards, so the test is written in
   Phase 19 as `test.fails(...)` per the project convention and flipped in Phase 23.
8. No move becomes `canonical` without a `rep_audits` row at `REP_AUDIT_DEPTH` that passes all four
   gates — nothing reaches the top of a node unaudited.
9. `ranked = 0` for every game with at least one `rep_deviations` row whose resolution begins
   `alerted_`.
10. A challenge resolves **only** via one of the numbered rules in §9 or an explicit user reversal;
    `resolution_rule` is non-null for every non-`open` row. No schema column anywhere stores a
    user-supplied classification of a move or a refusal.
11. Every append-only row carries a non-null `provenance_id` and `book_version` — no datum exists
    without the context that produced it (§10).
12. `book_version` is strictly monotonic and increments exactly once per book change, in the same
    transaction as that change.
13. Two exports of the same database at the same `book_version` are byte-identical. Which requires that
    **no wall-clock time, hostname, absolute path, run id or map-iteration order reaches the exported
    bytes** — export time goes in a sidecar file excluded from the manifest hash, and every collection is
    ordered by an explicit key. Stated because "byte-identical" is trivially violated by a single
    `new Date()` in a header and the failure looks like a hashing bug rather than a design bug.
14. No move becomes `canonical` on fewer than `REP_CONFIRM_OBS` self-directed observations — via the vote
    or via any challenge rule (§9 precondition). This is the invariant form of "a single move never
    enters the book", and it is the one a future rule is most likely to break by accident.
15. A `rep_deviations` row with `resolution ∈ ('alerted_timeout','post_game')` MUST NOT have an
    associated `rep_challenges` row. Only a deliberate `alerted_kept` opens a challenge — the integrity
    of the one-bit label depends on it.

### Non-functional bounds (the `N` component)

- Live book check: **zero engine calls**, DB reads only, p99 < 20 ms; measured by a test that asserts
  the engine client is never touched on the live path.
- A refusal MUST be durably committed in the same transaction as the move it belongs to.
- Post-game repertoire update: **zero additional engine calls** beyond the bounded promotion audit
  and the challenge A/B (≤ 2 `go depth 22` calls per open challenge, at most once per challenge).
- Maia policy probes are background-only, cached per `(epd, model)`, never on a request path.
- Any repertoire error MUST be logged at `warn`/`error` and swallowed — it can never fail a move, a
  game, or an analysis run (same posture as `FR-ANALYSE-8`). **One exception, which must be explicit:**
  writing the `rep_challenges` row on a refusal is inside the move transaction, so if *that* write fails
  the move fails. A silently-lost refusal is worse than a rejected move, because it is the one datum the
  system cannot reconstruct.
- **Coached games MUST be excluded from strength sampling.** `saveStrengthSample` is currently called
  unconditionally (`src/api/ws/analysis-service.js:137`), *outside* the `if (ranked && ...)` guard that
  protects the Elo update at line 203. So the unranked flip alone does not protect the strength
  estimator: a game containing a coach-corrected move contains a move the player did not choose, and
  feeding it to the estimator biases his measured strength upward. Phase 21 must extend the guard, and a
  test must assert it.

---

## Balance constants

Added to `src/shared/balance.js`, documented with rationale in `docs/game/balance.md` (a
`docs(balance):` commit, per CLAUDE.md — the regression test asserts the file and doc agree):

```
REP_PLY_MAX                 = 30    // PLIES (= 15 moves); runaway guard only, reach probability is the real limiter
REP_CONFIRM_OBS             = 2     // self-directed observations before any move may become canonical
REP_ADMIT_WIN_PTS           = 10    // loss <  this            → admitted           (= INACCURACY_WIN_PTS)
REP_QUARANTINE_WIN_PTS      = 20    // loss in [10, 20)        → quarantined; ≥ 20 → refused (= MISTAKE_WIN_PTS)
REP_MIN_ABS_WIN_PCT         = 35    // absolute win% floor after the move, mover's POV; skipped if unreachable
REP_LINE_BUDGET_WIN_PTS     = 20    // cumulative own-move loss on the cheapest book path to the node
REP_RECENCY_HALFLIFE_DAYS   = 120   // recency weight for the canonical-move vote
REP_ALT_ALTERNATION_MIN     = 3     // observations of each of two moves within one half-life → canonical + alt
REP_ALERTS_PER_GAME_MAX     = 3
REP_ALERT_TIMEOUT_SEC       = 60    // auto-apply his move; NOT a refusal
REP_COVERAGE_GOAL           = 50    // "1 in X games" frontier target
REP_AUDIT_DEPTH             = 22    // promotion audit (matches analysis pass 2)
REP_AUDIT_MULTIPV           = 3     //                (matches analysis pass 2)
REP_BOOTSTRAP_CONFIRMED_MIN = 20    // coach silent below this many confirmed nodes
REP_CANDIDATE_TTL_ENCOUNTERS = 8    // unrepeated candidates expire — ENCOUNTERS AT THE NODE, not games played

// Challenges (§9) — refusal-driven, automatic promotion.
// Sign convention: engine_delta = winPct(challenger) − winPct(incumbent); positive = challenger better.
// Neutral band is [-TOL, +CLEAR) = [-3, +2). The asymmetry is intentional (§9).
REP_CHALLENGE_REPEAT_CONFIRM     = 2    // unprompted plays of the challenger that promote it (rule 3)
REP_CHALLENGE_MIN_GAMES          = 6    // games at the node before trend/result may decide (rules 4–5)
REP_CHALLENGE_ENGINE_TOL         = 3    // win% pts the challenger may COST and still promote
REP_CHALLENGE_ENGINE_CLEAR       = 2    // win% pts ADVANTAGE that promotes on the engine alone (rule 2)
REP_CHALLENGE_RESULT_MARGIN      = 0.10 // Elo-adjusted performance edge required to call the result signal
REP_CHALLENGE_TREND_PLIES        = [2,4,6]   // forward of the node, not ±
REP_CHALLENGE_TTL_ENCOUNTERS     = 8    // encounters at the node before a challenge is abandoned (rule 7)
REP_REVERSAL_SUPPRESS_ENCOUNTERS = 10   // after a user reversal, no rule may re-promote that move
```

Note that `REP_CHALLENGE_ENGINE_CLEAR` (2) being *smaller* than `REP_CHALLENGE_ENGINE_TOL` (3) reads
oddly and is worth a sentence in `docs/game/balance.md`: they measure opposite directions. Two win%
points of engine advantage is enough to adopt a move; three win% points of engine disadvantage is still
tolerated if he keeps playing it.

`rep_challenges` holds only *observed* statistics, so re-tuning any of these re-decides every open
challenge without replaying a single game (`scripts/seed-repertoire.js --rebuild`). The exception is
`REP_AUDIT_DEPTH`/`REP_AUDIT_MULTIPV`: changing those invalidates existing `rep_audits` rows, which must
be re-run rather than reinterpreted — the rebuild MUST detect the mismatch and refuse rather than
silently compare win% figures measured at different depths.

---

## SDD document set — Phase 17 deliverables

This feature follows the full specification-driven development process in
`~/code/aib-genai/aib-genai-standards/process/spec-driven-development.md`. Per §5 of that standard,
**implementation MUST NOT begin before the specification and schemas are written and reviewed**, and
per §4 a specification is complete only when all five components (R, I, P, Q, N) are defined. So
Phase 17 is a documents-only phase with its own review gate, exactly as Phase 0 was for pawnbook
itself.

The feature gets its own directory, `docs/features/repertoire/`, mirroring
`docs/features/pawnbook/`:

| Document | Contents |
|---|---|
| `feature_spec.md` | **The normative artefact.** RFC 2119 throughout, structured R / I / P / Q / N exactly like `docs/features/pawnbook/feature_spec.md`. Requirement groups: `FR-REP-BOOK` (keying and structure), `FR-REP-LEARN` (observation → candidate → confirmed, the vote), `FR-REP-GATE` (the four soundness checks), `FR-REP-COACH` (live alert and takeback), `FR-REP-CHAL` (refusals and challenger promotion), `FR-REP-REACH` (reach probability, coverage, gaps), `FR-REP-DRILL` (FSRS integration), `FR-REP-STORE` (persistence, rebuildability), `FR-REP-API` (REST and WS surface). Header states authority: where this contradicts this plan or the research doc, **the spec wins**. |
| `design_plan.md` | **This plan, recorded verbatim** as the design rationale and provenance record, with a header noting it is descriptive (superseded by `feature_spec.md` where they differ) and dated. |
| `decisions.md` | Decision log with rationale and rejected alternatives, so the *why* survives: seeds come only from pawnbook games (no PGN import); alert + takeback always, first alert flips the game unranked; tolerant-but-blunder-proof gate thresholds; **pre-commit hold instead of a true undo** (§6) and why; EPD rather than move-sequence keying; reach probability from Maia policy rather than crowd stats; encounter-driven rather than search-driven expansion; and the constraint that **the user is asked for exactly one bit at an alert and never asked to classify anything** — with the reasoning for each interpretation being inferred instead, and for promotion being automatic within the gates. Each decision that a prior tool already solves differently cites `auto-repertoire-prior-art.md` for what that tool does and why we diverge, so "we chose X" is never confused with "nobody has tried Y". |
| `data_model.md` | Every new table column-by-column with types, nullability, FKs, indexes, and the **invariants** each one carries — including `rep_audits`, `rep_suppressions` and `games.coach_enabled`; the derivation rule proving `rep_nodes`/`rep_moves` are reproducible from the full append-only set (invariant 4); the definition of `line_loss` as a minimum over book paths and how it is recomputed; the `puzzles` `UNIQUE(fen)` → `UNIQUE(fen, kind)` migration written out in full with its rollback story. |
| `api_contract.md` | The `I` component elaborated: every REST route with request/response shape, status codes and error codes; every WS message in and out, cross-referenced to the Zod schemas in `src/schemas/messages.js` that are their machine-readable form; the alert/choice state machine as an explicit state diagram including timeout and disconnect edges. |
| `feature_steps.md` | Per-phase TDD plan in the established format — Status / Branch / Files / the exact test names written before implementation / DoD — for Phases 17–26. Future phases use `test.fails(...)` with `await import()` inside the body, per the existing convention. |
| `implementation_plan.md` | Per-session checklist, the tests each session turns green, suggested commit messages, and the DoD per session. |
| `traceability.md` | Matrix: every `FR-REP-*` → the test(s) that prove it → the file(s) that implement it. Kept current as each phase lands; Phase 26 fails if any row is unfilled. |
| `spec_review.md` | The §9 spec completeness checklist signed off, plus the Fagan-style inspection record (§7.3 of the standard): interface conformance, precondition enforcement, postcondition satisfaction, error semantics, non-functional constraints. |

Plus, outside the feature directory:

| Document | Contents |
|---|---|
| `docs/research/auto-repertoire.md` | The full literature record in the house style of `docs/research/strength-estimation.md` — every source in the research table above with proper citation, what was taken from it, and the explicit "where we deliberately differ from prior art" section. This is what makes the design defensible rather than invented. |
| `docs/research/auto-repertoire-prior-art.md` | **The prior-art / related-work survey** (§Has this been done before?), written out in full: the tool-by-tool comparison table with URLs and access dates and quoted feature claims; the fair-play and no-takeback constraints that explain why live in-game alerting exists nowhere else, with the rules cited; Lucas Chess's tutor credited as the closest interaction prior art and the three ways we differ; the engine book-learning lineage (Lincke, Hyatt, Buro, Hirsch, Donkers, AlphaZero) and the human-modelling lineage (Maia KDD 2020/2022, Chassy & Gobet 2011, Regan & Haworth 2011); **the null results recorded with the exact queries, sources and dates** so the "no opening-repertoire ITS, no personalised repertoire recommender" claim is falsifiable rather than asserted; and the two closing lists — the narrow novelty claim and the explicit not-novel list. This document is what a reviewer will attack first, so it is written to be attacked: every claim either has a citation or is marked as a search that came back empty. Re-run before any submission, since §1 is a live commercial field. |
| `docs/research/repertoire-study-preregistration.md` | **Written before the first game is played** (§10). The six research questions, each with its hypothesis, operational measure, analysis method, minimum sample and stopping rule; the confounds and how they are handled; what would falsify each claim. Dated and committed so the timestamp is verifiable, and thereafter amended only by append with reasons — never rewritten. This is the single cheapest thing in the whole plan and the only one whose window is closing. |
| `docs/research/repertoire-data-dictionary.md` | Every exported field: type, units, provenance, how it was computed, and which RQ uses it. Ships with the dataset export and is what makes it citable rather than merely available. |
| `docs/research/repertoire-methodology.md` | The DSR framing (Hevner; Peffers DSRM), the n-of-1 / single-case design, personal-informatics positioning, the ethics scope note, and the honest limitations statement from §10 — written now, while the limitations are obvious, rather than at write-up time when they are inconvenient. DSR requires the artefact's contribution to be positioned against existing solutions, so this document's "problem relevance" and "design as an artefact" sections are grounded in `auto-repertoire-prior-art.md` rather than restating it. |
| `docs/game/balance.md` | The new `REP_*` constants with the rationale for each value and the objective it serves. Required by CLAUDE.md; a regression test asserts this file and `src/shared/balance.js` agree. |
| `docs/features/pawnbook/feature_spec.md` | Amended, not replaced: `FR-PLAY-11` ("a ranked game MUST NOT expose eval or hints") must be reconciled with the coach, which is resolved by the ranked→unranked flip. That reconciliation is a spec change and belongs in the spec that owns the requirement. |
| `docs/game/mechanics.md`, `docs/game/player_experience.md`, `docs/game/progression.md` | The coach, the takeback, the challenge system and the refusal log are player-facing mechanics and a new progression axis (repertoire coverage alongside Elo and drill mastery). The existing game-design docs describe the whole experience and must stay true. |
| `docs/game/voice_and_tone.md` | The alert copy is the most sensitive text in the app — it interrupts a game to say "you got this wrong". `order_slip`, `lapse`, `novelty` and `refused_repeat` each need their own tone, and a refusal must never be scolded. Worth writing down before it is written into HTML. |

**Error taxonomy** (added to `src/errors.js` with `ErrorCode` entries, per the error-handling
standard — every error named with its code and HTTP status): `RepertoireNodeNotFoundError` (404),
`ChallengeNotOpenError` (409), `NoPendingMoveError` (409), `RepertoireMoveRefusedError` (422),
`InvalidRepertoireDecisionError` (400). Plus the explicit rule that any *internal* repertoire failure
is logged and swallowed, never propagated into a game or an analysis run.

---

## Phases

Continues the project's phase numbering (Phase 16 was the last, per
`docs/features/pawnbook/feature_steps.md`) and its SDD/TDD gates. One feature branch per phase,
targeting `development`.

**Phase 17 — Specification (no code).** Branch `docs/phase-17-repertoire-spec`. Produces the entire
document set above. **DoD:** the SDD §9 completeness checklist passes — every FR is MUST/SHOULD/MAY,
every error named with its code and HTTP status, every NFR has a measurable bound, every requirement
in this plan either maps to a spec entry or is explicitly listed as out of scope; `data_model.md`
and `api_contract.md` are complete enough to derive the code from; `spec_review.md` is filled in;
**`repertoire-study-preregistration.md` is committed before any game is played**; and in
`auto-repertoire-prior-art.md` every factual claim about another tool carries a URL and an access date,
every quoted feature claim is quoted verbatim, and every null result records the exact query, the source
searched and the date. No file under `src/` is touched in this phase.

**Phase 18 — Pure domain core (TDD).** New `src/domain/repertoire/`:
`epd.js` (EPD key + representative FEN), `gates.js` (the four checks), `vote.js` (recency-weighted
canonical selection), `state.js` (role transitions), `deviation.js` (the classification table),
`reach.js` (reach probability, coverage, gap ranking, drop-out priority),
`challenge.js` (§9 — the three signals and the promotion rule). No I/O, no engine, no
persistence. Tests first; these files carry the 90% branch gate comfortably.

**Phase 19 — Persistence, provenance and port.** All DDL above — including `rep_audits`,
`rep_suppressions` and the `games.coach_enabled` column, none of which are optional extras: the first two
are what make invariant 4 true and the reverse button work, the third is what makes RQ4 answerable.
`RepertoireRepository` added to
`src/ports/repositories.js` with both implementations (`src/adapters/sqlite/repositories.js`,
`src/adapters/memory/repositories.js`); the shared case added to
`tests/contract/repositories.test.js` so both are held to the same contract. **Provenance and
`book_version` land here, not later** — invariants 11–12 are unenforceable retrospectively, and every
row written before they exist is a row that cannot be used in an analysis.

**Phase 20 — Seeding and post-game update.**
`src/domain/repertoire/build.js` (pure: observations + evals → book operations) plus a thin
application service. Hook into `src/api/ws/analysis-service.js` after `move_evals` are saved —
wrapped so a repertoire failure can never fail analysis or a game (same posture as FR-ANALYSE-8).
`scripts/seed-repertoire.js` — idempotent batch over finished + analysed games; `--rebuild`
recomputes projections from `rep_observations`. Emits a `repertoire_update` WS summary.

**Phase 21 — Live coach and refusal capture.** Pre-commit check in `handleMove`
(`src/api/ws/handlers.js`); pending-move state per connection; `repertoire_alert` (outbound) and
`repertoire_choice { decision: 'correct' | 'keep' }` (inbound, and nothing else — the Zod schema is
where "we never ask him to classify" is *enforced*) added to `src/schemas/messages.js`;
`GameSession.setUnranked()` (note `ranked` is currently derived in the constructor at
`src/domain/game/session.js:37`, so this is a real state change, not just a setter); clock pause for the
duration of the hold; alert budget; `REP_ALERT_TIMEOUT_SEC` auto-keep that opens **no** challenge; the
`games.coach_enabled` check; `ranked_changed` event; and **extending the strength-sample guard in
`analysis-service.js` so coached games are excluded** (currently outside the `ranked` guard — see NFR).
`repertoireRepo` is added to `handleMove`'s injected dependencies rather than imported.
**Opening a `rep_challenges` row on every refusal happens here, synchronously, in the same
transaction as the move** — a refusal must never be lost to a crash or a disconnect.
NFR: the check is DB-only, p99 < 20 ms, zero engine calls.

**Phase 22 — Reach, coverage, health and challenge resolution.** Background policy probes into
`rep_policy` via `enginePool.getMaiaAnalysisClient`; coverage/completion/gap/line-health computation;
the challenge engine A/B (depth-22 MultiPV-3 on incumbent *and* challenger in the same position, both
written to `rep_audits`), trend extraction from `move_evals` at `+REP_CHALLENGE_TREND_PLIES` (forward
only), Elo-adjusted performance aggregation, `move_ms_taken` z-scoring, and the **automatic** resolution
rules writing `rep_changelog` and `rep_suppressions`;
`src/api/routes/repertoire.js` mounted in `src/server.js` (`/tree`, `/coverage`, `/challenges`,
`/refusals`, `/changelog`, `POST /changelog/:id/reverse`); `scripts/repertoire-report.js`.

**Phase 23 — Drill integration.** `puzzles.kind` + `UNIQUE(fen, kind)` migration; card creation on
confirmation; findability exemption audit across `select.js` / `queue.js` / `rating.js`;
reach-weighted due ordering.

**Phase 24 — UI.** `public/repertoire.html` (tree view, three-objective stats, line
health, **"what changed in your book" changelog feed** with the rule and numbers behind each change
and a reverse button, **Refusal log** with retrospective hit-rate, open challenges shown read-only as
"being worked out"); alert overlay in `public/play.html` — book-move arrow and exactly **two**
buttons, "Play book move" / "Keep mine", plus the unranked badge; opening summary on the review page;
a TUI screen under `tui/screens/`.

**Phase 25 — Research instrumentation and dataset export.** Branch `feat/phase-25-research-export`.
`scripts/export-research-dataset.js` (JSONL/CSV per table + PGN + data dictionary + SHA-256 manifest,
`--anonymise` flag), `scripts/repertoire-analysis.js` producing the RQ2 coverage curve, the RQ1
refusal hit-rate table and the RQ5 reliability diagram + Brier score **from exported data only**,
never from live DB reads, so the analysis path is reproducible by anyone holding the export.
`docs/research/repertoire-data-dictionary.md` finalised against the actual output. **DoD:** two
consecutive exports at the same `book_version` are byte-identical; the manifest verifies; every field
in the export appears in the data dictionary and vice versa; every RQ in the preregistration is either
computable from the export or explicitly marked as awaiting more data.

**Phase 26 — Production readiness review.** Branch `docs/phase-26-repertoire-review`, producing
`docs/features/repertoire/phase-26-review.md` in the format of the existing
`docs/features/pawnbook/phase-11-review.md`: numbered findings `D1…Dn` each resolved or explicitly
accepted. Covers all fifteen invariants above as tests, the coverage gate, the Fagan-style spec
conformance re-inspection, and a completeness check that `traceability.md` has no unfilled row.
`make verify` green.

**Documentation discipline across every phase** (SDD §7.4): if implementation shows a spec element is
wrong, ambiguous or infeasible, **stop, update `feature_spec.md`, then resume** — silent divergence
is a defect. Each phase's PR updates `feature_steps.md` (Status/Files/Tests/DoD) and `traceability.md`
in the same commit as the code, and spec changes land before or with the code they govern, never
after.

---

## Verification

- **Phase 17 gate (documents).** Nothing is implemented until the SDD §9 completeness checklist in
  `spec_review.md` passes and every one of the fifteen invariants and six NFR bounds above appears as
  a normative clause in `feature_spec.md`.
- **Traceability.** Every test in the suites below names the `FR-REP-*` it proves, and
  `traceability.md` is the index. A test that verifies behaviour absent from the spec means either an
  undocumented requirement (update the spec) or unnecessary scope (delete the test) — per SDD §6.
- `make verify` (eslint + vitest with ≥90% branch coverage on `src/domain/**`, `src/adapters/**`,
  `src/api/**`, `src/shared/**` + `npm audit --audit-level=high`) must pass at every phase gate.
- **Invariant suite** — one test per numbered invariant, including the rebuild-and-diff test that
  proves `rep_nodes`/`rep_moves` are pure projections of `rep_observations`.
- **NFR suite** — a test asserting the live path never touches the engine client, and a timing
  assertion on the book check against a synthetic book of a few thousand nodes.
- **Unit** — one suite per pure module. Gate tests table-drive the four checks including the
  cumulative-budget case (three consecutive 8-point losses must be refused at the third).
  Deviation tests cover every row of the classification table, driven by a small hand-built book
  fixture plus PGNs for transposition, order-slip, lapse and novelty.
- **Contract** — `RepertoireRepository` proved identical across SQLite and in-memory.
- **Migration** — a test that opens a DB containing a pre-migration `puzzles` table with a
  `UNIQUE(fen)` index, applies the schema, and asserts no rows were lost and `UNIQUE(fen, kind)`
  is in force. (The original `move_evals` `NOT NULL` bug silently dropped every row; this must not
  repeat.)
- **Challenge suite** — one test per numbered resolution rule in §9: gate veto beats good results;
  engine-clear promote; repeat-plus-neutral promote with no results data at all; evidence promote;
  **style-call promote** (engine says worse, results say better, gates pass → promoted, *not* escalated);
  incumbent-replayed close; abandonment at `REP_CHALLENGE_TTL_ENCOUNTERS`; alternation settling to
  `canonical` + `alt` rather than flipping; and the while-open invariant that neither move alerts. Plus a
  durability test: a refusal followed by an immediate simulated crash still leaves the `rep_challenges`
  row committed.
- **The regression tests for the defects this review found** — each one is a rule the system would
  otherwise break silently, so each gets a named test rather than a comment:
  1. **Rule 3 is reachable.** A refusal, then an unprompted replay of the challenger at that node with no
     second alert, promotes the move. (Before the fix, rule 3 counted refusals, which rule 8 makes
     impossible — the documented "common path" could never fire.)
  2. **A single observation never becomes canonical**, even when the engine A/B strongly favours it
     (invariant 14 vs rule 2).
  3. **A timeout opens no challenge** and a past-budget deviation opens no challenge (invariant 15).
  4. **A coach-corrected observation does not advance confirmation or the vote** — play a node's
     incumbent five times *via corrections* and assert the vote and `observations` are unmoved.
  5. **Reversal sticks.** Reverse a promotion, run the learning pass again on identical evidence, assert
     the move is not re-promoted and the changelog has no second entry.
  6. **`line_loss` is the minimum over paths.** Build a node reachable by a cheap and an expensive book
     path and assert admission follows the cheap one; assert adding a cheaper path lowers it.
  7. **Candidate TTL counts encounters, not games** — a node touched once every 12 games still
     confirms on its second encounter.
  8. **A node with no canonical move never alerts**, including via `refused_repeat` — retire the only
     canonical move at a node holding a `refused` move, replay the refused move, assert silence.
- **Rebuild determinism** — a test that rebuilds the projections twice and after an audit-depth change
  asserts the rebuild *refuses* rather than mixing depths.
- **"No classification" test** — the Zod schema rejects a `repertoire_choice` carrying any field
  beyond `decision`, and `decision` accepts only `'correct' | 'keep'`. This is the guard that stops
  the interface drifting back into asking him to label things.
- **WS handler** — pending move held; both decisions; the ranked flip persisting; alert budget
  exhaustion; timeout auto-keep; resign clearing a pending move.
- **E2E (playwright)** — scripted game that triggers the coach; once clicking "Play book move"
  (assert board state, `rep_deviations` row, unranked badge), once clicking "Keep mine" (assert the
  `rep_challenges` row, and that the node is silent for the rest of the game and in the next game).
- **End-to-end by hand:** `docker compose up`, play 5–6 games against `maia-1500` playing the same
  opening each time and check the book fills itself with no interaction, then in game 7 deliberately
  play a wrong move order and check
  the alert fires as `order_slip` and the takeback works; in game 8 refuse an alert and check the
  challenge opens and the node goes quiet; in game 9 play that same move again **and confirm no alert
  fires** (rule 8), then check the book promoted it automatically via rule 3 with a `rep_changelog` entry
  explaining why. Note the shape of this step — he is *not* asked twice; the second play is unprompted.
  Then
  `node scripts/repertoire-report.js` and check coverage %, the 1-in-X figures, the gap list and the
  open challenges read sensibly.

---

## Design review record

A Fagan-style pass over this plan before Phase 17 (SDD §7.3) found the following. Recorded because the
corrections look arbitrary without the defect they close, and because `decisions.md` must carry them —
several are places where the obvious implementation is the wrong one.

| # | Defect | Severity | Closed by |
|---|---|---|---|
| R1 | **Rule 3 was unreachable.** It required `refusals ≥ 2`, but rule 8 silences the node while a challenge is open, so a second refusal can never occur. The documented "common path" for adopting his moves could never fire — the feature's central mechanism was dead. | **Blocking** | Evidence now accrues from `challenger_plays` (unprompted repeats), symmetric with `incumbent_plays` (§9) |
| R2 | **Coach-corrected moves fed the vote.** Every time he accepted a takeback, the incumbent gained evidence — so the book reinforced itself for being the book, the vote froze, and RQ2/RQ3 would have measured the coach rather than the player. | **Blocking** | `source='coach_corrected'` excluded from confirmation counts and the vote (§2) |
| R3 | **Rule 2 could canonise a misclick.** "Promote at once on engine advantage" bypassed `REP_CONFIRM_OBS`, contradicting both §2 and the argument that no misclick button is needed. | High | Global promotion precondition + invariant 14; single-observation challengers are admitted as `alt`, not `canonical` |
| R4 | **A 60 s timeout counted as a refusal.** Walking away from the keyboard would have been recorded as a deliberate judgement, contaminating the one-bit label the whole novelty claim rests on. | High | Timeout and past-budget deviations open no challenge; invariant 15 |
| R5 | **`line_loss` was undefined in a DAG.** Gate 3 said "from the root", but a node has many paths with different cumulative losses and `rep_nodes.line_loss` is one column. | High | Defined as the minimum over observed book paths, with the reasoning for min over played-path and max |
| R6 | **Candidate TTL counted games played.** A node reached once every 12 games would expire its candidate before it could be seen twice, so the deep infrequent lines the feature exists to grow could never confirm. | High | TTLs counted in encounters at the node (§7, §9 rule 7) |
| R7 | **A reversal did not stick.** The next learning pass would re-fire the same rule on the same evidence and undo the reversal — leaving the only safeguard behind fully automatic promotion visibly inert. | High | `rep_suppressions` + `REP_REVERSAL_SUPPRESS_ENCOUNTERS` (§9) |
| R8 | **Audits were not recoverable**, so `rep_moves.audit_*` could not survive a rebuild and invariant 4 was false. | Medium | Append-only `rep_audits` table with provenance |
| R9 | **Coached games still fed the strength estimator** — `saveStrengthSample` sits outside the `ranked` guard (`analysis-service.js:137` vs `:203`), so the unranked flip alone did not protect it. | Medium | Explicit NFR clause and a test |
| R10 | **Two writers to `role='canonical'`** (the vote and challenge resolution) with no stated precedence; plus no guard against two genuinely-alternated moves promoting and demoting each other forever. | Medium | Vote suspended at nodes with an open challenge; alternation settles to `canonical` + `alt` (§2, §9 rule 9) |
| R11 | **A node could lose its only canonical move** on re-audit and then alert with no book move to offer — including via `refused_repeat`, which sits first in the §5 table and so cannot inherit the check by falling through. | Medium | Nodes without a canonical move are silent (§2), enforced by the ordering of the §5 table plus an explicit condition on row 1 |
| R12 | **Gate 2 punished earlier damage** — if a previous move left him under 35%, every move at the node failed, including the engine's best. | Medium | Floor skipped when unreachable at that node |
| R13 | **`order_slip` was unscoped** — "a book move elsewhere" matches `Nf3` at dozens of nodes, so the gentlest alert would have been the noisiest. | Medium | Scoped to book-reachable nodes |
| R14 | Off-by-one at both gate-1 boundaries (`<10`/`10–20`/`≥20` double-claimed 20); `win_loss` is really `win_loss_pts`; `±TREND_PLIES` is forward-only; `book_version` inside `rep_provenance` defeated its own reuse; `rep_deviations` still carried the `alerted_kept_learn`/`alerted_kept_once` classification split the user explicitly rejected; invariant count stated as nine when there were thirteen; `ms_taken` conflated think-time with decision-time; unstated engine-delta sign convention; quarantine with no exit; undefined coverage %; Elo "normalisation" unspecified; the coach toggle mentioned only in open items with no schema home; clock behaviour during the hold unstated; `lapse` unreachable before Phase 23; export determinism vs wall-clock. | Low | Each fixed in place |

Two things this pass did **not** change, and both are deliberate: automatic promotion stays automatic
(escalating the style call would defeat the feature), and the alert stays a single bit.

---

## Open items to flag as we go

- **Model mismatch:** reach probability uses the Maia-1 lc0 *analysis* weights while games are played
  against maia3. Documented as a known approximation; probing maia3 directly is a later option.
- **Empty DB today.** No alerts until ~20 nodes have confirmed themselves, so roughly the first 5–6
  games are silent observation. Expected, not a bug — and it needs saying in the UI so the feature
  does not look broken on day one.
- **Candidate accumulation at rare nodes.** Now that the TTL counts encounters rather than games (§7),
  a one-off move at a node reached once every 50 games effectively never expires. Harmless — candidates
  are invisible, undrilled and unpromotable — but the tree view needs a "hide candidates" default and
  the count is worth watching.
- **RQ4 is confounded with the coach.** A node gets a drill card *and* becomes coach-eligible at nearly
  the same time, so "deviations fell after the card appeared" cannot separate spaced repetition from
  being alerted. The per-game coach toggle (§6.7) is the lever that makes this separable — alternating
  coach-on and coach-off games gives an actual within-subject contrast — and the preregistration must
  commit to that alternation scheme *before* data exists, or RQ4 is not answerable from this instrument
  at all. This is the one research question whose validity depends on a decision taken in Phase 17.
- **The result signal is confounded, and we must say so.** We never observe the incumbent and the
  challenger in the *same* game against the *same* opponent on the *same* day, so "I score better
  with this move" partly measures opponent strength, tilt and form. Mitigations: normalise by opponent
  Elo (already recorded per game), require `REP_CHALLENGE_MIN_GAMES`, weight the engine A/B — which is
  counterfactual-free — above results, and prefer the repeat-refusal signal (rule 3), which needs no
  results at all and is the cleanest evidence available. The result signal only ever *promotes* inside
  the gates and every promotion is one-click reversible, so the cost of being wrong is bounded and
  small. The changelog always shows the sample size behind a change, so a 6-game 71% never reads as
  more than it is.
- **Novelty bias in refusals.** A freshly-adopted challenger gets played with attention and the old
  move by habit, which flatters the challenger. The trend signal at +2/+4/+6 plies is partly a check
  on this; the refusal log's retrospective hit-rate is the real long-run answer.
- **Automatic promotion is a bet on the gates.** Because nothing waits for approval, the four gates
  and the `rep_changelog` reversal path are the only things standing between a bad refusal and a worse
  book. Both need to be right before Phase 22 ships, and the gate suite is the highest-value test
  file in the feature.
- **Ranked integrity.** Every game with the coach enabled that fires an alert becomes unranked, so
  Elo and the playing-strength estimator stay comparable. A per-game coach toggle lets him play a
  clean rated game when he wants one.
- **The prior-art survey has a shelf life.** §1 is a live commercial field — `chessdesk.app` and
  OpenBook Chess are both shipping features now, and either could add game-derived book *learning*
  (not just seeding) at any time. The engineering does not care, but the novelty claim does, so
  `auto-repertoire-prior-art.md` must be re-run before any submission and dated each time. The one
  claim unlikely to erode is §2: platform fair-play rules and the absence of Live Chess takebacks are
  not going to change.
- **Novelty is in the combination, not the parts.** §6 of the survey lists ten mechanisms here that are
  established prior art. If a phase's write-up starts describing one of those as new, the survey is the
  correction — this is the most likely way the documentation drifts into overclaiming, because each
  mechanism *feels* invented while it is being implemented.
