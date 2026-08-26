#!/usr/bin/env bash
# Fetch Maia weight files into weights/.
# Priority: 1) ~/code/lucaschess darwin tree  2) linux tree  3) CSSLab release (1100-1900 only)
set -euo pipefail

DEST="$(cd "$(dirname "$0")/.." && pwd)/weights"
mkdir -p "$DEST"

DARWIN_SRC="$HOME/code/lucaschess/bin/OS/darwin/Engines/maia"
LINUX_SRC="$HOME/code/lucaschess/bin/OS/linux/Engines/maia"
CSSLAB_BASE="https://github.com/CSSLab/maia-chess/releases/download/v1.0"

REQUIRED=(1100 1200 1300 1400 1500 1600 1700 1800 1900)
OPTIONAL=(2200)

copy_from() {
    local src="$1"
    local elo="$2"
    local file="maia-${elo}.pb.gz"
    if [[ -f "$src/$file" ]]; then
        cp "$src/$file" "$DEST/$file"
        echo "  copied $file from $src"
        return 0
    fi
    return 1
}

download_from_csslab() {
    local elo="$1"
    local file="maia-${elo}.pb.gz"
    local url="${CSSLAB_BASE}/${file}"
    echo "  downloading $file from CSSLab..."
    curl -fsSL --max-time 60 -o "$DEST/$file" "$url"
}

echo "Fetching Maia weights into weights/ ..."

for elo in "${REQUIRED[@]}"; do
    file="maia-${elo}.pb.gz"
    if [[ -f "$DEST/$file" ]]; then
        echo "  $file already present, skipping"
        continue
    fi
    copy_from "$DARWIN_SRC" "$elo" \
        || copy_from "$LINUX_SRC" "$elo" \
        || download_from_csslab "$elo"
done

for elo in "${OPTIONAL[@]}"; do
    file="maia-${elo}.pb.gz"
    if [[ -f "$DEST/$file" ]]; then
        echo "  $file already present, skipping"
        continue
    fi
    copy_from "$DARWIN_SRC" "$elo" \
        || copy_from "$LINUX_SRC" "$elo" \
        || echo "  maia-${elo}.pb.gz not available (optional, skipping)"
done

echo "Done. Contents of weights/:"
ls -lh "$DEST"/*.pb.gz 2>/dev/null || echo "  (empty)"
