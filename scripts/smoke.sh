#!/usr/bin/env bash
# Engine acceptance tests — run inside the container or with ENGINE_MODE=native.
set -euo pipefail

# Cross-platform timeout: GNU timeout, gtimeout, or perl alarm fallback (macOS)
_timeout() {
    local secs="$1"; shift
    if command -v timeout >/dev/null 2>&1; then
        timeout "$secs" "$@"
    elif command -v gtimeout >/dev/null 2>&1; then
        gtimeout "$secs" "$@"
    else
        perl -e "alarm $secs; exec @ARGV" -- "$@"
    fi
}

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
    response=$(echo -e "uci\nquit" | _timeout 10 "$bin" 2>/dev/null) || true
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
response=$(echo -e "uci\nquit" | _timeout 10 "$SF_BIN" 2>/dev/null) || true
if echo "$response" | grep -q "UCI_Elo"; then
    check "stockfish UCI_Elo option present" "ok"
else
    check "stockfish UCI_Elo option present" "not found in uci output"
fi
if [[ "$MODE" != "native" ]]; then
    # Read ELF e_machine field (bytes 18-19, little-endian): aarch64 = 0x00B7
    elf_machine=$(node -e "
const fs=require('fs');
const b=Buffer.alloc(2);
const fd=fs.openSync('$SF_BIN','r');
fs.readSync(fd,b,0,2,18);
fs.closeSync(fd);
console.log(b.readUInt16LE(0).toString(16));
" 2>/dev/null) || elf_machine=""
    if [[ "$elf_machine" == "b7" ]]; then
        check "stockfish arm64 binary" "ok"
    else
        check "stockfish arm64 binary" "unexpected ELF e_machine: 0x${elf_machine}"
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
            | _timeout 15 "$LC0_BIN" --backend=eigen 2>/dev/null) || true
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

    # Identity test: verify Drawfish is the fork (id name differs from standard Stockfish 18)
    id_response=$(echo -e "uci\nquit" | _timeout 10 "$DRAWFISH_BIN" 2>/dev/null) || true
    id_name=$(echo "$id_response" | grep "^id name" | head -1)
    if echo "$id_name" | grep -q "Stockfish 18"; then
        check "drawfish is not standard Stockfish 18" "id name matches standard SF: $id_name"
    elif [[ -n "$id_name" ]]; then
        check "drawfish is not standard Stockfish 18" "ok"
    else
        check "drawfish is not standard Stockfish 18" "no id name in uci response"
    fi
fi

echo
echo "=== Results: $PASS passed, $FAIL failed ==="
[[ $FAIL -eq 0 ]]
