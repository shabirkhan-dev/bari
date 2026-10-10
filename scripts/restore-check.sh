#!/usr/bin/env bash
# Proves a backup restores: decrypts it into a fresh database and compares row counts.
# Usage: RESTORE_ADMIN_URL=postgresql://postgres@host/postgres BACKUP_PASSPHRASE=... scripts/restore-check.sh <file.gpg>
set -euo pipefail
: "${RESTORE_ADMIN_URL:?set RESTORE_ADMIN_URL}" "${BACKUP_PASSPHRASE:?set BACKUP_PASSPHRASE}"
file=${1:?backup file}
here=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d); db="restore_check_$$"
target=$(echo "$RESTORE_ADMIN_URL" | sed -E "s#/[^/?]*(\?|$)#/$db\1#")
cleanup() { psql "$RESTORE_ADMIN_URL" -qc "drop database if exists $db" >/dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT

gpg --batch --quiet --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" -d "$file" | tar -xz -C "$work"
psql "$RESTORE_ADMIN_URL" -v ON_ERROR_STOP=1 -qc "create database $db"
psql "$target" -v ON_ERROR_STOP=1 -q -f "$here/tests/db/supabase-stub.sql"
psql "$target" -v ON_ERROR_STOP=1 -q <<SQL
create temp table u (id uuid, email text, raw_user_meta_data jsonb);
\copy u from '$work/auth_users.csv' csv header
insert into auth.users (id, email, raw_user_meta_data) select id, email, raw_user_meta_data from u;
SQL
psql "$target" -qc "drop schema public cascade" >/dev/null  # the dump recreates it
pg_restore --no-owner --no-privileges --exit-on-error -d "$target" "$work/public.dump"

fail=0
while IFS=, read -r table expected; do
  actual=$(psql "$target" -qAtc "select count(*) from public.\"$table\"")
  if [ "$actual" != "$expected" ]; then echo "MISMATCH $table: backup $expected, restored $actual"; fail=1; fi
done < "$work/counts.csv"
[ $fail -eq 0 ] && echo "Restore OK: $(wc -l < "$work/counts.csv") tables, row counts match"
exit $fail
