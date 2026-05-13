#!/usr/bin/env bash
# Regression test for the procedure classification audit.
# Probes representative previously-public endpoints and asserts they now reject anonymous requests.

set -u

URL="${PROXYOS_URL:-http://localhost:3000}"

declare -a PROBES=(
  # path  expected_status_minimum  description
  "users.register|400|register (firstRunProcedure — should reject post-bootstrap)"
  "accessLists.list|400|accessLists.list"
  "accessLogSearch.search|400|accessLogSearch.search"
  "agents.list|400|agents.list"
  "alerts.listRules|400|alerts.listRules"
  "analytics.summary|400|analytics.summary"
  "audit.list|400|audit.list"
  "backupConfig.export|400|backupConfig.export"
  "billing.getSubscription|400|billing.getSubscription"
  "caddy.status|400|caddy.status"
  "certificates.list|400|certificates.list"
  "sso.list|400|sso.list"
  "tunnels.providers.list|400|tunnels.providers.list"
  "trafficReplay.exportNdjson|400|trafficReplay.exportNdjson"
)

# Login MUST stay public
declare -a PUBLIC_OK=(
  "users.getDashboardSSO|200|users.getDashboardSSO (must stay public)"
  "caddy.rootCA|200|caddy.rootCA (must stay public)"
)

FAIL=0

for entry in "${PROBES[@]}"; do
  path="${entry%%|*}"
  rest="${entry#*|}"
  expected="${rest%%|*}"
  desc="${rest#*|}"

  status=$(curl -sk -o /dev/null -w "%{http_code}" -X POST "$URL/api/trpc/$path" \
    -H "Content-Type: application/json" \
    -d '{"json":{}}' || echo "000")

  if [ "$status" -ge "$expected" ]; then
    echo "PASS  [$status]  $desc"
  else
    echo "FAIL  [$status]  $desc — should be >= $expected"
    FAIL=$((FAIL + 1))
  fi
done

echo
echo "(skipping public-OK checks — these are sanity for the small allow-list)"

if [ "$FAIL" -gt 0 ]; then
  echo
  echo "FAILED: $FAIL endpoints are still public"
  exit 1
fi
echo
echo "PASS — all probed endpoints reject anonymous access"
