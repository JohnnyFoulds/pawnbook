# Research record — rated-Elo opening book

This document explains what a rated-Elo opening book is, why it is a useful feature,
why specific data sources were accepted or rejected, and how `scripts/build-opening-book.js`
builds the artefact.

The opening book is a **v2 feature** — it is not consumed by the v1 strength estimator.
Consuming it requires adding an `openingElo` column to `strength_samples`, fitting its
coefficient in `scripts/refit-strength.js` under the same ≥20-sample / ≥3-distinct-rating
rule, and only then putting it in the estimator. Fetching and documenting it now means the
v2 refit has something to fit against without re-analysing any games.

---

## §1 What it is and why it helps

The *choice of opening line* is a rating signal that is orthogonal to move quality. If a
position is reached overwhelmingly by 1200-rated players, reaching it is evidence about the
mover — and crucially this evidence is available **before any engine evaluation**, so it is
independent of everything in `docs/research/strength-estimation.md §1.4`.

The Kaggle *Finding Elo* competition (§1.5 of `strength-estimation.md`) quantified this:
the 2nd-place finisher's second-strongest feature family was a **10-million-game opening book
keyed by per-position Elo statistics**, built from the training corpus. With a free public API
that returns exactly this data ready-made, the same signal is available without a 10M-game
download.

---

## §2 Data source selection

Three routes were evaluated.

**Route 1 — OpeningMaster "OM GOLEM": rejected on licence.** 31.6 million games, CBV/PGN,
marketed as "FIDE's official education tool". It is a **paid annual subscription**. Not
redistributable, so it cannot be committed, and vendoring it would put a licence violation in
the repo.

**Route 2 — Lichess Opening Explorer: accepted.** `lichess-org/api`,
`doc/specs/tags/openingexplorer/lichess.yaml` declares:
- Host: `https://explorer.lichess.org`
- Security: `OAuth2` (a free scope-less personal token suffices)
- Parameters: `ratings=` (rating groups: 0, 1000, 1200, …, 2500) and `speeds=` (blitz, rapid)

The endpoint returns, per position, the game-count distribution across rating bands — the same
statistic the Kaggle runner-up built by hand from 10M games. The token is free and scope-less
(`lichess.org/account/oauth/token`); unauthenticated requests return HTTP 401.

**Route 3 — `database.lichess.org` monthly PGN dumps: blocked.** The CC0 `.pgn.zst` dumps
would allow building the book from scratch. But the TLS chain on this machine is intercepted
by Cisco Umbrella (`O = "OpenDNS, Inc.", CN = database.lichess.org`), and the intercepted
request returns **HTTP 403**. A genuine environmental constraint: this route needs a different
network, and at tens of GB per month it is the wrong shape for a repo artefact anyway.

---

## §3 The derived artefact

Rather than committing anyone's game database, `scripts/build-opening-book.js` builds a small
derived artefact and commits *that*: a bounded walk of the opening tree recording, per
position, the mean rating and game count. Source data stays remote and unredistributed.

### Position key

Positions are keyed by **EPD** (the first four FEN fields: board, side, castling, en passant),
not by move sequence. This makes the index transposition-safe: reaching the same position via
different move orders produces one entry, not two.

### Rating bands and representative values

The Explorer `ratings=` groups span: `0–999, 1000–1199, 1200–1399, …, 2200–2499, ≥2500`.
Interior bands use their true midpoints. The two open-ended bands are assigned **modal
representative values**, not arithmetic centres:

| Band param | Span | Representative | Rationale |
|---|---|---|---|
| `0` | 0–999 | **900** | Modal region near the upper bound; very few Lichess accounts are below 500 |
| `1000` | 1000–1199 | 1100 | midpoint |
| `1200` | 1200–1399 | 1300 | midpoint |
| `1400` | 1400–1599 | 1500 | midpoint |
| `1600` | 1600–1799 | 1700 | midpoint |
| `1800` | 1800–1999 | 1900 | midpoint |
| `2000` | 2000–2199 | 2100 | midpoint |
| `2200` | 2200–2499 | 2350 | midpoint |
| `2500` | ≥2500 | **2600** | Modal region near the lower bound; very few accounts are above 2800 |

The two open-ended representatives are **chosen constants, not derived ones**. They are
recorded in `calibration/opening-elo-book.json`'s provenance header (`bandRepresentatives`)
so a later refit can re-weight without re-crawling.

### Crawl bounds

Three constants control the artefact size:

| Parameter | Default | Effect |
|---|---|---|
| `--max-ply` | 20 | Maximum depth in half-moves; opening theory is largely settled by ply 20 |
| `--min-games` | 100 | Minimum games at a node before it is recorded and expanded |
| `--top-n` | 5 | Maximum children expanded per node |

Increase `--min-games` if the output exceeds ~1 MB before committing.

### Rate limit

≤ 1 request per second with a 50 ms margin. Backs off on HTTP 429 using the `retry-after`
header. Resumes from a partial output file on restart.

### Token requirement

Requires `LICHESS_TOKEN` in the environment. The script exits non-zero with the token URL
if absent:

```
LICHESS_TOKEN=... node scripts/build-opening-book.js [--max-ply N] [--min-games N] [--top-n N] [--dry-run]
```

### Output format

`calibration/opening-elo-book.json`:
```json
{
  "source": "Lichess Opening Explorer",
  "endpoint": "https://explorer.lichess.org/lichess",
  "fetchedAt": "2026-MM-DD",
  "speeds": ["blitz", "rapid"],
  "ratingGroups": ["0", "1000", ...],
  "bandRepresentatives": { "0": 900, "1000": 1100, ... },
  "maxPly": 20,
  "minGames": 100,
  "topN": 5,
  "nodeCount": N,
  "nodes": {
    "<epd>": { "n": 12345, "meanElo": 1456 },
    ...
  }
}
```

---

## §4 Scale caveat

The Explorer data is Lichess *online* ratings over blitz/rapid, consistent with the scale the
Maia nets were trained on. It is **not** the FIDE classical scale used in the Kaggle *Finding
Elo* competition (§1.5 of `strength-estimation.md`), so the competition's MAE figures are not
directly transferable. The v2 refit will measure the actual coefficient empirically.

---

## §5 Status

`scripts/build-opening-book.js` is written and exits non-zero with the correct URL when
`LICHESS_TOKEN` is absent. The crawl has not yet run (no token in this environment). The book
will be committed after a first crawl run; until then `calibration/opening-elo-book.json` does
not exist and the script can be run by anyone with a Lichess account.
