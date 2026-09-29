#!/usr/bin/env bash
# Creates the first ADMIN user (no public sign-up exists). Usage: ./create-admin.sh admin@example.com 'Full Name' 'password'
set -euo pipefail
EMAIL=${1:?email}; NAME=${2:?full name}; PASS=${3:?password}
HASH=$(docker run --rm httpd:2.4-alpine htpasswd -nbBC 10 "" "$PASS" | cut -d: -f2 | sed 's/^\$2y/\$2a/')
docker compose exec -T mariadb sh -c 'mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" auth_db' <<SQL
INSERT INTO users (id, full_name, email, password_hash, role, is_active, created_at, updated_at)
VALUES (UUID(), '${NAME//\'/\'\'}', '${EMAIL//\'/\'\'}', '${HASH//\$/\$}', 'ADMIN', 1, NOW(), NOW());
SQL
echo "Admin created: $EMAIL"
