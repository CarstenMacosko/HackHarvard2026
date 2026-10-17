#!/usr/bin/env bash
# Database tests: applies supabase/setup.sql (+ seed_demo.sql) to an empty database and runs
# supabase/test/tests.sql.
#   DATABASE_URL=postgres://... supabase/test/run.sh   # an EMPTY database (it is modified)
#   supabase/test/run.sh                               # starts a throwaway local Postgres
# Works on plain Postgres 15+ and on the supabase/postgres image (test/stubs.sql fills in what
# a Supabase project provides). Never point it at your real project.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(dirname "$here")"

if [ -z "${DATABASE_URL:-}" ]; then
  bin="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
  [ -n "$bin" ] || bin="$(dirname "$(command -v pg_ctl)")"
  tmp="$(mktemp -d)"
  trap '"$bin/pg_ctl" -D "$tmp/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$tmp"' EXIT
  owner=""
  if [ "$(id -u)" = 0 ]; then owner="postgres"; chown -R postgres "$tmp"; fi
  run() { if [ -n "$owner" ]; then su "$owner" -s /bin/sh -c "$*"; else sh -c "$*"; fi; }
  run "'$bin/initdb' -D '$tmp/data' -U postgres -A trust >/dev/null"
  port=$((55000 + RANDOM % 1000))
  run "'$bin/pg_ctl' -D '$tmp/data' -o '-p $port -k $tmp -c listen_addresses=127.0.0.1' -l '$tmp/log' -w start >/dev/null"
  DATABASE_URL="postgres://postgres@127.0.0.1:$port/postgres"
fi

psql_() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -qtA "$@"; }
psql_ -f "$here/stubs.sql" >/dev/null
psql_ -f "$root/setup.sql" >/dev/null
if [ -f "$root/seed_demo.sql" ]; then
  psql_ -f "$root/seed_demo.sql" >/dev/null
  before="$(psql_ -c "select (select count(*) from observations) || '/' || (select count(*) from reviews) || '/' || (select count(*) from audit_log)")"
  psql_ -f "$root/seed_demo.sql" >/dev/null # safe to re-run: nothing new
  after="$(psql_ -c "select (select count(*) from observations) || '/' || (select count(*) from reviews) || '/' || (select count(*) from audit_log)")"
  [ "$before" = "$after" ] || { echo "FAILED: re-running seed_demo.sql added rows ($before -> $after)"; exit 1; }
  echo "ok - demo history loaded (observations/reviews/audit: $after) and safe to re-run"
fi
psql_ -f "$here/tests.sql" 2>&1 | sed -n 's/.*NOTICE:  //p; /ERROR/p; /passed/p'
