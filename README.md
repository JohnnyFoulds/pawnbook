# pawnbook

> Play chess engines locally, then drill your own mistakes with spaced repetition.

[![CI](https://github.com/JohnnyFoulds/pawnbook/actions/workflows/ci.yml/badge.svg)](https://github.com/JohnnyFoulds/pawnbook/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node 22](https://img.shields.io/badge/node-22-green.svg)](package.json)

---

## The training loop

1. **Play** a game against a Maia (human-shaped) or Stockfish (engine-shaped) opponent
2. **Analyse** — Stockfish grades every move; Maia checks whether a human at your level would have found the better one
3. **Quiz** — positions where you blundered and a human could have done better become puzzles, shown immediately while the game is fresh
4. **Drill** — FSRS spaced repetition resurfaces your own mistakes at the right interval, from a single opening blunder up to the full queue

The key idea: puzzles are filtered by `findability` — the probability that the Maia model at your rating would play the engine's best move. A mistake only becomes a drill if someone at your level could actually have found the right answer. Engine-only subtleties stay in the review but never enter the queue.

---

## Quickstart

```bash
# Prerequisites: Docker Desktop (arm64), Node 22, make
make setup          # copies Maia weights, checks binaries
docker compose up   # builds engines from source (~15 min first time)
open http://localhost:3000
```

Terminal client:

```bash
npm link            # puts 'chess' on $PATH
chess               # connect to the running server
chess --host dragon:3000   # remote, over ssh -L
```

---

## Opponents

| Name | ELO | Style |
|---|---|---|
| maia-1100 … maia-1900 | 1100–1900 | Human-like: loses the way people lose |
| maia-2200 | 2200 | Human-like (optional — present if the weight file exists) |
| sf-1400 … sf-2900 | 1400–2900 | Engine-shaped, `UCI_LimitStrength` |
| sf-max | 3190 | Full-strength Stockfish 18 |
| drawfish | unrated | Plays for stalemate; casual only |

Maia and Stockfish overlap in rating deliberately — same number, very different feel.

---

## Architecture

```
browser  ─┐
           ├── WS /ws + REST /api ──▶ Node server ──▶ engines (UCI) + SQLite
chess TUI ─┘
```

Three-layer (Interface → Domain → Ports), two implementations per port (real + in-memory fake), single SQLite file at `./data/chess.db`.

---

## Licensing

Our source code is **MIT**. The engines and Maia weights bundled in the Docker image are **GPL-3.0**. This is sound because:

- Engines run as separate processes over UCI stdin/stdout — GPL-3 does not reach across a process boundary
- No engine source or binaries are vendored in this repo; the Dockerfile clones upstream at build time
- **The built Docker image is a GPL-3 combined work and is not published to any registry**

See `LICENSES.md` for the full third-party inventory.
