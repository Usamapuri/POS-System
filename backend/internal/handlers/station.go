package handlers

import (
	"database/sql"
	"fmt"
	"net/http"
	"strings"
	"time"

	"pos-backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type StationHandler struct {
	db *sql.DB
}

func NewStationHandler(db *sql.DB) *StationHandler {
	return &StationHandler{db: db}
}

func (h *StationHandler) GetStations(c *gin.Context) {
	rows, err := h.db.Query(`SELECT id, name, output_type, COALESCE(NULLIF(TRIM(print_location), ''), 'kitchen'), is_active, sort_order, created_at FROM kitchen_stations ORDER BY sort_order ASC`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to fetch stations", Error: strPtr(err.Error())})
		return
	}
	defer rows.Close()

	var stations []models.KitchenStation
	for rows.Next() {
		var s models.KitchenStation
		rows.Scan(&s.ID, &s.Name, &s.OutputType, &s.PrintLocation, &s.IsActive, &s.SortOrder, &s.CreatedAt)

		catRows, _ := h.db.Query(`SELECT category_id FROM category_station_map WHERE station_id = $1`, s.ID)
		if catRows != nil {
			for catRows.Next() {
				var cid uuid.UUID
				catRows.Scan(&cid)
				s.Categories = append(s.Categories, cid)
			}
			catRows.Close()
		}
		stations = append(stations, s)
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Stations retrieved", Data: stations})
}

func (h *StationHandler) CreateStation(c *gin.Context) {
	var req struct {
		Name           string `json:"name" binding:"required"`
		OutputType     string `json:"output_type" binding:"required"`
		PrintLocation  string `json:"print_location"`
		SortOrder      int    `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid request", Error: strPtr(err.Error())})
		return
	}
	if req.OutputType != "kds" && req.OutputType != "printer" {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "output_type must be 'kds' or 'printer'"})
		return
	}
	pl := req.PrintLocation
	if pl != "counter" {
		pl = "kitchen"
	}
	if req.OutputType == "kds" {
		pl = "kitchen"
	}

	var s models.KitchenStation
	err := h.db.QueryRow(`INSERT INTO kitchen_stations (name, output_type, print_location, sort_order) VALUES ($1, $2, $3, $4) RETURNING id, name, output_type, COALESCE(NULLIF(TRIM(print_location), ''), 'kitchen'), is_active, sort_order, created_at`,
		req.Name, req.OutputType, pl, req.SortOrder).Scan(&s.ID, &s.Name, &s.OutputType, &s.PrintLocation, &s.IsActive, &s.SortOrder, &s.CreatedAt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to create station", Error: strPtr(err.Error())})
		return
	}
	c.JSON(http.StatusCreated, models.APIResponse{Success: true, Message: "Station created", Data: s})
}

func (h *StationHandler) UpdateStation(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Name           *string `json:"name"`
		OutputType     *string `json:"output_type"`
		PrintLocation  *string `json:"print_location"`
		IsActive       *bool   `json:"is_active"`
		SortOrder      *int    `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid request", Error: strPtr(err.Error())})
		return
	}

	if req.OutputType != nil && *req.OutputType != "kds" && *req.OutputType != "printer" {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "output_type must be 'kds' or 'printer'"})
		return
	}

	if req.Name != nil {
		if _, err := h.db.Exec(`UPDATE kitchen_stations SET name = $1 WHERE id = $2`, *req.Name, id); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to update name", Error: strPtr(err.Error())})
			return
		}
	}
	if req.OutputType != nil {
		// When flipping to KDS, force print_location back to 'kitchen' so we never
		// surface a misleading "Print at counter" badge on a screen-only station.
		if _, err := h.db.Exec(`UPDATE kitchen_stations SET output_type = $1, print_location = CASE WHEN $1 = 'kds' THEN 'kitchen' ELSE print_location END WHERE id = $2`, *req.OutputType, id); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to update output_type", Error: strPtr(err.Error())})
			return
		}
	}
	if req.PrintLocation != nil {
		pl := *req.PrintLocation
		if pl != "counter" {
			pl = "kitchen"
		}
		if _, err := h.db.Exec(`UPDATE kitchen_stations SET print_location = $1 WHERE id = $2`, pl, id); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to update print_location", Error: strPtr(err.Error())})
			return
		}
	}
	if req.IsActive != nil {
		if _, err := h.db.Exec(`UPDATE kitchen_stations SET is_active = $1 WHERE id = $2`, *req.IsActive, id); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to update is_active", Error: strPtr(err.Error())})
			return
		}
	}
	if req.SortOrder != nil {
		if _, err := h.db.Exec(`UPDATE kitchen_stations SET sort_order = $1 WHERE id = $2`, *req.SortOrder, id); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to update sort_order", Error: strPtr(err.Error())})
			return
		}
	}

	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Station updated"})
}

