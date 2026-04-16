#!/bin/sh
set -eu

CADDY_CONFIG="${CADDY_BASE_CONFIG_PATH:-/config/caddy/base-config.json}"
PROXYOS_DATA_DIR="${PROXYOS_DATA_DIR:-/data/proxyos}"
mkdir -p "$PROXYOS_DATA_DIR"

echo "[proxyos] starting caddy with $CADDY_CONFIG"
caddy start --config "$CADDY_CONFIG"

echo "[proxyos] waiting for caddy admin API on :2019"
for i in $(seq 1 30); do
  if wget -q -O - http://localhost:2019/config/ >/dev/null 2>&1; then
    echo "[proxyos] caddy ready"
    break
  fi
  sleep 0.5
done

shutdown() {
  echo "[proxyos] shutting down"
  caddy stop || true
  kill -TERM "$NODE_PID" 2>/dev/null || true
  wait "$NODE_PID" 2>/dev/null || true
  exit 0
}
trap shutdown TERM INT

echo "[proxyos] starting node"
cd /app/apps/web
node server.js &
NODE_PID=$!
wait "$NODE_PID"
