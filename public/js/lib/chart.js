/**
 * @module public/js/lib/chart
 * Chart helpers: eval graph, sparkline, breakdown bar, queue meter.
 * Uses Canvas 2D API directly — no bundler, no library.
 * Every chart has a table-view twin so no value is gated behind a tooltip.
 */

// quality.js served at /shared/quality.js by the Express server (src/shared/ as static)
import { QUALITY } from '/shared/quality.js';

// Design tokens (read from :root CSS custom properties)
const CSS = (() => {
  const s = getComputedStyle(document.documentElement);
  return {
    surface1:  s.getPropertyValue('--surface-1').trim()  || '#151517',
    surface2:  s.getPropertyValue('--surface-2').trim()  || '#1e1e21',
    accent:    s.getPropertyValue('--accent').trim()      || '#3987e5',
    good:      s.getPropertyValue('--good').trim()        || '#0ca30c',
    critical:  s.getPropertyValue('--critical').trim()    || '#d03b3b',
    inkMuted:  s.getPropertyValue('--ink-muted').trim()   || '#898781',
    gridline:  s.getPropertyValue('--gridline').trim()    || '#2c2c2a',
    baseline:  s.getPropertyValue('--baseline').trim()    || '#383835',
    inkSecondary: s.getPropertyValue('--ink-secondary').trim() || '#c3c2b7',
  };
})();

/**
 * Draw a sparkline into a <canvas> element.
 * @param {HTMLCanvasElement} canvas
 * @param {number[]} values
 * @param {object} [opts]
 * @param {string} [opts.color]
 * @param {boolean} [opts.dot] - highlight last point
 */
