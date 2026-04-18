import { useEffect, useMemo, useRef } from 'react'
import type { Order } from '@/types'
import { buildReceiptHtml, type CustomerReceiptSettings } from '@/lib/printCustomerReceipt'
import { formatMoney } from '@/lib/currency'

/**
 * Live, 1:1 preview of the printed customer receipt.
 *
 * Renders the exact same HTML fragment that `printCustomerReceipt` emits —
 * inside a Shadow DOM so the receipt's CSS (which uses generic class names
 * like .brand, .totals, .legal, etc.) cannot leak into the admin UI.
 */
export function ReceiptPreview({
  settings,
  paymentMethod = 'cash',
}: {
  settings: CustomerReceiptSettings
  paymentMethod?: 'cash' | 'credit_card' | 'online'
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const shadowRef = useRef<ShadowRoot | null>(null)

  const html = useMemo(() => {
    const demoOrder = buildDemoOrder()
    return buildReceiptHtml(demoOrder, settings, {
      cashierName: 'Admin User',
      paymentMethod,
      paidAt: new Date(),
      serverName: 'Sarah Smith',
      formatAmount: (n) => formatMoney(n),
      forPrint: false,
    })
  }, [settings, paymentMethod])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    // Attach shadow root once; React never touches children inside it, so we
    // can safely set innerHTML on the shadow root for subsequent updates.
    if (!shadowRef.current) {
      shadowRef.current = host.attachShadow({ mode: 'open' })
    }
    shadowRef.current.innerHTML = html
  }, [html])

  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 overflow-auto">
      <div
        className="mx-auto bg-white text-black shadow-md rounded-sm"
        style={{ width: '80mm' }}
      >
        <div ref={hostRef} />
      </div>
    </div>
  )
}

function buildDemoOrder(): Order {
  const now = new Date()
  const invNum = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-001`

  // Cast via `unknown` — only the fields actually read by buildReceiptHtml
  // matter here; the rest of Order is not exercised in the preview.
  return {
    id: 'demo-order',
    order_number: invNum,
    order_type: 'dine_in',
    status: 'completed',
    subtotal: 2450,
    tax_amount: 367.5,
    discount_amount: 100,
    service_charge_amount: 245,
    total_amount: 2962.5,
    checkout_payment_method: 'cash',
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    table: { table_number: '7' },
    items: [
      {
        id: 'i1', order_id: 'demo-order', product_id: 'p1',
        quantity: 2, unit_price: 650, total_price: 1300, status: 'served',
        created_at: now.toISOString(), updated_at: now.toISOString(),
        product: { id: 'p1', name: 'Chicken Karahi', price: 650 },
      },
      {
        id: 'i2', order_id: 'demo-order', product_id: 'p2',
        quantity: 3, unit_price: 250, total_price: 750, status: 'served',
        special_instructions: 'Less spicy please',
        created_at: now.toISOString(), updated_at: now.toISOString(),
        product: { id: 'p2', name: 'Garlic Naan', price: 250 },
      },
      {
        id: 'i3', order_id: 'demo-order', product_id: 'p3',
        quantity: 2, unit_price: 200, total_price: 400, status: 'served',
        created_at: now.toISOString(), updated_at: now.toISOString(),
        product: { id: 'p3', name: 'Mint Lemonade', price: 200 },
      },
    ],
  } as unknown as Order
}
