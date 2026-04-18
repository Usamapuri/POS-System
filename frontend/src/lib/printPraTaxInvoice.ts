import QRCode from 'qrcode'

import type { Order } from '@/types'
// Vite resolves the asset to a URL (hashed in prod, `/src/assets/...` in dev).
// We do NOT use the URL directly in the print HTML because the slip renders
// inside a `blob:` popup window which has no origin — relative URLs break
// there. Instead, at print time we fetch this URL and convert it to a base64
// data URL so the logo is self-contained in the printed document.
import praLogoUrl from '@/assets/pra-logo.png'
import {
  buildReceiptClosing,
  buildReceiptHtml,
  getServerNameFromOrder,
  type CustomerReceiptSettings,
} from '@/lib/printCustomerReceipt'

/**
 * printPraTaxInvoice prints a full thermal receipt plus an appended PRA
 * (Punjab Revenue Authority) tax block at the bottom — PRA logo, QR code, and
 * "PRA Invoice No". This is an *optional* second slip handed to customers who
 * explicitly request a tax invoice at checkout.
 *
 * The main receipt builder (`buildReceiptHtml`) is reused unchanged so the
 * two slips stay visually aligned; we only append an extra footer block.
 * Number issuance and QR payload are intentionally stubbed today so a future
 * PRA API integration can be dropped in without touching UI.
 */

// ── Placeholder helpers (safe to swap for real PRA integration later) ─────

/**
 * Returns the PRA invoice number to print. Today this is a blank slot — a
 * future change will call a PRA API (or a sequential counter) and persist
 * the issued number on the order. Keeping it empty here means the printed
 * receipt shows "PRA Invoice No:" with no value yet, matching the rollout
 * plan agreed with the operator.
 */
export function generatePraInvoiceNumber(order: Order): string {
  if (order.pra_invoice_number && order.pra_invoice_number.trim() !== '') {
    return order.pra_invoice_number.trim()
  }
  return ''
}

/**
 * Builds the string encoded inside the PRA QR code. Operators can configure a
 * `pra_invoice_qr_url_template` in Admin → Settings that contains the tokens
 * `{invoice_number}` and `{order_number}`; if no template is set we fall back
 * to the bare invoice number (or order number) so the QR is never empty.
 */
export function buildPraQrPayload(
  order: Order,
  invoiceNumber: string,
  template: string,
): string {
  const inv = invoiceNumber || ''
  const ord = order.order_number || ''
  const tpl = (template || '').trim()
  if (tpl) {
    return tpl.replace(/\{invoice_number\}/g, inv).replace(/\{order_number\}/g, ord)
  }
  return inv || ord
}

// ── Logo loader ──────────────────────────────────────────────────────────
// We must inline the PRA logo as a base64 data URL in the print HTML because
// the receipt renders inside a `blob:` popup window (`window.open`). Blob
// documents have no origin, so a relative URL like `/assets/pra-logo-*.png`
// cannot be resolved from that context and the logo renders as a broken
// image icon. Vite's `?inline` suffix is unreliable across dev/prod, so we
// do the conversion at runtime: fetch → FileReader → data URL, then cache
// the result so subsequent reprints incur zero cost.

let cachedPraLogoDataUrl: string | null = null
let pendingPraLogoLoad: Promise<string> | null = null

async function loadPraLogoAsDataUrl(): Promise<string> {
  if (cachedPraLogoDataUrl) return cachedPraLogoDataUrl
  if (pendingPraLogoLoad) return pendingPraLogoLoad
  pendingPraLogoLoad = (async () => {
    try {
      const res = await fetch(praLogoUrl)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(reader.error ?? new Error('FileReader error'))
        reader.readAsDataURL(blob)
      })
      cachedPraLogoDataUrl = dataUrl
      return dataUrl
    } catch (err) {
      // Log once; a missing logo should not break the slip — the invoice
      // number and QR still convey regulatory intent.
      console.warn('[PRA] Failed to load PRA logo for print:', err)
      return ''
    } finally {
      pendingPraLogoLoad = null
    }
  })()
  return pendingPraLogoLoad
}

// ── HTML + print ─────────────────────────────────────────────────────────

export type PrintPraTaxInvoiceOptions = {
  cashierName: string
  paymentMethod: string
  paidAt: Date
  serverName?: string
  formatAmount?: (n: number) => string
  formatAmountPlain?: (n: number) => string
}

