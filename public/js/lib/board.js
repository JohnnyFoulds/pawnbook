/**
 * @module public/js/lib/board
 * Shared cm-chessboard setup for play, quiz, puzzles, and review.
 * Review's board is read-only: no drag, no click-to-move.
 * One component, two modes. cm-chessboard loaded via CDN ESM import.
 */

const CDN = 'https://cdn.jsdelivr.net/npm/cm-chessboard@8';

// Colour strings accepted by showArrow() → mapped to cm-chessboard ARROW_TYPE objects.
const ARROW_COLORS = {
  success:   { class: 'arrow-success' },
  danger:    { class: 'arrow-danger' },
  warning:   { class: 'arrow-warning' },
  secondary: { class: 'arrow-secondary' },
  info:      { class: 'arrow-info' },
};

function injectCdnCss() {
  if (document.getElementById('cm-chessboard-css')) return;
  // Inline critical pointer-events rule so it takes effect synchronously
  // (before the board renders) — avoids a race with async <link> loading.
  const style = document.createElement('style');
  style.id = 'cm-chessboard-css';
  style.textContent = [
    `.cm-chessboard .coordinates,`,
    `.cm-chessboard .pieces-layer,`,
    `.cm-chessboard .markers-layer,`,
    `.cm-chessboard .markers-top-layer { pointer-events: none; }`,
    `.cm-chessboard .board { pointer-events: all; cursor: pointer; }`,
  ].join('\n');
  document.head.appendChild(style);
  // Also load the full stylesheets for visuals (colours, coordinates, markers, arrows)
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `${CDN}/assets/chessboard.css`;
  document.head.appendChild(link);
  const markersLink = document.createElement('link');
  markersLink.rel = 'stylesheet';
  markersLink.href = `${CDN}/assets/extensions/markers/markers.css`;
  document.head.appendChild(markersLink);
  const arrowsLink = document.createElement('link');
  arrowsLink.rel = 'stylesheet';
  arrowsLink.href = `${CDN}/assets/extensions/arrows/arrows.css`;
  document.head.appendChild(arrowsLink);
}

/**
 * Create a pawnbook board.
 * @param {HTMLElement} el - container element
 * @param {object} Chessboard - cm-chessboard constructor (passed by caller)
 * @param {object} [opts]
 * @param {boolean} [opts.readOnly=false] - review scrub board (no interaction)
 * @param {string} [opts.position='start']
 * @param {string} [opts.orientation='white']
 * @param {function} [opts.onMove] - called with {from, to} — play/quiz mode
 * @param {function} [opts.getLegalMoves] - () => string[] of UCI moves (e.g. ['e2e4'])
 *   When provided, piece pick-up and move submission are gated to chess-legal moves only.
 * @returns {Promise<object>} board instance + helpers
 */
export async function createBoard(el, Chessboard, opts = {}) {
  const {
    readOnly = false,
    position = 'start',
    orientation = 'white',
    onMove = null,
    getLegalMoves = null,
  } = opts;

  injectCdnCss();

  const { Markers, MARKER_TYPE } = await import(`${CDN}/src/extensions/markers/Markers.js`);
  const { Arrows } = await import(`${CDN}/src/extensions/arrows/Arrows.js`);

  const boardConfig = {
    position,
    orientation: orientation === 'black' ? 'b' : 'w',
    assetsUrl: `${CDN}/assets/`,
    style: {
      cssClass: 'default',
      pieces: {
        file: 'pieces/staunty.svg',
      },
    },
    extensions: [{ class: Markers }, { class: Arrows }],
  };

  const board = new Chessboard(el, boardConfig);

  if (!readOnly && onMove) {
    board.enableMoveInput((ev) => {
      if (ev.type === 'moveInputStarted') {
        board.removeMarkers();
        if (getLegalMoves) {
          const moves = getLegalMoves();
          const dests = [...new Set(
            moves.filter(uci => uci.startsWith(ev.squareFrom))
              .map(uci => uci.slice(2, 4))
          )];
          dests.forEach(sq => board.addMarker(MARKER_TYPE.dot, sq));
          // Disallow picking up a piece with no legal moves from this square
          return dests.length > 0;
        }
        return true;
      }

      if (ev.type === 'validateMoveInput') {
        if (getLegalMoves) {
          const moves = getLegalMoves();
          return moves.some(uci => uci.startsWith(ev.squareFrom + ev.squareTo));
        }
        return true;
      }

      if (ev.type === 'moveInputFinished') {
        board.removeMarkers();
        // legalMove is set by cm-chessboard based on validateMoveInput's return value
        if (ev.legalMove !== false) {
          onMove({ from: ev.squareFrom, to: ev.squareTo });
        }
      }
      return true;
    });
  }

  return {
    board,
    /**
     * Update position and optionally highlight last move squares.
     * @param {string} fen
     * @param {string} [lastFrom]
     * @param {string} [lastTo]
     */
    setPosition(fen, lastFrom, lastTo) {
      board.setPosition(fen, false);
      board.removeMarkers();
      if (lastFrom && lastTo) {
        board.addMarker(MARKER_TYPE.framePrimary, lastFrom);
        board.addMarker(MARKER_TYPE.framePrimary, lastTo);
      }
    },
    /** Show legal move destination dots. */
    showLegalDots(squares) {
      squares.forEach((sq) => board.addMarker(MARKER_TYPE.dot, sq));
    },
    /** Clear all markers. */
    clearMarkers() {
      board.removeMarkers();
    },
    /** Show check marker on a square. */
    showCheck(square) {
      board.addMarker(MARKER_TYPE.frameDanger, square);
    },
    /** Flip board. */
    flip() {
      board.setOrientation(board.getOrientation() === 'w' ? 'b' : 'w');
    },
    /**
     * Draw an arrow between two squares.
     * @param {string} from - e.g. 'e2'
     * @param {string} to   - e.g. 'e4'
     * @param {'success'|'danger'|'warning'|'secondary'|'info'} [color='success']
     */
    showArrow(from, to, color = 'success') {
      board.addArrow(ARROW_COLORS[color] ?? ARROW_COLORS.success, from, to);
    },
    /** Remove all arrows. */
    clearArrows() {
      board.removeArrows();
    },
  };
}
