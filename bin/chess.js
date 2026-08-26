#!/usr/bin/env node
/**
 * @module bin/chess
 * pawnbook TUI entry point.
 *
 * Usage:
 *   chess                        connect to localhost:3000, play screen
 *   chess drill                  drill due queue
 *   chess stats                  stats screen
 *   chess --host dragon:3000     remote server (pure WS/REST client, no local deps)
 *   chess --ascii                ASCII pieces instead of Unicode glyphs
 *   chess --no-mouse             disable SGR mouse reporting
 *   chess --plain                force 16-colour palette
 *   chess --hatch=none           disable ░ texture on dark squares
 *   chess --no-sound             session override: disable sound
 *   chess --no-streak            session override: hide streak tile/line
 *
 * --host is the point of the pure-client design: the server can run on a
 * remote machine and the TUI connects over plain WebSocket.
 *
 * The TUI imports no chess rules engine and computes no FSRS rating.
 * All game logic, move legality, and scheduling live on the server.
 */

import { parseArgs } from 'util';
import { createClient, apiCall } from '../tui/client.js';
import { createPlayScreen }  from '../tui/screens/play.js';
import { createDrillScreen } from '../tui/screens/drill.js';
import { createStatsScreen } from '../tui/screens/stats.js';

// ── Argument parsing ─────────────────────────────────────────────────────────

const { values: args, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    host:     { type: 'string', default: 'localhost:3000' },
    ascii:    { type: 'boolean', default: false },
    plain:    { type: 'boolean', default: false },
    hatch:    { type: 'string', default: 'on' },
    mouse:    { type: 'boolean', default: true },
    sound:    { type: 'boolean', default: true },
    streak:   { type: 'boolean', default: true },
    graphics: { type: 'boolean', default: false },
    help:     { type: 'boolean', default: false, short: 'h' },
  },
  allowNegative: true,
  strict: false,
});

// --no-streak, --no-sound, --no-mouse are negation of --streak etc.
// parseArgs with allowNegative handles --no-x as { x: false }

if (args.help) {
  console.log(`pawnbook TUI

Usage: chess [command] [options]

Commands:
  (none)   Play screen
  drill    Drill due queue
  stats    Stats overview

Options:
  --host HOST      Server address (default: localhost:3000)
  --ascii          ASCII pieces (K Q R B N P)
  --plain          16-colour palette
  --hatch=none     Disable ░ texture on dark squares
  --no-mouse       Disable SGR mouse reporting
  --no-sound       Session override: disable sound
  --no-streak      Session override: hide streak tile/line
  --graphics       Kitty graphics protocol board (opt-in, requires kitty)
`);
  process.exit(0);
}

const subcommand = positionals[0] ?? 'play';

const renderOpts = {
  ascii:  args.ascii  ?? false,
  hatch:  (args.hatch ?? 'on') !== 'none',
  plain:  args.plain  ?? false,
};

const sessionOpts = {
  noStreak: !(args.streak ?? true),
  noSound:  !(args.sound  ?? true),
  noMouse:  !(args.mouse  ?? true),
};

const host = args.host ?? 'localhost:3000';

// ── Run ──────────────────────────────────────────────────────────────────────

async function main() {
  // Minimal non-interactive output for non-terminal environments (piped, CI)
  const isTTY = process.stdout.isTTY;

  if (!isTTY) {
    // Just print board diagnostics and exit cleanly
    if (subcommand === 'stats') {
      try {
        const stats = await apiCall(host, '/api/stats');
        const appState = await apiCall(host, '/api/state').catch(() => ({}));
        const { createStatsScreen: _ } = await import('../tui/screens/stats.js');
        const screen = createStatsScreen({ host, sessionOpts, apiCall: apiCallBound });
        await screen.boot();
        console.log(screen.render());
      } catch (err) {
        console.error('stats error:', err.message);
        process.exit(1);
      }
    } else {
      console.error('chess TUI requires a TTY. Run in an interactive terminal.');
      process.exit(1);
    }
    return;
  }

  // Try to load terminal-kit (optional dep)
  let termkit;
  try {
    const { createRequire } = await import('module');
    const req = createRequire(import.meta.url);
    termkit = req('terminal-kit');
  } catch {
    // terminal-kit not installed — fall back to simple line-mode
    await runLineFallback();
    return;
  }

  await runTermkit(termkit);
}

function apiCallBound(h, path, opts) {
  return apiCall(h, path, opts);
}

async function runLineFallback() {
  // Minimal line-mode output — prints one screen and exits
  if (subcommand === 'stats') {
    try {
      const screen = createStatsScreen({ host, sessionOpts, apiCall });
      await screen.boot();
      console.log(screen.render());
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
    return;
  }
  console.error('Full TUI requires terminal-kit. Install with: npm install terminal-kit');
  console.error('Stats without full TUI: chess stats');
}

async function runTermkit(tk) {
  const term = tk.terminal;
  term.fullscreen(true);
  term.hideCursor(true);

  process.on('exit', () => {
    term.fullscreen(false);
    term.showCursor(true);
    term.processExit(0);
  });
  process.on('SIGINT', () => process.exit(0));

  if (!(sessionOpts.noMouse)) {
    term.grabInput({ mouse: 'button' });
  } else {
    term.grabInput();
  }

  // Dispatch to screen
  if (subcommand === 'stats') {
    const screen = createStatsScreen({ host, sessionOpts, apiCall });
    await screen.boot();
    term.clear();
    term(screen.render() + '\n');
    term.grabInput(false);
    setTimeout(() => process.exit(0), 100);
    return;
  }

  if (subcommand === 'drill') {
    const screen = createDrillScreen({
      host,
      renderOpts,
      apiCall,
    });

    await screen.boot();

    const redraw = () => {
      term.clear();
      term(screen.render() + '\n');
    };
    redraw();

    term.on('key', (name) => {
      if (name === 'q' || name === 'CTRL_C') { term.grabInput(false); process.exit(0); }
      screen.handleKey(name);
      redraw();
    });
    return;
  }

  // Default: play screen
  const client = createClient({
    host,
    onMessage: (msg) => {
      screen.handleMessage(msg);
      redraw();
    },
    onOpen:  () => { term.bold('Connected.\n'); },
    onClose: () => { term.red('Disconnected. Reconnecting…\n'); },
    onError: (err) => { term.red(`WS error: ${err.message}\n`); },
  });

  const screen = createPlayScreen({ client, renderOpts });

  const redraw = () => {
    term.clear();
    term(screen.render() + '\n');
  };

  term.on('key', (name) => {
    if (name === 'q' || name === 'CTRL_C') {
      client.close();
      term.grabInput(false);
      process.exit(0);
    }
    if (name === 'F10') { client.close(); process.exit(0); }
    screen.handleKey(name);
    redraw();
  });

  // Initial render while connecting
  redraw();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
