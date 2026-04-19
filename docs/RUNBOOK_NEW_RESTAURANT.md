# Runbook: spinning up a new restaurant on Railway

End-to-end checklist for adding restaurant #N+1 (e.g. a third location after Cova and ChaayeKhana). Should take ~30 minutes if DNS is already set up for `bhookly.com`.

This is the canonical operational document — keep it in sync with reality. The backend's [schema_patches.go](../backend/internal/database/schema_patches.go) handles all DB migrations on boot, so most of the work here is pointing infrastructure at the new project, not running scripts.

## Architecture recap

Each restaurant is a **fully isolated Railway project**: its own backend service, frontend service, and Postgres database. Same Docker images and same `main` branch — what differs is env vars and the database. There is no shared running service.

```
Railway project: bhookly-<slug>
├── frontend service (nginx, custom domain <slug>.bhookly.com)
├── backend service  (Go, internal-only)
└── Postgres plugin  (DATABASE_URL auto-injected)
```

CORS is barely exercised because the React bundle calls same-origin `/api/v1` and the frontend nginx proxies to the backend over Railway's private network.

## Prerequisites

- Access to the `Usamapuri/POS-System` GitHub repo (or wherever the canonical fork lives).
- Access to the Railway workspace that hosts the existing restaurants.
- DNS access for `bhookly.com` (Cloudflare or whatever registrar you use).
- A way to generate a strong random secret: `openssl rand -base64 48`.

## 1. Create the Railway project

1. Railway dashboard → New Project → **Deploy from GitHub repo** → pick `Usamapuri/POS-System`, branch `main`.
2. Name the project `bhookly-<slug>` (e.g. `bhookly-newrestaurant`). The slug should match the subdomain.
3. Add the **Postgres** plugin. Railway will provision a database and inject `DATABASE_URL` into other services in this project.

## 2. Configure the backend service

