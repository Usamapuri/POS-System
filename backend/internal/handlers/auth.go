package handlers

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"pos-backend/internal/email"
	"pos-backend/internal/middleware"
	"pos-backend/internal/models"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

// AuthHandler owns the /auth/* endpoints and the email dependency used by
// ForgotPassword. The email client is safe to construct once at startup —
// NewClientFromEnv reads env vars lazily and returns a valid zero-value in
// dev when RESEND_API_KEY is missing.
type AuthHandler struct {
	db     *sql.DB
	mailer *email.Client
	// rate limiter for ForgotPassword. Process-local is fine at our scale
	// (one backend per deployment, small traffic). Replace with Redis when
	// we go multi-tenant / multi-instance.
	forgotRL *forgotRateLimiter
}

func NewAuthHandler(db *sql.DB) *AuthHandler {
	return &AuthHandler{
		db:       db,
		mailer:   email.NewClientFromEnv(),
		forgotRL: newForgotRateLimiter(),
	}
}

// ─── Tunables ──────────────────────────────────────────────────────────────

const (
	// Reset token lifetime. Short enough that a leaked inbox item expires
	// before most attackers notice; long enough that a real user who
	// checks email on their phone at lunch can still use it.
	resetTokenTTL = 1 * time.Hour

	// Minimum password length for self-service flows. Doesn't retroactively
	// apply to admin-created passwords (see createUser in routes.go) —
	// explicit non-goal.
	minPasswordLen = 8

	// Per-IP-or-email throttle on POST /auth/forgot-password. Picked to be
	// generous enough for a confused user clicking twice, but tight enough
	// that a stolen email list can't be used to spam a restaurant's inbox.
	forgotMaxRequests = 5
	forgotWindow      = 5 * time.Minute
)

// ─── Login (existing + last_login_at) ──────────────────────────────────────

// Login handles user authentication.
func (h *AuthHandler) Login(c *gin.Context) {
	var req models.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "Invalid request body",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	identifier := strings.TrimSpace(req.Username)
	if identifier == "" || req.Password == "" {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "Username or email and password are required",
			Error:   stringPtr("missing_credentials"),
		})
		return
	}

	var user models.User
	// Accept either username or email in the same JSON field (still keyed
	// "username" for API backward compatibility). Email match is
	// case-insensitive; username is case-insensitive too so "Admin" works
	// when the row is stored as "admin". UNIQUE on both columns prevents
	// ambiguous double-matches.
	query := `
		SELECT id, username, email, password_hash, first_name, last_name, role, is_active, created_at, updated_at,
		       profile_image_url
		FROM users 
		WHERE is_active = true
		  AND (LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1))
		LIMIT 1
	`
	var profileURL sql.NullString
	err := h.db.QueryRow(query, identifier).Scan(
		&user.ID, &user.Username, &user.Email, &user.PasswordHash,
		&user.FirstName, &user.LastName, &user.Role, &user.IsActive,
		&user.CreatedAt, &user.UpdatedAt, &profileURL,
	)
	if profileURL.Valid && strings.TrimSpace(profileURL.String) != "" {
		s := strings.TrimSpace(profileURL.String)
		user.ProfileImageURL = &s
	}

	if err == sql.ErrNoRows {
		c.JSON(http.StatusUnauthorized, models.APIResponse{
			Success: false,
			Message: "Invalid username, email, or password",
			Error:   stringPtr("invalid_credentials"),
		})
		return
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Database error",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, models.APIResponse{
			Success: false,
			Message: "Invalid username, email, or password",
			Error:   stringPtr("invalid_credentials"),
		})
		return
	}

	// Stamp last_login_at best-effort. A DB hiccup here shouldn't break
	// login — if we can't write the audit field, we still issue the token.
	if _, err := h.db.Exec(`UPDATE users SET last_login_at = now() WHERE id = $1`, user.ID); err != nil {
		log.Printf("auth: last_login_at update failed for user=%s: %v", user.ID, err)
	}

	token, err := middleware.GenerateToken(&user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to generate token",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Login successful",
		Data: models.LoginResponse{
			Token: token,
			User:  user,
		},
	})
}

