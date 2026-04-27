import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { QRCodeSVG } from 'qrcode.react'
import { Loader2, RefreshCw, FileText } from 'lucide-react'
import apiClient from '@/api/client'
import { useToast } from '@/hooks/use-toast'
import { format } from 'date-fns'
import type { FiscalAuditRow, FiscalDetails } from '@/types'

export function AdminFiscalAudit() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { data: rows, isLoading } = useQuery({
    queryKey: ['fiscal', 'audit'],
    queryFn: () => apiClient.getFiscalAudit().then((r) => r.data ?? []),
  })

  const [viewId, setViewId] = useState<string | null>(null)
  const { data: viewData } = useQuery({
    queryKey: ['fiscal', 'order', viewId],
    queryFn: () => apiClient.getFiscalOrder(viewId!).then((r) => r.data!),
    enabled: Boolean(viewId),
  })

  const retryMut = useMutation({
    mutationFn: (id: string) => apiClient.postFiscalRetry(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['fiscal', 'audit'] })
      if (viewId === id) queryClient.invalidateQueries({ queryKey: ['fiscal', 'order', id] })
      toast({ title: 'Retry queued', description: 'Fiscal sync will run in the background.' })
    },
    onError: (e: Error) => toast({ title: 'Retry failed', description: e.message, variant: 'destructive' }),
  })

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Fiscal audit log</h1>
        <p className="text-muted-foreground text-sm mt-1">Completed orders and fiscal sync status (FBR/PRA/mock).</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent completed orders</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['fiscal', 'audit'] })}
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-8">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading…
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                  <TableHead>Authority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[200px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rows as FiscalAuditRow[] | undefined)?.map((r) => (
                  <TableRow key={r.order_id}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {r.completed_at
                        ? format(new Date(r.completed_at), 'yyyy-MM-dd HH:mm')
                        : '—'}
                    </TableCell>
                    <TableCell className="font-mono">#{r.order_number}</TableCell>
                    <TableCell className="text-right">{r.total_amount?.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{r.tax_amount?.toFixed(2)}</TableCell>
                    <TableCell>{r.authority || '—'}</TableCell>
                    <TableCell>{r.status || '—'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Button type="button" size="sm" variant="secondary" onClick={() => setViewId(r.order_id)}>
                          <FileText className="w-3.5 h-3.5 mr-1" />
                          View
                        </Button>
                        {(r.status === 'PENDING' || r.status === 'FAILED') && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => retryMut.mutate(r.order_id)}
                            disabled={retryMut.isPending}
                          >
                            Retry
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={viewId !== null} onOpenChange={(o) => !o && setViewId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fiscal copy</DialogTitle>
            <DialogDescription>Order {viewData?.order_number}</DialogDescription>
          </DialogHeader>
          {viewData && (
            <FiscalView fd={viewData.fiscal_details} total={viewData.total_amount} tax={viewData.tax_amount} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FiscalView({
  fd,
  total,
  tax,
}: {
  fd: FiscalDetails | undefined
  total: number
  tax: number
}) {
  if (!fd || !fd.status) {
    return <p className="text-sm text-muted-foreground">No fiscal data yet (pending first sync).</p>
  }
  return (
    <div className="space-y-3 text-sm">
      <p>
        <span className="text-muted-foreground">Status:</span> {fd.status}
      </p>
      <p>
        <span className="text-muted-foreground">Total / Tax:</span> {total.toFixed(2)} / {tax.toFixed(2)}
      </p>
      {fd.irn && (
        <p className="font-mono break-all">
          <span className="text-muted-foreground">IRN:</span> {fd.irn}
        </p>
      )}
      {fd.error_log && <p className="text-destructive text-xs">{fd.error_log}</p>}
      {fd.qr_code_value && (
        <div className="flex flex-col items-center gap-2 pt-2">
          <QRCodeSVG value={fd.qr_code_value} size={200} level="M" includeMargin />
        </div>
      )}
    </div>
  )
}
