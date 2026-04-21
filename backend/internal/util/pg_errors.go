package util

import (
	"errors"
	"strings"

	"github.com/lib/pq"
)

// DuplicateTableNumberMessage is returned to clients when table_number collides with UNIQUE.
const DuplicateTableNumberMessage = "Table names must be unique. Another table already uses this name — choose a different name."

// IsDuplicateDiningTableNumber reports whether err is a PostgreSQL unique violation on dining_tables.table_number.
func IsDuplicateDiningTableNumber(err error) bool {
	if err == nil {
		return false
	}
	var pqErr *pq.Error
	if errors.As(err, &pqErr) {
		if pqErr.Code == "23505" &&
			(pqErr.Constraint == "dining_tables_table_number_key" ||
				strings.Contains(pqErr.Message, "dining_tables_table_number_key")) {
			return true
		}
	}
	return strings.Contains(err.Error(), "dining_tables_table_number_key")
}
