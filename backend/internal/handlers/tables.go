package handlers

import (
	"database/sql"
	"fmt"
	"net/http"

	"pos-backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type TableHandler struct {
	db *sql.DB
}

func NewTableHandler(db *sql.DB) *TableHandler {
	return &TableHandler{db: db}
}

// GetTables retrieves all dining tables
func (h *TableHandler) GetTables(c *gin.Context) {
	location := c.Query("location")
	occupiedOnly := c.Query("occupied_only") == "true"
	availableOnly := c.Query("available_only") == "true"

	queryBuilder := `
		SELECT t.id, t.table_number, t.seating_capacity, t.location, t.zone, t.is_occupied,
		       t.map_x, t.map_y, t.map_w, t.map_h, t.map_rotation, t.shape,
		       t.created_at, t.updated_at,
		       o.id as order_id, o.order_number, o.customer_name, o.status as order_status,
		       o.created_at as order_created_at, o.total_amount, o.guest_count,
		       CASE WHEN o.id IS NOT NULL THEN true ELSE false END as has_active_order,
		       u.id as server_id, u.first_name as server_first_name, u.last_name as server_last_name, u.role as server_role,
		       lb.last_booked_at
		FROM dining_tables t
		LEFT JOIN LATERAL (
			SELECT id, order_number, customer_name, status, created_at, total_amount, guest_count, user_id
			FROM orders
			WHERE table_id = t.id AND status NOT IN ('completed', 'cancelled')
			ORDER BY created_at DESC
			LIMIT 1
		) o ON true
		LEFT JOIN users u ON o.user_id = u.id
		LEFT JOIN LATERAL (
			SELECT MAX(created_at) AS last_booked_at
			FROM orders
			WHERE table_id = t.id AND status <> 'cancelled'
		) lb ON true
		WHERE 1=1
	`

	var args []interface{}
	argIndex := 0

	if location != "" {
		argIndex++
		queryBuilder += fmt.Sprintf(` AND t.location ILIKE $%d`, argIndex)
		args = append(args, "%"+location+"%")
	}

	if occupiedOnly {
		queryBuilder += ` AND t.is_occupied = true`
	} else if availableOnly {
		queryBuilder += ` AND t.is_occupied = false`
	}

	queryBuilder += ` ORDER BY t.table_number ASC`

	rows, err := h.db.Query(queryBuilder, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to fetch tables",
			Error:   stringPtr(err.Error()),
		})
		return
	}
	defer rows.Close()

	var tables []map[string]interface{}
	for rows.Next() {
		var table models.DiningTable
		var orderID, orderNumber, customerName, orderStatus sql.NullString
		var orderCreatedAt sql.NullTime
		var totalAmount sql.NullFloat64
		var guestCount sql.NullInt32
		var hasActiveOrder bool
		var serverID, serverFirstName, serverLastName, serverRole sql.NullString
		var lastBookedAt sql.NullTime

		err := rows.Scan(
			&table.ID, &table.TableNumber, &table.SeatingCapacity, &table.Location, &table.Zone, &table.IsOccupied,
			&table.MapX, &table.MapY, &table.MapW, &table.MapH, &table.MapRotation, &table.Shape,
			&table.CreatedAt, &table.UpdatedAt,
			&orderID, &orderNumber, &customerName, &orderStatus, &orderCreatedAt, &totalAmount, &guestCount, &hasActiveOrder,
			&serverID, &serverFirstName, &serverLastName, &serverRole,
			&lastBookedAt,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{
				Success: false,
				Message: "Failed to scan table",
				Error:   stringPtr(err.Error()),
			})
			return
		}

		tableData := map[string]interface{}{
			"id":               table.ID,
			"table_number":     table.TableNumber,
			"seating_capacity": table.SeatingCapacity,
			"location":         table.Location,
			"zone":             table.Zone,
			"is_occupied":      table.IsOccupied,
			"has_active_order": hasActiveOrder,
			"map_x":            table.MapX,
			"map_y":            table.MapY,
			"map_w":            table.MapW,
			"map_h":            table.MapH,
			"map_rotation":     table.MapRotation,
			"shape":            table.Shape,
			"created_at":       table.CreatedAt,
			"updated_at":       table.UpdatedAt,
			"current_order":    nil,
		}
		if lastBookedAt.Valid {
			tableData["last_booked_at"] = lastBookedAt.Time
		} else {
			tableData["last_booked_at"] = nil
		}

		if orderID.Valid {
			orderData := map[string]interface{}{
				"id":            orderID.String,
				"order_number":  orderNumber.String,
				"customer_name": customerName.String,
				"status":        orderStatus.String,
				"created_at":    orderCreatedAt.Time,
				"total_amount":  totalAmount.Float64,
				"guest_count":   int(guestCount.Int32),
			}
			if serverID.Valid {
				orderData["server"] = map[string]interface{}{
					"id":         serverID.String,
					"first_name": serverFirstName.String,
					"last_name":  serverLastName.String,
					"role":       serverRole.String,
				}
			}
			tableData["current_order"] = orderData
		}

		tables = append(tables, tableData)
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Tables retrieved successfully",
		Data:    tables,
	})
}

