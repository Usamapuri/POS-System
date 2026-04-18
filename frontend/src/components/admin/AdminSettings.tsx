import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Globe,
  DollarSign,
  Printer,
  Save,
  UtensilsCrossed,
  Check,
  Moon,
  Sun,
  Monitor,
  Palette,
  Loader2,
} from 'lucide-react'
import apiClient from '@/api/client'
import { useToast } from '@/hooks/use-toast'
import { useTheme } from '@/contexts/ThemeContext'
import { DEFAULT_DISPLAY_CURRENCY, parseCurrencyFromSettings, setDisplayCurrency } from '@/lib/currency'

interface OrderTypeConfig {
  id: string
  label: string
  enabled: boolean
}

type SettingsSection = 'general' | 'financial' | 'receipt' | 'order-types' | 'appearance'

const NAV_ITEMS: { id: SettingsSection; label: string; icon: typeof Globe; description: string }[] = [
  { id: 'general', label: 'General', icon: Globe, description: 'Restaurant name and currency' },
  { id: 'financial', label: 'Financial', icon: DollarSign, description: 'Tax rates and service charges' },
  { id: 'receipt', label: 'Receipt & Printing', icon: Printer, description: 'Receipt branding and layout' },
  { id: 'order-types', label: 'Order Types', icon: UtensilsCrossed, description: 'Manage available order types' },
  { id: 'appearance', label: 'Appearance', icon: Palette, description: 'Theme and display preferences' },
]

