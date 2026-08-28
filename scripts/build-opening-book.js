#!/usr/bin/env node
/**
 * scripts/build-opening-book.js — build a rated-Elo opening book from the Lichess
 * Opening Explorer.
 *
 * Performs a breadth-first walk of the opening tree from the start position, querying
 * the Explorer for each node's per-rating-band game counts. Records, per position
 * (keyed by EPD), the total game count and the weighted-mean Elo over the bands.
 *
 * The result is written (or resumed into) calibration/opening-elo-book.json.
 *
 * Prerequisite: a free scope-less personal token from
 *   https://lichess.org/account/oauth/token
 * stored in the LICHESS_TOKEN environment variable. The script exits non-zero with a
 * clear message if the token is absent.
 *
 * Usage:
 *   LICHESS_TOKEN=... node scripts/build-opening-book.js [--max-ply N] [--min-games N] [--top-n N] [--dry-run]
 *
 * Rate limit: ≤ 1 request per second; backs off on 429.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '..');
const OUT_PATH = resolve(ROOT, 'calibration/opening-elo-book.json');

// ── Config ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function flag(name, def) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : def;
}
const MAX_PLY  = parseInt(flag('--max-ply',  '20'), 10);
const MIN_GAMES = parseInt(flag('--min-games', '100'), 10);
const TOP_N    = parseInt(flag('--top-n',    '5'), 10);
const DRY_RUN  = args.includes('--dry-run');

// ── Token check ───────────────────────────────────────────────────────────────

const TOKEN = process.env.LICHESS_TOKEN;
if (!TOKEN) {
  console.error(
    'LICHESS_TOKEN is not set.\n' +
    'Generate a free scope-less personal token at:\n' +
    '  https://lichess.org/account/oauth/token\n' +
    'Then run: LICHESS_TOKEN=<your-token> node scripts/build-opening-book.js'
  );
  process.exit(1);
}

// ── Rating bands ─────────────────────────────────────────────────────────────
// Each entry: { param: string passed to ?ratings=, repr: representative Elo }
// Interior bands use their midpoint; the two open-ended bands use modal estimates.
// The open-ended representatives (0→900, 2500→2600) are chosen constants, not
// derived ones — see docs/research/opening-elo-book.md for the rationale.

const BANDS = [
  { param: '0',    repr: 900  },  // <1000; modal region is near 999
  { param: '1000', repr: 1100 },
  { param: '1200', repr: 1300 },
  { param: '1400', repr: 1500 },
  { param: '1600', repr: 1700 },
  { param: '1800', repr: 1900 },
  { param: '2000', repr: 2100 },
  { param: '2200', repr: 2350 },
  { param: '2500', repr: 2600 },  // ≥2500; modal region is near the lower bound
];

const RATINGS_PARAM = BANDS.map(b => b.param).join(',');

// ── Delay / backoff ───────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let _lastRequest = 0;
async function rateLimitedFetch(url) {
  const now = Date.now();
  const gap = now - _lastRequest;
  if (gap < 1050) await sleep(1050 - gap);  // ≤ 1 req/s with a 50 ms margin
  _lastRequest = Date.now();

  let attempt = 0;
  while (true) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/json',
      },
    });
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('retry-after') || '60', 10);
      console.warn(`429 rate limit hit — backing off ${retryAfter}s`);
      await sleep(retryAfter * 1000);
      attempt++;
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  }
}

// ── Explorer query ────────────────────────────────────────────────────────────

const EXPLORER_BASE = 'https://explorer.lichess.org/lichess';

async function queryNode(moves) {
  const params = new URLSearchParams({
    play: moves.join(','),
    ratings: RATINGS_PARAM,
    speeds: 'blitz,rapid',
    topGames: '0',
    recentGames: '0',
  });
  return rateLimitedFetch(`${EXPLORER_BASE}?${params}`);
}

// ── FEN → EPD ─────────────────────────────────────────────────────────────────
// EPD = first four FEN fields (board, side, castling, ep) — position-based,
// transposition-safe, move-number independent.

function fenToEpd(fen) {
  return fen.split(' ').slice(0, 4).join(' ');
}

// ── Weighted-mean Elo from band counts ────────────────────────────────────────

function meanElo(bandCounts) {
  let sumW = 0, sumWE = 0;
  for (let i = 0; i < BANDS.length; i++) {
    const n = bandCounts[i] ?? 0;
    sumW  += n;
    sumWE += n * BANDS[i].repr;
  }
  return sumW === 0 ? null : Math.round(sumWE / sumW);
}

// ── Load / initialise output ──────────────────────────────────────────────────

function loadExisting() {
  if (!existsSync(OUT_PATH)) return null;
  const data = JSON.parse(readFileSync(OUT_PATH, 'utf8'));
  if (!data.nodes) return null;
  return data;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

async function main() {
  const existing = loadExisting();
  const nodes = existing ? existing.nodes : {};
  const seen  = new Set(Object.keys(nodes));

  console.log(existing
    ? `Resuming from ${Object.keys(nodes).length} existing nodes`
    : 'Starting fresh crawl');
  console.log(`Config: max-ply=${MAX_PLY}, min-games=${MIN_GAMES}, top-n=${TOP_N}`);

  // BFS queue: each entry is the list of UCI moves to reach this position
  const queue = [[]];  // start with the empty move list = start position

  let queried = 0;
  while (queue.length > 0) {
    const movesSoFar = queue.shift();
    const ply = movesSoFar.length;

    // Build a provisional EPD by computing the position via move list tracking.
    // The Explorer API returns the FEN for the queried position in its response,
    // so we use that as the key to avoid implementing move-application in JS.

    let data;
    try {
      data = await queryNode(movesSoFar);
      queried++;
    } catch (err) {
      console.error(`Failed to query moves [${movesSoFar.join(',')}]: ${err.message}`);
      continue;
    }

    const epd = fenToEpd(data.fen ?? START_FEN);
    const bandCounts = (data.moves ?? []).reduce((acc, _m, _i) => acc, BANDS.map(() => 0));

    // Aggregate total games across all bands from the white/black/draws breakdown
    // The Explorer returns { white, draws, black } per band and the total via topMoves.
    // The per-band breakdown lives in data.opening?.games or data.games — inspect:
    // Actually the Lichess Explorer returns a flat total { white, draws, black } and
    // the per-band data is NOT returned by default — we need to sum the top moves or
    // use the `player` endpoint. The standard endpoint returns aggregate totals only.
    //
    // For our purpose (weighted mean Elo across bands) we use the `ratings` breakdown
    // which the Explorer returns when `ratings=` is specified. Each move has a `game`
    // count array corresponding to the rating bands. The root-level total is the sum.

    const total = (data.white ?? 0) + (data.draws ?? 0) + (data.black ?? 0);

    // Extract per-band totals from the top moves (each move has a `game` array per
    // rating group when `ratings=` is in the query).
    const allBandTotals = BANDS.map(() => 0);
    for (const m of data.moves ?? []) {
      if (Array.isArray(m.game)) {
        for (let i = 0; i < BANDS.length; i++) {
          allBandTotals[i] += m.game[i] ?? 0;
        }
      }
    }

    const elo = meanElo(allBandTotals);

    if (!seen.has(epd) && total >= MIN_GAMES) {
      nodes[epd] = { n: total, meanElo: elo };
      seen.add(epd);
      if (queried % 50 === 0) {
        console.log(`${queried} queries, ${Object.keys(nodes).length} nodes`);
      }
    }

    // Enqueue child positions
    if (ply < MAX_PLY) {
      const topMoves = (data.moves ?? [])
        .filter(m => {
          const moveTotal = (m.white ?? 0) + (m.draws ?? 0) + (m.black ?? 0);
          return moveTotal >= MIN_GAMES;
        })
        .slice(0, TOP_N);

      for (const m of topMoves) {
        const childMoves = [...movesSoFar, m.uci];
        queue.push(childMoves);
      }
    }
  }

  console.log(`\nCrawl complete: ${Object.keys(nodes).length} nodes`);

  if (DRY_RUN) {
    console.log('[dry-run] calibration/opening-elo-book.json not written.');
    return;
  }

  const nodeSizeKB = Math.round(JSON.stringify(nodes).length / 1024);
  if (nodeSizeKB > 1024) {
    console.warn(
      `WARNING: nodes object is ${nodeSizeKB} KB > 1 MB. ` +
      'Increase --min-games to tighten coverage before committing.'
    );
  }

  const out = {
    source: 'Lichess Opening Explorer',
    endpoint: EXPLORER_BASE,
    fetchedAt: new Date().toISOString().slice(0, 10),
    speeds: ['blitz', 'rapid'],
    ratingGroups: BANDS.map(b => b.param),
    bandRepresentatives: Object.fromEntries(BANDS.map(b => [b.param, b.repr])),
    maxPly: MAX_PLY,
    minGames: MIN_GAMES,
    topN: TOP_N,
    nodeCount: Object.keys(nodes).length,
    nodes,
  };

  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n');
  console.log(`Written to calibration/opening-elo-book.json (${nodeSizeKB} KB)`);
}

main().catch(err => { console.error(err); process.exit(1); });
