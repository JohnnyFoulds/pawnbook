---
title: Terminal UI
---

# Terminal UI

pawnbook includes a terminal-based client as an alternative to the web interface. It connects to the same running server and shares the same database.

---

## Prerequisites

The server must be running before launching the TUI. The TUI is a client, not a standalone application.

The TUI requires optional dependencies:

```bash
npm install --include=optional
```

Optional packages: `terminal-kit`, `chartscii`, `sparkly`, `terminal-image`.

---

## Launching

```bash
npm run chess
```

Or directly:

```bash
node bin/chess.js
```

The TUI connects to `http://localhost:3000` by default (the same port as the web UI).

---

## Available screens

### Play

The Play screen shows an ASCII chess board and an opponent selector. Navigate the opponent list with arrow keys, confirm with Enter.

The board renders piece symbols on a two-tone grid:

| Square | Hex |
|---|---|
| Light | `#8f8b84` |
| Dark | `#5f6166` |

Moves are entered as UCI notation (e.g. `e2e4`, `g1f3`, `e7e8q` for promotion). The TUI accepts partial SAN input and completes it: typing `Nf3` is equivalent to `g1f3` when unambiguous.

Legal destination squares are marked with a `•` symbol.

### Drill

The Drill screen shows the same due-card queue as the web interface. Due count, position, and result feedback use the same FSRS scheduling. Cards drilled in the TUI are the same cards as the web UI — the database is shared.

Move input works the same way as the Play screen.

### Repertoire

The Repertoire screen shows the opening book tree: EPD positions, canonical moves, and role labels. Read-only; book management is done through the web interface.

### Stats

The Stats screen shows win/loss/draw counts, accuracy trend, and Elo history as terminal sparklines.

---

## Keyboard controls

| Key | Action |
|---|---|
| Arrow keys | Navigate lists and menus |
| Enter | Select / confirm |
| Escape | Go back |
| `q` | Quit the TUI |
| `r` | Resign (on the Play screen) |
| `h` | Request hint (unranked games only) |

---

## Colour support

The TUI uses ANSI-256 colour codes. On terminals that do not support 256 colours, it falls back to a monochrome rendering. The board remains functional in all modes.

Move quality colours (blunder through best) follow the same palette as the web interface.

---

## Shared state

All changes made through the TUI are immediately visible in the web interface, and vice versa. Both clients read from and write to the same `chess.db` file via the server API. There is no separate TUI database.