export function AdminSettings() {
  const [activeSection, setActiveSection] = useState<SettingsSection>('general')

  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { theme, setTheme } = useTheme()

  // ── Global settings query ──
  const { data: allSettingsRes } = useQuery({
    queryKey: ['settings', 'all'],
    queryFn: () => apiClient.getAllSettings(),
  })

  // ── General ──
  const [restaurantName, setRestaurantName] = useState('')
  const [currency, setCurrency] = useState(DEFAULT_DISPLAY_CURRENCY)

  useEffect(() => {
    const d = allSettingsRes?.data as Record<string, unknown> | undefined
    if (!d) return
    if (typeof d.restaurant_name === 'string') setRestaurantName(d.restaurant_name)
    setCurrency(parseCurrencyFromSettings(d.currency) ?? DEFAULT_DISPLAY_CURRENCY)
  }, [allSettingsRes])

  const saveGeneralMutation = useMutation({
    mutationFn: async () => {
      await apiClient.updateSetting('restaurant_name', restaurantName)
      await apiClient.updateSetting('currency', currency)
    },
    onSuccess: () => {
      setDisplayCurrency(currency)
      queryClient.invalidateQueries({ queryKey: ['settings', 'all'] })
      toast({ title: 'Settings saved', description: 'General settings updated.' })
    },
    onError: (e: unknown) => {
      toast({ title: 'Save failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    },
  })

  // ── Financial ──
  const [checkoutRates, setCheckoutRates] = useState({
    tax_cash_pct: '15',
    tax_card_pct: '5',
    tax_online_pct: '15',
    service_pct: '10',
  })

  useEffect(() => {
    const d = allSettingsRes?.data as Record<string, unknown> | undefined
    if (!d) return
    const num = (k: string, fallback: string) => {
      const v = d[k]
      if (typeof v === 'number') return String(Math.round(v * 10000) / 100)
      return fallback
    }
    setCheckoutRates({
      tax_cash_pct: num('tax_rate_cash', '15'),
      tax_card_pct: num('tax_rate_card', '5'),
      tax_online_pct: num('tax_rate_online', '15'),
      service_pct: num('service_charge_rate', '10'),
    })
  }, [allSettingsRes])

  const saveCheckoutRates = useMutation({
    mutationFn: async () => {
      const toFrac = (s: string) => parseFloat(s) / 100
      await apiClient.updateSetting('tax_rate_cash', toFrac(checkoutRates.tax_cash_pct))
      await apiClient.updateSetting('tax_rate_card', toFrac(checkoutRates.tax_card_pct))
      await apiClient.updateSetting('tax_rate_online', toFrac(checkoutRates.tax_online_pct))
      await apiClient.updateSetting('service_charge_rate', toFrac(checkoutRates.service_pct))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'all'] })
      queryClient.invalidateQueries({ queryKey: ['counterPricing'] })
      toast({ title: 'Settings saved', description: 'Tax and service rates updated.' })
    },
    onError: (e: unknown) => {
      toast({ title: 'Save failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    },
  })

  // ── Receipt ──
  const [customerReceipt, setCustomerReceipt] = useState({
    business_name: '',
    address: '',
    ntn: '',
    pos_number: '',
    logo_url: '',
    logo_width_percent: '75',
  })

  useEffect(() => {
    const d = allSettingsRes?.data as Record<string, unknown> | undefined
    if (!d) return
    const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '')
    setCustomerReceipt({
      business_name: str('receipt_business_name') || (typeof d.restaurant_name === 'string' ? d.restaurant_name : ''),
      address: str('receipt_address'),
      ntn: str('receipt_ntn'),
      pos_number: str('receipt_pos_number'),
      logo_url: str('receipt_logo_url'),
      logo_width_percent:
        typeof d.receipt_logo_width_percent === 'number'
          ? String(Math.round(d.receipt_logo_width_percent))
          : str('receipt_logo_width_percent') || '75',
    })
  }, [allSettingsRes])

  const saveCustomerReceipt = useMutation({
    mutationFn: async () => {
      const logoWidth = Math.min(80, Math.max(70, Number(customerReceipt.logo_width_percent || '75') || 75))
      await apiClient.updateSetting('receipt_business_name', customerReceipt.business_name)
      await apiClient.updateSetting('receipt_address', customerReceipt.address)
      await apiClient.updateSetting('receipt_ntn', customerReceipt.ntn)
      await apiClient.updateSetting('receipt_pos_number', customerReceipt.pos_number)
      await apiClient.updateSetting('receipt_logo_url', customerReceipt.logo_url)
      await apiClient.updateSetting('receipt_logo_width_percent', logoWidth)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'all'] })
      toast({ title: 'Settings saved', description: 'Receipt branding updated.' })
    },
    onError: (e: unknown) => {
      toast({ title: 'Save failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    },
  })

  // ── Order Types ──
  // Fixed, non-extensible list of supported order types. Only these three are
  // wired through the Counter/Checkout UI and backend guard; custom types are
  // intentionally not supported here.
  const BUILT_IN_ORDER_TYPES: readonly OrderTypeConfig[] = [
    { id: 'dine_in', label: 'Dine In', enabled: true },
    { id: 'takeout', label: 'Takeaway', enabled: true },
    { id: 'delivery', label: 'Delivery', enabled: true },
  ] as const

  const { data: orderTypes = [] } = useQuery<OrderTypeConfig[]>({
    queryKey: ['settings', 'enabled_order_types'],
    queryFn: async () => {
      const res = await apiClient.getSetting('enabled_order_types')
      return res.success && res.data ? res.data : []
    },
  })

  const [localOrderTypes, setLocalOrderTypes] = useState<OrderTypeConfig[]>(
    BUILT_IN_ORDER_TYPES.map((t) => ({ ...t }))
  )

  // Normalize whatever is persisted down to exactly the three built-in rows,
  // preserving each one's enabled state from the DB when present. Any legacy
  // custom types (e.g. old "foodpanda") are dropped so the setting stays
  // consistent with what the UI actually manages.
  useEffect(() => {
    const byId = new Map(orderTypes.map((t) => [t.id, t]))
    const normalized: OrderTypeConfig[] = BUILT_IN_ORDER_TYPES.map((defn) => {
      const existing = byId.get(defn.id)
      return existing
        ? { ...defn, enabled: existing.enabled, label: existing.label || defn.label }
        : { ...defn }
    })
    setLocalOrderTypes(normalized)
  }, [orderTypes])

  const saveOrderTypesMutation = useMutation({
    mutationFn: async (types: OrderTypeConfig[]) => apiClient.updateSetting('enabled_order_types', types),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'enabled_order_types'] }),
  })

  const toggleOrderType = (id: string) => {
    const updated = localOrderTypes.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t))
    setLocalOrderTypes(updated)
    saveOrderTypesMutation.mutate(updated)
  }

  // ── Section renderers ──

  const renderGeneral = () => (
    <div className="space-y-6">
      <SectionHeader
        title="General"
        description="Core restaurant identity and regional preferences."
      />
      <Card>
        <CardContent className="pt-6 space-y-5">
          <FieldGroup label="Restaurant Name" hint="Displayed across the POS system and receipts.">
            <Input
              value={restaurantName}
              onChange={(e) => setRestaurantName(e.target.value)}
              placeholder="Enter restaurant name"
            />
          </FieldGroup>

          <FieldGroup label="Currency" hint="The currency used across menus, orders, and receipts.">
            <select
              className="w-full h-10 px-3 border border-input rounded-md bg-background text-sm"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option value="PKR">PKR (Rs.)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (&euro;)</option>
              <option value="GBP">GBP (&pound;)</option>
            </select>
          </FieldGroup>

          <div className="flex justify-end pt-2">
            <Button onClick={() => saveGeneralMutation.mutate()} disabled={saveGeneralMutation.isPending}>
              {saveGeneralMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save General Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )

  const renderFinancial = () => (
    <div className="space-y-6">
      <SectionHeader
        title="Financial"
        description="Tax rates and service charges applied during checkout. These values are used across all counter and payment flows."
      />
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Tax Rates</CardTitle>
          <CardDescription>
            Rates are stored as fractions internally. Enter percentages below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FieldGroup label="Cash Tax (%)">
              <Input
                type="number"
                step="0.01"
                value={checkoutRates.tax_cash_pct}
                onChange={(e) => setCheckoutRates({ ...checkoutRates, tax_cash_pct: e.target.value })}
              />
            </FieldGroup>
            <FieldGroup label="Card Tax (%)">
              <Input
                type="number"
                step="0.01"
                value={checkoutRates.tax_card_pct}
                onChange={(e) => setCheckoutRates({ ...checkoutRates, tax_card_pct: e.target.value })}
              />
            </FieldGroup>
            <FieldGroup label="Online Tax (%)">
              <Input
                type="number"
                step="0.01"
                value={checkoutRates.tax_online_pct}
                onChange={(e) => setCheckoutRates({ ...checkoutRates, tax_online_pct: e.target.value })}
              />
            </FieldGroup>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Service Charge</CardTitle>
          <CardDescription>Applied to all orders during checkout.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <FieldGroup label="Service Charge (%)">
            <Input
              type="number"
              step="0.01"
              className="max-w-xs"
              value={checkoutRates.service_pct}
              onChange={(e) => setCheckoutRates({ ...checkoutRates, service_pct: e.target.value })}
            />
          </FieldGroup>

          <div className="flex justify-end pt-2">
            <Button onClick={() => saveCheckoutRates.mutate()} disabled={saveCheckoutRates.isPending}>
              {saveCheckoutRates.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save Financial Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )

  const renderReceipt = () => (
    <div className="space-y-6">
      <SectionHeader
        title="Receipt & Printing"
        description="Customize the thermal receipt printed after payment. Invoice number, payment mode, and cashier name are added automatically."
      />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Card className="lg:col-span-3">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Business Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FieldGroup label="Business Name" hint="Printed as the receipt header.">
              <Input
                value={customerReceipt.business_name}
                onChange={(e) => setCustomerReceipt({ ...customerReceipt, business_name: e.target.value })}
                placeholder="e.g. chaayé khana"
              />
            </FieldGroup>

            <FieldGroup label="Address" hint="Street, area, city (multiple lines OK).">
              <Textarea
                rows={3}
                value={customerReceipt.address}
                onChange={(e) => setCustomerReceipt({ ...customerReceipt, address: e.target.value })}
                placeholder="Street, area, city"
                className="resize-y min-h-[72px]"
              />
            </FieldGroup>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FieldGroup label="NTN / STRN">
                <Input
                  value={customerReceipt.ntn}
                  onChange={(e) => setCustomerReceipt({ ...customerReceipt, ntn: e.target.value })}
                  placeholder="Tax registration"
                />
              </FieldGroup>
              <FieldGroup label="POS / Counter Number">
                <Input
                  value={customerReceipt.pos_number}
                  onChange={(e) => setCustomerReceipt({ ...customerReceipt, pos_number: e.target.value })}
                  placeholder="e.g. 176709"
                />
              </FieldGroup>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FieldGroup label="Logo URL" hint="Public URL (PNG/SVG). Prints above business name.">
                <Input
                  value={customerReceipt.logo_url}
                  onChange={(e) => setCustomerReceipt({ ...customerReceipt, logo_url: e.target.value })}
                  placeholder="https://yourcdn.com/logo.png"
                />
              </FieldGroup>
              <FieldGroup label="Logo Width (%)" hint="Recommended: 70 to 80.">
                <Input
                  type="number"
                  min={70}
                  max={80}
                  value={customerReceipt.logo_width_percent}
                  onChange={(e) => setCustomerReceipt({ ...customerReceipt, logo_width_percent: e.target.value })}
                  placeholder="75"
                />
              </FieldGroup>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={() => saveCustomerReceipt.mutate()} disabled={saveCustomerReceipt.isPending}>
                {saveCustomerReceipt.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save Receipt Settings
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Preview</CardTitle>
            <CardDescription>Live preview of the receipt header.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
              <div className="mx-auto w-full max-w-[240px] bg-background border border-border rounded-md px-4 py-3 text-center shadow-sm">
                {customerReceipt.logo_url && (
                  <img
                    src={customerReceipt.logo_url}
                    alt="Receipt logo preview"
                    className="mx-auto mb-2 h-12 max-w-full object-contain"
                    style={{ width: `${Math.min(80, Math.max(70, Number(customerReceipt.logo_width_percent) || 75))}%` }}
                  />
                )}
                <div className="text-sm font-semibold">
                  {customerReceipt.business_name || 'Business name'}
                </div>
                {customerReceipt.address && (
                  <div className="text-[11px] text-muted-foreground whitespace-pre-line mt-0.5">{customerReceipt.address}</div>
                )}
                {customerReceipt.ntn && (
                  <div className="text-[11px] text-muted-foreground mt-0.5">NTN / STRN: {customerReceipt.ntn}</div>
                )}
                {customerReceipt.pos_number && (
                  <div className="text-[11px] text-muted-foreground mt-0.5">POS #: {customerReceipt.pos_number}</div>
                )}
                <div className="mt-2 border-t border-dashed border-border pt-2">
                  <div className="text-[10px] text-muted-foreground">INV-000001 &middot; Cash &middot; 12:00 PM</div>
                  <div className="text-[10px] text-muted-foreground">Cashier: Admin</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )

  const renderOrderTypes = () => (
    <div className="space-y-6">
      <SectionHeader
        title="Order Types"
        description="Control which order types are available in the POS interface. Only enabled types will appear for servers and counter staff."
      />
      <Card>
        <CardContent className="pt-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {localOrderTypes.map((type) => (
              <button
                key={type.id}
                onClick={() => toggleOrderType(type.id)}
                className={`group relative p-4 rounded-lg border-2 text-left transition-all ${
                  type.enabled
                    ? 'border-primary/40 bg-primary/5 hover:border-primary/60'
                    : 'border-muted bg-muted/30 opacity-70 hover:opacity-90'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-medium text-sm">{type.label}</span>
                  {type.enabled && (
                    <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                      <Check className="w-3 h-3 text-primary-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={type.enabled ? 'default' : 'secondary'} className="text-xs">
                    {type.enabled ? 'Active' : 'Disabled'}
                  </Badge>
                  <span className="text-xs text-muted-foreground font-mono">{type.id}</span>
                </div>
              </button>
            ))}
          </div>

          {saveOrderTypesMutation.isPending && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              Saving...
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )

  const renderAppearance = () => (
    <div className="space-y-6">
      <SectionHeader
        title="Appearance"
        description="Customize the visual look and feel of the POS interface."
      />
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Theme</CardTitle>
          <CardDescription>Choose how the application looks across all screens.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 max-w-md">
            {([
              { value: 'light' as const, label: 'Light', icon: Sun, desc: 'Bright background' },
              { value: 'dark' as const, label: 'Dark', icon: Moon, desc: 'Dark background' },
              { value: 'system' as const, label: 'System', icon: Monitor, desc: 'Match OS setting' },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  setTheme(opt.value)
                  toast({ title: 'Theme updated', description: `Switched to ${opt.label.toLowerCase()} mode.` })
                }}
                className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                  theme === opt.value
                    ? 'border-primary bg-primary/5'
                    : 'border-muted hover:border-muted-foreground/30'
                }`}
              >
                <opt.icon className={`w-5 h-5 ${theme === opt.value ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className={`text-sm font-medium ${theme === opt.value ? 'text-primary' : ''}`}>{opt.label}</span>
                <span className="text-[11px] text-muted-foreground leading-tight">{opt.desc}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )

  const sectionRenderers: Record<SettingsSection, () => JSX.Element> = {
    general: renderGeneral,
    financial: renderFinancial,
    receipt: renderReceipt,
    'order-types': renderOrderTypes,
    appearance: renderAppearance,
  }

  return (
    <div className="flex h-full min-h-0 w-full">
      {/* Sidebar navigation */}
      <nav className="hidden md:flex w-56 shrink-0 flex-col border-r border-border bg-muted/30 p-4 overflow-y-auto">
        <h2 className="text-lg font-semibold tracking-tight mb-1 px-2">Settings</h2>
        <p className="text-xs text-muted-foreground mb-4 px-2">Manage your POS configuration</p>
        <div className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = activeSection === item.id
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-background text-foreground font-medium shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/60'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {item.label}
              </button>
            )
          })}
        </div>
      </nav>

      {/* Mobile nav (horizontal scroll) */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-20 bg-background border-b border-border px-3 py-2 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = activeSection === item.id
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content panel */}
      <main className="flex-1 overflow-y-auto p-6 md:p-8 md:pt-6 mt-12 md:mt-0">
        <div className="max-w-3xl">
          {sectionRenderers[activeSection]()}
        </div>
      </main>
    </div>
  )
}

// ── Shared sub-components ──

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-2">
      <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1">{description}</p>
    </div>
  )
}

function FieldGroup({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="text-sm font-medium mb-1.5 block">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
