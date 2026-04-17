/**
 * Centralised copy for the Store Inventory → Reports tab.
 *
 * Every visible metric, chart, and column in the Reports tab should have an
 * entry here so users can hover an eye icon and understand what they are
 * looking at. Keep each string short — 1 to 3 sentences — and concrete.
 */

// --- Page & section intros --------------------------------------------------

export const REPORTS_TAB_INTRO =
  'Inventory intelligence tracks the value you hold, what moves through the store, and where money is leaking. All figures are computed from your stock movements and recorded on-hand counts in the selected period.'

export const VARIANCE_REPORT_INTRO =
  'Variance compares what the math says you should have (starting stock + purchases − issues + net adjustments) with what was actually counted. A non-zero variance usually means missed paperwork, waste, or shrinkage.'

export const VARIANCE_REPORT_SHORT =
  'Compares expected vs actual on-hand for every active item in the selected period. Surprises here are the first clue to missed paperwork, shrinkage, or waste.'

export const WASTE_TABLE_INTRO =
  'Every issue tagged as Spoilage/Waste or Return to Vendor is collected here so you can spot repeat loss patterns and cost them out by item.'

export const WASTE_TABLE_SHORT =
  'Issues tagged as Spoilage/Waste or Return to Vendor, oldest to newest. Repeated items here signal a storage, rotation, or supplier problem.'

// --- KPI cards --------------------------------------------------------------

export const KPI_TOTAL_STOCK_VALUE =
  'Sum of (quantity on hand × default unit cost) for every active item right now. This is the capital currently tied up in inventory.'

export const KPI_WASTE_VALUE =
  'Total cost of items written off with a Spoilage/Waste or Return to Vendor tag in the selected period. Lower is better.'

export const KPI_TURNOVER =
  'Issued value ÷ current stock value for the selected period. A higher number means stock is moving faster; very low numbers mean you are over-ordering or items are stale.'

export const KPI_ISSUED_VALUE =
  'Total cost value of everything issued out of the store in the selected period. This is the closest proxy we have to COGS for inventory you manage.'

export const KPI_DAYS_COVER =
  'If you keep issuing at the same average daily rate, how many days of stock you currently hold. Calculated as current stock value ÷ (issued value ÷ period days).'

export const KPI_WASTE_PCT_ISSUED =
  'Waste value as a percentage of issued value in the period. Enterprise grocery and restaurant benchmarks typically sit between 1–4%; anything higher warrants investigation.'

export const KPI_LOW_STOCK =
  'Active items at or below their reorder level right now. These need purchase orders soon to avoid stock-outs.'

export const KPI_VARIANCE_VALUE =
  'Total absolute variance (|actual − expected|) across all items, multiplied by unit cost. This is the cost impact of mismatches between books and physical count.'

// --- Charts ----------------------------------------------------------------

export const CHART_CATEGORY_DONUT =
  'Share of current stock value held in each category. Heavy concentration in one category can indicate over-stocking or missing categorisation.'

export const CHART_PURCHASE_VS_ISSUED =
  'Weekly totals of money spent on purchases vs units issued out of the store. When purchase cost consistently exceeds issuance you are building up inventory; when issuance outpaces purchases you are drawing it down.'

// --- Variance columns ------------------------------------------------------

export const COL_ITEM = 'The stock item being reconciled.'
export const COL_CATEGORY = 'The category this item belongs to.'
export const COL_STARTING =
  'Estimated quantity on hand at the start of the period, derived from today’s on-hand minus net movement activity in the period.'
export const COL_PURCHASED =
  'Total quantity received via purchase movements in the period.'
export const COL_ISSUED =
  'Total quantity issued out (to kitchen, cleaning, etc.) in the period.'
export const COL_NET_ADJ =
  'Net effect of manual adjustment movements in the period (+ in, − out).'
export const COL_EXPECTED =
  'What on-hand SHOULD be: starting + purchased − issued + net adjustments.'
export const COL_ACTUAL = 'What is physically on hand right now.'
export const COL_VARIANCE =
  'Actual − expected. Zero is perfect; negative means you have less than the books say (shrinkage, missed waste entries); positive means uncounted receipts or reversed issues.'
export const COL_STATUS =
  'Traffic-light summary: OK if variance is zero, Over / Short otherwise.'

// --- Waste columns ---------------------------------------------------------

export const COL_WASTE_ITEM = 'The item that was written off.'
export const COL_WASTE_QTY = 'How much was removed (in the item’s unit).'
export const COL_WASTE_REASON =
  'The bracketed tag attached to the issue movement: Spoilage/Waste or Return to Vendor.'
export const COL_WASTE_VALUE =
  'Lost value = quantity × default unit cost at the time of the write-off.'
export const COL_WASTE_DATE = 'Date the write-off movement was recorded.'
