package middleware

import (
	"database/sql"
	"net/http"

	"pos-backend/internal/config"
	"pos-backend/internal/models"

	"github.com/gin-gonic/gin"
)

// RequireKDSEnabled returns a middleware that short-circuits requests to
// kitchen screens when the venue has disabled the KDS (Kitchen Mode = kot_only).
// The frontend uses the `kitchen_display_disabled` error code to render a
// friendly "Kitchen display is disabled for this venue" screen.
func RequireKDSEnabled(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		s := config.LoadKitchen(db)
		if !s.IsKDSEnabled() {
			c.AbortWithStatusJSON(http.StatusForbidden, models.APIResponse{
				Success: false,
				Message: "Kitchen Display is disabled for this venue. Admin → Settings → Kitchen to re-enable.",
				Error:   stringPtr("kitchen_display_disabled"),
			})
			return
		}
		c.Next()
	}
}
