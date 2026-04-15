import type { StationKOT } from '@/types'

function buildPrintHtml(slips: StationKOT[]): string {
  const body = slips
    .map((k, idx) => {
      const raw = typeof k.payload === 'string' ? k.payload : JSON.stringify(k.payload, null, 2)
      const isLast = idx === slips.length - 1
      return `<section class="kot-slip${isLast ? ' kot-slip--last' : ''}"><pre>${escapeHtml(raw)}</pre></section>`
    })
    .join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>KOT Print</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: auto !important;
    min-height: auto !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 11px;
    padding: 8px;
  }
  pre {
    white-space: pre-wrap;
    margin: 0;
    word-break: break-word;
  }
  .kot-slip {
    page-break-inside: avoid;
    break-inside: avoid;
    margin: 0;
    padding: 8px 0;
  }
  /* One print job, multiple “pages” / cuts — thermal drivers vary; separators help either way. */
  .kot-slip:not(.kot-slip--last) {
    page-break-after: always;
    break-after: page;
  }
  .kot-slip + .kot-slip {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 2px dashed #000;
  }
</style></head><body>${body}</body></html>`
}

/** ESC/POS-style text tickets — one print dialog, one slip per station (page breaks + dashed separators). */
export function printKotReceipts(kots: StationKOT[] | undefined): void {
  if (!kots?.length) return
  const slips = kots.filter((k) => k.output_type === 'printer')
  if (slips.length === 0) return

  const html = buildPrintHtml(slips)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  // Tiny iframes clip print layout — only the first KOT appears. Use a full blob document instead.
  const w = window.open(
    url,
    '_blank',
    'width=420,height=720,left=-2400,top=0,menubar=no,toolbar=no'
  )

  if (!w) {
    URL.revokeObjectURL(url)
    printViaLargeOffscreenIframe(html)
    return
  }

  const cleanup = () => {
    try {
      w.close()
    } catch {
      /* ignore */
    }
    URL.revokeObjectURL(url)
  }

  let printed = false
  const doPrint = () => {
    if (printed) return
    printed = true
    try {
      w.focus()
      w.print()
    } finally {
      setTimeout(cleanup, 800)
    }
  }

  w.onload = () => window.setTimeout(doPrint, 150)
  window.setTimeout(() => {
    if (!printed && w.document?.readyState === 'complete') {
      doPrint()
    }
  }, 400)
  window.setTimeout(() => {
    if (!printed) doPrint()
  }, 1200)
}

/** When popups are blocked: off-screen iframe large enough for full multi-slip layout. */
function printViaLargeOffscreenIframe(html: string): void {
  const iframe = document.createElement('iframe')
  iframe.setAttribute(
    'style',
    [
      'position:fixed',
      'left:-8000px',
      'top:0',
      'width:320px',
      'min-height:12000px',
      'height:12000px',
      'border:0',
      'opacity:0',
      'pointer-events:none',
      'z-index:-1',
    ].join(';')
  )
  iframe.setAttribute('aria-hidden', 'true')
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument
  const win = iframe.contentWindow
  if (!doc || !win) {
    document.body.removeChild(iframe)
    return
  }

  doc.open()
  doc.write(html)
  doc.close()

  const runPrint = () => {
    try {
      win.focus()
      win.print()
    } finally {
      setTimeout(() => {
        try {
          document.body.removeChild(iframe)
        } catch {
          /* ignore */
        }
      }, 800)
    }
  }

  requestAnimationFrame(() => {
    setTimeout(runPrint, 300)
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
