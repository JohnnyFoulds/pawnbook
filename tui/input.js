/**
 * @module tui/input
 * SAN move input with prefix completion.
 *
 * Maintains a text buffer; as the user types, filters `legalMoves`
 * (an array of {uci, san}) to those whose SAN starts with the buffer
 * (case-insensitive). Tab completes to the longest common prefix.
 * An unambiguous prefix auto-submits on Enter.
 *
 * The TUI ships NO chess rules engine — legal moves come from the server's
 * `game_started` / `engine_move` messages as `[{uci, san}]`.
 *
 * @typedef {{ uci: string, san: string }} LegalMove
 */

/**
 * Filter legal moves whose SAN starts with a prefix (case-insensitive).
 *
 * @param {LegalMove[]} legalMoves
 * @param {string} prefix
 * @returns {LegalMove[]}
 */
export function filterMoves(legalMoves, prefix) {
  if (!prefix) return legalMoves;
  const p = prefix.toLowerCase();
  return legalMoves.filter((m) => m.san.toLowerCase().startsWith(p));
}

/**
 * Longest common prefix of an array of strings.
 *
 * @param {string[]} strs
 * @returns {string}
 */
export function longestCommonPrefix(strs) {
  if (!strs.length) return '';
  let prefix = strs[0];
  for (let i = 1; i < strs.length; i++) {
    while (!strs[i].startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
      if (!prefix) return '';
    }
  }
  return prefix;
}

/**
 * Complete the buffer to the longest common SAN prefix of the matching moves.
 *
 * @param {LegalMove[]} legalMoves
 * @param {string} buffer
 * @returns {string} — the new buffer after completion
 */
export function tabComplete(legalMoves, buffer) {
  const matches = filterMoves(legalMoves, buffer);
  if (!matches.length) return buffer;
  const lcp = longestCommonPrefix(matches.map((m) => m.san));
  return lcp.length > buffer.length ? lcp : buffer;
}

/**
 * Resolve an unambiguous buffer to a single LegalMove.
 * Returns the move if exactly one match, null otherwise.
 *
 * @param {LegalMove[]} legalMoves
 * @param {string} buffer
 * @returns {LegalMove|null}
 */
export function resolveMove(legalMoves, buffer) {
  const matches = filterMoves(legalMoves, buffer);
  if (matches.length === 1) return matches[0];
  // Exact SAN match even when multiple share the prefix (e.g. 'Nf3' vs 'Nf6')
  const exact = matches.find((m) => m.san.toLowerCase() === buffer.toLowerCase());
  return exact ?? null;
}

/**
 * Process a single keypress against the input state.
 * Returns the updated state object.
 *
 * @param {object} state
 * @param {string} state.buffer
 * @param {LegalMove[]} state.legalMoves
 * @param {string} key — single character or special key name
 * @returns {{ buffer: string, submitted: LegalMove|null, cleared: boolean }}
 */
export function processKey(state, key) {
  const { buffer, legalMoves } = state;
  let newBuffer = buffer;
  let submitted = null;
  let cleared = false;

  if (key === 'BACKSPACE' || key === '\x7f') {
    newBuffer = buffer.slice(0, -1);
  } else if (key === 'ESCAPE' || key === '\x1b') {
    newBuffer = '';
    cleared = true;
  } else if (key === 'TAB' || key === '\t') {
    newBuffer = tabComplete(legalMoves, buffer);
  } else if (key === 'ENTER' || key === '\r' || key === '\n') {
    const move = resolveMove(legalMoves, buffer);
    if (move) {
      submitted = move;
      newBuffer = '';
    }
  } else if (key.length === 1 && key >= ' ') {
    // Printable character
    newBuffer = buffer + key;
  }

  return { buffer: newBuffer, submitted, cleared };
}
