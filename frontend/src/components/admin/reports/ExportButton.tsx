import { useState } from 'react'
import { Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import apiClient from '@/api/client'
import { useToast } from '@/hooks/use-toast'
import { formatDateDDMMYYYY } from '@/lib/utils'
import type { ReportsExportId } from '@/types'

interface ExportButtonProps {
  report: ReportsExportId
  reportLabel: string
  fromISO: string
  toISO: string
  /** Optional extra params to pass through to the CSV exporter (e.g. items
   *  search/category for the Items tab). */
  extraParams?: Record<string, string>
  /**
   * Optional handler invoked when the user picks "Print PDF". The owning tab
   * should open a print-friendly view of its current data — keeping the
   * backend dependency-free while letting the user save as PDF from the
   * native browser print dialog.
   */
  onPrintPdf?: () => void
  size?: 'sm' | 'default'
  variant?: 'outline' | 'default' | 'ghost' | 'secondary'
}

/**
 * Re-usable Export button for any report tab. CSV downloads stream from the
 * backend; PDF goes through the browser's native print dialog (the calling
 * tab decides what to render in the print window).
 */
export function ExportButton({
  report,
  reportLabel,
  fromISO,
  toISO,
  extraParams,
  onPrintPdf,
  size = 'sm',
  variant = 'outline',
}: ExportButtonProps) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)

  const handleCsv = async () => {
    setBusy(true)
    try {
      await apiClient.exportReportCsv(report, fromISO, toISO, extraParams ?? {})
      toast({
        title: 'CSV downloaded',
        description: `${reportLabel} • ${formatDateDDMMYYYY(fromISO)} → ${formatDateDDMMYYYY(toISO)}`,
      })
    } catch (e) {
      toast({
        title: 'Export failed',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} disabled={busy} className="gap-2">
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs">Export {reportLabel}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleCsv}>
          <FileSpreadsheet className="w-4 h-4 mr-2" />
          CSV file
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onPrintPdf?.()}
          disabled={!onPrintPdf}
        >
          <FileText className="w-4 h-4 mr-2" />
          Print / Save as PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
