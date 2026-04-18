// Package util holds small, dependency-free helpers used across handlers.
package util

import (
	"fmt"
	"os"
	"sync"
	"time"
)

// ────────────────────────────────────────────────────────────────────────────
// Business timezone resolution
//
// Single source of truth for "what calendar day are we in?" Honors the
// BUSINESS_TIMEZONE env var (already used by orders.go for KOT numbering),
// falls back to Asia/Karachi (the deployment default), and finally to a
// fixed UTC+5 zone so containers without /usr/share/zoneinfo still work.
// ────────────────────────────────────────────────────────────────────────────

const defaultBusinessTimezone = "Asia/Karachi"

var (
	businessLocOnce sync.Once
	businessLoc     *time.Location
	businessTzName  string
)

// BusinessLocation returns the *time.Location for the business timezone.
// Cached after first call.
func BusinessLocation() *time.Location {
	businessLocOnce.Do(func() {
		name := os.Getenv("BUSINESS_TIMEZONE")
		if name == "" {
			name = defaultBusinessTimezone
		}
		if loc, err := time.LoadLocation(name); err == nil {
			businessLoc = loc
			businessTzName = name
			return
		}
		// tzdata missing — fall back to a fixed UTC+5 zone so labels stay correct.
		businessLoc = time.FixedZone("PKT", 5*60*60)
		businessTzName = "Asia/Karachi"
	})
	return businessLoc
}

// BusinessTimezoneName returns the canonical IANA name being used.
func BusinessTimezoneName() string {
	BusinessLocation()
	return businessTzName
}

// BusinessNow returns time.Now() expressed in the business timezone.
func BusinessNow() time.Time {
	return time.Now().In(BusinessLocation())
}

// BusinessDate returns the calendar date (00:00 local) for t in the business
// timezone. Use this whenever you need to compare against (created_at AT TIME
// ZONE $tz)::date in SQL.
func BusinessDate(t time.Time) time.Time {
	local := t.In(BusinessLocation())
	return time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, BusinessLocation())
}

// ────────────────────────────────────────────────────────────────────────────
// Period parsing
// ────────────────────────────────────────────────────────────────────────────

// PeriodWindow represents a date range in the business timezone, plus a
// matching "previous" range of equal length for KPI deltas.
type PeriodWindow struct {
	Period       string    // canonical id: today | yesterday | 7d | 30d | cw | cm | custom
	From         time.Time // local-midnight
	To           time.Time // local-midnight (inclusive day)
	PreviousFrom time.Time
	PreviousTo   time.Time
	// Granularity is a hint for time-series bucketing, not an enforcement.
	//   "hour"  for today / yesterday
	//   "day"   for 7d / 30d / cw / cm and short custom windows
	//   "month" for ranges > ~93 days
	Granularity string
}

// DaysInclusive returns the number of calendar days in [From, To].
func (p PeriodWindow) DaysInclusive() int {
	return int(p.To.Sub(p.From).Hours()/24) + 1
}

// FromISO returns From in YYYY-MM-DD form.
func (p PeriodWindow) FromISO() string { return p.From.Format("2006-01-02") }

// ToISO returns To in YYYY-MM-DD form.
func (p PeriodWindow) ToISO() string { return p.To.Format("2006-01-02") }

// PreviousFromISO returns PreviousFrom in YYYY-MM-DD form.
func (p PeriodWindow) PreviousFromISO() string { return p.PreviousFrom.Format("2006-01-02") }

// PreviousToISO returns PreviousTo in YYYY-MM-DD form.
func (p PeriodWindow) PreviousToISO() string { return p.PreviousTo.Format("2006-01-02") }

// FromLabel returns From in DD-MM-YYYY form (UI-ready).
func (p PeriodWindow) FromLabel() string { return p.From.Format("02-01-2006") }

// ToLabel returns To in DD-MM-YYYY form (UI-ready).
func (p PeriodWindow) ToLabel() string { return p.To.Format("02-01-2006") }

// PreviousFromLabel returns PreviousFrom in DD-MM-YYYY form.
func (p PeriodWindow) PreviousFromLabel() string { return p.PreviousFrom.Format("02-01-2006") }

// PreviousToLabel returns PreviousTo in DD-MM-YYYY form.
func (p PeriodWindow) PreviousToLabel() string { return p.PreviousTo.Format("02-01-2006") }

// ParseDashboardPeriod resolves a period id (and optional from/to override)
// to a concrete window in the business timezone.
//
// Supported ids:
//   - today        → today only; comparison = yesterday
//   - yesterday    → yesterday only; comparison = the day before
//   - 7d           → rolling last 7 days, ending today; comparison = the 7 days before
//   - 30d          → rolling last 30 days, ending today; comparison = the 30 days before
//   - cw           → current calendar week (ISO Mon–Sun); comparison = previous week
//   - cm           → current calendar month (1st → today); comparison = same length last month
//   - custom       → use fromISO/toISO (YYYY-MM-DD); comparison = same length immediately before
//
// Empty or unknown ids fall back to "today".
func ParseDashboardPeriod(period, fromISO, toISO string) (PeriodWindow, error) {
	loc := BusinessLocation()
	now := BusinessNow()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)

	switch period {
	case "", "today":
		return windowFor("today", today, today, "hour"), nil

	case "yesterday":
		yest := today.AddDate(0, 0, -1)
		return windowFor("yesterday", yest, yest, "hour"), nil

	case "7d":
		from := today.AddDate(0, 0, -6)
		return windowFor("7d", from, today, "day"), nil

	case "30d":
		from := today.AddDate(0, 0, -29)
		return windowFor("30d", from, today, "day"), nil

	case "cw":
		// ISO week: Monday = 1, Sunday = 7. weekday() in Go: Sunday=0..Saturday=6.
		dow := int(today.Weekday())
		if dow == 0 {
			dow = 7 // treat Sunday as last day of the week
		}
		from := today.AddDate(0, 0, -(dow - 1))
		return windowFor("cw", from, today, "day"), nil

	case "cm":
		from := time.Date(today.Year(), today.Month(), 1, 0, 0, 0, 0, loc)
		return windowFor("cm", from, today, "day"), nil

	case "custom":
		from, err := time.ParseInLocation("2006-01-02", fromISO, loc)
		if err != nil {
			return PeriodWindow{}, fmt.Errorf("invalid from (expected YYYY-MM-DD): %w", err)
		}
		to, err := time.ParseInLocation("2006-01-02", toISO, loc)
		if err != nil {
			return PeriodWindow{}, fmt.Errorf("invalid to (expected YYYY-MM-DD): %w", err)
		}
		if to.Before(from) {
			return PeriodWindow{}, fmt.Errorf("to must be on or after from")
		}
		gran := pickGranularity(int(to.Sub(from).Hours()/24) + 1)
		return windowFor("custom", from, to, gran), nil

	default:
		// Unknown id — be forgiving and treat as today.
		return windowFor("today", today, today, "hour"), nil
	}
}

// windowFor builds a PeriodWindow with a same-length previous-period.
func windowFor(period string, from, to time.Time, granularity string) PeriodWindow {
	days := int(to.Sub(from).Hours()/24) + 1
	prevTo := from.AddDate(0, 0, -1)
	prevFrom := prevTo.AddDate(0, 0, -(days - 1))
	return PeriodWindow{
		Period:       period,
		From:         from,
		To:           to,
		PreviousFrom: prevFrom,
		PreviousTo:   prevTo,
		Granularity:  granularity,
	}
}

func pickGranularity(days int) string {
	switch {
	case days <= 1:
		return "hour"
	case days <= 93:
		return "day"
	default:
		return "month"
	}
}
