import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Minus, Plus, Trash2, Ban, Send, Users } from 'lucide-react'
import type { KOTItem } from './KOTServerInterface'
import { isKotUnsentStatus } from './kotConstants'
import { useCurrency } from '@/contexts/CurrencyContext'

interface KOTSidebarProps {
  items: KOTItem[]
  tableName: string
  guestCount: number
  orderId: string | null
  onUpdateQty: (id: string, qty: number) => void
  onRemoveDraft: (id: string) => void
  onRequestVoid: (id: string, name: string, qty: number, price: number) => void
  onFireKOT: () => void
  isFireLoading: boolean
}

export function KOTSidebar({
  items,
  tableName,
  guestCount,
  orderId,
  onUpdateQty,
  onRemoveDraft,
  onRequestVoid,
  onFireKOT,
  isFireLoading,
}: KOTSidebarProps) {
  const { formatCurrency } = useCurrency()

  /** Not yet fired — `draft` (dine-in / local) or `pending` (takeout/delivery after save) */
  const draftItems = items.filter(i => isKotUnsentStatus(i.status))
  const sentItems = items.filter(i => ['sent', 'preparing', 'ready'].includes(i.status))
  const voidedItems = items.filter(i => i.status === 'voided')

  const activeItems = items.filter(i => i.status !== 'voided')
  const subtotal = activeItems.reduce((sum, i) => sum + i.unit_price * i.quantity, 0)
  const tax = subtotal * 0.1
  const total = subtotal + tax

  return (
    <div className="w-80 bg-white border-l flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b bg-gray-50">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-bold text-lg text-gray-900">Table {tableName}</div>
            <div className="flex items-center gap-2 mt-0.5">
              <Users className="w-3 h-3 text-gray-400" />
              <span className="text-sm text-gray-500">{guestCount} guest{guestCount !== 1 ? 's' : ''}</span>
            </div>
          </div>
          {orderId && (
            <Badge variant="outline" className="text-xs">
              Order Active
            </Badge>
          )}
        </div>
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">
            Tap items from the menu to add them
          </div>
        )}

        {/* Draft items */}
        {draftItems.length > 0 && (
          <div>
            <div className="px-4 py-2 bg-yellow-50 border-b border-yellow-100">
              <span className="text-xs font-semibold text-yellow-700 uppercase tracking-wide">
                Not sent ({draftItems.length})
              </span>
            </div>
            {draftItems.map(item => (
              <div key={item.id} className="px-4 py-3 border-b border-l-4 border-l-yellow-400">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-900 truncate">{item.product_name}</div>
                    <div className="text-sm text-gray-500">{formatCurrency(item.unit_price)}</div>
                  </div>
                  <div className="text-sm font-semibold text-gray-900">
                    {formatCurrency(item.unit_price * item.quantity)}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => onUpdateQty(item.id, item.quantity - 1)}
                    className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center hover:bg-gray-100"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="text-sm font-bold w-6 text-center">{item.quantity}</span>
                  <button
                    onClick={() => onUpdateQty(item.id, item.quantity + 1)}
                    className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center hover:bg-gray-100"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                  <div className="flex-1" />
                  <button
                    onClick={() => onRemoveDraft(item.id)}
                    className="w-7 h-7 rounded-md text-red-500 flex items-center justify-center hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Sent items */}
        {sentItems.length > 0 && (
          <div>
            <div className="px-4 py-2 bg-green-50 border-b border-green-100">
              <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">
                Sent ({sentItems.length})
              </span>
            </div>
            {sentItems.map(item => (
              <div key={item.id} className="px-4 py-3 border-b border-l-4 border-l-green-400">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-900 truncate">
                      {item.product_name}
                      <Badge variant="secondary" className="ml-2 text-xs bg-green-100 text-green-700">
                        {item.status}
                      </Badge>
                    </div>
                    <div className="text-sm text-gray-500">x{item.quantity} @ {formatCurrency(item.unit_price)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{formatCurrency(item.unit_price * item.quantity)}</span>
                    <button
                      onClick={() => onRequestVoid(item.id, item.product_name, item.quantity, item.unit_price)}
                      className="w-7 h-7 rounded-md text-red-500 flex items-center justify-center hover:bg-red-50"
                      title="Void item (requires manager PIN)"
                    >
                      <Ban className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Voided items */}
        {voidedItems.length > 0 && (
          <div>
            <div className="px-4 py-2 bg-red-50 border-b border-red-100">
              <span className="text-xs font-semibold text-red-700 uppercase tracking-wide">
                Voided ({voidedItems.length})
              </span>
            </div>
            {voidedItems.map(item => (
              <div key={item.id} className="px-4 py-3 border-b border-l-4 border-l-red-400 opacity-60">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-500 line-through truncate">{item.product_name}</div>
                    <div className="text-sm text-gray-400 line-through">x{item.quantity} @ {formatCurrency(item.unit_price)}</div>
                  </div>
                  <Badge variant="destructive" className="text-xs">VOIDED</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer: Totals + Fire KOT */}
      <div className="border-t bg-gray-50 p-4">
        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-gray-500">
            <span>Subtotal ({activeItems.length} items)</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>Tax (10%)</span>
            <span>{formatCurrency(tax)}</span>
          </div>
          <div className="flex justify-between font-bold text-gray-900 text-base pt-1 border-t">
            <span>Total</span>
            <span>{formatCurrency(total)}</span>
          </div>
        </div>
        <Button
          className="w-full mt-3 bg-orange-500 hover:bg-orange-600 text-white font-bold"
          size="lg"
          disabled={draftItems.length === 0 || isFireLoading}
          onClick={onFireKOT}
        >
          <Send className="w-4 h-4 mr-2" />
          {isFireLoading ? 'Sending...' : `Fire KOT (${draftItems.length} item${draftItems.length !== 1 ? 's' : ''})`}
        </Button>
      </div>
    </div>
  )
}
