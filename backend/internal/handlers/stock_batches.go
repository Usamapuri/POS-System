package handlers

import (
	"fmt"
	"time"

	"database/sql"
)

// ensureBatchesMatchOnHand inserts a synthetic lot when ledger batches sum below on-hand (legacy / drift).
func ensureBatchesMatchOnHand(tx *sql.Tx, itemID string, onHand float64, unitCost *float64) error {
	var sum float64
	if err := tx.QueryRow(
		`SELECT COALESCE(SUM(quantity_remaining), 0) FROM stock_batches WHERE stock_item_id = $1`,
		itemID,
	).Scan(&sum); err != nil {
		return err
	}
	if onHand-sum <= 0.000001 {
		return nil
	}
	diff := onHand - sum
	_, err := tx.Exec(`
		INSERT INTO stock_batches (stock_item_id, quantity_remaining, initial_quantity, unit_cost, expiry_date, stock_movement_id, purchase_order_line_id)
		VALUES ($1, $2, $2, $3, NULL, NULL, NULL)`,
		itemID, diff, unitCost)
	return err
}

func deductBatchesFIFO(tx *sql.Tx, itemID string, qty float64) error {
	if qty <= 0.000001 {
		return nil
	}
	rows, err := tx.Query(`
		SELECT id, quantity_remaining FROM stock_batches
		WHERE stock_item_id = $1 AND quantity_remaining > 0.000001
		ORDER BY expiry_date NULLS LAST, created_at ASC
		FOR UPDATE`,
		itemID)
	if err != nil {
		return err
	}
	type row struct {
		id string
		q  float64
	}
	var batches []row
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.id, &r.q); err != nil {
			rows.Close()
			return err
		}
		batches = append(batches, r)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	remaining := qty
	for _, b := range batches {
		if remaining <= 0.000001 {
			break
		}
		take := b.q
		if take > remaining {
			take = remaining
		}
		if _, err := tx.Exec(`UPDATE stock_batches SET quantity_remaining = quantity_remaining - $1 WHERE id = $2`, take, b.id); err != nil {
			return err
		}
		remaining -= take
	}
	if remaining > 0.000001 {
		return fmt.Errorf("insufficient batch quantity (short by %.4f)", remaining)
	}
	return nil
}

func insertPurchaseBatch(tx *sql.Tx, itemID, movementID string, qty float64, unitCost *float64, expiry *time.Time, poLineID *string) error {
	var exp interface{}
	if expiry != nil {
		exp = expiry.Format("2006-01-02")
	} else {
		exp = nil
	}
	if poLineID != nil && *poLineID != "" {
		_, err := tx.Exec(`
			INSERT INTO stock_batches (stock_item_id, quantity_remaining, initial_quantity, unit_cost, expiry_date, stock_movement_id, purchase_order_line_id)
			VALUES ($1, $2, $2, $3, $4, $5, $6::uuid)`,
			itemID, qty, unitCost, exp, movementID, *poLineID)
		return err
	}
	_, err := tx.Exec(`
		INSERT INTO stock_batches (stock_item_id, quantity_remaining, initial_quantity, unit_cost, expiry_date, stock_movement_id, purchase_order_line_id)
		VALUES ($1, $2, $2, $3, $4, $5, NULL)`,
		itemID, qty, unitCost, exp, movementID)
	return err
}

func insertOpeningBatch(db *sql.DB, itemID string, qty float64, unitCost *float64) error {
	if qty <= 0.000001 {
		return nil
	}
	_, err := db.Exec(`
		INSERT INTO stock_batches (stock_item_id, quantity_remaining, initial_quantity, unit_cost, expiry_date, stock_movement_id, purchase_order_line_id)
		VALUES ($1, $2, $2, $3, NULL, NULL, NULL)`,
		itemID, qty, unitCost)
	return err
}
