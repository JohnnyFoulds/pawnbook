/**
 * @module domain/repertoire/epd
 * EPD key extraction for book node identification.
 * EPD = first four fields of FEN (position, active colour, castling, en passant).
 * Halfmove clock and fullmove number are dropped so transpositions hash to the same key.
 */

/**
 * Extract the EPD key from a FEN string.
 * @param {string} fen
 * @returns {string}
 */
export function extractEpd(fen) {
  return fen.split(' ').slice(0, 4).join(' ');
}

/**
 * Extract the active colour from a FEN or EPD string.
 * @param {string} fenOrEpd
 * @returns {'white'|'black'}
 */
export function sideFromFen(fenOrEpd) {
  const colour = fenOrEpd.split(' ')[1];
  return colour === 'b' ? 'black' : 'white';
}
