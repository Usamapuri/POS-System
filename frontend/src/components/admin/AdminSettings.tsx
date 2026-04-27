import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
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
  Upload,
  Trash2,
  Plus,
  ArrowUp,
  ArrowDown,
  Image as ImageIcon,
  Link2,
  ChefHat,
  AlertTriangle,
  Info,
  FileText,
  Shield,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { KITCHEN_SETTINGS_QUERY_KEY } from '@/hooks/useKitchenSettings'
import type { KitchenStation } from '@/types'
import apiClient from '@/api/client'
import { useToast } from '@/hooks/use-toast'
import { useTheme } from '@/contexts/ThemeContext'
import { DEFAULT_DISPLAY_CURRENCY, parseCurrencyFromSettings, setDisplayCurrency } from '@/lib/currency'
import { ReceiptPreview } from '@/components/admin/ReceiptPreview'
import { FiscalSettingsPanel } from '@/components/admin/FiscalSettingsPanel'
import { parseReceiptSettings, type ReceiptCustomField } from '@/lib/printCustomerReceipt'

interface OrderTypeConfig {
  id: string
  label: string
  enabled: boolean
  /** When false, the global service charge % is not applied for this type at checkout. */
  include_service_charge?: boolean
  /** Flat per-order delivery fee; only used when id is `delivery`. */
  delivery_fee?: number
}

type SettingsSection = 'general' | 'financial' | 'receipt' | 'fiscal' | 'pra' | 'order-types' | 'kitchen' | 'appearance'

const NAV_ITEMS: { id: SettingsSection; label: string; icon: typeof Globe; description: string }[] = [
  { id: 'general', label: 'General', icon: Globe, description: 'Restaurant name and currency' },
  { id: 'financial', label: 'Financial', icon: DollarSign, description: 'Tax rates and service charges' },
  { id: 'receipt', label: 'Receipt & Printing', icon: Printer, description: 'Receipt branding and layout' },
  { id: 'fiscal', label: 'Tax & Fiscal', icon: Shield, description: 'FBR/PRA digital reporting and credentials' },
  { id: 'pra', label: 'Tax Invoice Settings', icon: FileText, description: 'Printed tax slip, QR template, and reprints' },
  { id: 'order-types', label: 'Order Types', icon: UtensilsCrossed, description: 'Manage available order types' },
  { id: 'kitchen', label: 'Kitchen', icon: ChefHat, description: 'KDS mode and kitchen thresholds' },
  { id: 'appearance', label: 'Appearance', icon: Palette, description: 'Theme and display preferences' },
]

// Hybrid was previously exposed in the UI but was behaviorally identical to
// KDS in the backend. It has been removed; values persisted as 'hybrid' are
// migrated to 'kds' on load. The backend still parses the legacy alias for
// backward-compat with any existing rows.
type KitchenModeChoice = 'kds' | 'kot_only'

const KITCHEN_MODE_COPY: Record<KitchenModeChoice, { title: string; description: string }> = {
  kds: {
    title: 'KDS',
    description:
      'Digital kitchen display is primary. Stations configured as "KDS" send tickets to the screen; stations configured as "Printer" still print.',
  },
  kot_only: {
    title: 'KOT only',
    description:
      'No kitchen display. Every station is treated as a printer and KOTs print on fire. The /kitchen screens are hidden from staff.',
  },
}

