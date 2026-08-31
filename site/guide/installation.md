---
title: Installation
---

# Installation

pawnbook ships as a Docker image (recommended) or runs natively on Node 22 with locally installed engine binaries.

---

## Docker (recommended)

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) 24+ or Docker Engine + Compose plugin
- 2 GB free disk space for the image (engines compiled from source)
- ARM64 (Apple Silicon, AWS Graviton) or AMD64 host

### Steps

```bash
git clone https://github.com/JohnnyFoulds/pawnbook.git
cd pawnbook
docker compose up --build
```

Open `http://localhost:3000`.

The first build compiles Stockfish 18, lc0 0.32.1, and Drawfish from source in a Debian Bookworm container. This takes 10–20 minutes on first run. Subsequent starts use the cached image.

:::info Data persistence
The SQLite database is stored at `./data/chess.db` on the host (mounted into the container). Your game history, drill queue, and opening repertoire persist across restarts and image rebuilds. Back up this file to preserve your data.
:::

### What's included

The Docker image bundles:

| Engine | Version | Used for |
|---|---|---|
| Stockfish | 18 | Post-game analysis, audit evals, opponent play |
| lc0 | 0.32.1 | Maia weight inference (findability, policy), Maia opponents |
| Drawfish | latest | Optional stalemate-seeking opponent |
| Maia weights | 1100–1900 | Placed in `./weights/` on first run |
| Maia-3 weights | 5M + 23M | Placed in `./weights/` on first run |

---

## Native (advanced)

### Prerequisites

- Node.js ≥ 22 and npm
- Stockfish binary (v14+)
- lc0 binary (v0.30+) with Maia weight files
- Maia-3 binary (optional but recommended; provides continuous-Elo human-like play)

### Steps

```bash
git clone https://github.com/JohnnyFoulds/pawnbook.git
cd pawnbook
npm install
cp .env.example .env
# Edit .env with your engine paths (see Configuration)
npm start
```

### Engine weights

Place weight files in the directory specified by `WEIGHTS_DIR` (default `./weights/`):

**lc0 Maia weights** (for human-like opponents maia-1100 through maia-1900):

```
weights/maia-1100.pb.gz
weights/maia-1200.pb.gz
...
weights/maia-1900.pb.gz
```

The `maia-2200` model is an optional community fine-tune and is not bundled. If the file is absent, `maia-2200` will not appear in the opponent list.

**Maia-3 weights** (for the newer continuous-Elo UCI engine):

```
weights/maia3-5m.pt      # 21 MB — faster, recommended for most hardware
weights/maia3-23m.pt     # 92 MB — higher quality
```

Both checkpoints are included in the Docker image. For native installs, download them from the Maia-3 releases page.

:::warning Engine paths
pawnbook checks for binary existence at startup. If `STOCKFISH_PATH` is not set, it attempts auto-detection via `which stockfish`. Set explicit paths in `.env` if auto-detection fails.
:::

---

## Verifying the install

Once the server is running, confirm it is healthy:

```bash
curl http://localhost:3000/api/state
```

A healthy response looks like:

```json
{
  "status": "ok",
  "elo": 1200,
  "dueCount": 0,
  "gamesPlayed": 0
}
```

If you see `"status": "ok"`, the server is up and the database is accessible. The opponent list on the play page will show which engines were detected.

---

## Data directory layout

```
data/
└── chess.db        # SQLite database — all game history, puzzles, repertoire

weights/
├── maia-1100.pb.gz
├── ...
├── maia-1900.pb.gz
├── maia3-5m.pt
└── maia3-23m.pt
```

Both directories are gitignored. The `data/` directory is created automatically on first start.
