# Third-party licences

## Our source code

| Component | Licence |
|---|---|
| `src/`, `tui/`, `public/`, `bin/`, `scripts/` | MIT — see `LICENSE` |

## Engines (compiled from source at Docker build time — not vendored)

| Component | Licence | Source |
|---|---|---|
| Stockfish 18 | GPL-3.0 | https://github.com/official-stockfish/Stockfish |
| lc0 0.32.1 | GPL-3.0 | https://github.com/LeelaChessZero/lc0 |
| Drawfish | GPL-3.0 | https://github.com/nmrugg/Drawfish |
| Maia weights (maia-1100 … maia-2200) | GPL-3.0 | https://github.com/CSSLab/maia-chess |

## Runtime npm dependencies

Key dependencies and their licences:

| Package | Licence |
|---|---|
| better-sqlite3 | MIT |
| chess.js | BSD-2-Clause |
| cm-chessboard | MIT |
| express | MIT |
| node-uci | MIT |
| pino | MIT |
| ts-fsrs | MIT |
| ws | MIT |
| zod | MIT |
| terminal-kit | MIT |
| chartscii | MIT |
| sparkly | MIT |

Run `npm ls --all --json` for the complete dependency tree.

## Licence boundary

The engines are spoken to over UCI on stdin/stdout — an arm's-length arrangement identical
to every other chess GUI. GPL-3 does not reach across a process boundary of this kind,
so `pawnbook`'s own source stays MIT.

**The built Docker image is a GPL-3 combined work.** It is not published to any registry.
If it were published, the offer-of-source obligation under GPL-3 section 6 would attach.
This note is here to keep that decision visible rather than accidental.