// ─── GetCurrentUser (unchanged) ────────────────────────────────────────────

func (h *AuthHandler) GetCurrentUser(c *gin.Context) {
	userID, _, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, models.APIResponse{
			Success: false,
			Message: "Authentication required",
			Error:   stringPtr("auth_required"),
		})
		return
	}

	var user models.User
	query := `
		SELECT id, username, email, first_name, last_name, role, is_active, created_at, updated_at,
		       profile_image_url
		FROM users 
		WHERE id = $1
	`
	var profileURL2 sql.NullString
	err := h.db.QueryRow(query, userID).Scan(
		&user.ID, &user.Username, &user.Email,
		&user.FirstName, &user.LastName, &user.Role, &user.IsActive,
		&user.CreatedAt, &user.UpdatedAt, &profileURL2,
	)
	if profileURL2.Valid && strings.TrimSpace(profileURL2.String) != "" {
		s := strings.TrimSpace(profileURL2.String)
		user.ProfileImageURL = &s
	}

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, models.APIResponse{
			Success: false,
			Message: "User not found",
			Error:   stringPtr("user_not_found"),
		})
		return
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Database error",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "User retrieved successfully",
		Data:    user,
	})
}

// Logout handles user logout. JWTs are stateless so this is largely
// client-side; we keep the endpoint for symmetry and to make it easy to add a
// token blacklist later.
func (h *AuthHandler) Logout(c *gin.Context) {
	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Logout successful",
	})
}

// ─── ForgotPassword ────────────────────────────────────────────────────────

// ForgotPassword starts the password-reset flow.
//
// Design notes:
//   - Always returns HTTP 200 with the same generic message, regardless of
//     whether the email matched a real user. Prevents enumeration of the
//     restaurant's user list from the public login page.
//   - Rate-limited per-IP AND per-email. An attacker iterating through a
//     leaked email list is capped at forgotMaxRequests per window; a single
//     confused user refreshing is also capped but at a different bucket.
//   - Token is 32 bytes of crypto/rand → base64url (43 chars, ~256 bits of
//     entropy). Only sha256(token) is persisted.
//   - Email sending is best-effort after the DB row is committed. If Resend
//     is down or misconfigured, we still return 200 so we don't leak
//     whether the user exists via timing/errors.
func (h *AuthHandler) ForgotPassword(c *gin.Context) {
	var req models.ForgotPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "Invalid request body",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	normalizedEmail := strings.ToLower(strings.TrimSpace(req.Email))
	if normalizedEmail == "" {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "Email is required",
			Error:   stringPtr("missing_email"),
		})
		return
	}

	// Rate limit before touching the DB so we don't give timing signal.
	ip := c.ClientIP()
	if !h.forgotRL.allow("ip:"+ip) || !h.forgotRL.allow("email:"+normalizedEmail) {
		c.JSON(http.StatusTooManyRequests, models.APIResponse{
			Success: false,
			Message: "Too many password reset attempts. Please try again in a few minutes.",
			Error:   stringPtr("rate_limited"),
		})
		return
	}

	// Generic success response sent no matter what happens below (except
	// for rate limiting, which is its own UX signal).
	genericSuccess := models.APIResponse{
		Success: true,
		Message: "If that email is registered, a password reset link has been sent.",
	}

	var (
		userID    string
		firstName string
	)
	err := h.db.QueryRow(
		`SELECT id, first_name FROM users WHERE lower(email) = $1 AND is_active = true LIMIT 1`,
		normalizedEmail,
	).Scan(&userID, &firstName)
	if err == sql.ErrNoRows {
		// Intentionally silent. Still do a small amount of "work" so the
		// response time looks the same as the hit path.
		_ = bcrypt.CompareHashAndPassword([]byte("$2a$10$7EqJtq98hPqEX7fNZaFWoOa5pRBKe/yQAq1xH6z3h/l6kCX3DGz9C"), []byte(normalizedEmail))
		c.JSON(http.StatusOK, genericSuccess)
		return
	}
	if err != nil {
		log.Printf("auth: forgot-password lookup failed: %v", err)
		c.JSON(http.StatusOK, genericSuccess)
		return
	}

	token, err := generateResetToken()
	if err != nil {
		log.Printf("auth: token generation failed: %v", err)
		c.JSON(http.StatusOK, genericSuccess)
		return
	}
	tokenHash := hashResetToken(token)
	expiresAt := time.Now().Add(resetTokenTTL)

	_, err = h.db.Exec(`
		UPDATE users
		   SET password_reset_token_hash   = $1,
		       password_reset_expires_at   = $2,
		       password_reset_requested_at = now()
		 WHERE id = $3
	`, tokenHash, expiresAt, userID)
	if err != nil {
		log.Printf("auth: forgot-password token write failed for user=%s: %v", userID, err)
		c.JSON(http.StatusOK, genericSuccess)
		return
	}

	resetURL := buildResetURL(token)

	// Send in the background so the request can return fast; also avoids
	// an attacker learning "email exists" from a 10s slow response when
	// Resend is slow. Detached context (not tied to the Gin request) so
	// the send can outlive the HTTP response, bounded by its own timeout.
	go func(toEmail, name, url string) {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		if err := h.mailer.SendPasswordReset(ctx, toEmail, name, url); err != nil {
			log.Printf("auth: password-reset email to %s failed: %v", toEmail, err)
		}
	}(normalizedEmail, firstName, resetURL)

	c.JSON(http.StatusOK, genericSuccess)
}

