---
title: Configuration Reference
---

# Configuration Reference

All configuration is via environment variables. Copy `.env.example` to `.env` in the project root to get started.

```bash
cp .env.example .env
```

---

## Environment variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `PORT` | integer | `3000` | HTTP and WebSocket listen port |
| `BIND_ADDR` | string | `127.0.0.1` | Network interface to bind. Any non-loopback address logs a warning at startup — pawnbook has no authentication layer |
| `NODE_ENV` | string | `development` | Runtime environment. Set to `production` in production deployments |
| `LOG_LEVEL` | string | `debug` | [pino](https://getpino.io/) log level: `trace`, `debug`, `info`, `warn`, `error`, or `fatal` |
| `ENGINE_MODE` | string | `native` | `native` resolves engine binaries via the path variables below. `container` looks in `/usr/local/bin` (set automatically by the Dockerfile) |
| `STOCKFISH_PATH` | string | auto-detect | Absolute path to the Stockfish binary. Auto-detected from common system paths when unset |
| `LC0_PATH` | string | auto-detect | Absolute path to the lc0 binary (used for Maia-1 weights and findability probes) |
| `DRAWFISH_PATH` | string | — | Absolute path to the drawfish binary. Optional — the drawfish opponent is only available when this is set |
| `DATA_DIR` | string | `./data` | Directory for the SQLite database (`chess.db`). Created on first run if absent |
| `WEIGHTS_DIR` | string | `./weights` | Directory containing neural-net weight files: `.pb.gz` files for Maia-1 (lc0) and checkpoint files for Maia-3 |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | string | — | OTLP endpoint URL for OpenTelemetry trace export. Tracing is a no-op when unset |
| `OTEL_TRACE_CONSOLE` | string | — | Set to `1` to print trace spans to stdout. Useful during local development |

---

## Security: BIND_ADDR

::: warning
`BIND_ADDR=0.0.0.0` exposes pawnbook on your entire local network. The application has **no login, no API keys, and no authentication** of any kind.
:::

If you need to access pawnbook over a network (e.g., from a different device on your LAN), place it behind a reverse proxy that adds authentication:

```nginx
# nginx example with HTTP Basic Auth
location / {
  auth_basic "pawnbook";
  auth_basic_user_file /etc/nginx/.htpasswd;
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
}
```

[Caddy](https://caddyserver.com/) is simpler for local use:

```
localhost:8080 {
  basicauth / {
    you JDJhJDE0JGh...
  }
  reverse_proxy localhost:3000
}
```

---

## Docker configuration

When using the provided `docker-compose.yml`, environment variables can be set directly in the file or in a `.env` file placed alongside it.

The Dockerfile automatically sets:
- `ENGINE_MODE=container` — engines are installed to `/usr/local/bin` during the build
- `NODE_ENV=production`

**Persisting your data** — the SQLite database is not inside the image. Mount a host volume to avoid losing your game history, repertoire, and card deck on container recreation:

```yaml
services:
  pawnbook:
    volumes:
      - ./data:/app/data       # chess.db lives here
      - ./weights:/app/weights # engine weight files
```

The `make setup` command creates these directories and downloads the Maia-3 weight files automatically.

---

## OpenTelemetry tracing

pawnbook emits distributed traces via the OpenTelemetry SDK. Tracing is completely optional and adds no overhead when the exporter is not configured.

To send traces to a local Jaeger instance:

```sh
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```

To print spans to stdout during development (useful for inspecting analysis pipeline timing):

```sh
OTEL_TRACE_CONSOLE=1
```

Traces cover the full analysis pipeline including per-pass timings, engine call durations, and repertoire update steps.
