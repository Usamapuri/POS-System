#!/bin/bash

# Create Super Admin / Platform Admin Script
#
# Interactively seeds a user row directly into the running Postgres
# container. Two modes:
#
#   ./scripts/create-admin.sh                  # customer's restaurant admin
#   ./scripts/create-admin.sh --platform       # bhookly support account
#
# The --platform flag sets is_platform_admin=true. That row is:
#   • Hidden from the customer's /admin/users list (see getAdminUsers in
#     backend/internal/api/routes.go).
#   • Protected from update/delete via /admin/users by non-platform callers.
# We seed one such row per deployment so the bhookly team can always log
# into a customer's restaurant to help, without the account appearing in
# their Users page.
#
# Password hashing: uses pgcrypto's crypt() + gen_salt('bf', 10) to produce a
# bcrypt $2a$ hash compatible with Go's golang.org/x/crypto/bcrypt. No local
# htpasswd / python / go dependencies required — we rely only on the Postgres
# container which the script already assumes is running.

set -e

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# ── Parse flags ────────────────────────────────────────────────────────────
PLATFORM_MODE=false
for arg in "$@"; do
    case "$arg" in
        --platform)
            PLATFORM_MODE=true
            ;;
        -h|--help)
            echo "Usage: $0 [--platform]"
            echo ""
            echo "  --platform   Create a bhookly platform-admin account (hidden from"
            echo "               the customer's Users admin page). Use once per new"
            echo "               deployment during provisioning."
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown argument: $arg${NC}"
            echo "Usage: $0 [--platform]"
            exit 1
            ;;
    esac
done

if [[ "$PLATFORM_MODE" == "true" ]]; then
    echo -e "${BLUE}POS System - Create Bhookly Platform Admin${NC}"
    echo "============================================"
    echo -e "${YELLOW}This creates a support account that's hidden from the customer's"
    echo -e "Users page. Use once per new restaurant deployment.${NC}"
else
    echo -e "${BLUE}POS System - Create Super Admin${NC}"
    echo "======================================="
fi
echo ""

# ── Container detection ────────────────────────────────────────────────────
# Works against either dev or prod compose setups. The script is intended
# for local / Railway-shell usage; we bail out clearly if neither is up.
CONTAINER_NAME="pos-postgres-dev"
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    CONTAINER_NAME="pos-postgres"
    if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo -e "${RED}❌ Database container is not running!${NC}"
        echo -e "${YELLOW}Please run 'make up' or 'make dev' first.${NC}"
        exit 1
    fi
fi

# ── Prompt for user details ────────────────────────────────────────────────
# In --platform mode we pre-fill with sensible defaults so bhookly provisioning
# stays consistent across tenants; the operator can still override.
if [[ "$PLATFORM_MODE" == "true" ]]; then
    DEFAULT_USERNAME="bhookly_support"
    DEFAULT_EMAIL="support@bhookly.com"
    DEFAULT_FIRST="Bhookly"
    DEFAULT_LAST="Support"
else
    DEFAULT_USERNAME=""
    DEFAULT_EMAIL=""
    DEFAULT_FIRST=""
    DEFAULT_LAST=""
fi

echo -e "${YELLOW}Please provide the following information:${NC}"
echo ""

prompt_required() {
    local label="$1"
    local default="$2"
    local var
    if [[ -n "$default" ]]; then
        read -p "$label [$default]: " var
        var="${var:-$default}"
    else
        read -p "$label: " var
    fi
    while [[ -z "$var" ]]; do
        echo -e "${RED}${label} cannot be empty!${NC}"
        read -p "$label: " var
    done
    echo "$var"
}

USERNAME=$(prompt_required "Username" "$DEFAULT_USERNAME")
EMAIL=$(prompt_required "Email" "$DEFAULT_EMAIL")
FIRST_NAME=$(prompt_required "First Name" "$DEFAULT_FIRST")
LAST_NAME=$(prompt_required "Last Name" "$DEFAULT_LAST")

# Hidden password input. Loop until password + confirmation match and are
# non-empty (minimum length is enforced at the API layer for self-service
# flows; no need to re-implement it here).
while true; do
    echo -n "Password: "
    read -s PASSWORD
    echo ""
    [[ -z "$PASSWORD" ]] && { echo -e "${RED}Password cannot be empty!${NC}"; continue; }

    echo -n "Confirm Password: "
    read -s CONFIRM_PASSWORD
    echo ""

    if [[ "$PASSWORD" == "$CONFIRM_PASSWORD" ]]; then
        break
    fi
    echo -e "${RED}Passwords do not match!${NC}"
