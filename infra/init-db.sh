#!/bin/sh
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=store_password="$STORE_DB_PASSWORD" --set=control_password="$CONTROL_DB_PASSWORD" <<'SQL'
CREATE ROLE rvu_store LOGIN PASSWORD :'store_password';
CREATE ROLE rvu_control LOGIN PASSWORD :'control_password';
REVOKE ALL ON DATABASE rvu FROM PUBLIC;
GRANT CONNECT ON DATABASE rvu TO rvu_store,rvu_control;
SQL
