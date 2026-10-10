#!/usr/bin/env bash
# Encrypted backup of the committee database.
# Needs: SUPABASE_DB_URL (session-pooler connection string), BACKUP_PASSPHRASE.
# Writes: backups/committee-<UTC timestamp>.tar.gz.gpg
set -euo pipefail
: "${SUPABASE_DB_URL:?set SUPABASE_DB_URL}" "${BACKUP_PASSPHRASE:?set BACKUP_PASSPHRASE}"

stamp=$(date -u +%Y%m%dT%H%M%SZ)
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
mkdir -p backups

# 1. Everything in our schema: tables, data, functions, policies.
pg_dump "$SUPABASE_DB_URL" --schema=public --no-owner --no-privileges -Fc -f "$work/public.dump"

# 2. Account rows our tables reference (ids + emails only, no password hashes).
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -qc \
  "\copy (select id, email, raw_user_meta_data from auth.users order by id) to '$work/auth_users.csv' csv header"

# 3. Row counts, so the restore check can prove nothing went missing.
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -qAtF, -c "
  select table_name, (xpath('/row/n/text()', query_to_xml(format('select count(*) n from public.%I', table_name), false, true, '')))[1]::text
  from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1" > "$work/counts.csv"

tar -czf "$work/backup.tar.gz" -C "$work" public.dump auth_users.csv counts.csv
gpg --batch --yes --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" \
    --symmetric --cipher-algo AES256 -o "backups/committee-$stamp.tar.gz.gpg" "$work/backup.tar.gz"
echo "backups/committee-$stamp.tar.gz.gpg"
