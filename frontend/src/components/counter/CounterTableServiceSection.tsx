import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toastHelpers } from '@/lib/toast-helpers'
import type { CounterServer, Order } from '@/types'
import { ChevronDown, Search, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

function serverLabel(s: CounterServer): string {
  return `${s.first_name} ${s.last_name} (@${s.username})`
}

type Props = {
  existingOrder: Order | null
  onServiceUpdated: (order: Order) => void
}

export function CounterTableServiceSection({ existingOrder, onServiceUpdated }: Props) {
  const queryClient = useQueryClient()
  const [partyDigits, setPartyDigits] = useState('')
  const [serverMenuOpen, setServerMenuOpen] = useState(false)
  const [serverFilter, setServerFilter] = useState('')
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null)

  const { data: serversRes, isError: serversQueryIsError } = useQuery({
    queryKey: ['counterServers'],
    queryFn: () => apiClient.getCounterServers(),
    enabled: Boolean(existingOrder?.id),
  })

  const allServers = serversRes?.success && serversRes.data ? serversRes.data : []

  const filteredServers = useMemo(() => {
    const q = serverFilter.trim().toLowerCase()
    if (!q) return allServers
    return allServers.filter((s) => {
      const full = `${s.first_name} ${s.last_name}`.toLowerCase()
      return (
        s.username.toLowerCase().includes(q) ||
        s.first_name.toLowerCase().includes(q) ||
        s.last_name.toLowerCase().includes(q) ||
        full.includes(q)
      )
    })
  }, [allServers, serverFilter])

  const selectedServer = useMemo(
    () => allServers.find((s) => s.id === selectedServerId) ?? null,
    [allServers, selectedServerId]
  )

  useEffect(() => {
    if (!existingOrder?.id) return
    const gc = existingOrder.guest_count ?? 0
    setPartyDigits(gc > 0 ? String(gc) : '')
    setSelectedServerId(existingOrder.user_id ?? null)
    setServerFilter('')
    setServerMenuOpen(false)
  }, [existingOrder?.id, existingOrder?.guest_count, existingOrder?.user_id])

  const onPartyInput = useCallback((raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 3)
    setPartyDigits(digits)
  }, [])

  const partyCount = partyDigits === '' ? 0 : Math.max(0, parseInt(partyDigits, 10) || 0)

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!existingOrder?.id) throw new Error('No order')
      const res = await apiClient.updateCounterOrderService(existingOrder.id, {
        guest_count: partyCount,
        assigned_server_id: selectedServerId ?? '',
      })
      if (!res.success || !res.data) {
        throw new Error(res.message || 'Could not save table service')
      }
      return res.data
    },
    onSuccess: (order) => {
      onServiceUpdated(order)
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['counterPendingOrders'] })
      toastHelpers.success('Table service saved', 'Party size and server updated on this order.')
    },
    onError: (e: Error) => {
      toastHelpers.error('Table service', e.message || 'Save failed')
    },
  })

  const listEmptyMessage = (() => {
    if (serversQueryIsError) return 'Could not load staff.'
    if (allServers.length === 0) return 'No servers found'
    if (filteredServers.length === 0) return 'No matches — try another search'
    return null
  })()

  if (!existingOrder?.id) return null

  return (
    <details className="group rounded-lg border border-border/70 bg-muted/20 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-foreground outline-none ring-offset-background hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring">
        <span>
          Party & server <span className="font-normal text-muted-foreground">(optional)</span>
          {(partyCount > 0 || selectedServer) && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              —{' '}
              {partyCount > 0 ? `${partyCount} ${partyCount === 1 ? 'guest' : 'guests'}` : ''}
              {partyCount > 0 && selectedServer ? ' · ' : ''}
              {selectedServer ? serverLabel(selectedServer) : ''}
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
          Saved with the order — update anytime before checkout closes
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" aria-hidden />
              Number of guests
            </Label>
            <Input
              inputMode="numeric"
              autoComplete="off"
              className="h-10 font-medium tabular-nums"
              value={partyDigits}
              onChange={(e) => onPartyInput(e.target.value)}
              placeholder="Not set"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Server / waiter</Label>
            <DropdownMenu open={serverMenuOpen} onOpenChange={setServerMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  disabled={allServers.length === 0 || serversQueryIsError}
                  className="h-10 w-full justify-between font-normal"
                >
                  <span className={cn('truncate', !selectedServer && 'text-muted-foreground')}>
                    {selectedServer ? serverLabel(selectedServer) : 'Not assigned'}
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)] p-0" align="start">
                <div className="p-2 border-b border-border">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="h-9 pl-8"
                      placeholder="Search by name…"
                      value={serverFilter}
                      onChange={(e) => setServerFilter(e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="w-full border-b border-border px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted/80"
                  onClick={() => {
                    setSelectedServerId(null)
                    setServerMenuOpen(false)
                    setServerFilter('')
                  }}
                >
                  Clear server
                </button>
                <div className="max-h-48 overflow-y-auto py-1">
                  {listEmptyMessage ? (
                    <div className="px-3 py-4 text-sm text-muted-foreground text-center">{listEmptyMessage}</div>
                  ) : (
                    filteredServers.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={cn(
                          'w-full text-left px-3 py-2.5 text-sm hover:bg-muted/80 transition-colors',
                          selectedServerId === s.id && 'bg-primary/10'
                        )}
                        onClick={() => {
                          setSelectedServerId(s.id)
                          setServerMenuOpen(false)
                          setServerFilter('')
                        }}
                      >
                        <span className="font-medium">
                          {s.first_name} {s.last_name}
                        </span>
                        <span className="text-muted-foreground ml-1">@{s.username}</span>
                      </button>
                    ))
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          className="w-full"
          disabled={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? 'Saving…' : 'Save to order'}
        </Button>
      </div>
    </details>
  )
}
