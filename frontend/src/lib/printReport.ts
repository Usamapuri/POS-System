/**
 * Opens an HTML document in a new window styled for printing/saving as PDF.
 * Used by every Reports tab's "Print / Save as PDF" action so the operator
 * gets a clean, header-laden printable view that the browser converts to
 * PDF via the native print dialog (no Go PDF dependency required).
 *
 * Caller responsibility:
 *   - Provide a `title`, `subtitle`, and `bodyHtml` that's already escaped /
 *     trustworthy. Do NOT pass user-provided HTML directly.
 *
 * The helper auto-triggers `window.print()` after render and closes the
 * window when the user dismisses the print dialog.
 */
export function openPrintableReport(opts: {
  title: string
  subtitle: string
  bodyHtml: string
  /**
   * Optional venue display name printed in the PDF footer. Callers should
   * source this from the `useBusinessName` hook so each restaurant's
   * exports get their own brand. Falls back to a generic label when omitted
   * so legacy callers don't break — but new code MUST pass it through.
   */
  brand?: string
}): void {
  const brand = (opts.brand ?? '').trim() || 'Restaurant POS'
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(opts.title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #111827; margin: 28px; }
  header { border-bottom: 1px solid #e5e7eb; padding-bottom: 14px; margin-bottom: 18px; }
  h1 { margin: 0; font-size: 22px; font-weight: 700; }
  .subtitle { color: #6b7280; font-size: 12px; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px; }
  thead th { background: #f9fafb; text-align: left; padding: 8px 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600; }
  tbody td { padding: 8px 10px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
  tbody tr:nth-child(even) { background: #fafafa; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .muted { color: #6b7280; }
  .section-title { font-size: 14px; font-weight: 600; margin: 18px 0 6px; }
  .kv { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 24px; }
  .kv > div { display: flex; justify-content: space-between; gap: 8px; padding: 6px 0; border-bottom: 1px dashed #e5e7eb; font-size: 12px; }
  .kv .label { color: #6b7280; }
  .kv .value { font-weight: 600; }
  .badge { display: inline-block; font-size: 10px; padding: 1px 6px; border-radius: 999px; background: #e5e7eb; color: #111827; }
  footer { margin-top: 24px; font-size: 10px; color: #9ca3af; }
  @media print {
    body { margin: 12mm; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(opts.title)}</h1>
  <div class="subtitle">${escapeHtml(opts.subtitle)}</div>
</header>
${opts.bodyHtml}
<footer>Generated ${escapeHtml(new Date().toLocaleString('en-GB'))} • ${escapeHtml(brand)}</footer>
<script>
  window.addEventListener('load', () => {
    setTimeout(() => {
      window.print();
    }, 250);
  });
  window.addEventListener('afterprint', () => {
    window.close();
  });
</script>
</body>
</html>`
  const win = window.open('', '_blank', 'width=900,height=720')
  if (!win) return
  win.document.open()
  win.document.write(html)
  win.document.close()
}

/** Minimal HTML escaper for trusted-string composition (titles, labels). */
export function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
