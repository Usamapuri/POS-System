import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, Save, Shield } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import apiClient from '@/api/client'
import { useToast } from '@/hooks/use-toast'
import type { FiscalTestConnectionResult } from '@/types'

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-2">
      <h2 className="text-3xl font-bold tracking-tight">{title}</h2>
      <p className="text-muted-foreground mt-1">{description}</p>
    </div>
  )
}

export function FiscalSettingsPanel() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['fiscal', 'config'],
    queryFn: () => apiClient.getFiscalConfig().then((r) => r.data!),
  })

  const [authority, setAuthority] = useState('NONE')
  const [posId, setPosId] = useState('')
  const [ntn, setNtn] = useState('')
  const [isSandbox, setIsSandbox] = useState(true)
  const [strn, setStrn] = useState('')
  const [pntn, setPntn] = useState('')
  const [posReg, setPosReg] = useState('')
  const [sfdUrl, setSfdUrl] = useState('http://localhost:16701')
  const [apiKey, setApiKey] = useState('')

  useEffect(() => {
    if (!data) return
    setAuthority(data.authority || 'NONE')
    setPosId(data.pos_id || '')
    setNtn(data.ntn || '')
    setIsSandbox(data.is_sandbox !== false)
    setStrn(data.strn || '')
    setPntn(data.pntn || '')
    setPosReg(data.pos_registration_number || '')
    setSfdUrl(data.sfd_proxy_url || 'http://localhost:16701')
    setApiKey('')
  }, [data])

  const saveMut = useMutation({
    mutationFn: () =>
      apiClient.putFiscalConfig({
        authority,
        pos_id: posId,
        ntn,
        is_sandbox: isSandbox,
        strn: authority === 'FBR' ? strn : undefined,
        pntn: authority === 'PRA' ? pntn : undefined,
        pos_registration_number: authority === 'PRA' ? posReg : undefined,
        sfd_proxy_url: authority === 'PRA' ? sfdUrl : undefined,
        ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiscal', 'config'] })
      toast({ title: 'Saved', description: 'Fiscal configuration updated.' })
    },
    onError: (e: Error) => toast({ title: 'Save failed', description: e.message, variant: 'destructive' }),
  })

  const [testOpen, setTestOpen] = useState(false)
  const [testResult, setTestResult] = useState<FiscalTestConnectionResult | null>(null)
  const testMut = useMutation({
    mutationFn: () => apiClient.postFiscalTestConnection({ authority: authority || undefined }),
    onSuccess: (res) => {
      if (res.data) {
        setTestResult(res.data)
        setTestOpen(true)
        if (res.data.error) {
          toast({ title: 'Test connection', description: res.data.error, variant: 'destructive' })
        }
      }
    },
    onError: (e: Error) => toast({ title: 'Test failed', description: e.message, variant: 'destructive' }),
  })

  if (isLoading && !data) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading fiscal settings…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Tax & fiscal compliance"
        description="Configure FBR (Islamabad) or PRA (Punjab) digital fiscal reporting. When sandbox is on, completed orders use a mock IRN/QR; use Test connection to hit real test endpoints from this screen."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Authority & credentials
          </CardTitle>
          <CardDescription>Changes apply to new fiscal syncs after you save. Set FISCAL_SECRETS_KEY on the server to encrypt API keys at rest.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Authority</Label>
            <Select value={authority} onValueChange={setAuthority}>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">None (mock only)</SelectItem>
                <SelectItem value="FBR">FBR (Federal)</SelectItem>
                <SelectItem value="PRA">PRA (Punjab SFD)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Sandbox mode (automatic sync)</p>
              <p className="text-xs text-muted-foreground">When on, the POS uses mock IRN/QR for completed orders. Use the test button below to try live HTTP to your configured endpoints.</p>
            </div>
            <Switch checked={isSandbox} onCheckedChange={setIsSandbox} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>NTN / Tax ID</Label>
              <Input value={ntn} onChange={(e) => setNtn(e.target.value)} placeholder="1234567-8" />
            </div>
            <div className="space-y-2">
              <Label>{authority === 'PRA' ? 'POS / Terminal ID' : 'POS ID'}</Label>
              <Input value={posId} onChange={(e) => setPosId(e.target.value)} placeholder="POS registration" />
            </div>
          </div>

          {authority === 'FBR' && (
            <div className="space-y-2">
              <Label>STRN (Sales tax registration)</Label>
              <Input value={strn} onChange={(e) => setStrn(e.target.value)} />
            </div>
          )}

          {authority === 'PRA' && (
            <>
              <div className="space-y-2">
                <Label>PNTN (if different from NTN, optional)</Label>
                <Input value={pntn} onChange={(e) => setPntn(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>POS registration number</Label>
                <Input value={posReg} onChange={(e) => setPosReg(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>SFD proxy URL</Label>
                <Input value={sfdUrl} onChange={(e) => setSfdUrl(e.target.value)} placeholder="http://localhost:16701" />
              </div>
            </>
          )}

          {(authority === 'FBR' || authority === 'PRA') && (
            <div className="space-y-2">
              <Label>API token / access code (leave blank to keep stored secret)</Label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
                placeholder={data?.api_key_set ? '••••' + (data.api_key_masked || '') : 'Paste new token to save'}
              />
            </div>
          )}

          <div className="space-y-2 pt-2">
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
                {saveMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save fiscal settings
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => testMut.mutate()}
                disabled={testMut.isPending || authority === 'NONE'}
              >
                {testMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Test sandbox connection
              </Button>
            </div>
            <p className="text-xs text-muted-foreground max-w-prose">
              Per-order fiscal sync status and PRA print state are in{' '}
              <strong>View Reports</strong> → <strong>Orders Browser</strong>.
            </p>
          </div>
        </CardContent>
      </Card>

      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Test result</DialogTitle>
            <DialogDescription>Dummy 1.00 PKR sale — verify QR and IRN with your authority.</DialogDescription>
          </DialogHeader>
          {testResult && (
            <div className="space-y-3">
              {testResult.error && <p className="text-sm text-destructive">{testResult.error}</p>}
              {testResult.irn && <p className="text-sm font-mono">IRN: {testResult.irn}</p>}
              {testResult.qr_code_value && (
                <div className="flex flex-col items-center gap-2 p-4 border rounded-md bg-background">
                  <p className="text-xs text-muted-foreground">QR (mock receipt)</p>
                  <QRCodeSVG value={testResult.qr_code_value} size={180} level="M" includeMargin />
                  <p className="text-[10px] break-all text-muted-foreground max-w-full">{testResult.qr_code_value}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
