#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

ARCH="$(uname -m)"
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"

if [ "$OS" != "linux" ]; then
  echo "ERROR: This installer currently supports Linux only."
  exit 1
fi

case "$ARCH" in
  x86_64|amd64) TARGET="cloudflared-linux-amd64" ;;
  aarch64|arm64) TARGET="cloudflared-linux-arm64" ;;
  *)
    echo "ERROR: Unsupported architecture: $ARCH"
    echo "Supported: x86_64/amd64, aarch64/arm64"
    exit 1
    ;;
esac

mkdir -p bin

URL="https://github.com/cloudflare/cloudflared/releases/latest/download/${TARGET}"
OUT="bin/cloudflared"

echo "Downloading cloudflared (${TARGET})..."
echo "  from: ${URL}"
echo "   to : ${OUT}"
echo ""

if command -v curl >/dev/null 2>&1; then
  curl -fsSL "${URL}" -o "${OUT}"
elif command -v wget >/dev/null 2>&1; then
  wget -qO "${OUT}" "${URL}"
else
  echo "ERROR: need curl or wget to download cloudflared."
  exit 1
fi

chmod +x "${OUT}"

echo "Installed: ${OUT}"
echo "Test:"
echo "  ./bin/cloudflared --version"






















