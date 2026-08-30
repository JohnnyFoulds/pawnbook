/**
 * @module domain/repertoire/deviation
 * Classifies a played move against the current book node.
 * Table is evaluated top-to-bottom; first matching row wins.
 * See feature_spec.md §FR-REP-BOOK row definitions.
 */

import { ACCEPTED_SET } from './state.js';

/**
 * @typedef {'in_book_canonical'|'in_book_alt'|'in_book_challenger'|'in_book_quarantined'
 *   |'refused_repeat'|'transposition'|'new_territory'|'order_slip'|'lapse'|'novelty'} DeviationKind
 */

/**
 * Classify a played move at a node.
 *
 * @param {{
 *   playedUci: string,
 *   nodeRole: import('./state.js').ROLES[number]|null,   // role of playedUci at this node; null = unknown
 *   nodeHasCanonical: boolean,                           // this node has a canonical move
 *   resultingEpdInBook: boolean,                         // EPD after the move is a known book node
 *   nodeHasDrillHistory: boolean,                        // node has a mature FSRS card
 *   reachableBookUcis: string[]|null,                    // canonical/alt moves reachable from here; null = unknown
 * }} params
 * @returns {{ kind: DeviationKind, alert: boolean }}
 */
export function classifyDeviation({
  playedUci,
  nodeRole,
  nodeHasCanonical,
  resultingEpdInBook,
  nodeHasDrillHistory,
  reachableBookUcis,
}) {
  // Row 1 — refused_repeat: only alerts when the node also has a canonical move to offer
  if (nodeRole === 'refused' && nodeHasCanonical) {
    return { kind: 'refused_repeat', alert: true };
  }

  // Row 2 — in accepted set (canonical, alt, challenger, quarantined)
  if (nodeRole !== null && ACCEPTED_SET.has(nodeRole)) {
    const kind = nodeRole === 'canonical' ? 'in_book_canonical'
      : nodeRole === 'alt' ? 'in_book_alt'
      : nodeRole === 'challenger' ? 'in_book_challenger'
      : 'in_book_quarantined';
    return { kind, alert: false };
  }

  // Row 3 — transposition: resulting EPD is already a book node
  if (resultingEpdInBook) {
    return { kind: 'transposition', alert: false };
  }

  // Row 4 — new_territory: no canonical move to alert about (also catches refused with no canonical)
  if (!nodeHasCanonical) {
    return { kind: 'new_territory', alert: false };
  }

  // Row 5 — order_slip: played move is canonical/alt at a reachable book node
  if (reachableBookUcis !== null && reachableBookUcis.includes(playedUci)) {
    return { kind: 'order_slip', alert: true };
  }

  // Row 6 — lapse: novel move at a node with drill history
  if (nodeHasDrillHistory) {
    return { kind: 'lapse', alert: true };
  }

  // Row 7 — novelty
  return { kind: 'novelty', alert: true };
}
