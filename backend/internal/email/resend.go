// Package email sends transactional email through Resend's HTTP API.
//
// Why a hand-rolled client instead of the resend-go SDK?
//   - One endpoint (POST /emails), one call site (password reset). Pulling in
//     another third-party dependency + its transitive tree for a ~30-line HTTP
//     request isn't worth it.
//   - Gives us a clean dev-mode fallback: when RESEND_API_KEY is unset (or
//     equal to the obvious placeholder) we log the email body to stdout
//     instead of trying to send. Local `make dev` works end-to-end without a
//     real Resend account.
//
// Configuration (per-deployment env vars):
//
//	RESEND_API_KEY        Shared bhookly Resend key. Leave unset in dev.
//	EMAIL_FROM            Full From header, e.g. `CK <noreply@bhookly.com>`.
//	TENANT_DISPLAY_NAME   Shown in email subject/body (falls back to "Your restaurant").
//	TENANT_SUPPORT_EMAIL  Optional reply-to + visible support address.
//	APP_URL               Absolute base URL used to build the reset link.
//
// All callers should pass a context.Context with a reasonable deadline; Resend
// returns within 1-2s in practice but we cap network calls at 10s to avoid
// hanging the /auth/forgot-password request on a bad network.
package email

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

const (
	resendEndpoint = "https://api.resend.com/emails"
	httpTimeout    = 10 * time.Second
	// Obvious placeholder that people tend to paste when they don't have a
	// real key yet. Treated the same as empty — dev-mode logging instead of a
	// real send attempt.
	placeholderKey = "your-resend-api-key"
)

// Client is a single-use (or long-lived) transactional email sender. Zero
// value is safe and runs in dev-mode logging.
type Client struct {
	apiKey       string
	fromAddr     string
	tenantName   string
	supportEmail string
	httpClient   *http.Client
}

// NewClientFromEnv reads RESEND_API_KEY, EMAIL_FROM, TENANT_DISPLAY_NAME, and
// TENANT_SUPPORT_EMAIL. Missing RESEND_API_KEY is intentionally NOT a fatal
// error — dev-mode logging keeps the flow testable on a fresh checkout.
func NewClientFromEnv() *Client {
	return &Client{
		apiKey:       strings.TrimSpace(os.Getenv("RESEND_API_KEY")),
		fromAddr:     strings.TrimSpace(os.Getenv("EMAIL_FROM")),
		tenantName:   firstNonEmpty(os.Getenv("TENANT_DISPLAY_NAME"), "Your restaurant"),
		supportEmail: strings.TrimSpace(os.Getenv("TENANT_SUPPORT_EMAIL")),
		httpClient:   &http.Client{Timeout: httpTimeout},
	}
}

// IsLiveSend reports whether SendPasswordReset will attempt a real Resend
// request (true) or fall back to stdout logging (false). Used by health
// checks and the "environment" admin page.
func (c *Client) IsLiveSend() bool {
	if c == nil {
		return false
	}
	return c.apiKey != "" && c.apiKey != placeholderKey && c.fromAddr != ""
}

