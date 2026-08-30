#!/usr/bin/env node
/**
 * scripts/playtest.js — automated end-to-end playtest
 *
 * Plays a full ladder sample against the running server, waits for analysis,
 * exercises the drill API, and prints a balance report.
 *
 * Usage:
 *   node scripts/playtest.js [--host localhost:3000] [--games 16] [--db ./data/chess.db]
 *
 * The server must already be running.
 */

import WebSocket from 'ws';
import Database from 'better-sqlite3';

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function flag(name, def) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : def;
}
const HOST    = flag('--host', 'localhost:3000');
const DB_PATH = flag('--db', './data/chess.db');
const MAX_GAMES_FLAG = parseInt(flag('--games', '16'), 10);

const BASE_URL = `http://${HOST}`;
const WS_URL   = `ws://${HOST}/ws`;

// ── Ladder schedule ───────────────────────────────────────────────────────────
// One slice of the 20-game protocol; covers Maia low/mid/high + SF mid + Drawfish.
// Colour alternates white/black to get both perspectives.

const SCHEDULE = [
  { opponentId: 'maia-1100', color: 'white' },
  { opponentId: 'maia-1100', color: 'black' },
  { opponentId: 'maia-1300', color: 'white' },
  { opponentId: 'maia-1500', color: 'black' },
  { opponentId: 'maia-1500', color: 'white' },
  { opponentId: 'maia-1700', color: 'black' },
  { opponentId: 'maia-1900', color: 'white' },
  { opponentId: 'sf-1400',   color: 'black' },
  { opponentId: 'sf-1400',   color: 'white' },
  { opponentId: 'sf-1700',   color: 'black' },
  { opponentId: 'sf-1700',   color: 'white' },
  { opponentId: 'sf-2000',   color: 'black' },
  { opponentId: 'maia-1200', color: 'white' },
  { opponentId: 'maia-1600', color: 'black' },
  { opponentId: 'maia-1800', color: 'white' },
  { opponentId: 'drawfish',  color: 'black' },
].slice(0, MAX_GAMES_FLAG);

// ── helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJson(path, opts = {}) {
  const res = await fetch(`${BASE_URL}${path}`, opts);
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

function pickMove(legalMoves) {
  // Weighted random: 20% chance of picking the first move (usually reasonable),
  // 80% truly random — generates a realistic mistake rate.
  if (!legalMoves || legalMoves.length === 0) return null;
  if (Math.random() < 0.2) return legalMoves[0].uci;
  return legalMoves[Math.floor(Math.random() * legalMoves.length)].uci;
}

// ── play one game ─────────────────────────────────────────────────────────────

function playGame({ opponentId, color }) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    let gameId = null;
    let moveCount = 0;
    // 60 moves is sufficient to generate mistakes; beyond that analysis time
    // grows linearly and the pre-eval queue can overflow the 5-min analysis timeout.
    const MAX_MOVES = 60;

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'new_game', opponentId, color, ranked: false }));
    });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      if (msg.type === 'game_started') {
        gameId = msg.gameId;
        // Only send a move if it's the player's turn — white moves first.
        // When playing black, wait for the engine's first engine_move instead.
        if (msg.youPlay === 'white') {
          const uci = pickMove(msg.legalMoves);
          if (uci) ws.send(JSON.stringify({ type: 'move', uci }));
        }
      }

      if (msg.type === 'engine_move') {
        moveCount++;
        if (!msg.gameOver) {
          if (moveCount >= MAX_MOVES) {
            // Resign cleanly so the game record is complete and analysis runs.
            ws.send(JSON.stringify({ type: 'resign' }));
          } else {
            const uci = pickMove(msg.legalMoves);
            if (uci) ws.send(JSON.stringify({ type: 'move', uci }));
          }
        }
      }

      if (msg.type === 'game_over' || (msg.type === 'engine_move' && msg.gameOver)) {
        ws.close();
      }

      if (msg.type === 'error') {
        ws.close();
        reject(new Error(`WS error: ${msg.error_code} — ${msg.message}`));
      }
    });

    ws.on('close', () => resolve(gameId));
    ws.on('error', reject);
  });
}

