import QRCode from 'qrcode'

import type { Order } from '@/types'
import praLogoUrl from '@/assets/pra-logo.png'
import {
  APP_ATTRIBUTION,
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

// ── HTML + print ─────────────────────────────────────────────────────────

export type PrintPraTaxInvoiceOptions = {
  cashierName: string
  paymentMethod: string
  paidAt: Date
  serverName?: string
  formatAmount?: (n: number) => string
  formatAmountPlain?: (n: number) => string
}

export async function printPraTaxInvoice(
  order: Order,
  cfg: CustomerReceiptSettings,
  opts: PrintPraTaxInvoiceOptions,
): Promise<{ invoiceNumber: string }> {
  const invoiceNumber = generatePraInvoiceNumber(order)
  const qrPayload = buildPraQrPayload(order, invoiceNumber, cfg.praInvoiceQrUrlTemplate)

  // Generate QR as a data URL so the popup window can render offline without
  // any external requests. Width is deliberately small — thermal printers
  // render crisp QR at ~120px and a larger source just eats paper.
  let qrDataUrl = ''
  try {
    qrDataUrl = await QRCode.toDataURL(qrPayload || ' ', {
      margin: 1,
      width: 220,
      errorCorrectionLevel: 'M',
    })
  } catch {
    // A QR failure must not block the slip — the logo + invoice number still
    // carry regulatory intent. Swallow and render without the QR image.
    qrDataUrl = ''
  }

  const html = buildPraInvoiceHtml(order, cfg, {
    ...opts,
    serverName: opts.serverName ?? getServerNameFromOrder(order),
    praInvoiceNumber: invoiceNumber,
    qrDataUrl,
  })

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const w = window.open(url, '_blank', 'width=420,height=720,left=-2400,top=0,menubar=no,toolbar=no')
  if (!w) {
    URL.revokeObjectURL(url)
    return { invoiceNumber }
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

  return { invoiceNumber }
}

// ── HTML builder ─────────────────────────────────────────────────────────

type BuildPraInvoiceOptions = PrintPraTaxInvoiceOptions & {
  praInvoiceNumber: string
  qrDataUrl: string
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
  // Build the main receipt as a styled fragment (no <html> wrapper). We then
  // append the PRA block inside the same document so both parts share paper
  // width + print rules.
  const mainFragment = buildReceiptHtml(order, cfg, {
    cashierName: opts.cashierName,
    paymentMethod: opts.paymentMethod,
    paidAt: opts.paidAt,
    serverName: opts.serverName,
    formatAmount: opts.formatAmount,
    formatAmountPlain: opts.formatAmountPlain,
    forPrint: false,
  })

  const inv = escapeHtml(order.order_number || '')
  const paper = cfg.paperWidthMm

  // Logo uses the bundled asset; Vite resolves the import above to a hashed
  // URL under /assets/. Using a URL (vs. inlining base64) keeps this file
  // small and lets the browser cache the logo between reprints.
  const logoSrc = escapeHtml(praLogoUrl)
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
    <div class="pra-logo-wrap"><img class="pra-logo" src="${logoSrc}" alt="Punjab Revenue Authority"/></div>
    <div class="pra-qr-wrap">${qrMarkup}</div>
    ${invoiceNumberMarkup}
    <div class="pra-label">Punjab Revenue Authority — Tax Invoice</div>
  </section>`

  const styles = `
  ${praTaxStyles()}
  `

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>PRA Tax Invoice ${inv}</title>
<style>
  @page { size: ${paper}mm auto; margin: 3mm 3mm 4mm; }
  html, body { width: ${paper}mm; max-width: ${paper}mm; margin: 0; padding: 0; background: #fff; }
  ${styles}
</style></head><body>${mainFragment}${praBlock}<div class="pra-attribution">${escapeHtml(APP_ATTRIBUTION)}</div></body></html>`
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
  .pra-logo-wrap {
    display: flex;
    justify-content: center;
    align-items: center;
    margin-bottom: 3mm;
  }
  .pra-logo {
    max-width: 60%;
    max-height: 18mm;
    object-fit: contain;
  }
  .pra-qr-wrap {
    display: flex;
    justify-content: center;
    align-items: center;
    margin-bottom: 3mm;
  }
  .pra-qr {
    width: 30mm;
    height: 30mm;
    image-rendering: pixelated;
  }
  .pra-qr-placeholder {
    width: 30mm;
    height: 30mm;
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
  .pra-attribution {
    font-family: 'Inter', system-ui, Helvetica, Arial, sans-serif;
    text-align: center;
    font-size: 8px;
    color: #666;
    letter-spacing: 0.02em;
    margin: 2mm 0 3mm;
  }
  `
}
