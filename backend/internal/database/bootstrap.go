package database

import (
	"database/sql"
	_ "embed"
	"fmt"
	"log"
)

// Embedded copy of scripts/init-railway-db.sql — keep in sync when changing the script.
//
//go:embed embedded_railway_init.sql
var embeddedRailwayInitSQL string

// BootstrapIfEmpty applies full schema + seed when the DB has no public.users table yet
// (typical fresh Railway Postgres). Idempotent for already-initialized databases.
func BootstrapIfEmpty(db *sql.DB) error {
	var exists bool
	err := db.QueryRow(`
		SELECT EXISTS (
			SELECT 1 FROM information_schema.tables
			WHERE table_schema = 'public' AND table_name = 'users'
		)`).Scan(&exists)
	if err != nil {
		return fmt.Errorf("bootstrap check: %w", err)
	}
	if exists {
		log.Println("Database already initialized (public.users exists); skipping embedded bootstrap")
		return nil
	}

	log.Println("Empty database detected: applying embedded schema + seed (Railway/bootstrap)…")
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("bootstrap begin: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.Exec(embeddedRailwayInitSQL); err != nil {
		return fmt.Errorf("bootstrap SQL: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("bootstrap commit: %w", err)
	}
	log.Println("Embedded schema + seed applied successfully")
	return nil
}
