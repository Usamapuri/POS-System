import { useState, useMemo, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import apiClient from '@/api/client'
import type { CounterServer, DiningTable } from '@/types'
import { Users, ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

export type TableSession = {
  guestCount: number
  serverId: string
  serverDisplayName: string
  customerName?: string
  customerEmail?: string
  customerPhone?: string
  guestBirthday?: string
}

type Props = {
  open: boolean
  table: DiningTable | null
  onOpenChange: (open: boolean) => void
  onConfirm: (session: TableSession) => void | Promise<void>
}

function serverLabel(s: CounterServer): string {
  return `${s.first_name} ${s.last_name} (@${s.username})`
}

export function TableSessionModal({ open, table, onOpenChange, onConfirm }: Props) {
  const [guestDigits, setGuestDigits] = useState('1')
  const [serverMenuOpen, setServerMenuOpen] = useState(false)
  const [serverFilter, setServerFilter] = useState('')
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [guestBirthday, setGuestBirthday] = useState('')
  const [confirmLoading, setConfirmLoading] = useState(false)

  const { data: serversRes, isError: serversQueryIsError } = useQuery({
    queryKey: ['counterServers'],
    queryFn: () => apiClient.getCounterServers(),
    enabled: open,
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
    if (open) {
      setGuestDigits('1')
      setServerFilter('')
      setSelectedServerId(null)
      setServerMenuOpen(false)
      setCustomerName('')
      setCustomerEmail('')
      setCustomerPhone('')
      setGuestBirthday('')
      setConfirmLoading(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onOpenChange])

  const onGuestInput = useCallback((raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 3)
    setGuestDigits(digits === '' ? '' : digits)
  }, [])

  if (!open || !table) return null

  const guestCount = Math.max(1, parseInt(guestDigits || '1', 10) || 1)

  const handleConfirm = async () => {
    if (!selectedServer) return
    setConfirmLoading(true)
    try {
      const session: TableSession = {
        guestCount,
        serverId: selectedServer.id,
        serverDisplayName: `${selectedServer.first_name} ${selectedServer.last_name}`.trim(),
        customerName: customerName.trim() || undefined,
        customerEmail: customerEmail.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        guestBirthday: guestBirthday.trim() || undefined,
      }
      await Promise.resolve(onConfirm(session))
    } finally {
      setConfirmLoading(false)
    }
  }

  const listEmptyMessage = (() => {
    if (serversQueryIsError) return 'Could not load staff. Try again or check your connection.'
    if (allServers.length === 0) return 'No servers found'
    if (filteredServers.length === 0) return 'No matches — try another search'
    return null
  })()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="bg-card border border-border rounded-xl shadow-lg max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-xl font-semibold">Table session</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Table <span className="font-medium text-foreground">{table.table_number}</span> — set guest count and
            server before ordering. Order number is assigned when you confirm.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm font-medium">
              <Users className="h-4 w-4" />
              Number of guests
            </Label>
            <Input
              inputMode="numeric"
              autoComplete="off"
              className="h-11 font-medium tabular-nums"
              value={guestDigits}
              onChange={(e) => onGuestInput(e.target.value)}
              placeholder="1"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Server / waiter</Label>
            <DropdownMenu open={serverMenuOpen} onOpenChange={setServerMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  disabled={allServers.length === 0 || serversQueryIsError}
                  className="h-11 w-full justify-between font-normal"
                >
                  <span className={cn('truncate', !selectedServer && 'text-muted-foreground')}>
                    {selectedServer ? serverLabel(selectedServer) : 'Select server…'}
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

        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Guest (optional)</p>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Name on ticket</Label>
            <Input
              className="h-10"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Display name"
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
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Birthday (hospitality)</Label>
            <Input type="date" className="h-10" value={guestBirthday} onChange={(e) => setGuestBirthday(e.target.value)} />
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={confirmLoading}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleConfirm()} disabled={!selectedServer || confirmLoading}>
            {confirmLoading ? 'Opening…' : 'Confirm'}
          </Button>
        </div>
      </div>
    </div>
  )
}
