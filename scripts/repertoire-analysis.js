#!/usr/bin/env node
/**
 * Compute RQ metrics from an exported pawnbook research dataset.
 * Reads ONLY from the export directory — never from the live DB.
 * Output is reproducible: same export → same analysis files.
 *
 * Usage:
 *   node scripts/repertoire-analysis.js [--input ./export] [--output ./analysis]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);
const inputArg = args.indexOf('--input');
const outputArg = args.indexOf('--output');
const inputDir = inputArg !== -1 ? args[inputArg + 1] : './export';
const outputDir = outputArg !== -1 ? args[outputArg + 1] : './analysis';

mkdirSync(outputDir, { recursive: true });

function readNdjson(file) {
  const path = join(inputDir, file);
  if (!existsSync(path)) return [];
  const text = readFileSync(path, 'utf8').trim();
  if (!text) return [];
  return text.split('\n').map(line => JSON.parse(line));
}

function writeCsv(filename, headers, rows) {
  const lines = [headers.join(','), ...rows.map(r => headers.map(h => {
    const v = r[h] ?? '';
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(','))];
  writeFileSync(join(outputDir, filename), lines.join('\n') + '\n', 'utf8');
}

// ── RQ2: Coverage growth curve ────────────────────────────────────────────

function computeRq2() {
  const games = readNdjson('games.ndjson')
    .filter(g => g.status === 'finished' && g.played_at)
    .sort((a, b) => a.played_at - b.played_at);

  const moves = readNdjson('rep_moves.ndjson');

  const rows = [];
  for (let i = 0; i < games.length; i++) {
    const game = games[i];
    const canonicalAtTime = moves.filter(
      m => m.role === 'canonical' && m.first_played && m.first_played <= game.played_at
    ).length;
    const totalNodes = new Set(moves.map(m => `${m.epd}|${m.side}`)).size;
    const coveragePct = totalNodes > 0 ? Math.round((canonicalAtTime / totalNodes) * 100) : 0;

    rows.push({
      game_n: i + 1,
      game_id: game.id,
      played_at: game.played_at,
      canonical_nodes: canonicalAtTime,
      coverage_pct: coveragePct,
    });
  }

  writeCsv('rq2-coverage.csv',
    ['game_n', 'game_id', 'played_at', 'canonical_nodes', 'coverage_pct'],
    rows);
  return rows.length;
}

// ── RQ1: Refusal hit-rate ──────────────────────────────────────────────────

function computeRq1() {
  const challenges = readNdjson('rep_challenges.ndjson')
    .filter(c => c.status !== 'open');

  const rows = challenges.map(c => ({
    challenge_id: c.id,
    epd: c.epd,
    incumbent_uci: c.incumbent_uci,
    challenger_uci: c.challenger_uci,
    engine_delta: c.engine_delta_win_pts ?? '',
    result_delta: (c.result_challenger_perf != null && c.result_incumbent_perf != null)
      ? (c.result_challenger_perf - c.result_incumbent_perf).toFixed(4)
      : '',
    challenger_plays: c.challenger_plays,
    resolution: c.status,
    rule: c.resolution_rule ?? '',
  }));

  writeCsv('rq1-refusals.csv',
    ['challenge_id', 'epd', 'incumbent_uci', 'challenger_uci', 'engine_delta',
     'result_delta', 'challenger_plays', 'resolution', 'rule'],
    rows);

  const promoted = challenges.filter(c => c.status === 'promoted').length;
  const rejected = challenges.filter(c => c.status === 'rejected' || c.status === 'rejected_unsound').length;
  const hitRate = (promoted + rejected) > 0
    ? (promoted / (promoted + rejected) * 100).toFixed(1)
    : 'N/A';

  return { total: rows.length, promoted, rejected, hitRate };
}

// ── RQ5: Maia policy calibration stub ────────────────────────────────────

function computeRq5() {
  const policy = readNdjson('rep_nodes.ndjson').filter(n => n.reach_prob != null);

  if (!policy.length) {
    const content = '# No policy data yet — run games to populate rep_policy\npredicted_prob,observed_freq,count\n';
    writeFileSync(join(outputDir, 'rq5-calibration.csv'), content, 'utf8');
    return 0;
  }

  // Basic calibration: bucket reach_prob into deciles, compare vs actual encounter rate
  const buckets = Array.from({ length: 10 }, (_, i) => ({
    bucket: i,
    lower: i / 10,
    upper: (i + 1) / 10,
    predicted: [],
    observed: [],
  }));

  for (const n of policy) {
    const b = Math.min(9, Math.floor(n.reach_prob * 10));
    buckets[b].predicted.push(n.reach_prob);
    buckets[b].observed.push(n.encounters > 0 ? 1 : 0);
  }

  const rows = buckets
    .filter(b => b.predicted.length > 0)
    .map(b => ({
      bucket_lower: b.lower,
      bucket_upper: b.upper,
      predicted_prob: (b.predicted.reduce((a, v) => a + v, 0) / b.predicted.length).toFixed(4),
      observed_freq: (b.observed.reduce((a, v) => a + v, 0) / b.observed.length).toFixed(4),
      count: b.predicted.length,
    }));

  writeCsv('rq5-calibration.csv',
    ['bucket_lower', 'bucket_upper', 'predicted_prob', 'observed_freq', 'count'],
    rows);

  return rows.length;
}

// ── Summary ────────────────────────────────────────────────────────────────

const rq2Games = computeRq2();
const rq1Stats = computeRq1();
const rq5Buckets = computeRq5();

const summaryLines = [
  '# Repertoire analysis summary',
  '',
  `RQ2 Coverage growth: ${rq2Games} games processed → rq2-coverage.csv`,
  rq2Games < 5 ? '  NOTE: Need more games for a meaningful coverage curve.' : '',
  '',
  `RQ1 Refusal hit-rate: ${rq1Stats.total} resolved challenges → rq1-refusals.csv`,
  `  Promoted: ${rq1Stats.promoted} | Rejected: ${rq1Stats.rejected} | Hit-rate: ${rq1Stats.hitRate}%`,
  rq1Stats.total < 10 ? '  NOTE: Need more challenges for statistical confidence.' : '',
  '',
  `RQ5 Calibration: ${rq5Buckets} buckets → rq5-calibration.csv`,
  rq5Buckets === 0 ? '  NOTE: No policy data yet. Populate rep_policy by running games.' : '',
].filter(l => l !== undefined).join('\n');

writeFileSync(join(outputDir, 'summary.txt'), summaryLines + '\n', 'utf8');

console.log(summaryLines);
console.log(`\nAnalysis complete → ${outputDir}`);
