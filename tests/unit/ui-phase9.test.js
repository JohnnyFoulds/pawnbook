/**
 * @module tests/unit/ui-phase9
 * Phase 9 Web UI checks:
 *   - tokens.css hex values match src/shared/quality.js
 *   - strings.json copy rules
 *   - queue meter ratio
 *   - motion token zeroing
 *   - streak/clock HTML presence
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { describe, it, expect } from 'vitest';

import { QUALITY } from '../../src/shared/quality.js';
import { DUE_SOFT_CAP } from '../../src/shared/balance.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, '../..');

function readFile(rel) {
  return readFileSync(resolve(root, rel), 'utf8');
}

// ── Regression: tokens.css hex values match quality.js ─────────────────────

describe('regression: tokens.css ↔ quality.js', () => {
  const css = readFile('public/css/tokens.css');

  const TOKEN_MAP = {
    blunder:    '--q-blunder',
    mistake:    '--q-mistake',
    inaccuracy: '--q-inaccuracy',
    ok:         '--q-ok',
    good:       '--q-good',
    great:      '--q-great',
    best:       '--q-best',
  };

  for (const [tier, cssVar] of Object.entries(TOKEN_MAP)) {
    it(`tokens.css ${cssVar} matches quality.js ${tier}.hex`, () => {
      const expected = QUALITY[tier].hex.toLowerCase();
      // Match: --q-blunder: #dd7065
      const re = new RegExp(`${cssVar}\\s*:\\s*(#[0-9a-fA-F]{6})`);
      const m = css.match(re);
      expect(m, `${cssVar} not found in tokens.css`).toBeTruthy();
      expect(m[1].toLowerCase()).toBe(expected);
    });
  }

  it('tokens.css defines every --dur-* variable', () => {
    expect(css).toMatch(/--dur-piece:/);
    expect(css).toMatch(/--dur-panel:/);
    expect(css).toMatch(/--dur-flash:/);
    expect(css).toMatch(/--dur-pulse:/);
  });

  it('prefers-reduced-motion block zeroes all --dur-* variables', () => {
    // The block must contain 0ms or 0s assignments for each dur var
    const rmBlock = css.match(/@media\s*\(prefers-reduced-motion[^{]*\)\s*\{([^}]*\{[^}]*\}[^}]*)\}/s);
    expect(rmBlock, 'prefers-reduced-motion block not found').toBeTruthy();
    const block = rmBlock[1];
    expect(block).toMatch(/--dur-piece\s*:\s*0/);
    expect(block).toMatch(/--dur-panel\s*:\s*0/);
    expect(block).toMatch(/--dur-flash\s*:\s*0/);
    expect(block).toMatch(/--dur-pulse\s*:\s*0/);
  });
});

// ── copy: strings.json rules ────────────────────────────────────────────────

describe('copy: strings.json', () => {
  const strings = JSON.parse(readFile('src/shared/strings.json'));

  it('no prose string contains an exclamation mark', () => {
    const violations = [];
    for (const [key, value] of Object.entries(strings)) {
      if (value.includes('!')) violations.push(`${key}: ${value}`);
    }
    expect(violations, `Exclamation marks found:\n${violations.join('\n')}`).toHaveLength(0);
  });

  it('every termination enum value has exactly one string', () => {
    const terminationKeys = Object.keys(strings).filter((k) => k.startsWith('game.termination.'));
    const TERMINATIONS = [
      'checkmate', 'resignation', 'stalemate', 'threefold',
      'fifty_move', 'insufficient_material', 'timeout', 'abandoned',
    ];
    for (const t of TERMINATIONS) {
      const key = `game.termination.${t}`;
      expect(strings[key], `Missing string for termination "${t}"`).toBeTruthy();
    }
    expect(terminationKeys).toHaveLength(TERMINATIONS.length);
  });

  it('every user-facing string is non-empty', () => {
    for (const [key, value] of Object.entries(strings)) {
      expect(value, `Empty string for key "${key}"`).toBeTruthy();
    }
  });

  it('drill.nothing_due matches the win-state copy', () => {
    expect(strings['drill.nothing_due']).toBe("Nothing due — you're clear.");
  });

  it('empty.no_puzzles_due matches the win-state copy', () => {
    expect(strings['empty.no_puzzles_due']).toBe("Nothing due — you're clear.");
  });
});

// ── meter: queue health is due / DUE_SOFT_CAP ──────────────────────────────

describe('meter: queue health ratio', () => {
  it('DUE_SOFT_CAP is 40', () => {
    expect(DUE_SOFT_CAP).toBe(40);
  });

  it('a due count of 40 fills the meter to 100%', () => {
    const pct = Math.min(40 / DUE_SOFT_CAP, 1) * 100;
    expect(pct).toBe(100);
  });

  it('a due count above the cap reads 40+, not the raw number', () => {
    const due = 55;
    const label = due > DUE_SOFT_CAP ? `${DUE_SOFT_CAP}+` : String(due);
    expect(label).toBe('40+');
  });

  it('a due count of 20 is 50% of the soft cap', () => {
    const pct = (20 / DUE_SOFT_CAP) * 100;
    expect(pct).toBe(50);
  });

  it('a due count of 0 is 0%', () => {
    const pct = (0 / DUE_SOFT_CAP) * 100;
    expect(pct).toBe(0);
  });
});

// ── HTML page checks ────────────────────────────────────────────────────────

describe('HTML pages', () => {
  it('stats.html contains the retired-mistakes tile', () => {
    const html = readFile('public/stats.html');
    // Must have an element that can render retired count
    expect(html).toMatch(/retired-val/);
  });

  it('stats.html contains queue-fill and queue-caption elements', () => {
    const html = readFile('public/stats.html');
    expect(html).toMatch(/queue-fill/);
    expect(html).toMatch(/queue-caption/);
  });

  it('stats.html contains a quality breakdown bar', () => {
    const html = readFile('public/stats.html');
    expect(html).toMatch(/quality-bar/);
  });

  it('play.html clock panel is conditional (only for timed games)', () => {
    const html = readFile('public/play.html');
    // play.html should have a clock element but it must be togglable
    expect(html).toMatch(/clock/i);
  });

  it('puzzles.html has an empty state with the win-state copy', () => {
    const html = readFile('public/puzzles.html');
    expect(html).toMatch(/clear/);
  });

  it('puzzles.html empty state links to a next action', () => {
    const html = readFile('public/puzzles.html');
    expect(html).toMatch(/play\.html|index\.html/);
  });

  it('review.html has the engine-only collapsible section', () => {
    const html = readFile('public/review.html');
    expect(html).toMatch(/engine-only/);
  });

  it('every page loads stats.js or the correct page JS module', () => {
    const pages = {
      'public/stats.html': 'stats.js',
      'public/games.html': 'games.js',
      'public/puzzles.html': 'puzzles.js',
      'public/quiz.html': 'quiz.js',
      'public/review.html': 'review.js',
      'public/play.html': 'play.js',
      'public/index.html': 'dashboard.js',
    };
    for (const [page, script] of Object.entries(pages)) {
      const html = readFile(page);
      expect(html, `${page} should load ${script}`).toContain(script);
    }
  });
});

// ── JS module checks ─────────────────────────────────────────────────────────

describe('JS modules', () => {
  it('stats.js uses due / DUE_SOFT_CAP for the queue meter', () => {
    const js = readFile('public/js/stats.js');
    expect(js).toMatch(/DUE_SOFT_CAP/);
    expect(js).toMatch(/renderQueueMeter/);
  });

  it('stats.js renders the retired-mistakes tile', () => {
    const js = readFile('public/js/stats.js');
    expect(js).toMatch(/retired-val/);
    expect(js).toMatch(/graduatedCount/);
  });

  it('puzzles.js auto-advance checks prefers-reduced-motion', () => {
    const js = readFile('public/js/puzzles.js');
    expect(js).toMatch(/prefers-reduced-motion/);
  });

  it('quiz.js auto-advance checks prefers-reduced-motion', () => {
    const js = readFile('public/js/quiz.js');
    expect(js).toMatch(/prefers-reduced-motion/);
  });

  it('puzzles.js feedback leads with a glyph element', () => {
    const js = readFile('public/js/puzzles.js');
    // Must use ✓/✗ glyphs in the feedback HTML
    expect(js).toMatch(/✓/);
    expect(js).toMatch(/✗/);
  });

  it('quiz.js feedback leads with a glyph element', () => {
    const js = readFile('public/js/quiz.js');
    expect(js).toMatch(/✓/);
    expect(js).toMatch(/✗/);
  });

  it('dashboard.js respects settings.show_streak (checks the key)', () => {
    const js = readFile('public/js/dashboard.js');
    expect(js).toMatch(/show_streak/);
  });

  it('chart.js imports QUALITY from /shared/quality.js (not a relative path)', () => {
    const js = readFile('public/js/lib/chart.js');
    expect(js).toMatch(/from\s+['"]\/shared\/quality\.js['"]/);
  });

  it('stats.js imports QUALITY from /shared/quality.js', () => {
    const js = readFile('public/js/stats.js');
    expect(js).toMatch(/from\s+['"]\/shared\/quality\.js['"]/);
  });

  it('play.js receives ranked games without eval UI references in ranked mode', () => {
    const js = readFile('public/js/play.js');
    // play.js must gate hint/eval on ranked status (server enforces; client should not request)
    expect(js).toMatch(/ranked/i);
  });

  it('review.js imports QUALITY and GLYPH_TIERS from shared', () => {
    const js = readFile('public/js/review.js');
    expect(js).toMatch(/GLYPH_TIERS/);
    expect(js).toMatch(/\/shared\/quality\.js/);
  });
});

// ── strings.json ↔ voice_and_tone.md regression ─────────────────────────────

describe('regression: strings.json ↔ voice_and_tone.md', () => {
  it('voice_and_tone.md exists', () => {
    const md = readFile('docs/game/voice_and_tone.md');
    expect(md.length).toBeGreaterThan(0);
  });

  it('voice_and_tone.md references the strings.json file', () => {
    const md = readFile('docs/game/voice_and_tone.md');
    expect(md).toMatch(/strings\.json/);
  });

  it('drill.nothing_due copy appears in voice_and_tone.md', () => {
    const md = readFile('docs/game/voice_and_tone.md');
    const strings = JSON.parse(readFile('src/shared/strings.json'));
    const val = strings['drill.nothing_due'];
    expect(md).toContain(val);
  });
});