export type PrintPraTaxInvoiceResult = {
  /** Invoice number printed on the slip (empty during rollout / pre-API). */
  invoiceNumber: string
  /**
   * Whether `window.open` successfully produced a print window. False when
   * the browser's popup blocker intercepted the window — callers should skip
   * the audit log in that case so we never record a print that never
   * reached paper.
   */
  printed: boolean
}

export async function printPraTaxInvoice(
  order: Order,
  cfg: CustomerReceiptSettings,
  opts: PrintPraTaxInvoiceOptions,
): Promise<PrintPraTaxInvoiceResult> {
  const invoiceNumber = generatePraInvoiceNumber(order)
  const qrPayload = buildPraQrPayload(order, invoiceNumber, cfg.praInvoiceQrUrlTemplate)

  // Kick off QR + logo conversion in parallel — both produce base64 data URLs
  // so the print document is fully self-contained and renders inside the
  // `blob:` popup window without needing any network access.
  const [qrDataUrl, logoDataUrl] = await Promise.all([
    QRCode.toDataURL(qrPayload || ' ', {
      margin: 1,
      width: 220,
      errorCorrectionLevel: 'M',
    }).catch(() => ''),
    loadPraLogoAsDataUrl(),
  ])

  const html = buildPraInvoiceHtml(order, cfg, {
    ...opts,
    serverName: opts.serverName ?? getServerNameFromOrder(order),
    praInvoiceNumber: invoiceNumber,
    qrDataUrl,
    logoDataUrl,
  })

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const w = window.open(url, '_blank', 'width=420,height=720,left=-2400,top=0,menubar=no,toolbar=no')
  if (!w) {
    URL.revokeObjectURL(url)
    return { invoiceNumber, printed: false }
  }

  let printed = false
  const doPrint = () => {
    if (printed) return
    printed = true
    try {
      w.focus()
      w.print()
    } finally {
      setTimeout(() => {
        try {
          w.close()
        } catch {
          /* ignore */
        }
        URL.revokeObjectURL(url)
      }, 800)
    }
  }
  w.onload = () => setTimeout(doPrint, 250)
  setTimeout(() => {
    if (!printed) doPrint()
  }, 1400)

  return { invoiceNumber, printed: true }
}

// ── HTML builder ─────────────────────────────────────────────────────────