// GetTable retrieves a specific table by ID
func (h *TableHandler) GetTable(c *gin.Context) {
	tableID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "Invalid table ID",
			Error:   stringPtr("invalid_uuid"),
		})
		return
	}

	var table models.DiningTable

	query := `
		SELECT t.id, t.table_number, t.seating_capacity, t.location, t.zone, t.is_occupied,
		       t.map_x, t.map_y, t.map_w, t.map_h, t.map_rotation, t.shape,
		       t.created_at, t.updated_at,
		       lb.last_booked_at
		FROM dining_tables t
		LEFT JOIN LATERAL (
			SELECT MAX(created_at) AS last_booked_at
			FROM orders
			WHERE table_id = t.id AND status <> 'cancelled'
		) lb ON true
		WHERE t.id = $1
	`

	var lastBookedAt sql.NullTime
	err = h.db.QueryRow(query, tableID).Scan(
		&table.ID, &table.TableNumber, &table.SeatingCapacity, &table.Location, &table.Zone,
		&table.IsOccupied, &table.MapX, &table.MapY, &table.MapW, &table.MapH, &table.MapRotation, &table.Shape,
		&table.CreatedAt, &table.UpdatedAt,
		&lastBookedAt,
	)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, models.APIResponse{
			Success: false,
			Message: "Table not found",
			Error:   stringPtr("table_not_found"),
		})
		return
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to fetch table",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	// Get current active order for this table
	var currentOrder *models.Order
	orderQuery := `
		SELECT o.id, o.order_number, o.customer_name, o.order_type, o.status, 
		       o.subtotal, o.tax_amount, o.total_amount, o.created_at, o.updated_at
		FROM orders o
		WHERE o.table_id = $1 AND o.status NOT IN ('completed', 'cancelled')
		ORDER BY o.created_at DESC
		LIMIT 1
	`

	var order models.Order
	err = h.db.QueryRow(orderQuery, tableID).Scan(
		&order.ID, &order.OrderNumber, &order.CustomerName, &order.OrderType, &order.Status,
		&order.Subtotal, &order.TaxAmount, &order.TotalAmount, &order.CreatedAt, &order.UpdatedAt,
	)

	if err == nil {
		currentOrder = &order
	} else if err != sql.ErrNoRows {
		// Log error but don't fail the request
		// fmt.Printf("Warning: Failed to fetch current order for table: %v\n", err)
	}

	// Create response with current order info
	response := map[string]interface{}{
		"id":               table.ID,
		"table_number":     table.TableNumber,
		"seating_capacity": table.SeatingCapacity,
		"location":         table.Location,
		"zone":             table.Zone,
		"is_occupied":      table.IsOccupied,
		"has_active_order": currentOrder != nil,
		"map_x":            table.MapX,
		"map_y":            table.MapY,
		"map_w":            table.MapW,
		"map_h":            table.MapH,
		"map_rotation":     table.MapRotation,
		"shape":            table.Shape,
		"created_at":       table.CreatedAt,
		"updated_at":       table.UpdatedAt,
		"current_order":    currentOrder,
	}
	if lastBookedAt.Valid {
		response["last_booked_at"] = lastBookedAt.Time
	} else {
		response["last_booked_at"] = nil
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Table retrieved successfully",
		Data:    response,
	})
}

