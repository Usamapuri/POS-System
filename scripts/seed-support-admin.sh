#!/bin/bash

# Seed Bhookly Platform-Admin Account
#
# Non-interactive helper that creates the `bhookly_support` user (with
# is_platform_admin=true) directly in a remote Postgres — typically a
# Railway-hosted DB. Use once per restaurant deployment.
#
# Why a separate script from create-admin.sh?
#   - create-admin.sh targets the LOCAL Postgres container via `docker exec`
#     (dev/local workflow).
#   - This script targets a REMOTE DB via a DATABASE_URL (Railway ops).
#   - Separating them keeps the UX of each one dead simple instead of having
#     a single script with "are we local or remote?" branches everywhere.
#
# Usage:
#   # Explicit URL
#   DATABASE_URL="postgresql://user:pass@host:port/db" \
#     scripts/seed-support-admin.sh
#
#   # Railway-linked: pulls DATABASE_PUBLIC_URL from whichever project is
#   # currently linked. Fastest for one-off ops.
#   scripts/seed-support-admin.sh --from-railway
#
#   # Specific Railway project (no need to `railway link` first)
#   scripts/seed-support-admin.sh --railway-project POS-ChaayeKhana
#
#   # Provide an explicit password instead of a generated one (for rerunning
#   # with a known password, e.g. password rotation).
#   BHOOKLY_SUPPORT_PASSWORD="strong-pw-here" scripts/seed-support-admin.sh ...
#
# The script is idempotent:
#   - If bhookly_support already exists, it prints the existing row's last
#     login + password-updated timestamps and exits 0 without changes.
#   - If you want to ROTATE the password on an existing row, re-run with
#     --rotate-password (+ optionally BHOOKLY_SUPPORT_PASSWORD).
#
# Requires:
#   - psql on PATH (macOS: `brew install libpq && brew link --force libpq`).
#   - openssl on PATH (for random password generation).
#   - Railway CLI (only when using --from-railway or --railway-project).

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# ── Defaults ───────────────────────────────────────────────────────────────

SUPPORT_USERNAME="bhookly_support"
SUPPORT_EMAIL="support@bhookly.com"
SUPPORT_FIRST="Bhookly"
SUPPORT_LAST="Support"
ROTATE_PASSWORD=false
RAILWAY_PROJECT=""
USE_RAILWAY=false
DATABASE_URL_ARG=""

# ── Flag parsing ───────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
    case "$1" in
        --database-url)
            DATABASE_URL_ARG="$2"; shift 2 ;;
        --from-railway)
            USE_RAILWAY=true; shift ;;
        --railway-project)
            USE_RAILWAY=true; RAILWAY_PROJECT="$2"; shift 2 ;;
        --rotate-password)
            ROTATE_PASSWORD=true; shift ;;
        --username)
            SUPPORT_USERNAME="$2"; shift 2 ;;
        --email)
            SUPPORT_EMAIL="$2"; shift 2 ;;
        -h|--help)
            sed -n '3,40p' "$0" | sed 's/^# \?//'
            exit 0 ;;
        *)
            echo -e "${RED}Unknown argument: $1${NC}" >&2
            echo "Run with --help for usage." >&2
            exit 1 ;;
    esac
done

# ── Resolve DATABASE_URL ───────────────────────────────────────────────────
# Precedence: explicit --database-url > $DATABASE_URL > Railway lookup.
# Railway case is the most common for ops work — we grab
# DATABASE_PUBLIC_URL, which is the externally-reachable proxy address
# (the internal DATABASE_URL only works from inside Railway's network).

if [[ -n "$DATABASE_URL_ARG" ]]; then
    RESOLVED_URL="$DATABASE_URL_ARG"
    SOURCE_LABEL="--database-url flag"
elif [[ -n "${DATABASE_URL:-}" ]]; then
    RESOLVED_URL="$DATABASE_URL"
    SOURCE_LABEL="DATABASE_URL env var"
