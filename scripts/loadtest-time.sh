#!/usr/bin/env bash
# Time the explorer's read paths against the local dev server (default :8799)
# and print EXPLAIN QUERY PLAN for the feed queries. Run after loadtest-seed.mjs.
set -euo pipefail
BASE="${1:-http://localhost:8799}"
paths=(
  "/api/messages?limit=50"
  "/api/messages?limit=50&kind=all"
  "/api/messages?limit=50&sort=hot"
  "/api/messages?limit=50&protocol=thorchain"
  "/api/messages?limit=50&protocol=lifi"
  "/api/messages?limit=50&tick=LEAF"
  "/api/messages?limit=50&address=1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"
  "/api/messages?limit=50&collection_id=5"
  "/api/chat?limit=200&collection_id=5"
  "/api/chat?limit=200&address=1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"
  "/api/protocols"
  "/api/ticks"
  "/api/chain"
)
for p in "${paths[@]}"; do
  best=9; for i in 1 2 3; do
    t=$(curl -s -o /dev/null -w '%{time_total}' "$BASE$p"); best=$(python3 -c "print(min($best,$t))")
  done
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE$p")
  printf '%-75s %s %6.0f ms\n' "$p" "$code" "$(python3 -c "print($best*1000)")"
done
