# pawnbook

> Play chess engines locally. Get every move graded. Drill your own mistakes with spaced repetition.

[![CI](https://github.com/JohnnyFoulds/pawnbook/actions/workflows/ci.yml/badge.svg)](https://github.com/JohnnyFoulds/pawnbook/actions/workflows/ci.yml)
[![Docker](https://github.com/JohnnyFoulds/pawnbook/actions/workflows/docker-release.yml/badge.svg)](https://github.com/JohnnyFoulds/pawnbook/actions/workflows/docker-release.yml)
[![Docker Hub](https://img.shields.io/docker/v/johannesfoulds/pawnbook?sort=semver&label=docker)](https://hub.docker.com/r/johannesfoulds/pawnbook)
[![Docker Pulls](https://img.shields.io/docker/pulls/johannesfoulds/pawnbook)](https://hub.docker.com/r/johannesfoulds/pawnbook)
[![Docs](https://img.shields.io/badge/docs-online-blue)](https://johnnyfoulds.github.io/pawnbook/)
[![codecov](https://codecov.io/gh/JohnnyFoulds/pawnbook/branch/master/graph/badge.svg?token=6d4c1170-5cc0-4d6d-b540-a5ede72d98c6)](https://codecov.io/gh/JohnnyFoulds/pawnbook)
[![Node 22](https://img.shields.io/badge/node-22-green.svg)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Table of Contents

- [What is pawnbook?](#what-is-pawnbook)
- [The training loop](#the-training-loop)
- [Quickstart](#quickstart)
  - [Docker (recommended)](#docker-recommended)
  - [Native (Node 22)](#native-node-22)
- [Opponents](#opponents)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Development](#development)
- [Release process](#release-process)
- [Contributing](#contributing)
- [Licensing](#licensing)

---

## What is pawnbook?

pawnbook is a self-hosted chess trainer built around four design pillars:

| Pillar | What it means |
|---|---|
| **Mistakes are content** | Every blunder you make becomes a drill card |
| **Honest feedback** | Elo is estimated from move quality, not win/loss; one-game noise is ≈ ±280 Elo |
| **Human-shaped difficulty** | The findability gate ensures only moves a player at your level could find become puzzles |
| **Respect your time** | FSRS caps the daily drill queue at 40 cards; graduated cards are retired permanently |

pawnbook is a single-user, single-machine tool. No accounts. No cloud sync. No leaderboards. Just you and the engines.

---

## The training loop

```
┌─────────────────────────────────────────────────────────────────┐
│  1  PLAY     Pick Maia (human-shaped) or Stockfish (tactical)   │
│              at any strength from 1100 to full Stockfish 18     │
│                                                                 │
│  2  ANALYSE  Stockfish grades every move; Maia checks whether   │
│              a human at your rating would have found better     │
│                                                                 │
│  3  QUIZ     Blunders where a player at your level could have   │
│              done better appear immediately, while fresh        │
│                                                                 │
│  4  DRILL    FSRS resurfaces the same mistakes on the right     │
│              schedule — days later, then weeks, then months     │
└─────────────────────────────────────────────────────────────────┘
```

The central idea is **findability**: a position enters the drill queue only if the Maia model at your rating would choose the engine's best move with probability ≥ 4%. Engine-only brilliancies stay in the review but never clutter your queue.

---

## Quickstart

### Docker (recommended)

```bash
# 1. Clone and fetch Maia weights (~200 MB)
git clone https://github.com/JohnnyFoulds/pawnbook.git
cd pawnbook
make setup

# 2. Build and start (compiles Stockfish 18 + lc0 from source — ~15 min)
docker compose up

# 3. Open the web UI
open http://localhost:3000
```

Or pull a pre-built image:

```bash
docker pull johannesfoulds/pawnbook
docker run -p 3000:3000 -v $(pwd)/data:/app/data johannesfoulds/pawnbook
```

### Native (Node 22)

Prerequisites: Node 22, Stockfish 18 binary, lc0 v0.32.1 binary, Maia weights.

```bash
npm install
cp .env.example .env          # edit engine paths
npm start
open http://localhost:3000
```

Terminal client (optional):

```bash
npm link                        # adds 'chess' to PATH
chess                           # connect to the local server
chess --host myserver:3000      # connect to a remote instance
```

---

## Opponents

| Name | Rating | Style |
|---|---|---|
| `maia-1100` … `maia-1900` | 1100–1900 | Human-like — makes the mistakes real people make |
| `maia-2200` | 2200 | Human-like (optional; present if weight file exists) |
| `sf-1400` … `sf-2900` | 1400–2900 | Stockfish 18 with `UCI_LimitStrength` |
| `sf-max` | ~3190 | Full-strength Stockfish 18 |
| `drawfish` | unrated | Plays for stalemate; casual games only |

Maia and Stockfish overlap in rating deliberately. Same number, very different feel: Maia loses like a human, Stockfish loses like a miscalibrated computer.

Ranked games update your strength estimate. Games against Drawfish are always unrated.

---

## Architecture

```
  Browser / TUI
       │
       ├── WebSocket  /ws
       └── REST       /api/...
               │
         ┌─────▼──────────────────┐
         │  Node 22 server        │
         │  (Interface layer)     │
         └─────┬──────────────────┘
               │  (one-way dependency)
         ┌─────▼──────────────────┐
         │  Domain layer          │
         │  analysis · drilling   │
         │  repertoire · strength │
         └─────┬──────────────────┘
               │
         ┌─────▼──────────────────┐
         │  Ports / Adapters      │
         │  SQLite  •  UCI pool   │
         └────────────────────────┘
```

Three strict layers; domain code never imports `express`, `ws`, `better-sqlite3`, or `child_process`. Every port has a real adapter (SQLite / UCI) and an in-memory fake used in tests. Composition happens in `src/server.js`.

Full reference: [Architecture concepts](https://johnnyfoulds.github.io/pawnbook/concepts/architecture.html)

---

## Configuration

Create `.env` in the project root (copy `.env.example` to start):

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP + WebSocket listen port |
| `BIND_ADDR` | `127.0.0.1` | Listen address — use `0.0.0.0` only on a trusted network |
| `DATA_DIR` | `./data` | Directory for `chess.db` and saved games |
| `STOCKFISH_PATH` | _(none)_ | Absolute path to the Stockfish binary |
| `LC0_PATH` | _(none)_ | Absolute path to the lc0 binary |
| `WEIGHTS_DIR` | `./weights` | Directory containing `maia-NNNN.pb.gz` weight files |
| `LOG_LEVEL` | `info` | pino log level (`trace` · `debug` · `info` · `warn` · `error`) |
| `ENGINE_MODE` | `native` | `container` inside Docker, `native` otherwise |

Full reference: [Configuration](https://johnnyfoulds.github.io/pawnbook/reference/configuration.html) · [Balance parameters](https://johnnyfoulds.github.io/pawnbook/reference/balance.html)

---

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests with coverage (≥ 90% branch coverage required)
npm run test:coverage

# Lint
npm run lint

# Lint + fix
npm run format

# Full pre-PR gate (lint + coverage + npm audit)
make verify

# Documentation site (local dev server)
npm run docs:dev

# Documentation site (production build)
npm run docs:build
```

Tests are written before implementation (TDD). Deferred tests use `test.fails(...)` with a dynamic `await import()` — never a top-level import of a non-existent module.

---

## Release process

pawnbook uses [Conventional Commits](https://www.conventionalcommits.org/) and `npm version` for releases. A version bump automatically builds and publishes the Docker image.

```bash
# Patch release (bug fixes)
npm version patch
git push --follow-tags

# Minor release (new feature, backwards-compatible)
npm version minor
git push --follow-tags

# Major release (breaking change)
npm version major
git push --follow-tags
```

Pushing a `v*.*.*` tag triggers the [Docker release workflow](.github/workflows/docker-release.yml), which:

1. Builds a multi-arch image and pushes versioned tags to Docker Hub
2. Runs a Trivy HIGH/CRITICAL container scan, uploading results to GitHub Security
3. Creates a GitHub Release with auto-generated notes

---

## Contributing

1. Fork the repo and create a branch: `feat/phase-N-<topic>` targeting `development`
2. Write tests first — `make verify` must pass before opening a PR
3. Use Conventional Commits: `type(scope): subject`
4. PRs target `development`; `development` → `master` at phase completion

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

---

## Licensing

pawnbook's source code (`src/`, `tui/`, `public/`, `bin/`, `scripts/`) is **MIT**.

The engines and Maia weights compiled into the Docker image are **GPL-3.0** (Stockfish 18, lc0 v0.32.1, Drawfish, Maia weights). They are not vendored in this repo; the Dockerfile clones each from its upstream repository at build time. Engines communicate with the application over UCI stdio — an arm's-length arrangement that does not cause GPL-3 to reach pawnbook's own source.

See [LICENSES.md](LICENSES.md) for the full third-party inventory.