export function drawSparkline(canvas, values, opts = {}) {
  const { color = CSS.accent, dot = true } = opts;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (!values.length) return;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const px = (i) => (i / (values.length - 1 || 1)) * (W - 4) + 2;
  const py = (v) => H - 2 - ((v - min) / range) * (H - 4);

  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  values.forEach((v, i) => {
    const x = px(i), y = py(v);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  if (dot && values.length > 0) {
    const last = values[values.length - 1];
    ctx.beginPath();
    ctx.arc(px(values.length - 1), py(last), 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
}

/**
 * Draw the eval graph into a <canvas>.
 * Single line, +/- area wash, blue above zero, red below.
 * @param {HTMLCanvasElement} canvas
 * @param {Array<{ply: number, winPct: number}>} evals - mover's POV, White's perspective
 * @param {Array<{ply: number, classification: string}>} [mistakes] - for glyph markers
 * @param {object} [opts]
 * @param {function} [opts.onHover] - called with ply index on crosshair move
 */
export function drawEvalGraph(canvas, evals, mistakes = [], opts = {}) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const PAD_LEFT = 36, PAD_RIGHT = 8, PAD_TOP = 8, PAD_BOTTOM = 24;
  const chartW = W - PAD_LEFT - PAD_RIGHT;
  const chartH = H - PAD_TOP - PAD_BOTTOM;
  const midY = PAD_TOP + chartH / 2;

  ctx.clearRect(0, 0, W, H);

  if (!evals.length) return;

  const px = (i) => PAD_LEFT + (i / (evals.length - 1 || 1)) * chartW;
  const py = (winPct) => PAD_TOP + ((100 - winPct) / 100) * chartH;

  // Zero rule
  ctx.beginPath();
  ctx.strokeStyle = CSS.baseline;
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.moveTo(PAD_LEFT, midY);
  ctx.lineTo(PAD_LEFT + chartW, midY);
  ctx.stroke();

  // Area fills
  ctx.save();
  ctx.beginPath();
  ctx.rect(PAD_LEFT, PAD_TOP, chartW, chartH);
  ctx.clip();

  // Blue above zero (White advantage)
  ctx.beginPath();
  evals.forEach((e, i) => {
    const x = px(i), y = Math.min(py(e.winPct), midY);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.lineTo(px(evals.length - 1), midY);
  ctx.lineTo(px(0), midY);
  ctx.closePath();
  ctx.fillStyle = 'rgba(57,135,229,0.12)';
  ctx.fill();

  // Red below zero (Black advantage)
  ctx.beginPath();
  evals.forEach((e, i) => {
    const x = px(i), y = Math.max(py(e.winPct), midY);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.lineTo(px(evals.length - 1), midY);
  ctx.lineTo(px(0), midY);
  ctx.closePath();
  ctx.fillStyle = 'rgba(208,59,59,0.10)';
  ctx.fill();

  ctx.restore();

  // The line
  ctx.beginPath();
  ctx.strokeStyle = CSS.accent;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  evals.forEach((e, i) => {
    const x = px(i), y = py(e.winPct);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Mistake glyphs below axis — selective (only classified moves)
  const GLYPH_MAP = { blunder: '??', mistake: '?', inaccuracy: '?!' };
  mistakes.forEach((m) => {
    const glyph = GLYPH_MAP[m.classification];
    if (!glyph) return;
    const idx = evals.findIndex((e) => e.ply === m.ply);
    if (idx < 0) return;
    const x = px(idx);
    ctx.fillStyle = QUALITY[m.classification]?.hex || CSS.inkMuted;
    ctx.font = '10px ' + (getComputedStyle(document.body).fontFamily || 'sans-serif');
    ctx.textAlign = 'center';
    ctx.fillText(glyph, x, H - 4);
  });

  // Y axis labels
  ctx.fillStyle = CSS.inkMuted;
  ctx.font = '10px ' + (getComputedStyle(document.body).fontFamily || 'sans-serif');
  ctx.textAlign = 'right';
  [75, 50, 25].forEach((pct) => {
    const y = py(pct);
    ctx.fillText(pct === 50 ? '0' : (pct > 50 ? '+' : '–'), PAD_LEFT - 4, y + 3);
    ctx.strokeStyle = CSS.gridline;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(PAD_LEFT, y);
    ctx.lineTo(PAD_LEFT + chartW, y);
    ctx.stroke();
    ctx.setLineDash([]);
  });

  // Crosshair on hover
  if (opts.onHover) {
    let hoverPly = null;
    canvas.onmousemove = (ev) => {
      const rect = canvas.getBoundingClientRect();
      const mx = (ev.clientX - rect.left) * (W / rect.width);
      const idx = Math.round((mx - PAD_LEFT) / chartW * (evals.length - 1));
      const clamped = Math.max(0, Math.min(evals.length - 1, idx));
      if (clamped !== hoverPly) {
        hoverPly = clamped;
        opts.onHover(hoverPly, evals[hoverPly]);
        // Redraw with crosshair
        drawEvalGraph(canvas, evals, mistakes, { ...opts, onHover: null });
        const x = px(hoverPly);
        ctx.strokeStyle = CSS.inkMuted;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x, PAD_TOP);
        ctx.lineTo(x, PAD_TOP + chartH);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(x, py(evals[hoverPly].winPct), 4, 0, Math.PI * 2);
        ctx.fillStyle = CSS.accent;
        ctx.fill();
        ctx.strokeStyle = CSS.surface1;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    };
    canvas.onmouseleave = () => {
      hoverPly = null;
      drawEvalGraph(canvas, evals, mistakes, opts);
      opts.onHover(-1, null);
    };
  }
}

/**
 * Render a table-view twin for the eval graph.
 * @param {HTMLElement} tbody
 * @param {Array<{ply: number, san: string, winPct: number, classification: string}>} rows
 */
export function renderEvalTable(tbody, rows) {
  tbody.innerHTML = '';
  rows.forEach((r) => {
    const tier = QUALITY[r.classification];
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${Math.ceil(r.ply / 2)}${r.ply % 2 === 1 ? '.' : '…'}</td>
      <td>${r.san ?? ''}</td>
      <td class="num">${r.winPct != null ? r.winPct.toFixed(1) : ''}</td>
      <td>${tier?.glyph ? `<span class="quality-chip quality-chip--${r.classification}">${tier.glyph}</span>` : ''}</td>
    `;
    tbody.appendChild(tr);
  });
}

/**
 * Render the 7-tier diverging breakdown bar.
 * Each segment carries its tier name as a label (never colour alone).
 * @param {HTMLElement} container
 * @param {Record<string, number>} counts - {blunder: N, mistake: N, ...}
 */
export function renderBreakdownBar(container, counts) {
  const tiers = ['blunder', 'mistake', 'inaccuracy', 'ok', 'good', 'great', 'best'];
  const total = tiers.reduce((s, t) => s + (counts[t] || 0), 0) || 1;
  container.innerHTML = '';
  tiers.forEach((tier) => {
    const n = counts[tier] || 0;
    if (!n) return;
    const pct = (n / total) * 100;
    const seg = document.createElement('div');
    seg.className = `breakdown-bar__seg breakdown-bar__seg--${tier}`;
    seg.style.flexGrow = String(n);
    if (pct >= 8) seg.textContent = QUALITY[tier].label;
    seg.title = `${QUALITY[tier].label}: ${n}`;
    container.appendChild(seg);
  });
}

/**
 * Render a queue health meter (due / DUE_SOFT_CAP).
 * @param {HTMLElement} trackEl - the .queue-meter__fill element
 * @param {HTMLElement} captionEl
 * @param {number} due
 * @param {number} softCap
 * @param {number} active
 * @param {number} graduated
 */
export function renderQueueMeter(trackEl, captionEl, due, softCap, active, graduated) {
  const pct = Math.min(100, (due / softCap) * 100);
  trackEl.style.width = pct + '%';
  const overCap = due > softCap;
  trackEl.classList.toggle('queue-meter__fill--warning', overCap);
  const dueLabel = overCap ? `${softCap}+` : String(due);
  captionEl.textContent = `${dueLabel} due of ${softCap} comfortable · ${active} active · ${graduated} retired`;
}
