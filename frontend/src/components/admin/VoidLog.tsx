import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight, Ban, Calendar } from 'lucide-react'
import type { VoidLogEntry } from '@/types'
import { useCurrency } from '@/contexts/CurrencyContext'

export function VoidLog() {
  const { formatCurrency } = useCurrency()
  const [page, setPage] = useState(1)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const perPage = 20

  const { data, isLoading } = useQuery({
    queryKey: ['void-log', page, fromDate, toDate],
    queryFn: async () => {
      const res = await apiClient.getVoidLog({
        page,
        per_page: perPage,
        from: fromDate || undefined,
        to: toDate || undefined,
      })
      return res
    },
  })

  const entries = (data?.data as VoidLogEntry[] | null) || []
  const meta = data?.meta || { current_page: 1, total_pages: 1, total: 0, per_page: 20 }

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleString()
    } catch {
      return d
    }
  }

  const getSeverity = (entry: VoidLogEntry) => {
    const value = entry.unit_price * entry.quantity
    if (value >= 50) return 'high'
    if (value >= 20) return 'medium'
    return 'low'
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Void Log</h2>
        <p className="text-gray-500 mt-1">Audit trail of all voided order items</p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">From Date</label>
              <Input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(1) }} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">To Date</label>
              <Input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setPage(1) }} />
            </div>
            {(fromDate || toDate) && (
              <Button variant="ghost" onClick={() => { setFromDate(''); setToDate(''); setPage(1) }}>
                Clear Filters
              </Button>
            )}
            <div className="flex-1" />
            <span className="text-sm text-gray-500">{meta.total} record{meta.total !== 1 ? 's' : ''}</span>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left p-3 font-medium text-gray-600">Date/Time</th>
                  <th className="text-left p-3 font-medium text-gray-600">Order</th>
                  <th className="text-left p-3 font-medium text-gray-600">Item</th>
                  <th className="text-right p-3 font-medium text-gray-600">Qty</th>
                  <th className="text-right p-3 font-medium text-gray-600">Value</th>
                  <th className="text-left p-3 font-medium text-gray-600">Reason</th>
                  <th className="text-left p-3 font-medium text-gray-600">Voided By</th>
                  <th className="text-left p-3 font-medium text-gray-600">Authorized By</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={8} className="p-8 text-center text-gray-400">Loading...</td></tr>
                ) : entries.length === 0 ? (
                  <tr><td colSpan={8} className="p-8 text-center text-gray-400">No void records found</td></tr>
                ) : (
                  entries.map((entry: VoidLogEntry) => {
                    const severity = getSeverity(entry)
                    const value = entry.unit_price * entry.quantity
                    return (
                      <tr key={entry.id} className="border-b hover:bg-gray-50">
                        <td className="p-3 text-gray-500 whitespace-nowrap">
                          <Calendar className="w-3 h-3 inline mr-1" />
                          {formatDate(entry.created_at)}
                        </td>
                        <td className="p-3 font-mono text-xs">{entry.order_number || '—'}</td>
                        <td className="p-3 font-medium text-gray-900">{entry.item_name}</td>
                        <td className="p-3 text-right">{entry.quantity}</td>
                        <td className="p-3 text-right">
                          <span className={`font-semibold ${
                            severity === 'high' ? 'text-red-600' : severity === 'medium' ? 'text-yellow-600' : 'text-gray-700'
                          }`}>
                            {formatCurrency(value)}
                          </span>
                        </td>
                        <td className="p-3">
                          {entry.reason ? (
                            <Badge variant="outline" className="text-xs">{entry.reason}</Badge>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="p-3 text-gray-600">{entry.voided_by_name || '—'}</td>
                        <td className="p-3 text-gray-600">{entry.authorized_name || '—'}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {meta.total_pages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t mt-4">
              <span className="text-sm text-gray-500">
                Page {meta.current_page} of {meta.total_pages}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= meta.total_pages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
