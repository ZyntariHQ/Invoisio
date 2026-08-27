#!/usr/bin/env bash
set -euo pipefail

# Usage: ./fix-prisma-duplicate-migration.sh [MIGRATION_NAME]
# Example: ./fix-prisma-duplicate-migration.sh 20260823120000_add_customers

MIGRATION=${1:-20260823120000_add_customers}
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION_DIR="$REPO_ROOT/backend/prisma/migrations/$MIGRATION"

if [ ! -d "$MIGRATION_DIR" ]; then
  echo "Migration folder not found: $MIGRATION_DIR"
  echo "Nothing to remove. If the migration exists on a remote branch, run this script on that branch or provide the correct migration name."
  exit 1
fi

echo "Found migration folder: $MIGRATION_DIR"
read -p "Proceed to remove this migration folder and create a backup tarball? [y/N] " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "Aborted by user. No changes made."
  exit 0
fi

BACKUP_TARBALL="$REPO_ROOT/tmp/${MIGRATION}.tar.gz"
mkdir -p "$REPO_ROOT/tmp"
tar -czf "$BACKUP_TARBALL" -C "$REPO_ROOT/backend/prisma/migrations" "$MIGRATION"
echo "Backup saved to $BACKUP_TARBALL"

git checkout -b fix/remove-duplicate-$MIGRATION
git rm -r "$MIGRATION_DIR"
git commit -m "chore(prisma): remove duplicate migration $MIGRATION"
echo "Removed migration and committed on branch fix/remove-duplicate-$MIGRATION"

read -p "Regenerate migrations now using 'npx prisma migrate dev'? (requires Node + prisma) [y/N] " regen
if [[ "$regen" == "y" || "$regen" == "Y" ]]; then
  pushd "$REPO_ROOT/backend" >/dev/null
  npx prisma migrate dev --name regen-after-duplicate
  git add prisma/migrations
  git commit -m "chore(prisma): regenerate migrations after removing duplicate $MIGRATION" || true
  popd >/dev/null
  echo "Regenerated migrations and committed changes."
else
  echo "Skipped regeneration. To regenerate locally run:" 
  echo "  cd backend && npx prisma migrate dev --name regen-after-duplicate"
fi

echo "Next steps: review commits, run tests, then push the branch:"
echo "  git push origin fix/remove-duplicate-$MIGRATION"

exit 0
