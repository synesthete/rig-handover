#!/usr/bin/env bash
# Save one rig page as a single self-contained HTML file (plan morning-digest § 3, ADR 0003).
# Usage: scripts/preview.sh [path] [out]   defaults: /digest/2026-10-28  var/preview/index.html
# The banner shows LANE_MARKER from the environment (or .env); unset it to save the clean copy (§ 4).
# The output goes to var/ (git-ignored): previews never go into the repo.
set -euo pipefail
path="${1:-/digest/2026-10-28}"
out="${2:-var/preview/index.html}"
port="${PREVIEW_PORT:-8799}"
mkdir -p "$(dirname "$out")"
PORT="$port" npx tsx --env-file-if-exists=.env src/server.ts >/dev/null 2>&1 &
pid=$!
trap 'kill $pid 2>/dev/null || true' EXIT
for _ in $(seq 1 50); do
  curl -fs "http://localhost:$port/health" >/dev/null && break
  sleep 0.2
done
curl -fsS "http://localhost:$port$path" -o "$out"
echo "saved $path -> $out ($(wc -c <"$out" | tr -d ' ') bytes)"
