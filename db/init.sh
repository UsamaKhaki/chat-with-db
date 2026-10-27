#!/usr/bin/env bash
# Creates the demo database objects. Runs as the Postgres image's init
# script, and in CI against a service container (set PGHOST etc. there).
set -euo pipefail

sql_dir="${DB_SQL_DIR:-/db}"
run_psql() {
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" "$@"
}

run_psql -f "$sql_dir/schema.sql"
run_psql -f "$sql_dir/seed.sql"
run_psql -f "$sql_dir/rag.sql"
run_psql \
  -v app_password="${CHAT_APP_PASSWORD:?CHAT_APP_PASSWORD is required}" \
  -v readonly_password="${CHAT_READONLY_PASSWORD:?CHAT_READONLY_PASSWORD is required}" \
  -f "$sql_dir/roles.sql"
