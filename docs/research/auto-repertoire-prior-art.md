# Prior-art survey — auto-repertoire

**Date:** 2026-08-29  
**Author:** Johannes Foulds  
**Re-run before any submission** — §1 is a live commercial field. Dated each time.

Short answer: **yes in parts, no as a whole, and the missing part is missing for a structural reason
rather than by oversight.** This document is written to be attacked: every claim either has a
citation or is marked as a search that came back empty. The null results are recorded with the
exact queries so they can be contradicted.

---

## 1. Building a repertoire from your own games — thoroughly done

Post-hoc repertoire building from your own games is a crowded, mature space.

| Tool | Overlaps with us | Does not do |
|---|---|---|
| **chessdesk.app** (2024–) | Closest commercial analogue. Imports ~100 Lichess/Chess.com games by username and *"seeds your repertoire from the openings you already play"*; shows replies at your rating band; flags lines your repertoire doesn't answer; spaced repetition; *"check whether your real games followed your preparation."* URL: `https://chessdesk.app`. Accessed 2026-08-29. | Reach probability from Lichess crowd statistics, not opponent's own policy. Import is a one-off seed. Post-hoc only. No soundness gate. No record of deliberate deviation. |
| **Chessbook** (`chessbook.com`) | Soundness / Effectiveness / Learnability triad; "1 in X games" reach probability; recommended-move ordering. We adopt all three (§3, §4 of spec). | Repertoire is authored by the user; engine and crowd stats advise. No learning from play. |
| **ChessAtlas** (`chessatlas.com`) | Deviation-detection workflow over imported games; your-deviation-vs-opponent-deviation split adopted in §5 of spec. | Post-hoc report only. No book mutation. |
| **OpenBook Chess** (`openingchess.app`) | Free, Lichess-login; explorer at your rating band; "Find gaps", "Find weak moves", "Review games"; drip-feeds new lines into practice; eval-bar-off option. | Build-then-drill. Games are reviewed, not learned from. |
| **Chess Position Trainer** (c. 2010, `chesspositiontrainer.com`) | *"Learn from every game you play (including online blitz), because the key information is no longer more than one click away."* The game→repertoire loop idea is at least fifteen years old. | Manual, one click at a time, after the game. User decides everything. |
| **Chessdriller** (OSS), Repertree, chess-opening-tool, RecallChess, Openings Lab, Chessalyz, Chess Nexus, Listudy, Chessmadra, Chessable/ChessTempo/Bookup | Confirm field standard: position-keyed storage, spaced repetition, post-game prep checks. | Same shape: author or import a book, drill it, review games afterwards. |
| **Lichess** (`lichess.org`) | Opening explorer at rating bands; studies; a long-standing forum feature request for a repertoire editor asking for deviation detection *"after the game."* | Even the *wished-for* feature on the largest chess site is post-game. |

**Conclusion:** post-hoc repertoire building from your own games is not novel and we do not claim it.
chessdesk.app in particular does the seeding-plus-gap-report part well. Our §FR-REP-REACH coverage
and gap report is a re-implementation on a different probability source.

---

## 2. Alerting during the game — does not exist, for a structural reason

Searches for "in-game repertoire alert chess" and "chess coach live game deviation" return only:

- **Engine-overlay cheating extensions** (ChessSolve, Chessist, Chess Assist, Chess Pro and similar),
  which show a move suggestion during a live game. These are banned.
- **Platform fair-play rules:** Chess.com Terms of Service §4 and Lichess Fair Play rules both
  prohibit third-party assistance during a rated live game. Chess.com additionally states:
  *"takebacks are not available in Live Chess."* Source: `https://www.chess.com/learn-how-to-play-chess/chess-takebacks`
  accessed 2026-08-29.

**The structural point:** every tool in §1 runs on a platform it does not own. It can only see the
game as a finished PGN. pawnbook owns its own game loop, against Maia bots, on the user's own
machine, and can flip a game to unranked the moment it intervenes — so it can do, legitimately and
without fair-play questions, the one thing none of them can.

**The closest genuine prior art for the interaction: Lucas Chess's tutor** (`lucaschess.github.io`,
open source). When enabled it interrupts a game against an engine, shows the tutor's suggested move
beside the move you just played, and allows a retake. Same interaction pattern. Must be credited.
Three differences:

1. Reference move is the engine's — exactly what the user rejected.
2. No memory: declining the tutor is not recorded, nothing is learned from it.
3. Nothing adapts: there is no book that changes.

Intervene-and-retake exists. **Intervene against a book learned from your own play, and treat the
refusal as training data, does not.**

---

## 3. Learning a book from played games — done for engines, not for people

