package handlers

import (
	"database/sql"
	"net/http"

	"pos-backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// CounterHandler exposes counter-only listing helpers.
type CounterHandler struct {
	db *sql.DB
}

func NewCounterHandler(db *sql.DB) *CounterHandler {
	return &CounterHandler{db: db}
}

type counterServerDTO struct {
	ID        uuid.UUID `json:"id"`
	Username  string    `json:"username"`
	FirstName string    `json:"first_name"`
	LastName  string    `json:"last_name"`
}

// ListServers returns active users with role server (for dine-in assignment).
func (h *CounterHandler) ListServers(c *gin.Context) {
	q := c.Query("q")
	var rows *sql.Rows
	var err error
	if q != "" {
		pattern := "%" + q + "%"
		rows, err = h.db.Query(`
			SELECT id, username, first_name, last_name FROM users
			WHERE role = 'server' AND is_active = true
			  AND (username ILIKE $1 OR first_name ILIKE $1 OR last_name ILIKE $1 OR (first_name || ' ' || last_name) ILIKE $1)
			ORDER BY first_name, last_name
		`, pattern)
	} else {
		rows, err = h.db.Query(`
			SELECT id, username, first_name, last_name FROM users
			WHERE role = 'server' AND is_active = true
			ORDER BY first_name, last_name
		`)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to list servers", Error: strPtr(err.Error())})
		return
	}
	defer rows.Close()

	var list []counterServerDTO
	for rows.Next() {
		var r counterServerDTO
		if err := rows.Scan(&r.ID, &r.Username, &r.FirstName, &r.LastName); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to scan row", Error: strPtr(err.Error())})
			return
		}
		list = append(list, r)
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Data: list})
}
