package main

import (
	"database/sql"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	_ "github.com/lib/pq"
)

func main() {
	var (
		dsn   = flag.String("url", os.Getenv("DATABASE_URL"), "Postgres connection URL (or set DATABASE_URL)")
		file  = flag.String("file", filepath.FromSlash("scripts/init-railway-db.sql"), "SQL file path to apply")
		reset = flag.Bool("reset", true, "Drop+recreate public schema before applying SQL")
	)
	flag.Parse()

	if strings.TrimSpace(*dsn) == "" {
		fatalf("missing -url (or DATABASE_URL)")
	}

	sqlBytes, err := os.ReadFile(*file)
	if err != nil {
		fatalf("read sql file %q: %v", *file, err)
	}
	sqlText := strings.TrimSpace(string(sqlBytes))
	if sqlText == "" {
		fatalf("sql file %q is empty", *file)
	}

	db, err := sql.Open("postgres", *dsn)
	if err != nil {
		fatalf("open db: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		fatalf("ping db: %v", err)
	}

	if *reset {
		resetSQL := strings.TrimSpace(`
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
`)
		if _, err := db.Exec(resetSQL); err != nil {
			fatalf("reset public schema: %v", err)
		}
	}

	if _, err := db.Exec(sqlText); err != nil {
		fatalf("apply sql: %v", err)
	}

	fmt.Println("OK: schema+seed applied successfully")
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "dbseed: "+format+"\n", args...)
	os.Exit(1)
}

