#!/bin/bash

# Provision Restaurant Deployment Helper
#
# Interactive pre-flight checklist for onboarding a new restaurant onto
# bhookly. Does NOT automate Railway or DNS (too many moving parts, different
# per-restaurant choices). What it DOES do:
#
#   1. Prompts for restaurant slug + display name.
#   2. Generates a fresh JWT_SECRET (unique per restaurant — NEVER reuse).
#   3. Prints a ready-to-copy environment variable block for the Railway
#      backend service.
#   4. After the operator confirms the deployment is up, invokes
#      create-admin.sh twice:
#        - Once with --platform to seed bhookly_support.
#        - Once for the customer's first admin user.
#
# When we hit ~5 customers it'll be worth automating this end-to-end with the
# Railway CLI + Cloudflare DNS. For 2-5 deployments this manual checklist is
# faster to maintain than a brittle automation.

set -e

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cat <<EOF
${BOLD}${BLUE}
╔═══════════════════════════════════════════════════════════════════╗
║  Bhookly POS — Provision a new restaurant deployment              ║
╚═══════════════════════════════════════════════════════════════════╝${NC}

This helper walks you through the five steps of onboarding a new customer.
It does NOT automate Railway or DNS — you'll do those in the UI / dashboard —
but it generates the env vars you need to paste and seeds the admin users
once the deployment is live.

EOF

# ── 1. Collect restaurant metadata ─────────────────────────────────────────
read -p "Restaurant short slug (lowercase, e.g. 'ck', 'cova'): " SLUG
while [[ -z "$SLUG" || ! "$SLUG" =~ ^[a-z0-9-]+$ ]]; do
    echo -e "${RED}Slug must be lowercase letters, digits, and hyphens only.${NC}"
    read -p "Slug: " SLUG
done

read -p "Human-readable display name (e.g. 'CK Restaurant'): " DISPLAY_NAME
while [[ -z "$DISPLAY_NAME" ]]; do
    echo -e "${RED}Display name cannot be empty.${NC}"
    read -p "Display name: " DISPLAY_NAME
done

read -p "Subdomain (just the leading part, '${SLUG}' is common) [${SLUG}]: " SUBDOMAIN
SUBDOMAIN="${SUBDOMAIN:-$SLUG}"

read -p "Apex domain [bhookly.com]: " APEX_DOMAIN
APEX_DOMAIN="${APEX_DOMAIN:-bhookly.com}"

HOST="${SUBDOMAIN}.${APEX_DOMAIN}"
APP_URL="https://${HOST}"

read -p "Customer support email for password-reset reply-to [support@bhookly.com]: " SUPPORT_EMAIL
SUPPORT_EMAIL="${SUPPORT_EMAIL:-support@bhookly.com}"

read -p "Centralized Resend API key (re_... — paste once, reuse per tenant): " RESEND_KEY
while [[ -z "$RESEND_KEY" || ! "$RESEND_KEY" =~ ^re_ ]]; do
    echo -e "${RED}Resend keys start with 're_'.${NC}"
    read -p "Resend API key: " RESEND_KEY
done

# ── 2. Generate a fresh JWT_SECRET ─────────────────────────────────────────
# openssl is available on macOS + every Linux host we'd run this from. 48
# bytes → 64 base64 chars, well above the 256-bit entropy HS256 wants.
if ! command -v openssl >/dev/null; then
    echo -e "${RED}openssl not found — install it before continuing.${NC}"
    exit 1
fi
JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')

echo ""
echo -e "${GREEN}✅ Configuration captured.${NC}"
echo ""

# ── 3. Print Railway env block ─────────────────────────────────────────────
cat <<EOF
${BOLD}${BLUE}
──────────────────────────────────────────────────────────────────────
 Step 1/4 — Paste these into the Railway backend service's Variables
──────────────────────────────────────────────────────────────────────${NC}

  ${BOLD}DATABASE_URL${NC}=\${{Postgres.DATABASE_URL}}          # Railway reference var
  ${BOLD}JWT_SECRET${NC}=${JWT_SECRET}
  ${BOLD}CORS_ORIGINS${NC}=${APP_URL}
  ${BOLD}APP_URL${NC}=${APP_URL}
  ${BOLD}GIN_MODE${NC}=release
  ${BOLD}RESEND_API_KEY${NC}=${RESEND_KEY}
  ${BOLD}EMAIL_FROM${NC}=${DISPLAY_NAME} <noreply@${APEX_DOMAIN}>
  ${BOLD}TENANT_DISPLAY_NAME${NC}=${DISPLAY_NAME}
  ${BOLD}TENANT_SUPPORT_EMAIL${NC}=${SUPPORT_EMAIL}

${YELLOW}⚠️  JWT_SECRET is unique to this restaurant. DO NOT reuse it anywhere.
   Store it in 1Password under 'Bhookly Deployments → ${SLUG}'.${NC}

${BOLD}${BLUE}
──────────────────────────────────────────────────────────────────────
 Step 2/4 — Paste these into the Railway FRONTEND service's Variables
──────────────────────────────────────────────────────────────────────${NC}

  ${BOLD}BACKEND_URL${NC}=http://\${{Backend.RAILWAY_PRIVATE_DOMAIN}}:8080

${BOLD}${BLUE}
──────────────────────────────────────────────────────────────────────
 Step 3/4 — DNS
──────────────────────────────────────────────────────────────────────${NC}

  Point ${BOLD}${HOST}${NC} at the Railway frontend service's public hostname
  (CNAME in Cloudflare / your DNS provider). Railway will issue a TLS cert
  automatically; give it 1-2 minutes.

${BOLD}${BLUE}
──────────────────────────────────────────────────────────────────────
 Step 4/4 — Seed the two admin accounts (after deployment is healthy)
──────────────────────────────────────────────────────────────────────${NC}

EOF

read -p "Is the deployment live and reachable at ${APP_URL}? Continue with user seeding? (y/N): " READY
if [[ ! "$READY" =~ ^[Yy]$ ]]; then
    cat <<EOF

${YELLOW}No problem. When the deployment is live, re-run this script OR just run
the two commands below directly against the running Postgres container:${NC}

  ${BOLD}./scripts/create-admin.sh --platform${NC}       # bhookly_support
  ${BOLD}./scripts/create-admin.sh${NC}                  # customer's first admin

EOF
    exit 0
fi

cat <<EOF

${BOLD}Creating bhookly support account (hidden from customer's UI)…${NC}

EOF
"$SCRIPT_DIR/create-admin.sh" --platform

cat <<EOF

${BOLD}Creating customer's first admin account…${NC}

EOF
"$SCRIPT_DIR/create-admin.sh"

cat <<EOF

${GREEN}${BOLD}✅ Done! ${DISPLAY_NAME} is provisioned.${NC}

${BOLD}Smoke test:${NC}
  1. Visit ${APP_URL}/login and sign in as the customer's admin.
  2. Visit ${APP_URL}/forgot-password, enter a real email, verify the reset
     email arrives (check Resend dashboard if not).
  3. Open the user menu (top-right) → Change password → verify it works.
  4. Create a product, run an order end-to-end through to payment.
  5. Sign out. Sign in as bhookly_support. Verify you see the full admin UI
     but that bhookly_support does NOT appear in Admin → Staff.

${BOLD}Credentials to store in 1Password:${NC}
  • Bhookly Deployments → ${SLUG} → JWT_SECRET
  • Bhookly Platform Access → bhookly_support@${HOST} (password you just set)
  • Hand the customer admin's credentials to the customer over a secure channel.
EOF
