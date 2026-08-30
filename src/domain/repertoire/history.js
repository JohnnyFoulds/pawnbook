/**
 * @module domain/repertoire/history
 * Pure derivations from the append-only rep_changelog log.
 * No imports from adapters, ports, or express — pure data transformation.
 *
 * All functions accept a raw entry array (as returned by getChangelogRange)
 * and return plain objects. They are deterministic: same input → same output.
 */

const COACH_WAKE_THRESHOLD = 20;

/**
 * Group changelog entries into reverse-chronological day buckets.
 * @param {Object[]} entries - changelog entries with `at` timestamp
 * @returns {{ date: string, entries: Object[] }[]}
 */
export function buildTimeline(entries) {
  const byDate = new Map();
  for (const e of entries) {
    const date = _isoDate(e.at);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(e);
  }
  return [...byDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, dayEntries]) => ({
      date,
      entries: [...dayEntries].sort((a, b) => (b.at ?? 0) - (a.at ?? 0)),
    }));
}

/**
 * Produce a chronological cumulative growth series from changelog entries.
 * Each day bucket accumulates confirms, promotes, retires and refuses.
 * `total` = confirms + promotes − retires as of that day.
 *
 * Used by both the `/journey` route and `scripts/repertoire-analysis.js` (RQ2).
 * @param {Object[]} entries - changelog entries with `at` and `kind`
 * @returns {{ date: string, confirms: number, promotes: number, retires: number, refuses: number, total: number }[]}
 */
export function buildGrowthSeries(entries) {
  const sorted = [...entries].sort((a, b) => (a.at ?? 0) - (b.at ?? 0));

  const byDate = new Map();
  for (const e of sorted) {
    const date = _isoDate(e.at);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(e);
  }

  let cumConfirms = 0;
  let cumPromotes = 0;
  let cumRetires  = 0;
  let cumRefuses  = 0;

  const series = [];
  for (const [date, dayEntries] of [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    for (const e of dayEntries) {
      if (e.kind === 'confirm' || e.kind === 'elect') cumConfirms++;
      else if (e.kind === 'promote') cumPromotes++;
      else if (e.kind === 'retire') cumRetires++;
      else if (e.kind === 'refuse') cumRefuses++;
    }
    series.push({
      date,
      confirms: cumConfirms,
      promotes: cumPromotes,
      retires:  cumRetires,
      refuses:  cumRefuses,
      total: cumConfirms + cumPromotes - cumRetires,
    });
  }
  return series;
}

/**
 * Extract named milestones from the changelog.
 * @param {Object[]} entries - changelog entries
 * @returns {{
 *   firstConfirm: { at: number, kind: string } | null,
 *   coachWoke:    { at: number, kind: string } | null,
 *   firstPromotion: { at: number, kind: string } | null,
 *   firstRefusal:   { at: number, kind: string } | null,
 *   firstReversal:  { at: number, kind: string } | null,
 * }}
 */
export function buildMilestones(entries) {
  const sorted = [...entries].sort((a, b) => (a.at ?? 0) - (b.at ?? 0));

  let firstConfirm   = null;
  let coachWoke      = null;
  let firstPromotion = null;
  let firstRefusal   = null;
  let firstReversal  = null;

  let confirmCount = 0;

  for (const e of sorted) {
    if (e.kind === 'confirm' || e.kind === 'elect') {
      confirmCount++;
      if (!firstConfirm) firstConfirm = { at: e.at, kind: e.kind };
      if (!coachWoke && confirmCount >= COACH_WAKE_THRESHOLD) {
        coachWoke = { at: e.at, kind: e.kind };
      }
    } else if (e.kind === 'promote' && !firstPromotion) {
      firstPromotion = { at: e.at, kind: e.kind };
    } else if (e.kind === 'refuse' && !firstRefusal) {
      firstRefusal = { at: e.at, kind: e.kind };
    } else if (e.kind === 'reverse' && !firstReversal) {
      firstReversal = { at: e.at, kind: e.kind };
    }

    if (firstConfirm && coachWoke && firstPromotion && firstRefusal && firstReversal) break;
  }

  return { firstConfirm, coachWoke, firstPromotion, firstRefusal, firstReversal };
}

/** @param {number|null} at @returns {string} */
function _isoDate(at) {
  if (!at) return '1970-01-01';
  return new Date(at).toISOString().slice(0, 10);
}
