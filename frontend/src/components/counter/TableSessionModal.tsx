import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { NumericKeypad } from '@/components/counter/NumericKeypad'
import apiClient from '@/api/client'
import type { DiningTable } from '@/types'
import { Users } from 'lucide-react'

export type TableSession = {
  guestCount: number
  serverId: string
  serverDisplayName: string
}

type Props = {
  open: boolean
  table: DiningTable | null
  onOpenChange: (open: boolean) => void
  onConfirm: (session: TableSession) => void
}

export function TableSessionModal({ open, table, onOpenChange, onConfirm }: Props) {
  const [nopStr, setNopStr] = useState('')
  const [serverQ, setServerQ] = useState('')
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null)

  const { data: serversRes, error: serversQueryError, isError: serversQueryIsError } = useQuery({
    queryKey: ['counterServers'],
    queryFn: () => apiClient.getCounterServers(),
    enabled: open,
  })

  const allServers = serversRes?.success && serversRes.data ? serversRes.data : []

  const filteredServers = useMemo(() => {
    const q = serverQ.trim().toLowerCase()
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
  }, [allServers, serverQ])

  const selectedServer = useMemo(
    () => allServers.find((s) => s.id === selectedServerId) ?? null,
    [allServers, selectedServerId]
  )

  useEffect(() => {
    if (open) {
      setNopStr('')
      setServerQ('')
      setSelectedServerId(null)
    }
  }, [open])

  if (!open || !table) return null

  const guestCount = Math.max(1, parseInt(nopStr || '1', 10) || 1)

  const handleConfirm = () => {
    if (!selectedServer) return
    onConfirm({
      guestCount,
      serverId: selectedServer.id,
      serverDisplayName: `${selectedServer.first_name} ${selectedServer.last_name}`.trim(),
    })
    onOpenChange(false)
    setNopStr('')
    setServerQ('')
    setSelectedServerId(null)
  }

  const listEmptyMessage = (() => {
    if (serversQueryIsError) return 'Could not load staff. Try again or check your connection.'
    if (allServers.length === 0) return 'No servers found'
    if (filteredServers.length === 0) return 'No matches — try another search or pick from the menu above'
    return null
  })()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card border border-border rounded-xl shadow-lg max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-6">
        <div>
          <h2 className="text-xl font-semibold">Table session</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Table <span className="font-medium text-foreground">{table.table_number}</span> — set guest
            count and server / waiter before ordering.
          </p>
        </div>

        <div>
          <Label className="flex items-center gap-2 text-base mb-2">
            <Users className="h-4 w-4" />
            Number of guests (NOP)
          </Label>
          <div className="text-center text-4xl font-bold tabular-nums py-2 min-h-[3rem] text-foreground">
            {nopStr === '' ? <span className="text-muted-foreground font-normal text-2xl">Tap digits</span> : guestCount}
          </div>
          <NumericKeypad value={nopStr} onChange={setNopStr} maxDigits={3} />
        </div>

        <div>
          <Label className="text-base mb-2 block">Server / Waiter</Label>
          <Select
            value={selectedServerId ?? ''}
            onValueChange={(v) => setSelectedServerId(v ? v : null)}
            disabled={allServers.length === 0 || serversQueryIsError}
          >
            <SelectTrigger className="mb-2 h-11 w-full">
              <SelectValue placeholder="Quick select waiter…" />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {allServers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {`${s.first_name} ${s.last_name} (@${s.username})`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Search by name…"
            value={serverQ}
            onChange={(e) => setServerQ(e.target.value)}
            className="mb-2 h-11"
          />
          <div className="border border-border rounded-md max-h-40 overflow-y-auto divide-y">
            {listEmptyMessage ? (
              <div className="p-3 text-sm text-muted-foreground text-center">{listEmptyMessage}</div>
            ) : (
              filteredServers.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`w-full text-left px-3 py-3 min-h-[48px] hover:bg-muted/80 transition-colors ${
                    selectedServerId === s.id ? 'bg-primary/15' : ''
                  }`}
                  onClick={() => setSelectedServerId(s.id)}
                >
                  <span className="font-medium">
                    {s.first_name} {s.last_name}
                  </span>
                  <span className="text-muted-foreground text-sm ml-2">@{s.username}</span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!selectedServer}>
            Confirm
          </Button>
        </div>
      </div>
    </div>
  )
}