// ─── ResetPassword ─────────────────────────────────────────────────────────

// ResetPassword completes the flow initiated by ForgotPassword.
//
// Security notes:
//   - sha256(token) is compared against the stored hash in constant time.
//   - Expiry is checked in SQL so a stale token can't even be looked up by
//     the wrong hash timing.
//   - On success, the reset fields are cleared (single-use) and
//     password_updated_at is stamped. We do NOT invalidate existing JWTs —
//     known limitation, documented in the plan.
func (h *AuthHandler) ResetPassword(c *gin.Context) {
	var req models.ResetPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "Invalid request body",
			Error:   stringPtr(err.Error()),
		})
		return
	}
	if strings.TrimSpace(req.Token) == "" {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "Reset token is required",
			Error:   stringPtr("missing_token"),
		})
		return
	}
	if len(req.NewPassword) < minPasswordLen {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "Password must be at least 8 characters",
			Error:   stringPtr("weak_password"),
		})
		return
	}

	tokenHash := hashResetToken(req.Token)

	// Pull every still-valid reset row and compare in constant time. In
	// practice the partial index makes this a ~1-row scan, but writing it
	// this way makes the constant-time intent explicit.
	rows, err := h.db.Query(`
		SELECT id, password_reset_token_hash
		  FROM users
		 WHERE password_reset_token_hash   IS NOT NULL
		   AND password_reset_expires_at   > now()
		   AND is_active = true
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Database error",
			Error:   stringPtr(err.Error()),
		})
		return
	}
	defer rows.Close()

	var matchedID string
	for rows.Next() {
		var id, storedHash string
		if err := rows.Scan(&id, &storedHash); err != nil {
			continue
		}
		if subtle.ConstantTimeCompare([]byte(storedHash), []byte(tokenHash)) == 1 {
			matchedID = id
			break
		}
	}
	if matchedID == "" {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "This reset link is invalid or has expired. Please request a new one.",
			Error:   stringPtr("invalid_or_expired_token"),
		})
		return
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to hash password",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	if _, err := h.db.Exec(`
		UPDATE users
		   SET password_hash               = $1,
		       password_updated_at         = now(),
		       password_reset_token_hash   = NULL,
		       password_reset_expires_at   = NULL,
		       password_reset_requested_at = NULL
		 WHERE id = $2
	`, string(hashed), matchedID); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to update password",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Password updated. You can now sign in with your new password.",
	})
}

// ─── ChangePassword ────────────────────────────────────────────────────────

// ChangePassword rotates the caller's own password. Requires a valid JWT
// (mounted under the `protected` route group) AND the current password, to
// defend against session-hijack scenarios.
func (h *AuthHandler) ChangePassword(c *gin.Context) {
	userID, _, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, models.APIResponse{
			Success: false,
			Message: "Authentication required",
			Error:   stringPtr("auth_required"),
		})
		return
	}

	var req models.ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "Invalid request body",
			Error:   stringPtr(err.Error()),
		})
		return
	}
	if req.CurrentPassword == "" {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "Current password is required",
			Error:   stringPtr("missing_current_password"),
		})
		return
	}
	if len(req.NewPassword) < minPasswordLen {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "New password must be at least 8 characters",
			Error:   stringPtr("weak_password"),
		})
		return
	}
	if req.CurrentPassword == req.NewPassword {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "New password must be different from current password",
			Error:   stringPtr("password_unchanged"),
		})
		return
	}

	var currentHash string
	if err := h.db.QueryRow(
		`SELECT password_hash FROM users WHERE id = $1 AND is_active = true`, userID,
	).Scan(&currentHash); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusUnauthorized, models.APIResponse{
				Success: false,
				Message: "User not found or inactive",
				Error:   stringPtr("user_not_found"),
			})
			return
		}
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Database error",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(currentHash), []byte(req.CurrentPassword)); err != nil {
		c.JSON(http.StatusUnauthorized, models.APIResponse{
			Success: false,
			Message: "Current password is incorrect",
			Error:   stringPtr("invalid_current_password"),
		})
		return
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to hash password",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	if _, err := h.db.Exec(`
		UPDATE users
		   SET password_hash       = $1,
		       password_updated_at = now()
		 WHERE id = $2
	`, string(hashed), userID); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to update password",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Password updated successfully.",
	})
}

// ─── Helpers ───────────────────────────────────────────────────────────────

// generateResetToken returns a cryptographically random token encoded as
// base64url (no padding). 32 bytes → 43 URL-safe characters, ~256 bits of
// entropy — well above anything bruteforce-feasible for a 1h TTL.
func generateResetToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

// hashResetToken returns the lowercase-hex sha256 of the raw token. We hash
// the incoming token on both write (ForgotPassword) and read
// (ResetPassword), and the DB only ever sees the hash.
func hashResetToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// buildResetURL assembles the absolute URL that goes into the email. Reads
// APP_URL at call time (not init time) so tests / different deploys can
// override without restarting. Trailing slashes on APP_URL are tolerated.
func buildResetURL(token string) string {
	base := strings.TrimRight(strings.TrimSpace(os.Getenv("APP_URL")), "/")
	if base == "" {
		// Dev fallback — matches vite default. If this ever renders in a
		// production email it's a config bug, and the log line in
		// SendPasswordReset will be the breadcrumb.
		base = "http://localhost:3000"
	}
	return base + "/reset-password?token=" + token
}

// Helper function to create string pointer
func stringPtr(s string) *string {
	return &s
}

// ─── Rate limiter (process-local, token-bucket-ish) ────────────────────────

type forgotRateLimiter struct {
	mu      sync.Mutex
	buckets map[string][]time.Time
}

func newForgotRateLimiter() *forgotRateLimiter {
	return &forgotRateLimiter{buckets: make(map[string][]time.Time)}
}

// allow reports whether the key is under the forgotMaxRequests limit within
// the forgotWindow. Side effect: records the current timestamp on success.
func (r *forgotRateLimiter) allow(key string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-forgotWindow)
	hits := r.buckets[key]
	// Drop stale entries.
	kept := hits[:0]
	for _, t := range hits {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	if len(kept) >= forgotMaxRequests {
		r.buckets[key] = kept
		return false
	}
	r.buckets[key] = append(kept, now)
	return true
}

