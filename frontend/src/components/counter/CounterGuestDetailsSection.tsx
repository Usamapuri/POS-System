import { useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { Label } from '@/components/ui/label'
import { toastHelpers } from '@/lib/toast-helpers'
import { ChevronDown } from 'lucide-react'
import type { Order } from '@/types'

export function toGuestDateInputValue(iso?: string | null): string {
  if (!iso) return ''
  const s = String(iso).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

type Props = {
  customerName: string
  setCustomerName: (v: string) => void
  customerEmail: string
  setCustomerEmail: (v: string) => void
  customerPhone: string
  setCustomerPhone: (v: string) => void
  guestBirthday: string
  setGuestBirthday: (v: string) => void
  existingOrder: Order | null
  onGuestUpdated: (order: Order) => void
}

export function CounterGuestDetailsSection({
  customerName,
  setCustomerName,
  customerEmail,
  setCustomerEmail,
  customerPhone,
  setCustomerPhone,
  guestBirthday,
  setGuestBirthday,
  existingOrder,
  onGuestUpdated,
}: Props) {
  const queryClient = useQueryClient()

  const saveGuestMutation = useMutation({
    mutationFn: async () => {
      if (!existingOrder?.id) throw new Error('No order')
      const res = await apiClient.updateCounterOrderGuest(existingOrder.id, {
        customer_name: customerName.trim() || undefined,
        customer_email: customerEmail.trim() || undefined,
        customer_phone: customerPhone.trim() || undefined,
        guest_birthday: guestBirthday.trim() || undefined,
      })
      if (!res.success || !res.data) {
        throw new Error(res.message || 'Could not save guest details')
      }
      return res.data
    },
    onSuccess: (order) => {
      onGuestUpdated(order)
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['counterPendingOrders'] })
      toastHelpers.success('Guest details saved', 'Updated on this order.')
    },
    onError: (e: Error) => {
      toastHelpers.error('Guest details', e.message || 'Save failed')
    },
  })

  const hasDraft =
    customerName.trim() ||
    customerEmail.trim() ||
    customerPhone.trim() ||
    guestBirthday.trim()

  return (
    <details className="group rounded-lg border border-border/70 bg-muted/20 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-foreground outline-none ring-offset-background hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring">
        <span>
          Guest <span className="font-normal text-muted-foreground">(optional)</span>
          {hasDraft && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              —{' '}
              {customerName.trim() ||
                customerEmail.trim() ||
                customerPhone.trim() ||
                (guestBirthday.trim() ? 'Birthday set' : '')}
            </span>
          )}
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="space-y-3 border-t border-border/60 px-3 pb-3 pt-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Saved with the order — you can update anytime before checkout closes
        </p>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Name on ticket</Label>
          <Input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="h-10 text-base"
            placeholder="Display name"
            autoComplete="name"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Email</Label>
            <Input
              type="email"
              className="h-10"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="email@example.com"
              autoComplete="email"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Phone</Label>
            <Input
              className="h-10"
              inputMode="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="Phone number"
              autoComplete="tel"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Birthday (hospitality)</Label>
          <DatePicker
            value={guestBirthday}
            onChange={setGuestBirthday}
            placeholder="Optional"
          />
        </div>
        {existingOrder && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full"
            disabled={saveGuestMutation.isPending}
            onClick={() => saveGuestMutation.mutate()}
          >
            {saveGuestMutation.isPending ? 'Saving…' : 'Save to order'}
          </Button>
        )}
      </div>
    </details>
  )
}
