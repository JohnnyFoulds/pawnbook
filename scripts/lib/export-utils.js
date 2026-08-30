/**
 * @module scripts/lib/export-utils
 * Pure helper functions for deterministic dataset export.
 * All functions are side-effect-free and testable in isolation.
 */

import { createHash } from 'crypto';

/**
 * Sort rows by a key function and serialise as NDJSON (newline-delimited JSON).
 * The sort is stable and the output is deterministic: no map iteration order,
 * no wall-clock timestamps in the serialised bytes.
 *
 * @param {object[]} rows
 * @param {(row: object) => string|number|(string|number)[]} keyFn — primary sort key
 * @returns {string} — NDJSON string (no trailing newline if rows is empty)
 */
export function sortedNdjson(rows, keyFn) {
  if (!rows.length) return '';
  const sorted = rows.slice().sort((a, b) => {
    const ka = [].concat(keyFn(a));
    const kb = [].concat(keyFn(b));
    for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
      const ai = ka[i] ?? '';
      const bi = kb[i] ?? '';
      if (ai < bi) return -1;
      if (ai > bi) return 1;
    }
    return 0;
  });
  return sorted.map(r => JSON.stringify(r)).join('\n');
}

/**
 * Build a PGN string for a single game.
 * Deterministic: moves are sorted by ply, timestamps are from DB columns only.
 *
 * @param {object[]} moves — game_moves rows, each with { ply, san }
 * @param {object} game — games row with { id, opponent_id, result, player_color }
 * @param {boolean} anonymise — if true, omit the White header
 * @param {number|null} bookVersion — book_version at game time (optional)
 * @returns {string}
 */
export function buildPgn(moves, game, anonymise = false, bookVersion = null) {
  const sortedMoves = moves.slice().sort((a, b) => (a.ply ?? a.ply) - (b.ply ?? b.ply));

  const resultTag = game.result === 'win'
    ? (game.player_color === 'white' ? '1-0' : '0-1')
    : game.result === 'loss'
    ? (game.player_color === 'white' ? '0-1' : '1-0')
    : game.result === 'draw' ? '1/2-1/2' : '*';

  const headers = [
    `[GameId "${game.id}"]`,
    ...(anonymise ? [] : [`[White "Player"]`]),
    `[Black "${game.opponent_id ?? 'Unknown'}"]`,
    `[Result "${resultTag}"]`,
    ...(bookVersion != null ? [`[BookVersion "${bookVersion}"]`] : []),
  ].join('\n');

  // Build move text: "1. e4 e5 2. Nf3 Nc6 ..."
  const moveParts = [];
  for (let i = 0; i < sortedMoves.length; i++) {
    const ply = sortedMoves[i].ply ?? (i + 1);
    const isWhite = ply % 2 === 1;
    const moveNum = Math.ceil(ply / 2);
    if (isWhite) moveParts.push(`${moveNum}.`);
    moveParts.push(sortedMoves[i].san);
  }
  moveParts.push(resultTag);

  return `${headers}\n\n${moveParts.join(' ')}\n`;
}

/**
 * Compute a manifest: one line per file, "<sha256>  <filename>", sorted by filename.
 *
 * @param {Map<string, string|Buffer>} fileMap — filename → content
 * @returns {string}
 */
export function computeManifest(fileMap) {
  const entries = [...fileMap.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, content]) => {
      const hash = createHash('sha256').update(content).digest('hex');
      return `${hash}  ${name}`;
    });
  return entries.join('\n') + (entries.length ? '\n' : '');
}
