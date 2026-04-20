-- Adds self-service password management + bhookly platform-admin support.
--
-- Columns:
--   password_reset_token_hash      sha256 hex of the one-time reset token; NULL
--                                  when no reset is pending. We never store
--                                  the raw token — a DB leak alone cannot be
--                                  used to reset anyone's password.
--   password_reset_expires_at      1-hour wall-clock expiry for the token.
--   password_reset_requested_at    Most recent forgot-password timestamp; used
--                                  for per-user rate limiting so one email
--                                  can't be flooded with resets.
--   last_login_at                  Updated on successful Login; surfaced in
--                                  the admin Users table so owners can see
--                                  stale accounts.
--   password_updated_at            Stamped whenever password_hash changes
--                                  (reset / change / admin-update).
--   is_platform_admin              TRUE for the single `bhookly_support`
--                                  account we seed on each deployment. This
--                                  row is hidden from the customer's admin
--                                  Users page and protected from
--                                  update/delete by non-platform users. See
--                                  backend/internal/api/routes.go
--                                  (getAdminUsers, updateUser, deleteUser).
--
-- MIRROR: Every change in this file must also appear as idempotent DDL in
--   backend/internal/database/schema_patches.go — production runs the Go
--   patches on every boot; this .sql file is the human-readable history.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS password_reset_token_hash    TEXT,
    ADD COLUMN IF NOT EXISTS password_reset_expires_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS password_reset_requested_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_login_at                TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS password_updated_at          TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS is_platform_admin            BOOLEAN NOT NULL DEFAULT false;

-- Partial index: lookups are always by hash + NOT NULL. Skipping NULL rows
-- keeps the index small (one row per pending reset) instead of row-per-user.
CREATE INDEX IF NOT EXISTS idx_users_password_reset_token_hash
    ON users(password_reset_token_hash)
    WHERE password_reset_token_hash IS NOT NULL;
