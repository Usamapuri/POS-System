// Command: re-seed a remote Postgres (e.g. Railway demo) with database/init/02_seed_data.sql
// after truncating app data via database/init/03_truncate_demo_app_data.sql.
//
// Usage (from repo root):
//
//	DATABASE_URL="postgresql://..." go run -C backend ./cmd/seeddemo
//
// From backend/:
//
//	DATABASE_URL="postgresql://..." go run ./cmd/seeddemo
//
// Flags:
//
//	-repo-root path   repo root containing database/init (default: inferred from cwd)
//	-seed-only        skip truncate; only run 02 (unsafe if rows already exist)
package main

import (
	"database/sql"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	_ "github.com/lib/pq"
)

func main() {
	wd, err := os.Getwd()
	if err != nil {
		log.Fatalf("getwd: %v", err)
	}
	defaultRoot := wd
	if filepath.Base(wd) == "backend" {
		defaultRoot = filepath.Clean(filepath.Join(wd, ".."))
	}

	repoRoot := flag.String("repo-root", defaultRoot, "repository root (contains database/init)")
	dsn := flag.String("database-url", os.Getenv("DATABASE_URL"), "PostgreSQL connection URL")
	seedOnly := flag.Bool("seed-only", false, "only run 02_seed_data.sql (skip truncate)")
	flag.Parse()

	if *dsn == "" {
		log.Fatal("set DATABASE_URL or pass -database-url (must start with postgres:// or postgresql://, never https://)")
	}

	truncatePath := filepath.Join(*repoRoot, "database", "init", "03_truncate_demo_app_data.sql")
	seedPath := filepath.Join(*repoRoot, "database", "init", "02_seed_data.sql")

	db, err := sql.Open("postgres", *dsn)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer db.Close()
	if err := db.Ping(); err != nil {
		log.Fatalf("ping: %v", err)
	}

	if !*seedOnly {
		if err := execSQLFile(db, truncatePath); err != nil {
			log.Fatalf("truncate script: %v", err)
		}
		log.Printf("truncate OK: %s", truncatePath)
	}
	if err := execSQLFile(db, seedPath); err != nil {
		log.Fatalf("seed script: %v", err)
	}
	log.Printf("seed OK: %s", seedPath)
	log.Println("demo users: admin, inventory1, counter1, counter2, kitchen1 — password admin123 (admin manager PIN 1234)")
}

func execSQLFile(db *sql.DB, path string) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	stmts := splitSQLStatements(string(b))
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for i, q := range stmts {
		if _, err := tx.Exec(q); err != nil {
			return fmt.Errorf("statement %d in %s: %w\n---\n%s\n---", i+1, path, err, truncateQuery(q))
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	return nil
}

func truncateQuery(s string) string {
	s = strings.TrimSpace(s)
	if len(s) <= 400 {
		return s
	}
	return s[:400] + "…"
}

// stripLineComments removes `-- …` tails so semicolons inside SQL comments do not split statements.
func stripLineComments(s string) string {
	lines := strings.Split(s, "\n")
	for i, line := range lines {
		if j := strings.Index(line, "--"); j >= 0 {
			lines[i] = line[:j]
		}
	}
	return strings.Join(lines, "\n")
}

// splitSQLStatements splits on semicolons outside single-quoted strings (SQL '' escape not handled).
func splitSQLStatements(s string) []string {
	s = stripLineComments(strings.ReplaceAll(s, "\r\n", "\n"))
	var out []string
	var b strings.Builder
	inQuote := false
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c == '\'' {
			inQuote = !inQuote
			b.WriteByte(c)
			continue
		}
		if c == ';' && !inQuote {
			stmt := strings.TrimSpace(b.String())
			if stmt != "" && !isSQLCommentOnly(stmt) {
				out = append(out, stmt)
			}
			b.Reset()
			continue
		}
		b.WriteByte(c)
	}
	last := strings.TrimSpace(b.String())
	if last != "" && !isSQLCommentOnly(last) {
		out = append(out, last)
	}
	return out
}

func isSQLCommentOnly(stmt string) bool {
	lines := strings.Split(stmt, "\n")
	for _, line := range lines {
		t := strings.TrimSpace(line)
		if t == "" {
			continue
		}
		if !strings.HasPrefix(t, "--") {
			return false
		}
	}
	return true
}
