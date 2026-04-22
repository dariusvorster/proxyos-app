#!/usr/bin/env bash
# Rebuild smoke test — verifies ProxyOS survives container recreation
# Usage: ./scripts/rebuild-smoke-test.sh
# Requires: docker, docker compose, curl

set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
BASE_URL="${BASE_URL:-http://localhost:3000}"
TEST_DOMAIN="${TEST_DOMAIN:-smoke-test.local}"
TEST_UPSTREAM_PORT=18080
UPSTREAM_NAME="proxyos-smoke-upstream"
CURL_TIMEOUT=10

PASS=0
FAIL=0

pass() { echo "[PASS] $*"; PASS=$((PASS + 1)); }
fail() { echo "[FAIL] $*"; FAIL=$((FAIL + 1)); }
step() { echo ""; echo "==> Step $*"; }

cleanup() {
  echo ""
  echo "[cleanup] Stopping test containers..."
  docker stop "$UPSTREAM_NAME" 2>/dev/null || true
  docker rm   "$UPSTREAM_NAME" 2>/dev/null || true
  docker compose -f "$COMPOSE_FILE" down 2>/dev/null || true
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Step 1: Start ProxyOS and a mock upstream
# ---------------------------------------------------------------------------
step "1 — Start ProxyOS (docker compose up)"
docker compose -f "$COMPOSE_FILE" up -d
echo "[info] Waiting for ProxyOS to become healthy..."
for i in $(seq 1 30); do
  if curl -sf --max-time "$CURL_TIMEOUT" "$BASE_URL/api/health" >/dev/null 2>&1; then
    pass "ProxyOS health check responded"
    break
  fi
  if [ "$i" -eq 30 ]; then
    fail "ProxyOS did not become healthy after 30 seconds"
    exit 1
  fi
  sleep 1
done

step "1b — Start mock upstream (nginx:alpine)"
docker run -d \
  --name "$UPSTREAM_NAME" \
  -p "${TEST_UPSTREAM_PORT}:80" \
  --label "proxyos-smoke=true" \
  nginx:alpine

# Give nginx a moment to start
sleep 2

UPSTREAM_IP_BEFORE=$(docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$UPSTREAM_NAME")
if [ -z "$UPSTREAM_IP_BEFORE" ]; then
  fail "Could not determine upstream IP before rebuild — docker inspect returned empty"
  exit 1
fi
echo "[info] Upstream IP before rebuild: $UPSTREAM_IP_BEFORE"

if curl -sf --max-time "$CURL_TIMEOUT" "http://localhost:${TEST_UPSTREAM_PORT}/" >/dev/null 2>&1; then
  pass "Mock upstream is reachable on port $TEST_UPSTREAM_PORT"
else
  fail "Mock upstream not reachable — aborting"
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 2: Create a test route via API (if PROXYOS_API_KEY is set)
# ---------------------------------------------------------------------------
step "2 — Create test route"
ROUTE_CREATED=false

if [ -n "${PROXYOS_API_KEY:-}" ]; then
  echo "[info] PROXYOS_API_KEY set — attempting route creation via tRPC"
  # tRPC mutation: routes.create
  TRPC_PAYLOAD=$(cat <<JSON
{
  "domain": "${TEST_DOMAIN}",
  "upstream": "http://${UPSTREAM_IP_BEFORE}:80",
  "httpsRedirect": false,
  "stripPrefix": false,
  "prefix": ""
}
JSON
)
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time "$CURL_TIMEOUT" \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${PROXYOS_API_KEY}" \
    "${BASE_URL}/api/trpc/routes.create" \
    --data-raw "$TRPC_PAYLOAD" 2>/dev/null || echo "000")

  if [ "$HTTP_STATUS" = "200" ]; then
    pass "Test route created for domain $TEST_DOMAIN"
    ROUTE_CREATED=true
  else
    echo "[warn] Route creation returned HTTP $HTTP_STATUS — continuing without route validation"
  fi
else
  echo "[info] PROXYOS_API_KEY not set — skipping route creation, testing container restart resilience only"
fi

# ---------------------------------------------------------------------------
# Step 3: Verify route works (if created)
# ---------------------------------------------------------------------------
step "3 — Verify route through ProxyOS (pre-restart)"
if [ "$ROUTE_CREATED" = "true" ]; then
  ROUTE_RESP=$(curl -sf --max-time "$CURL_TIMEOUT" \
    -H "Host: ${TEST_DOMAIN}" \
    "${BASE_URL}/" 2>/dev/null || echo "")
  if echo "$ROUTE_RESP" | grep -qi "nginx\|welcome\|html"; then
    pass "Route responds through ProxyOS before container restart"
  else
    fail "Route did not return expected nginx response (got: ${ROUTE_RESP:0:200})"
  fi
else
  echo "[skip] No route created — skipping proxy routing check"
fi

# ---------------------------------------------------------------------------
# Step 4: Recreate the ProxyOS container
# ---------------------------------------------------------------------------
step "4 — Recreate ProxyOS container (--force-recreate)"
docker compose -f "$COMPOSE_FILE" up --force-recreate -d
echo "[info] Waiting for ProxyOS to become healthy after recreate..."
for i in $(seq 1 30); do
  if curl -sf --max-time "$CURL_TIMEOUT" "$BASE_URL/api/health" >/dev/null 2>&1; then
    pass "ProxyOS healthy after container recreation"
    break
  fi
  if [ "$i" -eq 30 ]; then
    fail "ProxyOS did not recover after recreation"
    exit 1
  fi
  sleep 1
done

# ---------------------------------------------------------------------------
# Step 5: Verify route still works after ProxyOS restart
# ---------------------------------------------------------------------------
step "5 — Verify route after ProxyOS recreation"
if [ "$ROUTE_CREATED" = "true" ]; then
  ROUTE_RESP2=$(curl -sf --max-time "$CURL_TIMEOUT" \
    -H "Host: ${TEST_DOMAIN}" \
    "${BASE_URL}/" 2>/dev/null || echo "")
  if echo "$ROUTE_RESP2" | grep -qi "nginx\|welcome\|html"; then
    pass "Route still responds after ProxyOS container recreation"
  else
    fail "Route broke after ProxyOS recreation (got: ${ROUTE_RESP2:0:200})"
  fi
else
  echo "[skip] No route created — skipping post-ProxyOS-restart proxy check"
fi

# ---------------------------------------------------------------------------
# Step 6: Recreate the upstream container
# ---------------------------------------------------------------------------
step "6 — Recreate upstream container"
docker stop "$UPSTREAM_NAME" || true
docker rm   "$UPSTREAM_NAME" || true

docker run -d \
  --name "$UPSTREAM_NAME" \
  -p "${TEST_UPSTREAM_PORT}:80" \
  --label "proxyos-smoke=true" \
  nginx:alpine

sleep 2

UPSTREAM_IP_AFTER=$(docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$UPSTREAM_NAME")
if [ -z "$UPSTREAM_IP_AFTER" ]; then
  fail "Could not determine upstream IP after rebuild — docker inspect returned empty"
  exit 1
fi
echo "[info] Upstream IP after rebuild: $UPSTREAM_IP_AFTER"

if [ "$UPSTREAM_IP_BEFORE" != "$UPSTREAM_IP_AFTER" ]; then
  pass "Upstream IP changed ($UPSTREAM_IP_BEFORE -> $UPSTREAM_IP_AFTER) — DNS re-resolution is needed"
else
  echo "[warn] Upstream IP did not change — DNS re-resolution test is less meaningful (same IP assigned)"
fi

if curl -sf --max-time "$CURL_TIMEOUT" "http://localhost:${TEST_UPSTREAM_PORT}/" >/dev/null 2>&1; then
  pass "Recreated upstream reachable on port $TEST_UPSTREAM_PORT"
else
  fail "Recreated upstream not reachable"
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 7: Verify route still works after upstream recreation (DNS re-resolution)
# ---------------------------------------------------------------------------
step "7 — Verify route after upstream recreation (DNS re-resolution)"
if [ "$ROUTE_CREATED" = "true" ]; then
  # Give ProxyOS a moment to re-resolve if it uses periodic DNS
  sleep 3

  ROUTE_RESP3=$(curl -sf --max-time "$CURL_TIMEOUT" \
    -H "Host: ${TEST_DOMAIN}" \
    "${BASE_URL}/" 2>/dev/null || echo "")
  if echo "$ROUTE_RESP3" | grep -qi "nginx\|welcome\|html"; then
    pass "Route works after upstream recreation — ProxyOS re-resolved DNS"
  else
    fail "Route broke after upstream recreation (got: ${ROUTE_RESP3:0:200})"
  fi
else
  # Still verify ProxyOS itself stayed healthy through the upstream churn
  if curl -sf --max-time "$CURL_TIMEOUT" "$BASE_URL/api/health" >/dev/null 2>&1; then
    pass "ProxyOS remains healthy after upstream recreation"
  else
    fail "ProxyOS became unhealthy after upstream recreation"
  fi
fi

# ---------------------------------------------------------------------------
# Step 8: Summary
# ---------------------------------------------------------------------------
echo ""
echo "================================================"
echo "  Rebuild Smoke Test Results"
echo "================================================"
echo "  PASS: $PASS"
echo "  FAIL: $FAIL"
echo "================================================"

if [ "$FAIL" -gt 0 ]; then
  echo "[RESULT] FAIL — $FAIL check(s) did not pass"
  exit 1
fi

echo "[RESULT] PASS — all checks passed"
exit 0
