#!/usr/bin/env bash
set -euo pipefail

if [ -z "${DATABASE_URL-}" ]; then
  echo "DATABASE_URL must be set"
  exit 1
fi

SQL_FILE="$(dirname "$0")/../prisma/non-blocking-indexes/queries.sql"

echo "Running non-blocking index statements from $SQL_FILE"

# Run each statement separately to ensure CONCURRENTLY is not inside a transaction
awk 'BEGIN{RS=";"} {gsub(/^[ \t\n]+|[ \t\n]+$/,"",$0); if(length($0)) print $0";"}' "$SQL_FILE" | while read -r stmt; do
  echo "Executing: ${stmt:0:80}..."
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "$stmt"
done

echo "Done"