When Railway creates the backend service from the repo (it'll detect [backend/railway.json](../backend/railway.json) and use the [Dockerfile](../backend/Dockerfile)):

1. **Settings → Source → Root Directory** → `backend`. This is what makes Railway pick up the per-service `railway.json`.
2. **Settings → Variables** — add these (see [backend/.env.example](../backend/.env.example) for full reference):

   | Key | Value | Notes |
   |---|---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Reference variable from the Postgres plugin |
   | `JWT_SECRET` | `<run openssl rand -base64 48>` | **MUST be unique per restaurant.** Re-using lets tokens cross-validate. |
   | `CORS_ORIGINS` | `https://<slug>.bhookly.com` | Comma-separated; add the `*.up.railway.app` fallback if you want |
   | `GIN_MODE` | `release` | Enables fail-fast on missing `JWT_SECRET` |
   | `BUSINESS_TIMEZONE` | `Asia/Karachi` | Or your venue's IANA TZ |

3. Backend service does **not** need a custom domain — it's only reached via the frontend's nginx proxy over Railway's private network.

## 3. Configure the frontend service

1. **Settings → Source → Root Directory** → `frontend`. Picks up [frontend/railway.json](../frontend/railway.json) and the [Dockerfile](../frontend/Dockerfile).
2. **Settings → Variables**:

   | Key | Value | Notes |
   |---|---|---|
   | `BACKEND_URL` | `http://${{<backend-service-name>.RAILWAY_PRIVATE_DOMAIN}}:8080` | **Use the private domain, not the public URL.** Public URL adds latency + egress cost. |

   Replace `<backend-service-name>` with the actual name Railway gave the backend service in this project (e.g. `bhookly-newrestaurant-backend`).
3. **Settings → Networking → Custom Domain** → add `<slug>.bhookly.com`. Railway returns a CNAME target.

## 4. DNS

In your DNS provider (Cloudflare, etc.) for `bhookly.com`:

```
CNAME   <slug>   <railway-cname-target>
```

If using Cloudflare, set proxy status to **DNS only** (gray cloud) initially so Railway can issue the Let's Encrypt cert. You can re-enable proxying after the cert is issued (~2 min).

## 5. First deploy

Railway will deploy automatically once env vars + custom domain are set. Watch the backend's deploy logs — you should see:

```
Successfully connected to database
Empty database detected: applying embedded schema + seed (Railway/bootstrap)…
Embedded schema + seed applied successfully
Applying idempotent schema patches…
Schema patches finished
[GIN-debug] Listening and serving HTTP on :8080
```

If you see `JWT_SECRET must be set when GIN_MODE=release`, you forgot step 2 — go back and set `JWT_SECRET`.

## 6. Smoke tests

After the cert is provisioned (~2 min after DNS propagates):

```bash
# Frontend nginx is up
curl -i https://<slug>.bhookly.com/health
# expect: HTTP/2 200, body "healthy"

# nginx → backend proxy works
curl -i https://<slug>.bhookly.com/api/v1/health
# expect: HTTP/2 200, body {"status":"healthy","message":"POS API is running"}
```

## 7. Initial admin setup

The bootstrap seeds a default admin (see [backend/internal/database/embedded_railway_init.sql](../backend/internal/database/embedded_railway_init.sql) — credentials match the demo accounts).

1. Log in at `https://<slug>.bhookly.com/login` as `admin / admin123`.
2. **Change the admin password immediately** (Admin → Manage Staff → admin → Change Password).
3. **Admin → Settings → General**: set `restaurant_name` to the actual venue name. This drives the in-app subheaders, the PDF report footers, and the CSV export filenames.
4. **Admin → Settings → Receipt & Printing**: set `receipt_business_name`, `receipt_logo_url`, contact details, tax rates, etc.
5. **Admin → Manage Staff**: create real user accounts and disable / change passwords on the demo `server1`, `counter1`, `kitchen1` accounts.

## 8. Verify per-restaurant isolation

1. Go to **Admin → Reports → any tab → Print** — the PDF footer should read `Generated <date> • <your restaurant name>`, NOT "Restaurant POS" or "Cafe Cova".
2. Go to **Admin → Reports → any tab → Export CSV** — the downloaded filename should start with your restaurant's slug (e.g. `newrestaurant_overview_...csv`).
3. From the COVA or ChaayeKhana deployment, try logging in to the new restaurant's URL with the OLD JWT — should fail with 401 (proves `JWT_SECRET` is unique).

## 9. Backups + monitoring

1. **Postgres → Backups tab** — verify daily backups are enabled. On Railway Pro this is one click.
2. Schedule a **monthly restore drill**: restore the latest backup to a throwaway Railway project, hit `/health`, confirm a list endpoint paginates. Untested backups aren't backups.
3. (Optional) Add a Sentry project for the new restaurant. Set `SENTRY_DSN` env vars on backend + frontend.

## 10. Done

The new restaurant is live at `https://<slug>.bhookly.com`. From now on:

- Every push to `main` automatically redeploys both services (per `watchPatterns` in the per-service `railway.json`).
- New SQL migrations under `database/migrations/` trigger a backend redeploy and run idempotently via `ApplySchemaPatches()`.
- No per-restaurant deploy command needed — Railway handles it.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Backend crash loop on first deploy | `JWT_SECRET` not set with `GIN_MODE=release`. Set it. |
| `cert request failed` on the custom domain | DNS hasn't propagated, or Cloudflare proxy is on (turn it off temporarily). |
| API calls return CORS errors | `CORS_ORIGINS` doesn't include the actual frontend origin. Add it. |
| Frontend loads but `/api/v1/*` returns 502 | `BACKEND_URL` is wrong. Use the Railway reference variable, not a hand-typed URL. |
| CSV exports say "Cafe Cova" or PDF footer says "Restaurant POS" | `restaurant_name` not set in Admin → Settings → General. |
| Tokens validate across restaurants | `JWT_SECRET` is shared (or unset → both fall back to the dev placeholder). Generate fresh per restaurant and rotate. |
