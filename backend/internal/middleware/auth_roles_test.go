package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestManagerAccessParityForSettingsAndStations(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	router.Use(func(c *gin.Context) {
		if role := c.GetHeader("X-Role"); role != "" {
			c.Set("role", role)
		}
		c.Next()
	})

	adminStations := router.Group("/admin")
	adminStations.Use(RequireRoles([]string{"admin", "manager", "kitchen"}))
	adminStations.GET("/stations", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"success": true})
	})

	adminManagerWrite := router.Group("/admin")
	adminManagerWrite.Use(RequireRoles([]string{"admin", "manager"}))
	adminManagerWrite.PUT("/settings/:key", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"success": true})
	})

	tests := []struct {
		name       string
		method     string
		path       string
		role       string
		wantStatus int
	}{
		{
			name:       "manager can read stations",
			method:     http.MethodGet,
			path:       "/admin/stations",
			role:       "manager",
			wantStatus: http.StatusOK,
		},
		{
			name:       "manager can update settings",
			method:     http.MethodPut,
			path:       "/admin/settings/tax_rate_cash",
			role:       "manager",
			wantStatus: http.StatusOK,
		},
		{
			name:       "admin can read stations",
			method:     http.MethodGet,
			path:       "/admin/stations",
			role:       "admin",
			wantStatus: http.StatusOK,
		},
		{
			name:       "admin can update settings",
			method:     http.MethodPut,
			path:       "/admin/settings/tax_rate_cash",
			role:       "admin",
			wantStatus: http.StatusOK,
		},
		{
			name:       "kitchen can read stations",
			method:     http.MethodGet,
			path:       "/admin/stations",
			role:       "kitchen",
			wantStatus: http.StatusOK,
		},
		{
			name:       "kitchen cannot update settings",
			method:     http.MethodPut,
			path:       "/admin/settings/tax_rate_cash",
			role:       "kitchen",
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "counter denied stations",
			method:     http.MethodGet,
			path:       "/admin/stations",
			role:       "counter",
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "counter denied settings update",
			method:     http.MethodPut,
			path:       "/admin/settings/tax_rate_cash",
			role:       "counter",
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "missing role denied stations",
			method:     http.MethodGet,
			path:       "/admin/stations",
			role:       "",
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "missing role denied settings update",
			method:     http.MethodPut,
			path:       "/admin/settings/tax_rate_cash",
			role:       "",
			wantStatus: http.StatusForbidden,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.path, nil)
			if tc.role != "" {
				req.Header.Set("X-Role", tc.role)
			}
			res := httptest.NewRecorder()
			router.ServeHTTP(res, req)
			if res.Code != tc.wantStatus {
				t.Fatalf("expected status %d, got %d", tc.wantStatus, res.Code)
			}
		})
	}
}
