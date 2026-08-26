# Security

## Scope

pawnbook is a single-user, local-only application with **no authentication of any kind**. This is a design pillar, not an oversight — the app is intended to run on your own machine and be accessed only by you.

## Binding behaviour

The server binds to `127.0.0.1` by default. Do not expose port 3000 to an untrusted network. The application has no auth model, no multi-tenancy, and a SQLite file containing all your games and personal training data.

**Documented remote path:** `ssh -L 3000:localhost:3000 <your-mac>` then connect from any machine. This requires no server-side change and no new port.

**Explicit opt-in for LAN bind:** set `BIND_ADDR=0.0.0.0` in `docker-compose.override.yml`. The server logs a `warn` at startup naming the bind address whenever it is not loopback.

## What this app does NOT do

- No cloud sync, no accounts, no leaderboards
- No telemetry beyond local OTel traces for debugging (set `OTEL_TRACE_CONSOLE=1` to view them)
- No outbound network requests at runtime (weights and engines are local)

## Reporting a vulnerability

Open a GitHub issue. For sensitive reports, contact the maintainer directly via the email in the GitHub profile.