export function AdminSettings() {
  const [activeSection, setActiveSection] = useState<SettingsSection>('general')

  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { theme, setTheme } = useTheme()
  const stationsErrorNotifiedRef = useRef(false)

  const getSettingsErrorMessage = (operation: string, error: unknown) => {
    const raw = error instanceof Error ? error.message : String(error)
    if (raw.toLowerCase().includes('insufficient_permissions')) {
      return `${operation} failed due to role permissions (${raw}).`
    }
    return `${operation} failed: ${raw}`
  }

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
      toast({
        title: 'Save failed',
        description: getSettingsErrorMessage('General settings save', e),
        variant: 'destructive',
      })
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
      toast({
        title: 'Save failed',
        description: getSettingsErrorMessage('Financial settings save', e),
        variant: 'destructive',
      })
    },
  })

  // ── Receipt ──
  type ReceiptFormState = {
    business_name: string
    address: string
    ntn: string
    pos_number: string
    logo_url: string
    logo_width_percent: string
    phone: string
    email: string
    website: string
    accent_color: string
    thank_you: string
    custom_fields: ReceiptCustomField[]
  }

  const EMPTY_RECEIPT_FORM: ReceiptFormState = {
    business_name: '',
    address: '',
    ntn: '',
    pos_number: '',
    logo_url: '',
    logo_width_percent: '75',
    phone: '',
    email: '',
    website: '',
    accent_color: '#111827',
    thank_you: 'Thank you for your visit!',
    custom_fields: [],
  }

  const [customerReceipt, setCustomerReceipt] = useState<ReceiptFormState>(EMPTY_RECEIPT_FORM)

  // ── Tax invoice (printed PRA-style slip) — see also Tax & Fiscal for digital sync ──
  // These live in the same `app_settings` key-value store under simple keys,
  // gated by `pra_invoice_enabled`. When disabled, the post-payment prompt
  // is never shown to cashiers.
  type PraFormState = {
    enabled: boolean
    qr_url_template: string
    footer_note: string
    /** Allow cashiers to reprint a PRA invoice after the order was completed. */
    late_print_enabled: boolean
    /**
     * Number of full days after the order's completion (or creation, if the
     * order has no completed_at) during which a non-admin user may still issue
     * a reprint. 0 = same business day only. Capped at 7 by the backend.
     */
    late_print_window_days: string
  }
  const EMPTY_PRA_FORM: PraFormState = {
    enabled: false,
    qr_url_template: '',
    footer_note: '',
    late_print_enabled: true,
    late_print_window_days: '7',
  }
  const [praForm, setPraForm] = useState<PraFormState>(EMPTY_PRA_FORM)

  useEffect(() => {
    const d = allSettingsRes?.data as Record<string, unknown> | undefined
    if (!d) return
    const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '')
    const parsedCustom = Array.isArray(d.receipt_custom_fields)
      ? (d.receipt_custom_fields as unknown[])
          .map((r, idx): ReceiptCustomField | null => {
            if (!r || typeof r !== 'object') return null
            const rec = r as Record<string, unknown>
            const label = typeof rec.label === 'string' ? rec.label : ''
            const value = typeof rec.value === 'string' ? rec.value : ''
            if (!label && !value) return null
            return {
              id: typeof rec.id === 'string' && rec.id ? rec.id : `cf-${Date.now()}-${idx}`,
              label,
              value,
              position: rec.position === 'header' ? 'header' : 'footer',
              style: rec.style === 'bold' || rec.style === 'muted' ? rec.style : 'normal',
            }
          })
          .filter((v): v is ReceiptCustomField => v !== null)
      : []
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
      phone: str('receipt_phone'),
      email: str('receipt_email'),
      website: str('receipt_website'),
      accent_color: /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(str('receipt_accent_color'))
        ? str('receipt_accent_color')
        : '#111827',
      thank_you: str('receipt_thank_you') || 'Thank you for your visit!',
      custom_fields: parsedCustom,
    })
    const lateEnabledRaw = d.pra_invoice_late_print_enabled
    const windowDaysRaw = d.pra_invoice_late_print_window_days
    setPraForm({
      enabled: d.pra_invoice_enabled === true,
      qr_url_template: str('pra_invoice_qr_url_template'),
      footer_note: str('pra_invoice_footer_note'),
      late_print_enabled: lateEnabledRaw === undefined ? true : lateEnabledRaw === true,
      late_print_window_days:
        typeof windowDaysRaw === 'number'
          ? String(Math.max(0, Math.min(7, Math.round(windowDaysRaw))))
          : '7',
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
      await apiClient.updateSetting('receipt_phone', customerReceipt.phone)
      await apiClient.updateSetting('receipt_email', customerReceipt.email)
      await apiClient.updateSetting('receipt_website', customerReceipt.website)
      await apiClient.updateSetting('receipt_accent_color', customerReceipt.accent_color)
      await apiClient.updateSetting('receipt_thank_you', customerReceipt.thank_you)
      await apiClient.updateSetting(
        'receipt_custom_fields',
        customerReceipt.custom_fields.map((f) => ({
          id: f.id,
          label: f.label,
          value: f.value,
          position: f.position,
          style: f.style ?? 'normal',
        })),
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'all'] })
      toast({ title: 'Settings saved', description: 'Receipt branding updated.' })
    },
    onError: (e: unknown) => {
      toast({
        title: 'Save failed',
        description: getSettingsErrorMessage('Receipt settings save', e),
        variant: 'destructive',
      })
    },
  })

  const savePraInvoice = useMutation({
    mutationFn: async () => {
      const days = Math.max(
        0,
        Math.min(7, Math.round(Number(praForm.late_print_window_days || '7') || 0)),
      )
      await apiClient.updateSetting('pra_invoice_enabled', praForm.enabled)
      await apiClient.updateSetting('pra_invoice_qr_url_template', praForm.qr_url_template.trim())
      await apiClient.updateSetting('pra_invoice_footer_note', praForm.footer_note.trim())
      await apiClient.updateSetting('pra_invoice_late_print_enabled', praForm.late_print_enabled)
      await apiClient.updateSetting('pra_invoice_late_print_window_days', days)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'all'] })
      toast({ title: 'Saved', description: 'Tax invoice settings updated.' })
    },
    onError: (e: unknown) => {
      toast({
        title: 'Save failed',
        description: getSettingsErrorMessage('Tax invoice settings save', e),
        variant: 'destructive',
      })
    },
  })

  // Custom fields helpers
  const addCustomField = (position: 'header' | 'footer') => {
    setCustomerReceipt((prev) => ({
      ...prev,
      custom_fields: [
        ...prev.custom_fields,
        { id: `cf-${Date.now()}`, label: '', value: '', position, style: 'normal' },
      ],
    }))
  }
  const updateCustomField = (id: string, patch: Partial<ReceiptCustomField>) => {
    setCustomerReceipt((prev) => ({
      ...prev,
      custom_fields: prev.custom_fields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }))
  }
  const removeCustomField = (id: string) => {
    setCustomerReceipt((prev) => ({
      ...prev,
      custom_fields: prev.custom_fields.filter((f) => f.id !== id),
    }))
  }
  const moveCustomField = (id: string, dir: -1 | 1) => {
    setCustomerReceipt((prev) => {
      const idx = prev.custom_fields.findIndex((f) => f.id === id)
      if (idx < 0) return prev
      const target = idx + dir
      if (target < 0 || target >= prev.custom_fields.length) return prev
      const next = [...prev.custom_fields]
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return { ...prev, custom_fields: next }
    })
  }

  // Logo uploader — downscale client-side to keep app_settings payload small.
  const logoFileInputRef = useRef<HTMLInputElement | null>(null)
  const handleLogoFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file', description: 'Please choose an image file (PNG, JPG, SVG).', variant: 'destructive' })
      return
    }
    try {
      const dataUrl = await resizeImageToDataUrl(file, 400, 0.92)
      setCustomerReceipt((p) => ({ ...p, logo_url: dataUrl }))
      toast({ title: 'Logo loaded', description: 'Preview updated. Click Save to persist.' })
    } catch (e) {
      toast({ title: 'Upload failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    }
  }

  // Derive a live CustomerReceiptSettings object for the preview that also
  // includes the current tax/service rates the admin is editing in-session.
  const previewSettings = useMemo(() => {
    const raw = (allSettingsRes?.data as Record<string, unknown> | undefined) ?? {}
    const toFrac = (s: string) => {
      const n = parseFloat(s)
      return Number.isFinite(n) ? n / 100 : 0
    }
    const merged: Record<string, unknown> = {
      ...raw,
      receipt_business_name: customerReceipt.business_name,
      receipt_address: customerReceipt.address,
      receipt_ntn: customerReceipt.ntn,
      receipt_pos_number: customerReceipt.pos_number,
      receipt_logo_url: customerReceipt.logo_url,
      receipt_logo_width_percent:
        Math.min(80, Math.max(70, Number(customerReceipt.logo_width_percent || '75') || 75)),
      receipt_phone: customerReceipt.phone,
      receipt_email: customerReceipt.email,
      receipt_website: customerReceipt.website,
      receipt_accent_color: customerReceipt.accent_color,
      receipt_thank_you: customerReceipt.thank_you,
      receipt_custom_fields: customerReceipt.custom_fields,
      tax_rate_cash: toFrac(checkoutRates.tax_cash_pct),
      tax_rate_card: toFrac(checkoutRates.tax_card_pct),
      tax_rate_online: toFrac(checkoutRates.tax_online_pct),
      service_charge_rate: toFrac(checkoutRates.service_pct),
    }
    return parseReceiptSettings(merged)
  }, [allSettingsRes, customerReceipt, checkoutRates])

  // ── Order Types ──
  // Fixed, non-extensible list of supported order types. Only these three are
  // wired through the Counter/Checkout UI and backend guard; custom types are
  // intentionally not supported here.
  const BUILT_IN_ORDER_TYPES: readonly OrderTypeConfig[] = [
    { id: 'dine_in', label: 'Dine In', enabled: true, include_service_charge: true, delivery_fee: 0 },
    { id: 'takeout', label: 'Takeaway', enabled: true, include_service_charge: true, delivery_fee: 0 },
    { id: 'delivery', label: 'Delivery', enabled: true, include_service_charge: true, delivery_fee: 0 },
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
      if (!existing) return { ...defn }
      const include =
        existing.include_service_charge === undefined || existing.include_service_charge === null
          ? true
          : Boolean(existing.include_service_charge)
      const dFee =
        typeof existing.delivery_fee === 'number' && !Number.isNaN(existing.delivery_fee)
          ? existing.delivery_fee
          : 0
      return {
        ...defn,
        enabled: existing.enabled,
        label: existing.label || defn.label,
        include_service_charge: include,
        delivery_fee: defn.id === 'delivery' ? dFee : 0,
      }
    })
    setLocalOrderTypes(normalized)
  }, [orderTypes])

  const saveOrderTypesMutation = useMutation({
    mutationFn: async (types: OrderTypeConfig[]) => apiClient.updateSetting('enabled_order_types', types),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'enabled_order_types'] }),
    onError: (e: unknown) => {
      toast({
        title: 'Save failed',
        description: getSettingsErrorMessage('Order types save', e),
        variant: 'destructive',
      })
    },
  })

  const [orderTypeModalId, setOrderTypeModalId] = useState<string | null>(null)
  const [otModalEnabled, setOtModalEnabled] = useState(true)
  const [otModalIncludeSvc, setOtModalIncludeSvc] = useState(true)
  const [otModalDeliveryFee, setOtModalDeliveryFee] = useState('0')

  const openOrderTypeModal = (id: string) => {
    const t = localOrderTypes.find((x) => x.id === id)
    if (!t) return
    setOrderTypeModalId(id)
    setOtModalEnabled(t.enabled)
    setOtModalIncludeSvc(t.include_service_charge !== false)
    setOtModalDeliveryFee(String(t.delivery_fee ?? 0))
  }

  const saveOrderTypeModal = () => {
    if (!orderTypeModalId) return
    const df =
      orderTypeModalId === 'delivery'
        ? Math.max(0, Number.parseFloat(otModalDeliveryFee.replace(/,/g, '')) || 0)
        : 0
    const updated = localOrderTypes.map((t) =>
      t.id === orderTypeModalId
        ? {
            ...t,
            enabled: otModalEnabled,
            include_service_charge: otModalIncludeSvc,
            delivery_fee: df,
          }
        : t
    )
    setLocalOrderTypes(updated)
    saveOrderTypesMutation.mutate(updated)
    setOrderTypeModalId(null)
  }

  // ── Kitchen ──
  const [kitchenForm, setKitchenForm] = useState({
    mode: 'kds' as KitchenModeChoice,
    urgencyMinutes: '15',
    staleMinutes: '120',
    recallWindowSeconds: '300',
  })

  useEffect(() => {
    const d = allSettingsRes?.data as Record<string, unknown> | undefined
    if (!d) return
    const modeRaw = typeof d['kitchen.mode'] === 'string' ? (d['kitchen.mode'] as string) : 'kds'
    // Migrate legacy 'hybrid' (now removed from the UI) to 'kds' since the
    // two were behaviorally identical server-side.
    const mode: KitchenModeChoice = modeRaw === 'kot_only' ? 'kot_only' : 'kds'
    const num = (k: string, fallback: string) => {
      const v = d[k]
      if (typeof v === 'number') return String(v)
      if (typeof v === 'string' && v.trim() !== '') return v
      return fallback
    }
    setKitchenForm({
      mode,
      urgencyMinutes: num('kitchen.urgency_minutes', '15'),
      staleMinutes: num('kitchen.stale_minutes', '120'),
      recallWindowSeconds: num('kitchen.recall_window_seconds', '300'),
    })
  }, [allSettingsRes])

  const { data: stationsRes, error: stationsError, isError: isStationsError } = useQuery({
    queryKey: ['admin', 'stations', 'list-for-settings'],
    queryFn: () => apiClient.getStations(),
    staleTime: 60_000,
  })
  useEffect(() => {
    if (!isStationsError) {
      stationsErrorNotifiedRef.current = false
      return
    }
    if (stationsErrorNotifiedRef.current) return
    stationsErrorNotifiedRef.current = true
    toast({
      title: 'Kitchen stations unavailable',
      description: getSettingsErrorMessage('Kitchen stations load', stationsError),
      variant: 'destructive',
    })
  }, [isStationsError, stationsError, toast])
  const stations = (stationsRes?.data ?? []) as KitchenStation[]
  const kdsStationCount = stations.filter((s) => s.is_active && s.output_type === 'kds').length
  const printerStationCount = stations.filter((s) => s.is_active && s.output_type === 'printer').length

  const saveKitchenMutation = useMutation({
    mutationFn: async () => {
      const urgency = Math.max(1, Math.min(240, Number(kitchenForm.urgencyMinutes) || 15))
      const stale = Math.max(15, Math.min(1440, Number(kitchenForm.staleMinutes) || 120))
      const recall = Math.max(0, Math.min(3600, Number(kitchenForm.recallWindowSeconds) || 300))
      await apiClient.updateSetting('kitchen.mode', kitchenForm.mode)
      await apiClient.updateSetting('kitchen.urgency_minutes', urgency)
      await apiClient.updateSetting('kitchen.stale_minutes', stale)
      await apiClient.updateSetting('kitchen.recall_window_seconds', recall)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'all'] })
      queryClient.invalidateQueries({ queryKey: KITCHEN_SETTINGS_QUERY_KEY })
      toast({ title: 'Settings saved', description: 'Kitchen configuration updated.' })
    },
    onError: (e: unknown) => {
      toast({
        title: 'Save failed',
        description: getSettingsErrorMessage('Kitchen settings save', e),
        variant: 'destructive',
      })
    },
  })

  // ── Section renderers ──

  const renderGeneral = () => (
    <div className="space-y-6">
      <SectionHeader
        title="General"
        description="Core restaurant identity and regional preferences"
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
        description="Tax rates and service charges applied during checkout. These values are used across all counter and payment flows"
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
          <CardDescription>Applied to all orders during checkout</CardDescription>
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

  const renderReceipt = () => {
    const headerFields = customerReceipt.custom_fields.filter((f) => f.position === 'header')
    const footerFields = customerReceipt.custom_fields.filter((f) => f.position === 'footer')

    return (
      <div className="space-y-6">
        <SectionHeader
          title="Receipt & Printing"
          description="Customize the thermal receipt printed after payment. Invoice number, date, time, payment mode, cashier, and server name are added automatically from each order"
        />

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          {/* ── Left column: editable settings ─────────────────────────── */}
          <div className="xl:col-span-3 space-y-6">
            {/* Brand */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" /> Brand
                </CardTitle>
                <CardDescription>Logo and business name printed at the top of every receipt</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FieldGroup label="Business Name" hint="Printed as the receipt header.">
                  <Input
                    value={customerReceipt.business_name}
                    onChange={(e) => setCustomerReceipt({ ...customerReceipt, business_name: e.target.value })}
                    placeholder="e.g. COVA Cafe"
                  />
                </FieldGroup>

                <FieldGroup label="Logo" hint="Upload an image (auto-resized) or paste a public URL.">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => logoFileInputRef.current?.click()}
                        className="gap-2"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Upload Image
                      </Button>
                      <input
                        ref={logoFileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) handleLogoFile(file)
                          e.target.value = ''
                        }}
                      />
                      {customerReceipt.logo_url && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setCustomerReceipt({ ...customerReceipt, logo_url: '' })}
                          className="gap-2 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Remove
                        </Button>
                      )}
                    </div>
                    <div className="relative">
                      <Link2 className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={customerReceipt.logo_url.startsWith('data:') ? '' : customerReceipt.logo_url}
                        onChange={(e) => setCustomerReceipt({ ...customerReceipt, logo_url: e.target.value })}
                        placeholder={customerReceipt.logo_url.startsWith('data:')
                          ? 'Using uploaded image (clear to switch to URL)'
                          : 'https://yourcdn.com/logo.png'}
                        className="pl-8"
                        disabled={customerReceipt.logo_url.startsWith('data:')}
                      />
                    </div>
                  </div>
                </FieldGroup>

                <FieldGroup label="Logo Width (%)" hint="Recommended: 70–80.">
                  <Input
                    type="number"
                    min={70}
                    max={80}
                    value={customerReceipt.logo_width_percent}
                    onChange={(e) => setCustomerReceipt({ ...customerReceipt, logo_width_percent: e.target.value })}
                    placeholder="75"
                    className="max-w-[140px]"
                  />
                </FieldGroup>
              </CardContent>
            </Card>

            {/* Contact */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Contact</CardTitle>
                <CardDescription>Address and reach-out details. All contact lines are optional</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FieldGroup label="Address" hint="Street, area, city (multiple lines OK).">
                  <Textarea
                    rows={3}
                    value={customerReceipt.address}
                    onChange={(e) => setCustomerReceipt({ ...customerReceipt, address: e.target.value })}
                    placeholder={'Street address\nArea, City'}
                    className="resize-y min-h-[72px]"
                  />
                </FieldGroup>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FieldGroup label="Phone">
                    <Input
                      value={customerReceipt.phone}
                      onChange={(e) => setCustomerReceipt({ ...customerReceipt, phone: e.target.value })}
                      placeholder="e.g. +92 300 1234567"
                    />
                  </FieldGroup>
                  <FieldGroup label="Email">
                    <Input
                      type="email"
                      value={customerReceipt.email}
                      onChange={(e) => setCustomerReceipt({ ...customerReceipt, email: e.target.value })}
                      placeholder="hello@yourrestaurant.com"
                    />
                  </FieldGroup>
                </div>
                <FieldGroup label="Website">
                  <Input
                    value={customerReceipt.website}
                    onChange={(e) => setCustomerReceipt({ ...customerReceipt, website: e.target.value })}
                    placeholder="www.yourrestaurant.com"
                  />
                </FieldGroup>
              </CardContent>
            </Card>

            {/* Legal / Tax */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Legal &amp; Tax</CardTitle>
                <CardDescription>Regulatory identifiers printed below the header</CardDescription>
              </CardHeader>
              <CardContent>
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
              </CardContent>
            </Card>

            {/* Custom lines */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Custom Lines</CardTitle>
                <CardDescription>
                  Add your own labeled lines — useful for tag lines, terms, promotions, or social handles.
                  Choose whether each line appears above the items (Header) or below the totals (Footer).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <CustomFieldsEditor
                  title="Header lines"
                  hint="Shown above the items table, right after NTN/STRN."
                  fields={headerFields}
                  allFields={customerReceipt.custom_fields}
                  onAdd={() => addCustomField('header')}
                  onUpdate={updateCustomField}
                  onRemove={removeCustomField}
                  onMove={moveCustomField}
                />
                <CustomFieldsEditor
                  title="Footer lines"
                  hint="Shown below the Payable row — great for 'Thank you' variants, FBR notes, or policy."
                  fields={footerFields}
                  allFields={customerReceipt.custom_fields}
                  onAdd={() => addCustomField('footer')}
                  onUpdate={updateCustomField}
                  onRemove={removeCustomField}
                  onMove={moveCustomField}
                />
              </CardContent>
            </Card>

            {/* Appearance */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Appearance</CardTitle>
                <CardDescription>Accent color and closing message</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FieldGroup label="Accent Color" hint="Used for section rules, business name, and Payable row.">
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={customerReceipt.accent_color}
                        onChange={(e) => setCustomerReceipt({ ...customerReceipt, accent_color: e.target.value })}
                        className="w-10 h-10 rounded border border-input cursor-pointer bg-transparent"
                        aria-label="Accent color"
                      />
                      <Input
                        value={customerReceipt.accent_color}
                        onChange={(e) => setCustomerReceipt({ ...customerReceipt, accent_color: e.target.value })}
                        placeholder="#111827"
                        className="font-mono uppercase"
                      />
                    </div>
                  </FieldGroup>
                  <FieldGroup label="Thank-You Message" hint="Shown just above the attribution footer.">
                    <Input
                      value={customerReceipt.thank_you}
                      onChange={(e) => setCustomerReceipt({ ...customerReceipt, thank_you: e.target.value })}
                      placeholder="Thank you for your visit!"
                    />
                  </FieldGroup>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button
                size="lg"
                onClick={() => saveCustomerReceipt.mutate()}
                disabled={saveCustomerReceipt.isPending}
              >
                {saveCustomerReceipt.isPending
                  ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  : <Save className="w-4 h-4 mr-2" />}
                Save Receipt Settings
              </Button>
            </div>
          </div>

          {/* ── Right column: live preview ─────────────────────────────── */}
          <div className="xl:col-span-2">
            <Card className="xl:sticky xl:top-6">
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Live Preview</CardTitle>
                <CardDescription>
                  Exact 1:1 preview of the printed receipt with sample items and totals.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ReceiptPreview settings={previewSettings} paymentMethod="cash" />
                <p className="mt-3 text-[11px] text-muted-foreground leading-snug">
                  Preview uses your current tax and service rates from the Financial tab, plus any
                  unsaved edits above. The footer attribution is hardcoded and cannot be removed.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  const renderOrderTypes = () => {
    const modalType = orderTypeModalId
      ? localOrderTypes.find((t) => t.id === orderTypeModalId)
      : undefined
    return (
      <div className="space-y-6">
        <SectionHeader
          title="Order Types"
          description="Control which order types are available in the POS interface. Only enabled types will appear for servers and counter staff. Click a card to configure service charge and delivery fee."
        />
        <Card>
          <CardContent className="pt-6 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {localOrderTypes.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => openOrderTypeModal(type.id)}
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={type.enabled ? 'default' : 'secondary'} className="text-xs">
                      {type.enabled ? 'Active' : 'Disabled'}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-mono">{type.id}</span>
                  </div>
                  {type.include_service_charge === false && (
                    <p className="text-[11px] text-muted-foreground mt-2">No service charge</p>
                  )}
                  {type.id === 'delivery' && (type.delivery_fee ?? 0) > 0 && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Delivery fee: {type.delivery_fee}
                    </p>
                  )}
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

        <Dialog
          open={orderTypeModalId !== null}
          onOpenChange={(o) => {
            if (!o) setOrderTypeModalId(null)
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {modalType ? `Configure ${modalType.label}` : 'Order type'}
              </DialogTitle>
              <DialogDescription>
                Changes apply at the checkout counter for new and updated tickets. The service charge
                rate is set under Financial; here you only choose whether it applies to this order type.
              </DialogDescription>
            </DialogHeader>
            {modalType && (
              <div className="space-y-4 py-1">
                <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                  <div>
                    <p className="text-sm font-medium">Available in POS</p>
                    <p className="text-xs text-muted-foreground">When off, staff cannot start this order type.</p>
                  </div>
                  <Switch checked={otModalEnabled} onCheckedChange={setOtModalEnabled} />
                </div>
                <div className="flex items-start gap-3 rounded-md border p-3">
                  <Checkbox
                    id="ot-svc"
                    checked={otModalIncludeSvc}
                    onCheckedChange={(c) => setOtModalIncludeSvc(c === true)}
                    className="mt-0.5"
                  />
                  <div className="space-y-0.5">
                    <label htmlFor="ot-svc" className="text-sm font-medium leading-none cursor-pointer">
                      Apply service charge
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Uses the global service charge % on food &amp; beverage (after discount) for this order
                      type.
                    </p>
                  </div>
                </div>
                {modalType.id === 'delivery' && (
                  <FieldGroup label="Delivery fee (flat per order)">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={otModalDeliveryFee}
                      onChange={(e) => setOtModalDeliveryFee(e.target.value)}
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Added after tax; not included in the sales tax base. Currency matches your store setting.
                    </p>
                  </FieldGroup>
                )}
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOrderTypeModalId(null)}>
                Cancel
              </Button>
              <Button type="button" onClick={saveOrderTypeModal} disabled={saveOrderTypesMutation.isPending}>
                {saveOrderTypesMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  const renderKitchen = () => {
    const mode = kitchenForm.mode
    // Friendly live-impact statements so the admin sees exactly what the
    // switch will do to their existing station config.
    const routingSummary = (() => {
      if (mode === 'kot_only') {
        if (kdsStationCount > 0) {
          return {
            tone: 'warn' as const,
            icon: AlertTriangle,
            text: `${kdsStationCount} station${kdsStationCount === 1 ? '' : 's'} configured as KDS will be treated as printers.${printerStationCount > 0 ? ` ${printerStationCount} already print natively.` : ''}`,
          }
        }
        return {
          tone: 'info' as const,
          icon: Info,
          text: 'All stations already print. The KDS screen will be hidden for everyone.',
        }
      }
      // mode === 'kds'
      if (kdsStationCount === 0) {
        return {
          tone: 'warn' as const,
          icon: AlertTriangle,
          text: 'No stations are configured as KDS yet. Add at least one in Admin → Kitchen Stations so tickets appear on the screen.',
        }
      }
      return {
        tone: 'info' as const,
        icon: Info,
        text: `${kdsStationCount} station${kdsStationCount === 1 ? '' : 's'} on the screen${printerStationCount > 0 ? `, ${printerStationCount} still printing` : ''}.`,
      }
    })()

    return (
      <div className="space-y-6">
        <SectionHeader
          title="Kitchen"
          description="Choose how orders reach the kitchen and tune KDS urgency/stale thresholds"
        />

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Kitchen Mode</CardTitle>
            <CardDescription>
              Controls routing and whether the Kitchen Display screen is visible. In <em>KDS</em>{' '}
              mode, each station's per-station output type (KDS vs Printer) is honored.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {(['kds', 'kot_only'] as const).map((m) => {
                const copy = KITCHEN_MODE_COPY[m]
                const active = kitchenForm.mode === m
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setKitchenForm((p) => ({ ...p, mode: m }))}
                    className={`text-left rounded-xl border-2 p-4 transition-all ${
                      active
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-background hover:border-muted-foreground/40'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-semibold">{copy.title}</span>
                      {active && (
                        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                          <Check className="w-3 h-3 text-primary-foreground" />
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-snug">{copy.description}</p>
                  </button>
                )
              })}
            </div>

            <div
              className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${
                routingSummary.tone === 'warn'
                  ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200'
                  : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-gray-700 dark:bg-gray-800/50 dark:text-slate-300'
              }`}
            >
              <routingSummary.icon className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{routingSummary.text}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">KDS Thresholds</CardTitle>
            <CardDescription>
              Applied to the Kitchen Display. Urgency tints tickets that have been on the line too
              long; stale excludes abandoned tickets from the default view; recall window lets a
              bumped ticket be sent back to the line.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FieldGroup label="Urgency (minutes)" hint="Ticket turns red after this.">
                <Input
                  type="number"
                  min={1}
                  max={240}
                  value={kitchenForm.urgencyMinutes}
                  onChange={(e) => setKitchenForm({ ...kitchenForm, urgencyMinutes: e.target.value })}
                />
              </FieldGroup>
              <FieldGroup label="Stale (minutes)" hint="Tickets older than this are hidden by default.">
                <Input
                  type="number"
                  min={15}
                  max={1440}
                  value={kitchenForm.staleMinutes}
                  onChange={(e) => setKitchenForm({ ...kitchenForm, staleMinutes: e.target.value })}
                />
              </FieldGroup>
              <FieldGroup label="Recall window (seconds)" hint="Allow un-bump within this window.">
                <Input
                  type="number"
                  min={0}
                  max={3600}
                  value={kitchenForm.recallWindowSeconds}
                  onChange={(e) => setKitchenForm({ ...kitchenForm, recallWindowSeconds: e.target.value })}
                />
              </FieldGroup>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={() => saveKitchenMutation.mutate()} disabled={saveKitchenMutation.isPending}>
                {saveKitchenMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save Kitchen Settings
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const renderFiscal = () => <FiscalSettingsPanel />

  const renderPra = () => (
    <div className="space-y-6">
      <SectionHeader
        title="Tax Invoice Settings"
        description="Configure the optional printed tax invoice slip (same document your team already uses at checkout). The standard customer receipt is always printed; this tax slip is only produced when the customer asks for it. Government digital reporting (FBR/PRA sync) is configured under Tax & Fiscal."
      />

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4" /> Printed tax invoice slip
          </CardTitle>
          <CardDescription>
            When enabled, the cashier is prompted after payment to optionally print a second slip: your
            <strong> Punjab Revenue Authority</strong>-style tax invoice (PRA branding, QR code, invoice
            number field). This is the physical tax receipt; it works alongside digital fiscal settings in{' '}
            <strong>Tax &amp; Fiscal</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Enable tax invoice prompt at checkout</p>
              <p className="text-xs text-muted-foreground mt-1">
                Adds a post-payment prompt with <em>Skip</em> (default) and <em>Print PRA Invoice</em>{' '}
                buttons. Leave off to keep checkout identical to today.
              </p>
            </div>
            <Switch
              checked={praForm.enabled}
              onCheckedChange={(v) => setPraForm((p) => ({ ...p, enabled: v }))}
              aria-label="Enable tax invoice prompt at checkout"
            />
          </div>

          <div className={praForm.enabled ? '' : 'opacity-60 pointer-events-none'}>
            <div className="space-y-4">
              <FieldGroup
                label="QR Code Payload Template"
                hint="Optional. Supports {invoice_number} and {order_number} placeholders. Leave blank to encode the invoice number directly."
              >
                <Input
                  value={praForm.qr_url_template}
                  onChange={(e) => setPraForm((p) => ({ ...p, qr_url_template: e.target.value }))}
                  placeholder="https://e.pra.punjab.gov.pk/invoice/{invoice_number}"
                  disabled={!praForm.enabled}
                />
              </FieldGroup>

              <FieldGroup
                label="Footer Note"
                hint="Optional short line shown on the tax invoice slip (above the logo area)."
              >
                <Textarea
                  rows={2}
                  value={praForm.footer_note}
                  onChange={(e) => setPraForm((p) => ({ ...p, footer_note: e.target.value }))}
                  placeholder="e.g. Verify this invoice by scanning the QR code."
                  className="resize-y min-h-[56px]"
                  disabled={!praForm.enabled}
                />
              </FieldGroup>
            </div>
          </div>

          <div className={praForm.enabled ? 'border-t pt-5 space-y-4' : 'border-t pt-5 space-y-4 opacity-60 pointer-events-none'}>
            <div>
              <p className="text-sm font-medium">Late printing (reprints)</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Lets cashiers issue a tax invoice for a past order from{' '}
                <strong>View Reports → Orders Browser</strong> when the customer comes back later.
                Admins can always reprint regardless of this window.
              </p>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-muted/20 p-3">
              <div>
                <p className="text-sm font-medium">Allow late reprints</p>
                <p className="text-xs text-muted-foreground">
                  When off, only the first print at checkout is allowed for non-admins.
                </p>
              </div>
              <Switch
                checked={praForm.late_print_enabled}
                onCheckedChange={(v) => setPraForm((p) => ({ ...p, late_print_enabled: v }))}
                aria-label="Allow late tax invoice reprints"
              />
            </div>
            <FieldGroup
              label="Reprint window"
              hint="Number of full days after the order is completed during which a reprint is allowed. 0 = same business day only. Maximum 7 days. Window ends at 23:59 Asia/Karachi."
            >
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={7}
                  step={1}
                  value={praForm.late_print_window_days}
                  onChange={(e) =>
                    setPraForm((p) => ({ ...p, late_print_window_days: e.target.value }))
                  }
                  className="w-24"
                  disabled={!praForm.late_print_enabled}
                />
                <span className="text-sm text-muted-foreground">days</span>
              </div>
            </FieldGroup>
          </div>

          <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-900 dark:text-amber-200">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <p>
              The invoice number on this printed slip may show blank until it is wired to your
              sequential counter or government API. Digital IRN/QR sync for compliance is configured
              under <strong>Tax &amp; Fiscal</strong>.
            </p>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => savePraInvoice.mutate()}
              disabled={savePraInvoice.isPending}
            >
              {savePraInvoice.isPending
                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                : <Save className="w-4 h-4 mr-2" />}
              Save tax invoice settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )

  const renderAppearance = () => (
    <div className="space-y-6">
      <SectionHeader
        title="Appearance"
        description="Customize the visual look and feel of the POS interface"
      />
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Theme</CardTitle>
          <CardDescription>Choose how the application looks across all screens</CardDescription>
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
    fiscal: renderFiscal,
    pra: renderPra,
    'order-types': renderOrderTypes,
    kitchen: renderKitchen,
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
        <div className={activeSection === 'receipt' ? 'max-w-6xl' : 'max-w-3xl'}>
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
      <h2 className="text-3xl font-bold tracking-tight">{title}</h2>
      <p className="text-muted-foreground mt-1">{description}</p>
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

// ── Custom fields editor ───────────────────────────────────────────────

function CustomFieldsEditor({
  title,
  hint,
  fields,
  allFields,
  onAdd,
  onUpdate,
  onRemove,
  onMove,
}: {
  title: string
  hint: string
  fields: ReceiptCustomField[]
  allFields: ReceiptCustomField[]
  onAdd: () => void
  onUpdate: (id: string, patch: Partial<ReceiptCustomField>) => void
  onRemove: (id: string) => void
  onMove: (id: string, dir: -1 | 1) => void
}) {
  // Position-within-group helpers: we only allow moves within the same group
  // so the preview order stays predictable.
  const indexInGroup = (id: string) => fields.findIndex((f) => f.id === id)
  const indexInAll = (id: string) => allFields.findIndex((f) => f.id === id)

  // Translate an in-group move into an all-fields move (swap with the
  // previous / next field of the same position).
  const moveWithinGroup = (id: string, dir: -1 | 1) => {
    const groupIdx = indexInGroup(id)
    const target = groupIdx + dir
    if (target < 0 || target >= fields.length) return
    const myAllIdx = indexInAll(id)
    const neighborAllIdx = indexInAll(fields[target].id)
    const distance = neighborAllIdx - myAllIdx
    if (distance === 0) return
    const step: -1 | 1 = distance > 0 ? 1 : -1
    for (let i = 0; i < Math.abs(distance); i++) onMove(id, step)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">{title}</h4>
          <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onAdd} className="gap-1.5 shrink-0">
          <Plus className="w-3.5 h-3.5" />
          Add line
        </Button>
      </div>

      {fields.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-4 text-xs text-muted-foreground text-center">
          No lines yet. Click <span className="font-medium">Add line</span> to create one.
        </div>
      ) : (
        <div className="space-y-2">
          {fields.map((f, i) => (
            <div
              key={f.id}
              className="rounded-md border border-border bg-background p-3 space-y-2"
            >
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.5fr_auto] gap-2">
                <Input
                  value={f.label}
                  onChange={(e) => onUpdate(f.id, { label: e.target.value })}
                  placeholder="Label (optional)"
                  className="h-9"
                />
                <Input
                  value={f.value}
                  onChange={(e) => onUpdate(f.id, { value: e.target.value })}
                  placeholder="Value — e.g. Follow us @covacafe"
                  className="h-9"
                />
                <select
                  value={f.style ?? 'normal'}
                  onChange={(e) =>
                    onUpdate(f.id, {
                      style: e.target.value as 'normal' | 'bold' | 'muted',
                    })
                  }
                  className="h-9 px-2 rounded-md border border-input bg-background text-xs"
                >
                  <option value="normal">Normal</option>
                  <option value="bold">Bold</option>
                  <option value="muted">Muted</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={i === 0}
                    onClick={() => moveWithinGroup(f.id, -1)}
                    aria-label="Move up"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={i === fields.length - 1}
                    onClick={() => moveWithinGroup(f.id, 1)}
                    aria-label="Move down"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </Button>
                  <Badge variant="secondary" className="ml-1 text-[10px] uppercase tracking-wide">
                    {f.position}
                  </Badge>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemove(f.id)}
                  className="h-7 gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Image helpers ──────────────────────────────────────────────────────

/**
 * Read an image file, scale it down to `maxWidth` (preserving aspect ratio),
 * and return a JPEG/PNG data URL. SVGs are returned as-is (data URL), since
 * rasterizing them loses quality.
 */
async function resizeImageToDataUrl(file: File, maxWidth: number, quality: number): Promise<string> {
  // SVG: read as text and encode as data URL directly — stays crisp.
  if (file.type === 'image/svg+xml') {
    const text = await file.text()
    const encoded = window.btoa(unescape(encodeURIComponent(text)))
    return `data:image/svg+xml;base64,${encoded}`
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('Could not decode image'))
    el.src = dataUrl
  })

  const ratio = img.width > maxWidth ? maxWidth / img.width : 1
  const w = Math.round(img.width * ratio)
  const h = Math.round(img.height * ratio)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  // Transparent PNG support: preserve alpha when the source has it.
  const hasAlpha = file.type === 'image/png' || file.type === 'image/webp'
  if (!hasAlpha) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
  }
  ctx.drawImage(img, 0, 0, w, h)
  return hasAlpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', quality)
}
