import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, Edit2, Monitor, Printer, X, Save, Store } from 'lucide-react'
import type { KitchenStation, Category } from '@/types'

export function StationManagement() {
  const [showCreate, setShowCreate] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formOutput, setFormOutput] = useState<'kds' | 'printer'>('kds')
  const [formPrintLocation, setFormPrintLocation] = useState<'kitchen' | 'counter'>('kitchen')
  const [formOrder, setFormOrder] = useState(0)
  const queryClient = useQueryClient()

  const {
    data: stations = [],
    isLoading: stationsLoading,
    isError: stationsError,
    error: stationsErrorDetail,
  } = useQuery({
    queryKey: ['stations'],
    queryFn: async () => {
      const res = await apiClient.getStations()
      return res.data || []
    },
  })

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await apiClient.getCategories()
      return res.data || []
    },
  })

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.createStation({
        name: formName,
        output_type: formOutput,
        sort_order: formOrder,
        ...(formOutput === 'printer' ? { print_location: formPrintLocation } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stations'] })
      resetForm()
    },
  })

  const updateMutation = useMutation({
    mutationFn: (id: string) =>
      apiClient.updateStation(id, {
        name: formName,
        output_type: formOutput,
        sort_order: formOrder,
        ...(formOutput === 'printer' ? { print_location: formPrintLocation } : { print_location: 'kitchen' }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stations'] })
      resetForm()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteStation(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stations'] }),
  })

  const setCategoriesMutation = useMutation({
    mutationFn: ({ stationId, categoryIds }: { stationId: string; categoryIds: string[] }) =>
      apiClient.setStationCategories(stationId, categoryIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stations'] })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] })
    },
  })

  const resetForm = () => {
    setShowCreate(false)
    setEditId(null)
    setFormName('')
    setFormOutput('kds')
    setFormPrintLocation('kitchen')
    setFormOrder(0)
  }

  const startEdit = (s: KitchenStation) => {
    setEditId(s.id)
    setFormName(s.name)
    setFormOutput(s.output_type)
    setFormPrintLocation(s.print_location === 'counter' ? 'counter' : 'kitchen')
    setFormOrder(s.sort_order)
    setShowCreate(false)
  }

  const toggleCategory = (stationId: string, categoryId: string, currentIds: string[]) => {
    const newIds = currentIds.includes(categoryId)
      ? currentIds.filter(id => id !== categoryId)
      : [...currentIds, categoryId]
    setCategoriesMutation.mutate({ stationId, categoryIds: newIds })
  }

  if (stationsLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[240px]">
        <div className="text-muted-foreground text-sm">Loading kitchen stations…</div>
      </div>
    )
  }

  if (stationsError) {
    return (
      <div className="p-6 space-y-2">
        <h2 className="text-2xl font-bold text-gray-900">Kitchen Stations</h2>
        <p className="text-destructive text-sm">
          Could not load stations. {stationsErrorDetail instanceof Error ? stationsErrorDetail.message : 'Check that the API is running and the database has the kitchen_stations migration applied.'}
        </p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Kitchen Stations</h2>
          <p className="text-gray-500 mt-1">Configure KOT routing destinations and assign menu categories</p>
        </div>
        <Button onClick={() => { resetForm(); setShowCreate(true) }}>
          <Plus className="w-4 h-4 mr-2" /> Add Station
        </Button>
      </div>

      {/* Create / Edit Form */}
      {(showCreate || editId) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{editId ? 'Edit Station' : 'New Station'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="text-sm font-medium text-gray-700 block mb-1">Name</label>
                <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Main Kitchen" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Output</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setFormOutput('kds')}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium flex items-center gap-2 ${
                      formOutput === 'kds' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200'
                    }`}
                  >
                    <Monitor className="w-4 h-4" /> KDS
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormOutput('printer')}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium flex items-center gap-2 ${
                      formOutput === 'printer' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200'
                    }`}
                  >
                    <Printer className="w-4 h-4" /> Printer
                  </button>
                </div>
              </div>
              <div className="w-24">
                <label className="text-sm font-medium text-gray-700 block mb-1">Order</label>
                <Input type="number" value={formOrder} onChange={e => setFormOrder(Number(e.target.value))} />
              </div>
              <Button
                type="button"
                onClick={() => (editId ? updateMutation.mutate(editId) : createMutation.mutate())}
                disabled={!formName.trim()}
              >
                <Save className="w-4 h-4 mr-2" /> {editId ? 'Update' : 'Create'}
              </Button>
              <Button type="button" variant="ghost" onClick={resetForm}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            {formOutput === 'printer' && (
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Thermal ticket prints at</label>
                <div className="flex gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setFormPrintLocation('kitchen')}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium flex items-center gap-2 ${
                      formPrintLocation === 'kitchen' ? 'bg-amber-50 border-amber-300 text-amber-900' : 'border-gray-200'
                    }`}
                  >
                    <Printer className="w-4 h-4" /> Kitchen station
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormPrintLocation('counter')}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium flex items-center gap-2 ${
                      formPrintLocation === 'counter' ? 'bg-amber-50 border-amber-300 text-amber-900' : 'border-gray-200'
                    }`}
                  >
                    <Store className="w-4 h-4" /> Checkout counter
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Counter: staff prints here and carries the ticket to the kitchen. Station: use the thermal next to that pass.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Station Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stations.map((station: KitchenStation) => (
          <Card key={station.id} className="relative">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-lg text-gray-900">{station.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={station.output_type === 'kds' ? 'default' : 'secondary'}>
                      {station.output_type === 'kds' ? (
                        <><Monitor className="w-3 h-3 mr-1" /> KDS</>
                      ) : (
                        <><Printer className="w-3 h-3 mr-1" /> Printer</>
                      )}
                    </Badge>
                    {station.output_type === 'printer' && (
                      <Badge variant="outline" className="text-xs font-normal">
                        {station.print_location === 'counter' ? 'Print at counter' : 'Print at station'}
                      </Badge>
                    )}
                    {!station.is_active && <Badge variant="destructive">Inactive</Badge>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => startEdit(station)} className="p-2 text-gray-400 hover:text-blue-600 rounded-md hover:bg-blue-50">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => deleteMutation.mutate(station.id)} className="p-2 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Category chips */}
              <div className="mt-4">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Assigned Categories</label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {categories.map((cat: Category) => {
                    const isAssigned = (station.category_ids || []).includes(cat.id)
                    return (
                      <button
                        key={cat.id}
                        onClick={() => toggleCategory(station.id, cat.id, station.category_ids || [])}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          isAssigned
                            ? 'text-white shadow-sm'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                        style={isAssigned ? { backgroundColor: cat.color || '#3b82f6' } : {}}
                      >
                        {cat.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {stations.length === 0 && !showCreate && (
        <div className="text-center py-12 text-gray-400">
          No kitchen stations configured yet. Add one to start routing KOTs.
        </div>
      )}
    </div>
  )
}