// GetTablesByLocation retrieves tables grouped by location
func (h *TableHandler) GetTablesByLocation(c *gin.Context) {
	query := `
		SELECT t.id, t.table_number, t.seating_capacity, t.location, t.zone, t.is_occupied,
		       t.map_x, t.map_y, t.map_w, t.map_h, t.map_rotation, t.shape,
		       t.created_at, t.updated_at,
		       o.id as order_id, o.order_number, o.customer_name, o.status as order_status,
		       lb.last_booked_at
		FROM dining_tables t
		LEFT JOIN LATERAL (
			SELECT id, order_number, customer_name, status
			FROM orders
			WHERE table_id = t.id AND status NOT IN ('completed', 'cancelled')
			ORDER BY created_at DESC
			LIMIT 1
		) o ON true
		LEFT JOIN LATERAL (
			SELECT MAX(created_at) AS last_booked_at
			FROM orders
			WHERE table_id = t.id AND status <> 'cancelled'
		) lb ON true
		ORDER BY t.location ASC, t.table_number ASC
	`

	rows, err := h.db.Query(query)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to fetch tables",
			Error:   stringPtr(err.Error()),
		})
		return
	}
	defer rows.Close()

	// Group tables by location
	locationMap := make(map[string][]models.DiningTable)

	for rows.Next() {
		var table models.DiningTable
		var orderID, orderNumber, customerName, orderStatus sql.NullString
		var location sql.NullString
		var lastBookedAt sql.NullTime

		err := rows.Scan(
			&table.ID, &table.TableNumber, &table.SeatingCapacity, &location, &table.Zone, &table.IsOccupied,
			&table.MapX, &table.MapY, &table.MapW, &table.MapH, &table.MapRotation, &table.Shape,
			&table.CreatedAt, &table.UpdatedAt,
			&orderID, &orderNumber, &customerName, &orderStatus,
			&lastBookedAt,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{
				Success: false,
				Message: "Failed to scan table",
				Error:   stringPtr(err.Error()),
			})
			return
		}

		// Set location
		if location.Valid {
			table.Location = &location.String
		} else {
			defaultLocation := "General"
			table.Location = &defaultLocation
		}
		table.HasActiveOrder = orderID.Valid
		if lastBookedAt.Valid {
			t := lastBookedAt.Time
			table.LastBookedAt = &t
		}

		locationKey := *table.Location
		locationMap[locationKey] = append(locationMap[locationKey], table)
	}

	// Convert map to structured response
	var locations []map[string]interface{}
	for locationName, tables := range locationMap {
		locations = append(locations, map[string]interface{}{
			"location": locationName,
			"tables":   tables,
		})
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Tables grouped by location retrieved successfully",
		Data:    locations,
	})
}

// GetTableStatus retrieves the status overview of all tables
func (h *TableHandler) GetTableStatus(c *gin.Context) {
	query := `
		SELECT 
		    COUNT(*) as total_tables,
		    COUNT(CASE WHEN is_occupied = true THEN 1 END) as occupied_tables,
		    COUNT(CASE WHEN is_occupied = false THEN 1 END) as available_tables,
		    COALESCE(location, 'General') as location
		FROM dining_tables
		GROUP BY COALESCE(location, 'General')
		ORDER BY location
	`

	rows, err := h.db.Query(query)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to fetch table status",
			Error:   stringPtr(err.Error()),
		})
		return
	}
	defer rows.Close()

	var locationStats []map[string]interface{}
	var totalTables, totalOccupied, totalAvailable int

	for rows.Next() {
		var total, occupied, available int
		var location string

		err := rows.Scan(&total, &occupied, &available, &location)
		if err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{
				Success: false,
				Message: "Failed to scan table status",
				Error:   stringPtr(err.Error()),
			})
			return
		}

		locationStats = append(locationStats, map[string]interface{}{
			"location":         location,
			"total_tables":     total,
			"occupied_tables":  occupied,
			"available_tables": available,
			"occupancy_rate":   float64(occupied) / float64(total) * 100,
		})

		totalTables += total
		totalOccupied += occupied
		totalAvailable += available
	}

	response := map[string]interface{}{
		"total_tables":     totalTables,
		"occupied_tables":  totalOccupied,
		"available_tables": totalAvailable,
		"occupancy_rate":   float64(totalOccupied) / float64(totalTables) * 100,
		"by_location":      locationStats,
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Table status retrieved successfully",
		Data:    response,
	})
}

