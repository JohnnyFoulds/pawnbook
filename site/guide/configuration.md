---
title: Configuration
---

# Configuration

pawnbook reads configuration from environment variables. Copy `.env.example` to `.env` and edit before starting.

```bash
cp .env.example .env
```

When using Docker Compose, variables in `.env` are automatically passed to the container.

---

## Environment variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `PORT` | integer | `3000` | HTTP and WebSocket listen port |
| `BIND_ADDR` | string | `127.0.0.1` | Listen address |
| `NODE_ENV` | string | `development` | Runtime environment |
| `LOG_LEVEL` | string | `debug` | Log verbosity |
| `ENGINE_MODE` | string | `native` | Engine binary location strategy |
| `STOCKFISH_PATH` | string | auto-detected | Absolute path to the Stockfish binary |
| `LC0_PATH` | string | auto-detected | Absolute path to the lc0 binary |
| `DRAWFISH_PATH` | string | — | Absolute path to the drawfish binary (optional) |
| `DATA_DIR` | string | `./data` | Directory for `chess.db` |
| `WEIGHTS_DIR` | string | `./weights` | Directory for neural-net weight files |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | string | — | OpenTelemetry OTLP endpoint |
| `OTEL_TRACE_CONSOLE` | string | — | Set to `1` to print traces to stdout |

---

## Notes

### BIND_ADDR

The default `127.0.0.1` restricts the server to loopback connections on the host machine. Setting this to `0.0.0.0` exposes pawnbook to your local network.

:::warning No authentication layer
pawnbook has no authentication. Any client that can reach the port can play games and read your history. If you expose it to a network, place a reverse proxy with authentication (e.g. nginx + basic auth, Caddy + forward auth) in front of it.
:::

### ENGINE_MODE

| Value | Engine binary location |
|---|---|
| `native` | Paths resolved via `STOCKFISH_PATH`, `LC0_PATH`, `DRAWFISH_PATH`, or auto-detection |
| `container` | Fixed paths at `/usr/local/bin/stockfish`, `/usr/local/bin/lc0`, `/usr/local/bin/drawfish` |

The Dockerfile sets `ENGINE_MODE=container` automatically. You should not need to change this when using Docker.

### LOG_LEVEL

pawnbook uses [pino](https://getpino.io/) for structured logging. Valid levels in descending verbosity: `trace`, `debug`, `info`, `warn`, `error`, `fatal`, `silent`.

For production deployments, `info` is recommended. The `debug` default produces verbose engine communication logs.

### NODE_ENV

Set to `production` for production deployments. In `development` mode, additional debug routes (`/api/debug/*`) are mounted.

### OpenTelemetry

When `OTEL_EXPORTER_OTLP_ENDPOINT` is unset, the telemetry module is a no-op. No data is sent to any third party.

Set the endpoint to send traces to a local collector (e.g. Jaeger, OTEL Collector):

```sh
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

Set `OTEL_TRACE_CONSOLE=1` to print traces to stdout without an external collector — useful for debugging.

---

## Day-streak boundary

The streak counter uses a **04:00 local time** boundary rather than midnight. A session that starts at 23:30 and runs past midnight counts as a single day. A session at 01:00 counts for the previous calendar day.

This boundary is not configurable.

---

## Example `.env` for native install

```sh
PORT=3000
BIND_ADDR=127.0.0.1
NODE_ENV=production
LOG_LEVEL=info
ENGINE_MODE=native
STOCKFISH_PATH=/usr/local/bin/stockfish
LC0_PATH=/usr/local/bin/lc0
DATA_DIR=/home/user/.pawnbook/data
WEIGHTS_DIR=/home/user/.pawnbook/weights
```