func (h *StationHandler) DeleteStation(c *gin.Context) {
	id := c.Param("id")
	_, err := h.db.Exec(`DELETE FROM kitchen_stations WHERE id = $1`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to delete station", Error: strPtr(err.Error())})
		return
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Station deleted"})
}

func (h *StationHandler) SetStationCategories(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		CategoryIDs []string `json:"category_ids"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid request", Error: strPtr(err.Error())})
		return
	}

	tx, err := h.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to start transaction", Error: strPtr(err.Error())})
		return
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`DELETE FROM category_station_map WHERE station_id = $1`, id); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to clear station categories", Error: strPtr(err.Error())})
		return
	}
	// One category → one station: remove each category from any other station before assigning here
	for _, cid := range req.CategoryIDs {
		if cid == "" {
			continue
		}
		if _, err := tx.Exec(`DELETE FROM category_station_map WHERE category_id = $1`, cid); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to reassign category", Error: strPtr(err.Error())})
			return
		}
		if _, err := tx.Exec(`INSERT INTO category_station_map (category_id, station_id) VALUES ($1, $2)`, cid, id); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to map category", Error: strPtr(err.Error())})
			return
		}
	}
	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to commit", Error: strPtr(err.Error())})
		return
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Category mappings updated"})
}

// SetCategoryKitchenStation assigns a menu category to exactly one kitchen station (or clears).
func (h *StationHandler) SetCategoryKitchenStation(c *gin.Context) {
	categoryID := c.Param("id")
	var req struct {
		StationID *string `json:"station_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid request", Error: strPtr(err.Error())})
		return
	}

	tx, err := h.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to start transaction", Error: strPtr(err.Error())})
		return
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`DELETE FROM category_station_map WHERE category_id = $1`, categoryID); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to clear mapping", Error: strPtr(err.Error())})
		return
	}

	if req.StationID != nil && *req.StationID != "" {
		var active bool
		err := tx.QueryRow(`SELECT is_active FROM kitchen_stations WHERE id = $1`, *req.StationID).Scan(&active)
		if err != nil {
			c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Kitchen station not found", Error: strPtr("invalid_station")})
			return
		}
		if !active {
			c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Kitchen station is inactive"})
			return
		}
		if _, err := tx.Exec(`INSERT INTO category_station_map (category_id, station_id) VALUES ($1, $2)`, categoryID, *req.StationID); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to assign station", Error: strPtr(err.Error())})
			return
		}
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to commit", Error: strPtr(err.Error())})
		return
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Category station updated"})
}

// TestKOT renders a small canned KOT for the given station so admins can
// confirm their physical printer / KDS is actually wired up. The shape of
// the response intentionally matches the `kots[]` entries returned by
// FireKOT so the frontend can reuse `printKotReceipts` and `KotPrintModal`
// without any branching.
func (h *StationHandler) TestKOT(c *gin.Context) {
	id := c.Param("id")
	var (
		stationID                                      uuid.UUID
		name, outputType, printLocation                string
		isActive                                       bool
	)
	err := h.db.QueryRow(`
		SELECT id, name, output_type, COALESCE(NULLIF(TRIM(print_location), ''), 'kitchen'), is_active
		FROM kitchen_stations WHERE id = $1`, id,
	).Scan(&stationID, &name, &outputType, &printLocation, &isActive)
	if err != nil {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Station not found"})
		return
	}
	if !isActive {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Station is inactive — activate it before sending a test KOT"})
		return
	}
	if outputType == "kds" {
		printLocation = "kitchen"
	}

	now := time.Now()
	type testItem struct {
		Quantity            int
		ProductName         string
		SpecialInstructions *string
	}
	specialNote := "Sent via Admin → Kitchen Stations"
	items := []testItem{
		{Quantity: 1, ProductName: "TEST ITEM — please ignore", SpecialInstructions: &specialNote},
	}

	var payload interface{}
	if outputType == "printer" {
		var b strings.Builder
		b.WriteString("================================\n")
		b.WriteString("       *** TEST KOT ***\n")
		b.WriteString("================================\n")
		b.WriteString(fmt.Sprintf("Station:  %s\n", name))
		b.WriteString("Order:    TEST\n")
		b.WriteString("Table:    —\n")
		b.WriteString(fmt.Sprintf("Fired:    %s\n", now.Format("15:04:05")))
		b.WriteString("--------------------------------\n")
		for _, it := range items {
			b.WriteString(fmt.Sprintf("  %dx  %s\n", it.Quantity, it.ProductName))
			if it.SpecialInstructions != nil && *it.SpecialInstructions != "" {
				b.WriteString(fmt.Sprintf("       >> %s\n", *it.SpecialInstructions))
			}
		}
		b.WriteString("================================\n")
		b.WriteString("    NOT A REAL ORDER — DISCARD\n")
		b.WriteString("================================\n")
		payload = b.String()
	} else {
		payload = map[string]interface{}{
			"station_id":   stationID,
			"station_name": name,
			"order_number": "TEST",
			"table_number": "—",
			"items": []map[string]interface{}{
				{
					"product_name":         items[0].ProductName,
					"quantity":             items[0].Quantity,
					"special_instructions": items[0].SpecialInstructions,
				},
			},
			"fired_at": now,
			"is_test":  true,
		}
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Test KOT generated",
		Data: map[string]interface{}{
			"kots": []map[string]interface{}{
				{
					"station_id":     stationID,
					"station_name":   name,
					"output_type":    outputType,
					"print_location": printLocation,
					"payload":        payload,
				},
			},
		},
	})
}

func (h *StationHandler) GetStationCategories(c *gin.Context) {
	id := c.Param("id")
	rows, err := h.db.Query(`SELECT category_id FROM category_station_map WHERE station_id = $1`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to fetch mappings", Error: strPtr(err.Error())})
		return
	}
	defer rows.Close()

	var ids []uuid.UUID
	for rows.Next() {
		var cid uuid.UUID
		rows.Scan(&cid)
		ids = append(ids, cid)
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Category mappings retrieved", Data: ids})
}
