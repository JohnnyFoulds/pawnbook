# Art direction

## The one-line statement

> **A quiet, unlit room with a well-made board in it.** Warm neutral wood tones on a near-black surface, no ornament, no glow. The only saturated colour on screen is information.

Rules out: gradients, glassmorphism, glows, drop shadows, gamified badges, rounded cartoon pieces, neon accents, decorative illustration.

Rules in: flat fills, hairline rules, generous negative space, one accent used sparingly.

## Reference

Fritz for DOS (ChessBase 1992–95): four colours, texture instead of tone, permanent key bar, zero ornament. Not nostalgia — a demonstration that a chess interface needs almost nothing, and that constraint-driven design ages better than styling.

## Board — web (validated)

Appears on four of seven pages: `play`, `quiz`, `puzzles`, and `review` (read-only scrub board). One component with a read-only mode.

| Role | Value | Notes |
|---|---|---|
| Light square | `#b0a89d` | warm neutral — boxwood |
| Dark square | `#63666b` | cooler gray-blue |
| Last move | `#d9b310` @ 46% | composites to `#c3ad5c` / `#998941` |
| Check | `#d03b3b` @ 45% | composites to `#be7771` / `#945355` |
| Selected | `#3987e5` @ 44% | composites to `#7c99bd` / `#5175a1` |
| Legal destination | `•` marker | consistent with TUI |
| Board frame | 1px `--hairline` ring, 8px radius, no shadow | |
| Coordinates | outside board, `--ink-muted`, 11px | |

### Validation results (all pass)

- Base squares ΔE 22.7
- Dark square 3.37:1 vs surface-page, 3.16:1 vs surface-1
- Every tint ΔE ≥ 8 from its own base square (worst: last-move on light, 8.9)
- Every tint pair ΔE ≥ 12.9 on both squares
- Piece contrast: black 3.63–9.45:1, white 2.22–5.79:1 (white-on-light-last-move 2.22:1 — requires outlined piece set)

### Failed candidates (recorded to prevent re-trying)

- `premove` tint: gray-over-gray lands ΔE 5.6 from `selected` on both squares — no alpha fixes it
- Last move at 30% alpha: ΔE 6.0 from light square — visually nothing

### Piece set: `staunty`

Heavier silhouettes and thicker outlines. The outline carries the white piece at 2.22:1 on a last-move-tinted light square. One-line swap; both evaluated in Phase 9. Staunty is the default.

## Board — TUI (validated)

Different hexes by necessity: pieces are pinned to pure white/black, forcing luminance [0.10, 0.30].

| Role | Hex | Y | White pc | Black pc |
|---|---|---|---|---|
| Light square | `#8f8b84` | 0.260 | 3.39:1 | 6.19:1 |
| Dark square | `#5f6166` | 0.119 | 6.20:1 | 3.39:1 |
| Last move | `#78753f` | 0.171 | 4.76:1 | 4.41:1 |
| Check | `#96564d` | 0.137 | 5.62:1 | 3.74:1 |

All in band; worst piece/square 3.39:1. Square ΔE: light↔dark 14.7, all pairs ≥ 9.7.

Close pair dark↔check (ΔE 9.7) covered by hatch presence + `+` marker.

## Typography

System sans throughout: `system-ui, -apple-system, "Segoe UI", sans-serif`. No webfont anywhere.

| Role | Size | Weight |
|---|---|---|
| Hero figure | 48–56px | 600 |
| Stat value | 28px | 600 |
| Section heading | 20px | 600 |
| Body | 15px | 400 |
| Move list / tables | 14px | 400 — `tabular-nums` |
| Caption / axis | 13px | 400 — `--ink-muted` |
| Board coordinates | 11px | 400 — `--ink-muted` |

Proportional figures on hero and stat values. `tabular-nums` only in aligned columns. Weight floor: 400 (300 reads thin on a near-black surface).

## Motion language

| Event | Duration | Notes |
|---|---|---|
| Piece move (yours) | 0 ms | instant — you know what you did |
| Piece move (engine) | 200 ms | `cubic-bezier(.2,.7,.3,1)` |
| Capture | 200 ms | move, captured piece fades 120 ms |
| Drill correct flash | 400 ms | hold, auto-advance after 1.2 s |
| Panel / card enter | 150 ms | opacity + 4px rise |
| Chart refetch | 200 ms | previous render at 40%, never skeleton |
| Thinking pulse | 1.4 s loop | opacity 0.4↔1.0 on dot only |

`prefers-reduced-motion: reduce` → all durations to 0, disable pulse and auto-advance.

## Move quality palette (validated)

Diverging red ↔ blue, neutral gray midpoint. Ordinal scale — not categorical.

| Tier | Glyph | Dark hex |
|---|---|---|
| Blunder | `??` | `#dd7065` |
| Mistake | `?` | `#b85a50` |
| Inaccuracy | `?!` | `#8f4a45` |
| OK | — | `#6f6f69` |
| Good | — | `#256abf` |
| Great | `!` | `#3987e5` |
| Best | `!!` | `#6da7ec` |

Validated: all ordinal checks pass on `--surface #151517 --mode dark`. First attempt failed — `#ef7a72`/`#86b6ef` fell outside the dark lightness band.

`OK` and `Good` have no chess glyph. They are never separated by colour alone: move list annotates only the five glyph tiers; all seven appear in the breakdown bar where each segment is directly labelled.

## Design tokens

```css
--surface-page:  #0d0d0d;
--surface-1:     #151517;
--surface-2:     #1e1e21;
--ink-primary:   #ffffff;
--ink-secondary: #c3c2b7;
--ink-muted:     #898781;
--gridline:      #2c2c2a;
--baseline:      #383835;
--accent:        #3987e5;
--hairline:      rgba(255,255,255,0.10);
--good:          #0ca30c;
--critical:      #d03b3b;
--sq-light:      #b0a89d;
--sq-dark:       #63666b;
--sq-lastmove:   rgba(217,179,16,0.46);
--sq-check:      rgba(208,59,59,0.45);
--sq-selected:   rgba(57,135,229,0.44);
```

## Identity

`pawnbook` — lowercase wordmark, weight 600, tracking `-0.02em`, drawn pawn SVG to its left. The `♟` character is NOT used in the wordmark — it acquired emoji presentation in Unicode 11 and may render full-colour. `favicon.svg` is a drawn pawn silhouette in `--ink-primary` on transparent, plus a 32px PNG fallback.

## Sound

Six CC0 samples, ≤ 60 ms each: `move`, `capture`, `check`, `game-end`, `drill-correct`, `drill-wrong`. Off by default. Listed in `LICENSES.md` with provenance. Lichess samples are not CC0. Fully droppable; built last.