elif $USE_RAILWAY; then
    command -v railway >/dev/null || {
        echo -e "${RED}railway CLI not found — install from https://docs.railway.com/develop/cli${NC}" >&2
        exit 1
    }
    if [[ -n "$RAILWAY_PROJECT" ]]; then
        echo -e "${BLUE}Linking to Railway project: ${RAILWAY_PROJECT}${NC}"
        railway link --project "$RAILWAY_PROJECT" >/dev/null
    fi
    # Find the Postgres service non-interactively. Heuristic: service name
    # contains "Database" or "Postgres" (case-insensitive). This matches
    # our naming convention ("ChaayeKhana Database", "COVA Database") and
    # the default name Railway uses for the Postgres template.
    DB_SERVICE=$(railway status --json 2>/dev/null | \
        python3 -c "import json,sys; d=json.load(sys.stdin); names=[s['node']['name'] for s in d['services']['edges']]; [print(n) for n in names if 'database' in n.lower() or 'postgres' in n.lower()]" | \
        head -1)
    if [[ -z "$DB_SERVICE" ]]; then
        echo -e "${RED}Could not find a Postgres service in the linked Railway project.${NC}" >&2
        echo -e "${YELLOW}Pass --database-url instead, or ensure the Postgres service name includes 'Database' or 'Postgres'.${NC}" >&2
        exit 1
    fi
    RESOLVED_URL=$(railway variables --service "$DB_SERVICE" --kv 2>/dev/null \
        | awk -F= '/^DATABASE_PUBLIC_URL=/ {sub(/^DATABASE_PUBLIC_URL=/,""); print; exit}')
    if [[ -z "$RESOLVED_URL" ]]; then
        echo -e "${RED}DATABASE_PUBLIC_URL not found on service '${DB_SERVICE}'. Is the Postgres public proxy enabled?${NC}" >&2
        exit 1
    fi
    SOURCE_LABEL="Railway project: ${RAILWAY_PROJECT:-$(railway status --json | python3 -c 'import json,sys;print(json.load(sys.stdin)["name"])')} → service: ${DB_SERVICE}"
else
    echo -e "${RED}No DATABASE_URL provided.${NC}" >&2
    echo "Use one of:" >&2
    echo "  DATABASE_URL=... $0" >&2
    echo "  $0 --database-url '...'" >&2
    echo "  $0 --from-railway          (current linked project)" >&2
    echo "  $0 --railway-project NAME" >&2
    exit 1
fi

# ── Tooling checks ─────────────────────────────────────────────────────────

command -v psql >/dev/null || {
    echo -e "${RED}psql not found on PATH.${NC}" >&2
    echo "macOS: brew install libpq && brew link --force libpq" >&2
    exit 1
}
command -v openssl >/dev/null || {
    echo -e "${RED}openssl not found — install it before continuing.${NC}" >&2
    exit 1
}

# ── Banner ─────────────────────────────────────────────────────────────────

SANITIZED_URL=$(echo "$RESOLVED_URL" | sed -E 's|(postgres(ql)?://[^:]+:)[^@]+@|\1*****@|')
cat <<EOF
${BOLD}${BLUE}
╔═══════════════════════════════════════════════════════════════════╗
║  Bhookly POS — Seed platform-admin account                        ║
╚═══════════════════════════════════════════════════════════════════╝${NC}

Target:   ${SANITIZED_URL}
Source:   ${SOURCE_LABEL}
Account:  ${SUPPORT_USERNAME} / ${SUPPORT_EMAIL}

EOF

# ── Schema precondition: is_platform_admin column must exist ──────────────
# The column is added by schema_patches.go (runs on backend boot) or by
# migrations/004_auth_password_reset.sql (runs on fresh installs). If
# neither has happened yet, we abort with an actionable error instead of
# falling back to an insert that would fail with a cryptic SQL error.

HAS_COLUMN=$(psql "$RESOLVED_URL" -tAc \
    "SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='is_platform_admin'" \
    2>&1 || true)

if [[ "$HAS_COLUMN" != "1" ]]; then
    cat <<EOF
${RED}✗ users.is_platform_admin column not found in this database.${NC}

${YELLOW}This means the backend hasn't booted with the new code yet. Either:${NC}
  1. Push the new code so Railway redeploys the backend (ApplySchemaPatches
     adds the column on boot), THEN re-run this script.
  2. Or apply the SQL migration manually:
     psql "\$DATABASE_URL" -f database/migrations/004_auth_password_reset.sql

EOF
    exit 1
fi

# ── Check for existing row ─────────────────────────────────────────────────