// SendPasswordReset delivers a password-reset email. resetURL is the fully
// built absolute URL with the one-time token already embedded. The
// plain-text version mirrors the HTML because some inboxes (and every email
// security sandbox) fetch text/plain first.
func (c *Client) SendPasswordReset(ctx context.Context, toEmail, firstName, resetURL string) error {
	if c == nil {
		return fmt.Errorf("email: nil client")
	}
	subject := fmt.Sprintf("Reset your %s password", c.tenantName)
	html := buildResetHTML(c.tenantName, firstName, resetURL, c.supportEmail)
	text := buildResetText(c.tenantName, firstName, resetURL, c.supportEmail)

	// Dev-mode: log and bail. Explicitly NOT returning an error so the
	// /auth/forgot-password handler can finish normally; the operator can
	// grab the reset link from the backend logs.
	if !c.IsLiveSend() {
		log.Printf(
			"EMAIL (dev-mode, no RESEND_API_KEY set)\n  to: %s\n  subject: %s\n  reset URL: %s",
			toEmail, subject, resetURL,
		)
		return nil
	}

	payload := map[string]interface{}{
		"from":    c.fromAddr,
		"to":      []string{toEmail},
		"subject": subject,
		"html":    html,
		"text":    text,
	}
	if c.supportEmail != "" {
		payload["reply_to"] = c.supportEmail
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("email: marshal payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, resendEndpoint, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("email: build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("email: resend request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}
	// Resend returns structured JSON errors; include the raw body to make
	// debugging DNS / domain-not-verified issues obvious.
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	return fmt.Errorf("email: resend returned %d: %s", resp.StatusCode, strings.TrimSpace(string(raw)))
}

// buildResetHTML produces a minimal but branded HTML body. Intentionally
// inline-styled — email clients strip <style> blocks with abandon, and no
// framework (MJML etc.) is justified for a single template.
func buildResetHTML(tenant, firstName, url, support string) string {
	greeting := "Hi"
	if trimmed := strings.TrimSpace(firstName); trimmed != "" {
		greeting = "Hi " + trimmed
	}
	supportLine := ""
	if support != "" {
		supportLine = fmt.Sprintf(
			`<p style="margin:24px 0 0;color:#6b7280;font-size:13px;line-height:1.5;">If you didn't ask to reset your password, you can safely ignore this email — your password won't be changed. Questions? Reply to this email or contact <a href="mailto:%s" style="color:#c2410c;">%s</a>.</p>`,
			support, support,
		)
	} else {
		supportLine = `<p style="margin:24px 0 0;color:#6b7280;font-size:13px;line-height:1.5;">If you didn't ask to reset your password, you can safely ignore this email — your password won't be changed.</p>`
	}
	return fmt.Sprintf(`<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#fdf8f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1410;">
    <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:40px 32px;box-shadow:0 1px 2px rgba(0,0,0,0.04);">
      <tr><td>
        <p style="margin:0 0 8px;color:#c2410c;font-size:12px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;">%s</p>
        <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;font-weight:700;color:#1a1410;">Reset your password</h1>
        <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#374151;">%s — someone (hopefully you) asked to reset the password for your %s account. Click the button below to set a new one. This link is valid for <strong>1 hour</strong>.</p>
        <p style="margin:24px 0;"><a href="%s" style="display:inline-block;padding:12px 24px;background:#c2410c;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600;font-size:15px;">Reset password</a></p>
        <p style="margin:0 0 4px;color:#6b7280;font-size:13px;">Or copy and paste this link into your browser:</p>
        <p style="margin:0;word-break:break-all;"><a href="%s" style="color:#c2410c;font-size:13px;text-decoration:underline;">%s</a></p>
        %s
      </td></tr>
    </table>
  </body>
</html>`, tenant, greeting, tenant, url, url, url, supportLine)
}

func buildResetText(tenant, firstName, url, support string) string {
	greeting := "Hi"
	if trimmed := strings.TrimSpace(firstName); trimmed != "" {
		greeting = "Hi " + trimmed
	}
	var b strings.Builder
	fmt.Fprintf(&b, "%s,\n\n", greeting)
	fmt.Fprintf(&b, "Someone (hopefully you) asked to reset the password for your %s account.\n", tenant)
	fmt.Fprintf(&b, "Open this link in your browser to set a new password (valid for 1 hour):\n\n%s\n\n", url)
	b.WriteString("If you didn't ask for this, you can safely ignore this email — your password won't be changed.\n")
	if support != "" {
		fmt.Fprintf(&b, "\nQuestions? Contact %s.\n", support)
	}
	return b.String()
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if s := strings.TrimSpace(v); s != "" {
			return s
		}
	}
	return ""
}
