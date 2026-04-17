package handlers

import (
	_ "embed"
	"strings"
	"testing"
)

//go:embed expenses.go
var expensesGoSource string

// Regression guard: P&L revenue must use completed_at (same basis as daily closing / current day).
// No database required.
func TestExpensesGo_PnLRevenueUsesCompletedAtContract(t *testing.T) {
	t.Helper()
	s := expensesGoSource
	if !strings.Contains(s, "func (h *ExpenseHandler) GetPnLReport") {
		t.Fatal("expected GetPnLReport in expenses.go")
	}
	if !strings.Contains(s, "strings.Replace(truncExpr, \"ts\", \"completed_at\", 1)") {
		t.Fatal("P&L revenue bucket must DATE_TRUNC on completed_at")
	}
	if !strings.Contains(s, "AND completed_at IS NOT NULL") {
		t.Fatal("P&L revenue must exclude rows with null completed_at")
	}
	if !strings.Contains(s, "completed_at::date >= $1::date AND completed_at::date <= $2::date") {
		t.Fatal("P&L revenue date filter must use completed_at::date")
	}
}