EXISTING=$(psql "$RESOLVED_URL" -tAc \
    "SELECT id, last_login_at, password_updated_at, is_platform_admin FROM users WHERE username='${SUPPORT_USERNAME}' OR email='${SUPPORT_EMAIL}' LIMIT 1" \
    2>&1 || true)

if [[ -n "$EXISTING" ]]; then
    echo -e "${YELLOW}→ A row with username='${SUPPORT_USERNAME}' or email='${SUPPORT_EMAIL}' already exists:${NC}"
    echo "    $EXISTING"
    echo ""
    if $ROTATE_PASSWORD; then
        echo -e "${BLUE}--rotate-password specified; will update password_hash on the existing row.${NC}"
    else
        echo -e "${GREEN}✓ Nothing to do. Re-run with --rotate-password if you want to reset the password.${NC}"
        exit 0
    fi
fi

# ── Choose / generate password ─────────────────────────────────────────────

if [[ -n "${BHOOKLY_SUPPORT_PASSWORD:-}" ]]; then
    PASSWORD="$BHOOKLY_SUPPORT_PASSWORD"
    PASSWORD_SOURCE="BHOOKLY_SUPPORT_PASSWORD env var"
else
    # 24 random base64 chars ≈ 144 bits of entropy. Excludes `/+=` by
    # passing through tr, so the password is easy to select/paste.
    PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-24)
    PASSWORD_SOURCE="generated (random, 24 chars)"
fi

# ── Ensure pgcrypto is available ───────────────────────────────────────────
# Idempotent; requires the connected user to have CREATE EXTENSION privilege
# (the Railway default `postgres` role does).

psql "$RESOLVED_URL" -q -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;" >/dev/null

# ── Hash password + upsert row ─────────────────────────────────────────────
# We use psql's own -v + :'var' parameter binding, which handles quote
# escaping safely (no shell-level SQL-injection risk from weird passwords).
# The SQL is branched by whether we're creating vs rotating to keep the
# behavior predictable and auditable.

if [[ -z "$EXISTING" ]]; then
    echo -e "${BLUE}Creating ${SUPPORT_USERNAME} (is_platform_admin=true, role=admin)…${NC}"
    psql "$RESOLVED_URL" \
        -v username="$SUPPORT_USERNAME" \
        -v email="$SUPPORT_EMAIL" \
        -v first_name="$SUPPORT_FIRST" \
        -v last_name="$SUPPORT_LAST" \
        -v pw="$PASSWORD" \
        <<'SQL'
INSERT INTO users (
    username, email, password_hash, first_name, last_name, role,
    is_active, is_platform_admin, password_updated_at
) VALUES (
    :'username', :'email',
    crypt(:'pw', gen_salt('bf', 10)),
    :'first_name', :'last_name', 'admin',
    true, true, now()
);
SQL
else
    echo -e "${BLUE}Rotating password for ${SUPPORT_USERNAME}…${NC}"
    psql "$RESOLVED_URL" \
        -v username="$SUPPORT_USERNAME" \
        -v email="$SUPPORT_EMAIL" \
        -v pw="$PASSWORD" \
        <<'SQL'
UPDATE users
   SET password_hash       = crypt(:'pw', gen_salt('bf', 10)),
       password_updated_at = now(),
       is_platform_admin   = true,
       is_active           = true
 WHERE username = :'username' OR email = :'email';
SQL
fi

# ── Report ─────────────────────────────────────────────────────────────────

cat <<EOF

${GREEN}${BOLD}✓ Platform-admin account ready.${NC}

${BOLD}Credentials:${NC}
  Username:  ${SUPPORT_USERNAME}
  Email:     ${SUPPORT_EMAIL}
  Password:  ${PASSWORD}
  Source:    ${PASSWORD_SOURCE}

${YELLOW}⚠️  This password will NOT be displayed again. Save it in 1Password NOW:${NC}
    Item title:  Bhookly Platform Access → ${SUPPORT_USERNAME}
    Vault:       Bhookly Engineering (or wherever your team stores infra creds)

${BOLD}Login test:${NC}
  Open ${BOLD}https://<restaurant>.bhookly.com/login${NC} and sign in with the
  credentials above. Verify that ${SUPPORT_USERNAME} does ${BOLD}NOT${NC} appear
  in Admin → Staff — if it does, the frontend is running stale code and
  needs to be redeployed.

EOF
