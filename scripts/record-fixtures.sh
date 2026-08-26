#!/usr/bin/env bash
# Record real UCI output from native engines for use in ScriptedEngineClient tests.
# Requires ENGINE_MODE=native (Homebrew Stockfish + lc0 must be present).
set -euo pipefail

SF_BIN="/opt/homebrew/opt/stockfish/bin/stockfish"
LC0_BIN="/opt/homebrew/Cellar/lc0/0.32.1/libexec/lc0"
WEIGHTS_DIR="$(cd "$(dirname "$0")/.." && pwd)/weights"
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/tests/fixtures/engine-output"

mkdir -p "$OUT_DIR"

echo "Recording Stockfish fixture: startpos depth 15..."
printf "uci\nisready\nposition startpos\ngo depth 15\nquit\n" \
    | timeout 60 "$SF_BIN" 2>/dev/null \
    > "$OUT_DIR/sf-startpos-depth15.txt"
echo "  written sf-startpos-depth15.txt"

echo "Recording Stockfish MultiPV fixture: startpos MultiPV 3..."
printf "uci\nsetoption name MultiPV value 3\nisready\nposition startpos\ngo depth 12\nquit\n" \
    | timeout 60 "$SF_BIN" 2>/dev/null \
    > "$OUT_DIR/sf-startpos-multipv3.txt"
echo "  written sf-startpos-multipv3.txt"

# Maia 1500 policy probe
MAIA_WEIGHT="$WEIGHTS_DIR/maia-1500.pb.gz"
if [[ -f "$MAIA_WEIGHT" ]]; then
    echo "Recording lc0 Maia-1500 policy probe: startpos..."
    printf "setoption name WeightsFile value %s\nsetoption name VerboseMoveStats value true\nsetoption name PolicyTemperature value 1.0\nuci\nisready\nposition startpos\ngo nodes 2\nquit\n" \
        "$MAIA_WEIGHT" \
        | timeout 30 "$LC0_BIN" --backend=blas 2>/dev/null \
        > "$OUT_DIR/lc0-maia1500-startpos-policy.txt"
    echo "  written lc0-maia1500-startpos-policy.txt"
else
    echo "  SKIP: maia-1500.pb.gz not found at $MAIA_WEIGHT"
fi

echo
echo "Fixtures written to $OUT_DIR:"
ls -lh "$OUT_DIR"
