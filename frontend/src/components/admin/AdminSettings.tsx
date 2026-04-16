import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { 
  Settings, 
  Database, 
  Bell,
  Globe,
  DollarSign,
  Printer,
  Save,
  RotateCcw,
  UtensilsCrossed,
  Check
} from 'lucide-react'
import apiClient from '@/api/client'
import { useToast } from '@/hooks/use-toast'
import { parseCurrencyFromSettings } from '@/lib/formatMoney'

interface OrderTypeConfig {
  id: string
  label: string
  enabled: boolean
}

export function AdminSettings() {
  const [settings, setSettings] = useState({
    restaurant_name: 'My Restaurant',
    currency: 'PKR',
    tax_rate: '10.00',
    service_charge: '5.00',
    receipt_header: 'Thank you for dining with us!',
    receipt_footer: 'Visit again soon!',
    notification_email: 'admin@restaurant.com',
    backup_frequency: 'daily',
    theme: 'light',
    language: 'en'
  })

  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: allSettingsRes } = useQuery({
    queryKey: ['settings', 'all'],
    queryFn: () => apiClient.getAllSettings(),
  })

  const [checkoutRates, setCheckoutRates] = useState({
    tax_cash_pct: '15',
    tax_card_pct: '5',
    tax_online_pct: '15',
    service_pct: '10',
  })

  const [customerReceipt, setCustomerReceipt] = useState({
    business_name: '',
    address: '',
    ntn: '',
    pos_number: '',
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
    const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '')
    setCustomerReceipt({
      business_name: str('receipt_business_name') || (typeof d.restaurant_name === 'string' ? d.restaurant_name : ''),
      address: str('receipt_address'),
      ntn: str('receipt_ntn'),
      pos_number: str('receipt_pos_number'),
    })
    setSettings((prev) => ({
      ...prev,
      currency: parseCurrencyFromSettings(d.currency),
    }))
  }, [allSettingsRes])

  const saveCustomerReceipt = useMutation({
    mutationFn: async () => {
      await apiClient.updateSetting('receipt_business_name', customerReceipt.business_name)
      await apiClient.updateSetting('receipt_address', customerReceipt.address)
      await apiClient.updateSetting('receipt_ntn', customerReceipt.ntn)
      await apiClient.updateSetting('receipt_pos_number', customerReceipt.pos_number)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'all'] })
    },
  })

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
    },
  })

  const { data: orderTypes = [] } = useQuery<OrderTypeConfig[]>({
    queryKey: ['settings', 'enabled_order_types'],
    queryFn: async () => {
      const res = await apiClient.getSetting('enabled_order_types')
      return res.success && res.data ? res.data : []
    },
  })

  const [localOrderTypes, setLocalOrderTypes] = useState<OrderTypeConfig[]>([])
  const [newOrderType, setNewOrderType] = useState({ id: '', label: '' })

  useEffect(() => {
    if (orderTypes.length > 0) {
      setLocalOrderTypes(orderTypes)
    }
  }, [orderTypes])

  const saveOrderTypesMutation = useMutation({
    mutationFn: async (types: OrderTypeConfig[]) => {
      return apiClient.updateSetting('enabled_order_types', types)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'enabled_order_types'] })
    },
  })

  const toggleOrderType = (id: string) => {
    const updated = localOrderTypes.map(t => t.id === id ? { ...t, enabled: !t.enabled } : t)
    setLocalOrderTypes(updated)
    saveOrderTypesMutation.mutate(updated)
  }

  const addOrderType = () => {
    if (!newOrderType.id || !newOrderType.label) return
    const updated = [...localOrderTypes, { id: newOrderType.id.toLowerCase().replace(/\s+/g, '_'), label: newOrderType.label, enabled: true }]
    setLocalOrderTypes(updated)
    saveOrderTypesMutation.mutate(updated)
    setNewOrderType({ id: '', label: '' })
  }

  const removeOrderType = (id: string) => {
    const updated = localOrderTypes.filter(t => t.id !== id)
    setLocalOrderTypes(updated)
    saveOrderTypesMutation.mutate(updated)
  }

  const saveCurrencyMutation = useMutation({
    mutationFn: (currency: string) => apiClient.updateSetting('currency', currency),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'all'] })
      toast({ title: 'Saved', description: 'Currency preference updated.' })
    },
    onError: (e: unknown) => {
      toast({
        title: 'Save failed',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    },
  })

  const handleSave = () => {
    saveCurrencyMutation.mutate(settings.currency)
  }

  const handleReset = () => {
    // Reset to defaults
    setSettings({
      restaurant_name: 'My Restaurant',
      currency: 'PKR',
      tax_rate: '10.00',
      service_charge: '5.00',
      receipt_header: 'Thank you for dining with us!',
      receipt_footer: 'Visit again soon!',
      notification_email: 'admin@restaurant.com',
      backup_frequency: 'daily',
      theme: 'light',
      language: 'en'
    })
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">System Settings</h2>
          <p className="text-muted-foreground">
            Configure your restaurant's POS system settings
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset
          </Button>
          <Button onClick={handleSave} disabled={saveCurrencyMutation.isPending}>
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Restaurant Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5" />
              Restaurant Information
            </CardTitle>
            <CardDescription>
              Basic information about your restaurant
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Restaurant Name</label>
              <Input
                value={settings.restaurant_name}
                onChange={(e) => setSettings({...settings, restaurant_name: e.target.value})}
                placeholder="Enter restaurant name"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Language</label>
              <select
                className="w-full p-2 border border-input rounded-md bg-background"
                value={settings.language}
                onChange={(e) => setSettings({...settings, language: e.target.value})}
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Financial Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Financial Settings
            </CardTitle>
            <CardDescription>
              Configure currency, taxes, and charges
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Currency</label>
              <select
                className="w-full p-2 border border-input rounded-md bg-background"
                value={settings.currency}
                onChange={(e) => setSettings({...settings, currency: e.target.value})}
              >
                <option value="PKR">PKR (RS)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Tax Rate (%)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={settings.tax_rate}
                  onChange={(e) => setSettings({...settings, tax_rate: e.target.value})}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Service Charge (%)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={settings.service_charge}
                  onChange={(e) => setSettings({...settings, service_charge: e.target.value})}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Counter checkout tax &amp; service
            </CardTitle>
            <CardDescription>
              Rates are stored as fractions (0–1). Shown as percent for editing. Used by counter checkout and payment validation.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Tax cash (%)</label>
              <Input
                type="number"
                step="0.01"
                value={checkoutRates.tax_cash_pct}
                onChange={(e) => setCheckoutRates({ ...checkoutRates, tax_cash_pct: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Tax card (%)</label>
              <Input
                type="number"
                step="0.01"
                value={checkoutRates.tax_card_pct}
                onChange={(e) => setCheckoutRates({ ...checkoutRates, tax_card_pct: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Tax online (%)</label>
              <Input
                type="number"
                step="0.01"
                value={checkoutRates.tax_online_pct}
                onChange={(e) => setCheckoutRates({ ...checkoutRates, tax_online_pct: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Service charge (%)</label>
              <Input
                type="number"
                step="0.01"
                value={checkoutRates.service_pct}
                onChange={(e) => setCheckoutRates({ ...checkoutRates, service_pct: e.target.value })}
              />
            </div>
            <div className="col-span-full">
              <Button
                type="button"
                onClick={() => saveCheckoutRates.mutate()}
                disabled={saveCheckoutRates.isPending}
              >
                Save checkout rates
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Receipt Settings */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Printer className="w-5 h-5" />
              Customer receipt (thermal, after payment)
            </CardTitle>
            <CardDescription>
              Shown on the printed receipt from checkout. Invoice number and payment mode come from the order; cashier
              name is the logged-in user.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 max-w-2xl">
            <div>
              <label className="text-sm font-medium mb-2 block">Business name (header)</label>
              <Input
                value={customerReceipt.business_name}
                onChange={(e) => setCustomerReceipt({ ...customerReceipt, business_name: e.target.value })}
                placeholder="e.g. chaayé khana"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Address</label>
              <Textarea
                rows={3}
                value={customerReceipt.address}
                onChange={(e) => setCustomerReceipt({ ...customerReceipt, address: e.target.value })}
                placeholder="Street, area, city (multiple lines OK)"
                className="resize-y min-h-[72px]"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">NTN / STRN</label>
                <Input
                  value={customerReceipt.ntn}
                  onChange={(e) => setCustomerReceipt({ ...customerReceipt, ntn: e.target.value })}
                  placeholder="Tax registration"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">POS / counter number</label>
                <Input
                  value={customerReceipt.pos_number}
                  onChange={(e) => setCustomerReceipt({ ...customerReceipt, pos_number: e.target.value })}
                  placeholder="e.g. 176709"
                />
              </div>
            </div>
            <Button
              type="button"
              onClick={() => saveCustomerReceipt.mutate()}
              disabled={saveCustomerReceipt.isPending}
            >
              Save receipt fields
            </Button>
            <div className="border-t pt-4 space-y-4">
              <p className="text-sm text-muted-foreground">Optional legacy lines (other screens)</p>
              <div>
                <label className="text-sm font-medium mb-2 block">Receipt Header</label>
                <Input
                  value={settings.receipt_header}
                  onChange={(e) => setSettings({ ...settings, receipt_header: e.target.value })}
                  placeholder="Header message"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Receipt Footer</label>
                <Input
                  value={settings.receipt_footer}
                  onChange={(e) => setSettings({ ...settings, receipt_footer: e.target.value })}
                  placeholder="Footer message"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* System Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              System Configuration
            </CardTitle>
            <CardDescription>
              System behavior and preferences
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Theme</label>
              <select
                className="w-full p-2 border border-input rounded-md bg-background"
                value={settings.theme}
                onChange={(e) => setSettings({...settings, theme: e.target.value})}
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="system">System</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Backup Frequency</label>
              <select
                className="w-full p-2 border border-input rounded-md bg-background"
                value={settings.backup_frequency}
                onChange={(e) => setSettings({...settings, backup_frequency: e.target.value})}
              >
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="manual">Manual Only</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Order Types Configuration */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UtensilsCrossed className="w-5 h-5" />
              Order Types
            </CardTitle>
            <CardDescription>
              Enable or disable order types shown in the POS interface. Only enabled types will appear for servers and counter staff.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {localOrderTypes.map(type => (
                <button
                  key={type.id}
                  onClick={() => toggleOrderType(type.id)}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    type.enabled
                      ? 'border-green-300 bg-green-50'
                      : 'border-gray-200 bg-gray-50 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm">{type.label}</span>
                    {type.enabled && <Check className="w-4 h-4 text-green-600" />}
                  </div>
                  <div className="text-xs text-gray-500">{type.id}</div>
                  <Badge
                    variant={type.enabled ? 'default' : 'secondary'}
                    className={`mt-2 text-xs ${type.enabled ? 'bg-green-600' : ''}`}
                  >
                    {type.enabled ? 'Active' : 'Disabled'}
                  </Badge>
                  {type.id !== 'dine_in' && type.id !== 'takeout' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); removeOrderType(type.id) }}
                      className="text-xs text-red-500 hover:text-red-700 mt-1 block"
                    >
                      Remove
                    </button>
                  )}
                </button>
              ))}
            </div>
            <div className="flex gap-2 items-end pt-2 border-t">
              <div className="flex-1">
                <label className="text-sm font-medium mb-1 block">Add Custom Order Type</label>
                <Input
                  placeholder="e.g. Foodpanda, Uber Eats..."
                  value={newOrderType.label}
                  onChange={e => setNewOrderType({ id: e.target.value.toLowerCase().replace(/\s+/g, '_'), label: e.target.value })}
                />
              </div>
              <Button onClick={addOrderType} disabled={!newOrderType.label} size="sm">
                Add Type
              </Button>
            </div>
            {saveOrderTypesMutation.isPending && (
              <p className="text-xs text-blue-500">Saving...</p>
            )}
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Notification Settings
            </CardTitle>
            <CardDescription>
              Configure alerts and notifications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Notification Email</label>
              <Input
                type="email"
                value={settings.notification_email}
                onChange={(e) => setSettings({...settings, notification_email: e.target.value})}
                placeholder="admin@restaurant.com"
              />
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Low Stock Alerts</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Daily Reports</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">System Updates</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Error Notifications</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* System Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            System Status
          </CardTitle>
          <CardDescription>
            Current system health and information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <Badge variant="outline" className="w-full">
                Database
              </Badge>
              <p className="text-sm text-green-600 mt-1">Connected</p>
            </div>
            <div className="text-center">
              <Badge variant="outline" className="w-full">
                API Server
              </Badge>
              <p className="text-sm text-green-600 mt-1">Online</p>
            </div>
            <div className="text-center">
              <Badge variant="outline" className="w-full">
                Backup Status
              </Badge>
              <p className="text-sm text-green-600 mt-1">Up to date</p>
            </div>
            <div className="text-center">
              <Badge variant="outline" className="w-full">
                Version
              </Badge>
              <p className="text-sm text-muted-foreground mt-1">v1.0.0</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
