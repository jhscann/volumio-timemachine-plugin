#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

VERSION=$(node -e "console.log(require('./timemachine/package.json').version)")
OUT_DIR="$ROOT_DIR/dist"
OUT_FILE="$OUT_DIR/timemachine-$VERSION.zip"

mkdir -p "$OUT_DIR"
rm -f "$OUT_FILE"

(
  cd "$ROOT_DIR"
  zip -qr "$OUT_FILE" timemachine
)

echo "$OUT_FILE"