| Source | Status |
|---|---|
| Lincke, *Strategies for the Automatic Construction of Opening Books* (LNCS 2001, Computers and Games 2000) | Drop-out expansion, `Σ errors(path)` priority. **Directly borrowed.** |
| Hyatt, *Book Learning — a Methodology to Tune an Opening Book Automatically* (ICGA Journal 22(1), 1999) | Result-driven + search-driven (trend) learning. **Directly borrowed.** |
| Buro, *Toward Opening Book Learning* (ICCA Journal 22(2), 1999) | Learn reasonable alternatives, not just delete losers. **Directly borrowed.** |
| Hirsch, *Machine Learning in MChess Professional* (ACG 9, 2001) | Add/delete asymmetric thresholds; "score just out of book must not be too low." **Directly borrowed.** |
| Donkers, Uiterwijk & van den Herik, *Nosce Hostem* (2003) | Books tuned against a modelled opponent — same idea as our Maia reach probability. |
| Silver et al., AlphaZero (Science 2018) | Self-play book construction. Converges on strongest moves; opposite of our requirement to preserve weaker ones. |

Every source learns a book for the *program*, from its own games, with no human in the loop at the
moment of deviation. These systems cannot distinguish a memory failure from a change of mind —
they only have results to infer from. We get it as one bit, free, per deviation.

---

## 4. Human chess behaviour and personalisation

| Source | Relevance |
|---|---|
| McIlroy-Young et al., *Aligning Superhuman AI with Human Behavior* (KDD 2020, `doi:10.1145/3394486.3403219`) and *Learning Models of Individual Behavior in Chess* (KDD 2022 / arXiv 2008.10086) | Calibrated human-policy machinery for reach probability; closest thing in the literature to a personal chess model. Models move choice; does not build or maintain a repertoire; no intervention. |
| Chassy & Gobet, *Measuring Chess Experts' Single-Use Sequence Knowledge* (PLoS ONE 6(5), 2011) | Empirical study of players leaving known opening theory. Descriptive, over master databases; no per-player instrument. |
| Regan & Haworth, *Intrinsic Chess Ratings* (AAAI 2011) | Win%-loss grading scale our gates use. Not repertoire work. |
| Gobet & Simon (1996); Chase & Simon (1973); Charness et al. (2005); Einstellung-effect work (2007) | Chess expertise background for RQ4 and "understanding before memorisation." |
| *Comparing Typical Opening Move Choices Made by Humans and Chess Engines* (2006, ICGA Journal) | Human/engine opening divergence in aggregate — the phenomenon our style-tolerant gate accommodates. |

**Null results (recorded with queries for falsifiability):**

- Search: "opening repertoire intelligent tutoring system" on Google Scholar, arXiv, OpenAlex.
  Date: 2026-08-29. Result: chess ITS literature is **confined to endgames and Chinese chess**.
  No opening-repertoire ITS found.
- Search: "personalised opening repertoire recommender" on arXiv, Semantic Scholar, OpenAlex.
  Date: 2026-08-29. Result: no papers on repertoire optimisation as a formal problem, and no
  personalised recommender.
- Search: "opening book learning human player" on arXiv, Google Scholar.
  Date: 2026-08-29. Result: only the engine book-learning papers (§3).

These null results are findings, not gaps in the search. Re-run before submission.

---

## 5. What is genuinely novel — stated narrowly enough to defend

1. **Repertoire deviation detected and resolved in the position, against a book learned from the
   player's own games** — combining Lucas Chess's intervene-and-retake with chessdesk-style learned
   books, which no tool does, and which platform rules prevent third-party tools from doing at all.
2. **The refusal as a labelled datum.** A declined takeback is a conscious, timestamped, in-position
   statement that the book move is no longer wanted. No chess dataset contains this; no book-learning
   system has a mechanism to collect it.
3. **Style-tolerant admission with a hard blunder floor** — optimising for the player's own outcomes
   rather than engine agreement, with rule 5 of §FR-REP-CHAL-4 promoting a move the engine dislikes
   when results support it. Every tool in §1 treats engine agreement as the objective.
4. **Reach probability from the opponent's actual policy.** Opponents are Maia at a known Elo, so
   `p(reply | position)` is exact rather than estimated — which also makes RQ5 a clean calibration
   study.
5. **Zero curation cost.** Confirmation is repetition; promotion is automatic within the gates. The
   tools in §1 all require the user to author or approve the book.

---

## 6. What is not novel — must not be claimed

Position/EPD keying; spaced repetition of opening moves; seeding a book from your own games; coverage
and gap reports at your rating band; "1 in X games" reach probability; the Soundness/Effectiveness/
Learnability split; result-driven and search-driven book learning; drop-out expansion; win%-based move
grading; intervening during a game against a bot and offering a retake.

**All of these are prior art and are cited above.** The contribution is the specific combination in
§5 and the instrument it yields — not any single mechanism.
