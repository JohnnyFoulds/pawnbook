#!/usr/bin/env bash
# Engine acceptance tests — run inside the container or with ENGINE_MODE=native.
set -euo pipefail

MODE="${ENGINE_MODE:-container}"

if [[ "$MODE" == "native" ]]; then
    SF_BIN="/opt/homebrew/opt/stockfish/bin/stockfish"
    LC0_BIN="/opt/homebrew/Cellar/lc0/0.32.1/libexec/lc0"
    DRAWFISH_BIN=""  # x86-64 ELF, not runnable natively
    WEIGHTS_DIR="$(cd "$(dirname "$0")/.." && pwd)/weights"
else
    SF_BIN="/usr/local/bin/stockfish"
    LC0_BIN="/usr/local/bin/lc0"
    DRAWFISH_BIN="/usr/local/bin/drawfish"
    WEIGHTS_DIR="/app/weights"
fi

PASS=0
FAIL=0

check() {
    local name="$1"
    local result="$2"
    if [[ "$result" == "ok" ]]; then
        echo "  PASS  $name"
        PASS=$((PASS + 1))
    else
        echo "  FAIL  $name — $result"
        FAIL=$((FAIL + 1))
    fi
}

uci_check() {
    local bin="$1"
    local name="$2"
    local response
    response=$(echo -e "uci\nquit" | timeout 10 "$bin" 2>/dev/null) || true
    if echo "$response" | grep -q "uciok"; then
        check "$name uci handshake" "ok"
    else
        check "$name uci handshake" "no uciok in response"
    fi
}

echo "=== pawnbook engine smoke tests (mode: $MODE) ==="
echo

# Stockfish
echo "--- Stockfish ---"
uci_check "$SF_BIN" "stockfish"
response=$(echo -e "uci\nquit" | timeout 10 "$SF_BIN" 2>/dev/null) || true
if echo "$response" | grep -q "UCI_Elo"; then
    check "stockfish UCI_Elo option present" "ok"
else
    check "stockfish UCI_Elo option present" "not found in uci output"
fi
if [[ "$MODE" != "native" ]]; then
    arch=$(file "$SF_BIN" 2>/dev/null) || arch=""
    if echo "$arch" | grep -qi "aarch64\|arm64"; then
        check "stockfish arm64 binary" "ok"
    else
        check "stockfish arm64 binary" "unexpected arch: $arch"
    fi
fi

# lc0
echo
echo "--- lc0 ---"
uci_check "$LC0_BIN" "lc0"

# Maia weights
echo
echo "--- Maia weights ---"
REQUIRED_ELOS=(1100 1200 1300 1400 1500 1600 1700 1800 1900)
for elo in "${REQUIRED_ELOS[@]}"; do
    wf="$WEIGHTS_DIR/maia-${elo}.pb.gz"
    if [[ -f "$wf" ]]; then
        response=$(echo -e "setoption name WeightsFile value $wf\nuci\nquit" \
            | timeout 15 "$LC0_BIN" --backend=eigen 2>/dev/null) || true
        if echo "$response" | grep -q "uciok"; then
            check "maia-${elo} loads on lc0" "ok"
        else
            check "maia-${elo} loads on lc0" "lc0 did not respond with uciok"
        fi
    else
        check "maia-${elo}.pb.gz present" "file missing: $wf"
    fi
done

# Drawfish (container only — x86-64 ELF)
if [[ "$MODE" != "native" ]] && [[ -n "$DRAWFISH_BIN" ]]; then
    echo
    echo "--- Drawfish ---"
    uci_check "$DRAWFISH_BIN" "drawfish"

    # Identity test: stalemate-hunting position
    STALEMATE_FEN="4k3/4P3/8/4K3/8/8/8/8 w - - 0 1"
    response=$(printf "position fen %s\ngo depth 6\nquit\n" "$STALEMATE_FEN" \
        | timeout 30 "$DRAWFISH_BIN" 2>/dev/null) || true
    if echo "$response" | grep -q "bestmove e5e6"; then
        check "drawfish stalemate identity (bestmove e5e6)" "ok"
    else
        check "drawfish stalemate identity (bestmove e5e6)" "unexpected: $(echo "$response" | grep bestmove || echo 'no bestmove')"
    fi
fi

echo
echo "=== Results: $PASS passed, $FAIL failed ==="
[[ $FAIL -eq 0 ]]