done

echo ""
echo -e "${YELLOW}Creating ${PLATFORM_MODE:+platform-}admin user with the following details:${NC}"
echo "Username: $USERNAME"
echo "Email: $EMAIL"
echo "Name: $FIRST_NAME $LAST_NAME"
echo "Role: admin"
if [[ "$PLATFORM_MODE" == "true" ]]; then
    echo -e "${YELLOW}Platform Admin: YES (hidden from customer UI)${NC}"
fi
echo ""

read -p "Continue? (y/N): " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}Operation cancelled.${NC}"
    exit 0
fi

# ── Check for duplicates ───────────────────────────────────────────────────
USER_EXISTS=$(docker exec "$CONTAINER_NAME" psql -U postgres -d pos_system -tAc \
    "SELECT EXISTS(SELECT 1 FROM users WHERE username = '$USERNAME' OR email = '$EMAIL');")

if [[ "$USER_EXISTS" == "t" ]]; then
    echo -e "${RED}❌ User with username '$USERNAME' or email '$EMAIL' already exists!${NC}"
    exit 1
fi

# ── Hash password via pgcrypto ─────────────────────────────────────────────
# pgcrypto is stdlib in every Postgres build shipped with the docker image.
# CREATE EXTENSION is idempotent and requires superuser; the `postgres`
# role used here has it. The -v pw=... + :'pw' pattern is psql's own
# variable substitution, which handles quote-escaping safely (no shell-level
# SQL-injection risk from weird passwords).
echo -e "${YELLOW}💫 Hashing password (bcrypt, cost 10)…${NC}"
docker exec "$CONTAINER_NAME" psql -U postgres -d pos_system -q -c \
    "CREATE EXTENSION IF NOT EXISTS pgcrypto;" >/dev/null

PASSWORD_HASH=$(docker exec -i "$CONTAINER_NAME" \
    psql -U postgres -d pos_system -tA -v pw="$PASSWORD" \
    -c "SELECT crypt(:'pw', gen_salt('bf', 10));" | tr -d '[:space:]')

if [[ -z "$PASSWORD_HASH" || "$PASSWORD_HASH" != \$2a\$* ]]; then
    echo -e "${RED}❌ Failed to hash password (got: ${PASSWORD_HASH:0:10}…)${NC}"
    exit 1
fi

# ── Insert user ────────────────────────────────────────────────────────────
PLATFORM_VALUE=$([[ "$PLATFORM_MODE" == "true" ]] && echo "true" || echo "false")

echo -e "${YELLOW}💫 Creating user…${NC}"
docker exec -i "$CONTAINER_NAME" psql -U postgres -d pos_system \
    -v username="$USERNAME" \
    -v email="$EMAIL" \
    -v hash="$PASSWORD_HASH" \
    -v first_name="$FIRST_NAME" \
    -v last_name="$LAST_NAME" \
    -v is_platform="$PLATFORM_VALUE" \
    <<'SQL'
INSERT INTO users (
    username, email, password_hash, first_name, last_name, role,
    is_active, is_platform_admin, password_updated_at
) VALUES (
    :'username', :'email', :'hash', :'first_name', :'last_name', 'admin',
    true, :'is_platform'::boolean, now()
);
SQL

if [[ $? -eq 0 ]]; then
    echo -e "${GREEN}✅ Admin user created successfully!${NC}"
    echo ""
    echo -e "${GREEN}Admin user details:${NC}"
    echo "Username: $USERNAME"
    echo "Email: $EMAIL"
    echo "Role: admin"
    echo "Status: active"
    if [[ "$PLATFORM_MODE" == "true" ]]; then
        echo -e "${YELLOW}Platform Admin: YES${NC}"
        echo ""
        echo -e "${BLUE}Store these credentials in 1Password under 'Bhookly Platform Access → ${USERNAME}'.${NC}"
        echo -e "${BLUE}This account WILL NOT appear in the customer's /admin/users page.${NC}"
    fi
else
    echo -e "${RED}❌ Failed to create admin user!${NC}"
    exit 1
fi
