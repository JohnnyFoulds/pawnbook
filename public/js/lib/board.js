/**
 * @module public/js/lib/board
 * Shared cm-chessboard setup for play, quiz, puzzles, and review.
 * Review's board is read-only: no drag, no click-to-move.
 * One component, two modes. cm-chessboard loaded via CDN ESM import.
 */

// cm-chessboard ESM import — loaded by individual pages that need it
// so this module does not import it directly; the caller passes it.

/**
 * Create a pawnbook board.
 * @param {HTMLElement} el - container element
 * @param {object} Chessboard - cm-chessboard constructor (passed by caller)
 * @param {object} [opts]
 * @param {boolean} [opts.readOnly=false] - review scrub board (no interaction)
 * @param {string} [opts.position='start']
 * @param {string} [opts.orientation='white']
 * @param {function} [opts.onMove] - called with {from, to, promotion} — play/quiz mode
 * @returns {object} board instance + helpers
 */
export function createBoard(el, Chessboard, opts = {}) {
  const {
    readOnly = false,
    position = 'start',
    orientation = 'white',
    onMove = null,
  } = opts;

  const boardConfig = {
    position,
    orientation,
    style: {
      cssClass: 'pawnbook-board',
      moveFromMarker: undefined,
      moveToMarker: undefined,
    },
    // Piece set — staunty for heavier silhouettes and outline at small sizes
    sprite: {
      url: 'https://cdn.jsdelivr.net/npm/cm-chessboard@8/assets/pieces/staunty.svg',
    },
  };

  const board = new Chessboard(el, boardConfig);

  // Read-only mode: no drag, no click handlers
  if (!readOnly && onMove) {
    board.enableMoveInput((ev) => {
      // cm-chessboard fires MOVE_INPUT_STARTED, PIECE_SELECTED, MOVE_FINALIZED
      if (ev.type === 'moveInputFinalized') {
        const { squareFrom, squareTo } = ev;
        onMove({ from: squareFrom, to: squareTo });
        return false; // always return false — server validates and sets position
      }
      return true;
    });
  }

  return {
    board,
    /**
     * Update position and optionally highlight last move.
     * @param {string} fen
     * @param {string} [lastFrom]
     * @param {string} [lastTo]
     */
    setPosition(fen, lastFrom, lastTo) {
      board.setPosition(fen, false); // false = no animation for instant moves
      if (lastFrom && lastTo) {
        board.addMarker({ square: lastFrom, class: 'lastmove' });
        board.addMarker({ square: lastTo,   class: 'lastmove' });
      }
    },
    /** Show legal move destination dots. */
    showLegalDots(squares) {
      squares.forEach((sq) => board.addMarker({ square: sq, class: 'legal-dot' }));
    },
    /** Clear all markers. */
    clearMarkers() {
      board.removeMarkers();
    },
    /** Show check marker on a square. */
    showCheck(square) {
      board.addMarker({ square, class: 'check' });
    },
    /** Flip board. */
    flip() {
      board.setOrientation(board.getOrientation() === 'white' ? 'black' : 'white');
    },
  };
}
