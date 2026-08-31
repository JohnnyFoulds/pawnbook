# Stage 1: build lc0 v0.32.1 (multi-platform: arm64 + amd64)
FROM debian:bookworm AS lc0-build
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends \
    git build-essential ninja-build meson pkg-config python3 ca-certificates \
    zlib1g-dev libeigen3-dev libopenblas-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /build
RUN git clone --depth 1 --branch v0.32.1 https://github.com/LeelaChessZero/lc0.git
WORKDIR /build/lc0
# -Dnative_arch=false produces a portable binary for the target platform
RUN ./build.sh release \
    -Dgtest=false \
    -Dnative_arch=false \
    -Dispc=false \
    -Dcudnn=false
RUN strip build/release/lc0
RUN cp build/release/lc0 /usr/local/bin/lc0

# Stage 2: build Stockfish 18 and Drawfish (multi-platform: arm64 + amd64)
FROM debian:bookworm AS engines-build
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends \
    git build-essential clang ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /build

# Stockfish 18 (needs network for NNUE download during build)
RUN git clone --depth 1 --branch sf_18 https://github.com/official-stockfish/Stockfish.git
WORKDIR /build/Stockfish/src
RUN SFARCH=$(case "${TARGETARCH}" in \
      arm64) echo "armv8-dotprod" ;; \
      amd64) echo "x86-64-modern" ;; \
      *) echo "x86-64" ;; \
    esac) && \
    make -j$(nproc) profile-build ARCH=$SFARCH COMP=gcc
RUN strip stockfish
RUN cp stockfish /usr/local/bin/stockfish

# Drawfish (Stockfish fork that scores stalemate as win)
WORKDIR /build
RUN git clone --depth 1 https://github.com/nmrugg/Drawfish.git
WORKDIR /build/Drawfish/src
RUN DFARCH=$(case "${TARGETARCH}" in \
      arm64) echo "armv8" ;; \
      amd64) echo "x86-64-modern" ;; \
      *) echo "x86-64" ;; \
    esac) && \
    make -j$(nproc) build ARCH=$DFARCH COMP=clang
RUN strip drawfish
RUN cp drawfish /usr/local/bin/drawfish

# Stage 3: build Node.js dependencies (node-gyp needs python3 + build tools)
FROM node:22-bookworm AS node-build
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# Stage 4: runtime
FROM node:22-bookworm-slim AS runtime

# Copy compiled engines
COPY --from=lc0-build /usr/local/bin/lc0 /usr/local/bin/lc0
COPY --from=engines-build /usr/local/bin/stockfish /usr/local/bin/stockfish
COPY --from=engines-build /usr/local/bin/drawfish /usr/local/bin/drawfish
RUN chmod +x /usr/local/bin/lc0 /usr/local/bin/stockfish /usr/local/bin/drawfish

# Runtime dependency for lc0's OpenBLAS backend
RUN apt-get update && apt-get install -y --no-install-recommends \
    libopenblas0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy pre-built Node dependencies from node-build stage
COPY --from=node-build /app/node_modules ./node_modules

# Copy application source
COPY src/ ./src/
COPY public/ ./public/
COPY bin/ ./bin/
COPY tui/ ./tui/

# Copy scripts (includes smoke.sh for in-container engine acceptance tests)
COPY scripts/ /app/scripts/

# Copy Maia weights (populated by make setup / fetch-weights.sh)
COPY weights/ /app/weights/

# Guard: fail at build time if weights are missing rather than at runtime
RUN test "$(ls -1 /app/weights/*.pb.gz 2>/dev/null | wc -l)" -ge 9 || \
    (echo 'ERROR: weights/ is empty or incomplete — run: make setup' && exit 1)

# Create data directory
RUN mkdir -p /app/data

# Run as non-root
RUN useradd -r -s /bin/false pawnbook && chown -R pawnbook:pawnbook /app
USER pawnbook

ENV NODE_ENV=production
ENV BIND_ADDR=0.0.0.0
ENV PORT=3000
ENV ENGINE_MODE=container

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "const h=require('http');const r=h.get('http://localhost:3000/api/state',res=>{process.exit(res.statusCode===200?0:1)});r.on('error',()=>process.exit(1))"

CMD ["node", "src/server.js"]