type BuildPraInvoiceOptions = PrintPraTaxInvoiceOptions & {
  praInvoiceNumber: string
  qrDataUrl: string
  /**
   * Base64 data URL for the PRA logo. Empty string falls back to a neutral
   * placeholder so a logo-load failure still produces a valid slip.
   */
  logoDataUrl: string
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Returns a full thermal-printable HTML document: the main customer receipt
 * content (reused verbatim via `buildReceiptHtml` so formatting stays in
 * lock-step) followed by a dedicated PRA tax block.
 */
export function buildPraInvoiceHtml(
  order: Order,
  cfg: CustomerReceiptSettings,
  opts: BuildPraInvoiceOptions,
): string {
  // Build the main receipt as a styled fragment (no <html> wrapper) WITHOUT
  // its closing block (thank-you + attribution). The closing is appended
  // after the PRA block below so that "Thank you for your visit!" and the
  // "software powered by artyreal.com" attribution always remain the very
  // last lines on any slip, whether or not a PRA block is present.
  const mainFragment = buildReceiptHtml(order, cfg, {
    cashierName: opts.cashierName,
    paymentMethod: opts.paymentMethod,
    paidAt: opts.paidAt,
    serverName: opts.serverName,
    formatAmount: opts.formatAmount,
    formatAmountPlain: opts.formatAmountPlain,
    forPrint: false,
    omitClosing: true,
  })
  const closingFragment = buildReceiptClosing(cfg)

  const inv = escapeHtml(order.order_number || '')
  const paper = cfg.paperWidthMm

  // Logo was pre-converted to a base64 data URL by the caller so the popup
  // window can render it without any network access. If the conversion
  // failed (unlikely), we fall back to a plain "PRA" text block so the slip
  // still reads as the regulatory section it's meant to be.
  const logoMarkup = opts.logoDataUrl
    ? `<div class="pra-logo-wrap"><img class="pra-logo" src="${escapeHtml(opts.logoDataUrl)}" alt="Punjab Revenue Authority"/></div>`
    : '<div class="pra-logo-fallback">PRA</div>'
  const qrMarkup = opts.qrDataUrl
    ? `<img class="pra-qr" src="${escapeHtml(opts.qrDataUrl)}" alt="PRA QR Code"/>`
    : '<div class="pra-qr-placeholder" aria-hidden="true"></div>'

  const footerNote = cfg.praInvoiceFooterNote.trim()
  const footerNoteMarkup = footerNote
    ? `<div class="pra-note">${escapeHtml(footerNote)}</div>`
    : ''

  const invoiceNumberMarkup = opts.praInvoiceNumber
    ? `<div class="pra-invoice-no"><span class="pra-invoice-label">PRA Invoice No:</span> <span class="pra-invoice-value">${escapeHtml(opts.praInvoiceNumber)}</span></div>`
    : `<div class="pra-invoice-no"><span class="pra-invoice-label">PRA Invoice No:</span> <span class="pra-invoice-value pra-invoice-blank">&nbsp;</span></div>`

  const praBlock = `
  <section class="pra-block" aria-label="PRA Tax Invoice">
    ${footerNoteMarkup}
    <div class="pra-grid">
      <div class="pra-grid-logo">${logoMarkup}</div>
      <div class="pra-grid-qr">${qrMarkup}</div>
    </div>
    ${invoiceNumberMarkup}
    <div class="pra-label">Punjab Revenue Authority — Tax Invoice</div>
  </section>`

  const styles = `
  ${praTaxStyles()}
  `

  // Render order: main body (items + totals) → PRA block (logo, QR, invoice
  // number) → closing block (thank-you + attribution). The closing is the
  // SAME fragment the standard receipt uses, just emitted after the PRA
  // section so it always ends up on the last line of the slip.
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>PRA Tax Invoice ${inv}</title>
<style>
  @page { size: ${paper}mm auto; margin: 3mm 3mm 4mm; }
  html, body { width: ${paper}mm; max-width: ${paper}mm; margin: 0; padding: 0; background: #fff; }
  ${styles}
</style></head><body>${mainFragment}${praBlock}${closingFragment}</body></html>`
}

function praTaxStyles(): string {
  // Visual goals:
  //  • Clear dashed separator above the PRA section so it reads as a distinct
  //    regulatory block (matches the red-circled area in the reference photo).
  //  • Logo and QR are centered with generous whitespace for scan reliability.
  //  • "PRA Invoice No:" line is bold and bordered so it reads as the key
  //    compliance field even when left blank during rollout.
  return `
  .pra-block {
    margin: 6mm 1.5mm 2mm;
    padding: 4mm 2mm 2mm;
    border-top: 2px dashed #000;
    text-align: center;
    font-family: 'Inter', system-ui, -apple-system, Helvetica, Arial, sans-serif;
    color: #000;
  }
  .pra-note {
    font-size: 9px;
    color: #333;
    margin-bottom: 3mm;
    line-height: 1.35;
  }
  .pra-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2mm;
    align-items: center;
    margin-bottom: 3mm;
  }
  .pra-grid-logo {
    display: flex;
    justify-content: center;
    align-items: center;
  }
  .pra-grid-qr {
    display: flex;
    justify-content: center;
    align-items: center;
  }
  .pra-logo-wrap {
    display: flex;
    justify-content: center;
    align-items: center;
  }
  .pra-logo {
    max-width: 100%;
    max-height: 22mm;
    object-fit: contain;
  }
  .pra-logo-fallback {
    font-size: 22px;
    font-weight: 900;
    letter-spacing: 0.1em;
    color: #000;
  }
  .pra-qr {
    width: 26mm;
    height: 26mm;
    image-rendering: pixelated;
  }
  .pra-qr-placeholder {
    width: 26mm;
    height: 26mm;
    border: 1px dashed #666;
  }
  .pra-invoice-no {
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    font-size: 10px;
    font-weight: 700;
    border: 1px solid #000;
    padding: 1.8mm 2mm;
    margin: 0 auto 2mm;
    display: inline-block;
    max-width: 100%;
    letter-spacing: 0.02em;
  }
  .pra-invoice-label { font-weight: 700; }
  .pra-invoice-value { font-weight: 600; }
  .pra-invoice-blank {
    display: inline-block;
    min-width: 28mm;
    border-bottom: 1px dotted #000;
  }
  .pra-label {
    font-size: 8px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #444;
    margin-top: 2mm;
  }
  `
}