// ── wait for analysis ─────────────────────────────────────────────────────────

async function waitForAnalysis(gameId, timeoutMs = 5 * 60 * 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { games } = await fetchJson('/api/games').catch(() => ({ games: [] }));
    const g = games.find(x => x.id === gameId);
    if (!g) { await sleep(2000); continue; }
    if (g.analysisState === 'done' || g.analysisState === 'failed') return g.analysisState;
    process.stdout.write('.');
    await sleep(3000);
  }
  return 'timeout';
}

// ── drill all due puzzles ─────────────────────────────────────────────────────

async function drillAllPuzzles(db) {
  const puzzles = db.prepare(`
    SELECT p.id, p.best_move_uci, p.accepted_moves_json
    FROM puzzles p
    JOIN fsrs_cards c ON c.puzzle_id = p.id
    WHERE c.graduated = 0
  `).all();

  let attempted = 0, correct = 0, errors = 0;

  for (const p of puzzles) {
    // Parse accepted moves; fall back to best_move_uci
    let accepted = [];
    try { accepted = JSON.parse(p.accepted_moves_json || '[]'); } catch { /**/ }
    if (accepted.length === 0 && p.best_move_uci) accepted = [p.best_move_uci];
    if (accepted.length === 0) continue;

    const correctMove = accepted[0];

    // Attempt 1: wrong move (pick something unlikely to be in accepted)
    // We'll just use a "null move" pattern — send 'a1a1' which will be rejected
    // by Zod (invalid UCI) so skip and go straight to correct attempt for now.
    // Real human testing will cover the retry flow.

    // Attempt correct move
    try {
      const res = await fetchJson(`/api/puzzles/${p.id}/attempt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          move: correctMove,
          msTaken: 8000 + Math.floor(Math.random() * 12000),
          hintUsed: false,
          attemptNo: 1,
          phase: 'drill',
        }),
      });
      attempted++;
      if (res.correct) correct++;
    } catch {
      errors++;
    }

    await sleep(100); // don't hammer the server
  }

  return { attempted, correct, errors };
}

// ── metrics from DB ───────────────────────────────────────────────────────────

function collectMetrics(db, gameIds) {
  const placeholders = gameIds.map(() => '?').join(',');

  const games = db.prepare(`
    SELECT id, opponent_id, player_color, result, accuracy, analysis_state
    FROM games WHERE id IN (${placeholders})
  `).all(gameIds);

  const puzzles = db.prepare(`
    SELECT p.source_game_id, p.classification, p.findability, p.temptation,
           p.instructiveness, p.tags, p.maia_model
    FROM puzzles p WHERE p.source_game_id IN (${placeholders})
  `).all(gameIds);

  const done        = games.filter(g => g.analysis_state === 'done').length;
  const failed      = games.filter(g => g.analysis_state === 'failed').length;
  const engineOnly  = puzzles.filter(p => (p.tags || '').includes('engine_only')).length;
  const commonTrap  = puzzles.filter(p => (p.tags || '').includes('common_trap')).length;
  const findabilities = puzzles.map(p => p.findability).filter(Boolean);
  const avgFind     = findabilities.length
    ? (findabilities.reduce((a, b) => a + b, 0) / findabilities.length).toFixed(3)
    : 'n/a';

  const byGame = {};
  for (const g of games) {
    byGame[g.id] = { ...g, puzzles: [] };
  }
  for (const p of puzzles) {
    if (byGame[p.source_game_id]) byGame[p.source_game_id].puzzles.push(p);
  }

  return {
    games: Object.values(byGame),
    totals: {
      games: games.length,
      analysedOk: done,
      analysedFailed: failed,
      puzzles: puzzles.length,
      engineOnly,
      commonTrap,
      avgFindability: avgFind,
      puzzlesPerGame: puzzles.length / Math.max(done, 1),
    },
  };
}

// ── report ────────────────────────────────────────────────────────────────────

function printReport(metrics, drillStats) {
  const { totals, games } = metrics;

  console.log('\n' + '='.repeat(60));
  console.log('PLAYTEST REPORT');
  console.log('='.repeat(60));
  console.log(`Games played:       ${totals.games}`);
  console.log(`Analysis done:      ${totals.analysedOk}  failed: ${totals.analysedFailed}`);
  console.log(`Puzzles generated:  ${totals.puzzles}  (${totals.puzzlesPerGame.toFixed(1)}/game)`);
  console.log(`  engine_only:      ${totals.engineOnly}`);
  console.log(`  common_trap:      ${totals.commonTrap}`);
  console.log(`  avg findability:  ${totals.avgFindability}`);
  console.log('');
  console.log(`Drill attempts:     ${drillStats.attempted}  correct: ${drillStats.correct}  errors: ${drillStats.errors}`);
  console.log('');

  // Balance flags
  const flags = [];
  if (totals.engineOnly === 0 && totals.puzzles > 0) {
    flags.push('⚠  Zero engine_only puzzles — FINDABILITY_MIN may be too high (filter not filtering)');
  }
  if (totals.analysedFailed > 0) {
    flags.push(`⚠  ${totals.analysedFailed} analysis failure(s) — check server logs`);
  }
  if (totals.puzzlesPerGame < 0.5 && totals.analysedOk > 5) {
    flags.push('⚠  Very few puzzles/game — player may be too strong for the opponent set, or FINDABILITY_MIN too high');
  }
  if (totals.puzzlesPerGame > 8) {
    flags.push('⚠  Many puzzles/game — cap may be too high, or player is blundering heavily');
  }

  if (flags.length === 0) {
    console.log('✓  No balance flags');
  } else {
    console.log('Balance flags:');
    flags.forEach(f => console.log(' ', f));
  }

  console.log('\nPer-game breakdown:');
  for (const g of games) {
    const acc = g.accuracy != null ? `${g.accuracy.toFixed(0)}%` : '  ?%';
    const tags = g.puzzles.map(p => p.tags).filter(Boolean).join(' ');
    console.log(
      `  ${g.opponent_id.padEnd(12)} ${(g.player_color||'').padEnd(6)} ${(g.result||'?').padEnd(10)}`
      + ` acc:${acc.padStart(4)}  puzzles:${g.puzzles.length}  ${g.analysis_state}`
      + (tags ? `  [${[...new Set(g.puzzles.map(p=>p.tags))].join(',')}]` : ''),
    );
  }

  console.log('\n' + '='.repeat(60));
  console.log('Paste the above into docs/game/playtest_log.md');
  console.log('='.repeat(60) + '\n');
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Automated playtest — ${SCHEDULE.length} games against ${HOST}`);
  console.log('Server must be running. Ctrl-C to abort.\n');

  // Verify server is up
  await fetchJson('/api/opponents').catch(() => {
    console.error(`Cannot reach ${BASE_URL}. Start the server first: node src/server.js`);
    process.exit(1);
  });

  const db = new Database(DB_PATH);
  const gameIds = [];

  for (let i = 0; i < SCHEDULE.length; i++) {
    const { opponentId, color } = SCHEDULE[i];
    process.stdout.write(`[${i + 1}/${SCHEDULE.length}] ${opponentId} (${color}) … `);

    let gameId;
    try {
      gameId = await playGame({ opponentId, color });
      if (!gameId) throw new Error('no gameId returned');
      gameIds.push(gameId);
      process.stdout.write(`game ${gameId.slice(0, 8)} — waiting for analysis `);
      const state = await waitForAnalysis(gameId);
      console.log(` ${state}`);
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
    }

    // Small gap between games so engines aren't piled up
    await sleep(1000);
  }

  console.log('\nAll games played. Exercising drill API…');

  const drillStats = await drillAllPuzzles(db);

  if (gameIds.length === 0) {
    console.log('No games completed — nothing to report.');
    process.exit(1);
  }

  const metrics = collectMetrics(db, gameIds);
  printReport(metrics, drillStats);
}

main().catch(e => { console.error(e); process.exit(1); });
