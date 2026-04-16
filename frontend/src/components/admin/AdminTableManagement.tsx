import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { 
  Plus,
  Search,
  Edit,
  Trash2,
  Users,
  MapPin,
  CheckCircle,
  Settings,
  LayoutGrid,
  List
} from 'lucide-react'
import apiClient from '@/api/client'
import { toastHelpers } from '@/lib/toast-helpers'
import { TableForm } from '@/components/forms/TableForm'
import type { DiningTable } from '@/types'
import { TableLayoutBuilder } from '@/components/tables/TableLayoutBuilder'
import { buildFloorTabs } from '@/lib/managedFloors'

type ViewMode = 'list' | 'table-form' | 'layout'

export function AdminTableManagement() {
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [searchTerm, setSearchTerm] = useState('')
  const [editingTable, setEditingTable] = useState<DiningTable | null>(null)
  const [filterStatus, setFilterStatus] = useState<'all' | 'available' | 'occupied'>('all')
  const [selectedFloor, setSelectedFloor] = useState<string>('General')

  const queryClient = useQueryClient()

  const { data: allTables = [], isLoading } = useQuery({
    queryKey: ['tables-summary'],
    queryFn: () => apiClient.getTables().then(res => res.data)
  })
  const { data: floorSettingRes } = useQuery({
    queryKey: ['settings', 'managed_floors'],
    queryFn: () => apiClient.getSetting('managed_floors'),
  })

  const deleteTableMutation = useMutation({
    mutationFn: ({ id }: { id: string; tableNumber: string }) => apiClient.deleteTable(id),
    onSuccess: (_, { tableNumber }) => {
      queryClient.invalidateQueries({ queryKey: ['tables'] })
      queryClient.invalidateQueries({ queryKey: ['tables-summary'] })
      toastHelpers.apiSuccess('Delete', `Table ${tableNumber}`)
    },
    onError: (error: any) => {
      toastHelpers.apiError('Delete table', error)
    }
  })

  const handleFormSuccess = () => {
    setViewMode('list')
    setEditingTable(null)
  }

  const handleCancelForm = () => {
    setViewMode('list')
    setEditingTable(null)
  }

  const handleDeleteTable = (table: DiningTable) => {
    const occupied = table.has_active_order ?? table.is_occupied
    if (occupied) {
      toastHelpers.warning(
        'Cannot Delete Table',
        `Table ${table.table_number} is currently occupied. Please clear the table first.`
      )
      return
    }

    if (confirm(`Are you sure you want to delete Table ${table.table_number}? This action cannot be undone.`)) {
      deleteTableMutation.mutate({ 
        id: table.id.toString(), 
        tableNumber: table.table_number 
      })
    }
  }

  const floors = useMemo(() => {
    const tableLocations = (allTables as DiningTable[]).map((t) => t.location || 'General')
    return buildFloorTabs(floorSettingRes?.data, tableLocations)
  }, [allTables, floorSettingRes?.data])

  useEffect(() => {
    if (!floors.includes(selectedFloor)) {
      setSelectedFloor(floors[0] || 'General')
    }
  }, [floors, selectedFloor])

  const filteredTables = useMemo(() => {
    return (allTables as DiningTable[]).filter((table) => {
      const occupied = table.has_active_order ?? table.is_occupied
      const statusMatch =
        filterStatus === 'all' ? true : filterStatus === 'occupied' ? occupied : !occupied
      const query = searchTerm.trim().toLowerCase()
      const text = `${table.table_number} ${table.location ?? ''}`.toLowerCase()
      return statusMatch && (!query || text.includes(query))
    })
  }, [allTables, filterStatus, searchTerm])

  const stats = {
    total: (allTables as DiningTable[]).length,
    available: (allTables as DiningTable[]).filter((t) => !(t.has_active_order ?? t.is_occupied)).length,
    occupied: (allTables as DiningTable[]).filter((t) => t.has_active_order ?? t.is_occupied).length,
  }

  const saveLayoutMutation = useMutation({
    mutationFn: async (tables: Array<DiningTable & { map_x: number; map_y: number; map_w: number; map_h: number; map_rotation: number; shape: string }>) => {
      await Promise.all(
        tables.map((t) =>
          apiClient.updateTable(t.id, {
            map_x: t.map_x,
            map_y: t.map_y,
            map_w: t.map_w,
            map_h: t.map_h,
            map_rotation: t.map_rotation,
            shape: t.shape,
            location: t.location || selectedFloor,
            zone: null,
          })
        )
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] })
      queryClient.invalidateQueries({ queryKey: ['tables-summary'] })
      toastHelpers.success('Layout saved', 'Table positions updated successfully.')
    },
    onError: (error: unknown) => {
      toastHelpers.apiError('Save layout', error)
    },
  })

  const floorMutation = useMutation({
    mutationFn: (updatedFloors: string[]) => apiClient.updateSetting('managed_floors', updatedFloors),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'managed_floors'] })
    },
    onError: (error: unknown) => {
      toastHelpers.apiError('Update floors', error)
    },
  })

  const handleCreateFloor = async (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    if (floors.some((f) => f.toLowerCase() === trimmed.toLowerCase())) return
    const next = mergeFloorList([...floors, trimmed], [])
    await floorMutation.mutateAsync(next)
    toastHelpers.success('Floor added', `${trimmed} is now available.`)
  }

  const handleRenameFloor = async (from: string, to: string) => {
    const value = to.trim()
    if (!value || value === from) return
    const next = floors.map((f) => (f === from ? value : f))
    await floorMutation.mutateAsync(Array.from(new Set(next)))
    const touched = (allTables as DiningTable[]).filter((t) => (t.location || 'General') === from)
    await Promise.all(touched.map((t) => apiClient.updateTable(t.id, { location: value })))
    queryClient.invalidateQueries({ queryKey: ['tables'] })
    queryClient.invalidateQueries({ queryKey: ['tables-summary'] })
    setSelectedFloor(value)
    toastHelpers.success('Floor renamed', `${from} renamed to ${value}.`)
  }

  const handleDeleteFloor = async (name: string, moveTo: string) => {
    if (!moveTo || moveTo === name) return
    const touched = (allTables as DiningTable[]).filter((t) => (t.location || 'General') === name)
    await Promise.all(touched.map((t) => apiClient.updateTable(t.id, { location: moveTo })))
    const next = floors.filter((f) => f !== name)
    await floorMutation.mutateAsync(next)
    queryClient.invalidateQueries({ queryKey: ['tables'] })
    queryClient.invalidateQueries({ queryKey: ['tables-summary'] })
    setSelectedFloor(moveTo)
    toastHelpers.success('Floor deleted', `${name} moved to ${moveTo}.`)
  }

  if (viewMode === 'table-form') {
    return (
      <div className="p-6 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Table Management</h2>
            <p className="text-muted-foreground">
              {editingTable ? 'Update table details' : 'Add a new table to the floor plan'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setViewMode('list')} className="gap-2">
              <List className="h-4 w-4" />
              Table List
            </Button>
            <Button variant="outline" onClick={() => setViewMode('layout')} className="gap-2">
              <LayoutGrid className="h-4 w-4" />
              Layout Builder
            </Button>
            <Button
              onClick={() => {
                setEditingTable(null)
                setViewMode('table-form')
              }}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Table
            </Button>
          </div>
        </div>

        <TableForm
          table={editingTable || undefined}
          floors={floors}
          onCreateFloor={handleCreateFloor}
          onRenameFloor={handleRenameFloor}
          onDeleteFloor={handleDeleteFloor}
          mode={editingTable ? 'edit' : 'create'}
          onSuccess={handleFormSuccess}
          onCancel={handleCancelForm}
        />
      </div>
    )
  }

  if (viewMode === 'layout') {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Table Management</h2>
            <p className="text-muted-foreground">Build a visual floor map and arrange table positions.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setViewMode('list')} className="gap-2">
              <List className="h-4 w-4" />
              Table List
            </Button>
            <Button
              onClick={() => {
                setEditingTable(null)
                setViewMode('table-form')
              }}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Table
            </Button>
          </div>
        </div>

        <TableLayoutBuilder
          tables={allTables as DiningTable[]}
          floors={floors}
          selectedFloor={selectedFloor}
          onFloorChange={(name) => {
            setSelectedFloor(name)
          }}
          onSave={(payload) => saveLayoutMutation.mutateAsync(payload)}
          onCreateFloor={async (name) => {
            await handleCreateFloor(name)
            setSelectedFloor(name.trim())
          }}
          onRenameFloor={handleRenameFloor}
          onDeleteFloor={handleDeleteFloor}
          onUpsertTable={async (payload) => {
            if (payload.id) {
              await apiClient.updateTable(payload.id, payload)
            } else {
              await apiClient.createTable(payload)
            }
            queryClient.invalidateQueries({ queryKey: ['tables'] })
            queryClient.invalidateQueries({ queryKey: ['tables-summary'] })
            toastHelpers.success('Table saved', `${payload.table_number} updated.`)
          }}
          onDeleteTable={async (id) => {
            await apiClient.deleteTable(id)
            queryClient.invalidateQueries({ queryKey: ['tables'] })
            queryClient.invalidateQueries({ queryKey: ['tables-summary'] })
            toastHelpers.success('Table deleted', 'Removed from floor and table list.')
          }}
        />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Table Management</h2>
          <p className="text-muted-foreground">Manage your restaurant's dining tables and seating arrangements</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setViewMode('layout')} className="gap-2">
            <LayoutGrid className="h-4 w-4" />
            Layout Builder
          </Button>
          <Button
            onClick={() => {
              setEditingTable(null)
              setViewMode('table-form')
            }}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Table
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardContent className="pt-6 text-center"><div className="text-2xl font-bold">{stats.total}</div><p className="text-xs text-muted-foreground">Total Tables</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><div className="text-2xl font-bold text-green-600">{stats.available}</div><p className="text-xs text-muted-foreground">Available</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><div className="text-2xl font-bold text-blue-600">{stats.occupied}</div><p className="text-xs text-muted-foreground">Occupied</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><div className="text-2xl font-bold text-muted-foreground">{floors.length}</div><p className="text-xs text-muted-foreground">Floors / Areas</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><div className="text-2xl font-bold text-muted-foreground">{filteredTables.length}</div><p className="text-xs text-muted-foreground">Filtered</p></CardContent></Card>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tables by number or location..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant={filterStatus === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterStatus('all')}
          >
            All ({stats.total})
          </Button>
          <Button
            variant={filterStatus === 'available' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterStatus('available')}
          >
            Available ({stats.available})
          </Button>
          <Button
            variant={filterStatus === 'occupied' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterStatus('occupied')}
          >
            Occupied ({stats.occupied})
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Card><CardContent className="pt-6">Loading tables...</CardContent></Card>
      ) : filteredTables.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <Settings className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No tables found</h3>
              <p className="mt-1 text-sm text-gray-500">
                {searchTerm || filterStatus !== 'all' ? 'No tables match your current filters.' : 'Get started by adding your first table.'}
              </p>
              {!searchTerm && filterStatus === 'all' && (
                <div className="mt-6">
                  <Button onClick={() => setViewMode('table-form')} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Add Table
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTables.map((table) => {
            const occupied = table.has_active_order ?? table.is_occupied
            const statusMeta = getTableStatusMeta(occupied)
            const activityLabel = getTableActivityLabel(table, occupied)
            return (
              <Card key={table.id} className={`hover:shadow-md transition-shadow border ${occupied ? 'bg-slate-50/70 border-slate-200' : 'bg-white border-emerald-100'}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-2xl leading-none tracking-tight">Table {table.table_number}</CardTitle>
                      <div className="flex items-center gap-2 mt-3">
                        <Badge
                          variant="outline"
                          className={`pointer-events-none gap-1.5 border transition-none ${statusMeta.className}`}
                        >
                          <span className={`h-2 w-2 rounded-full ${statusMeta.dotClass}`} />
                          {occupied ? <Users className="h-3.5 w-3.5" /> : <CheckCircle className="h-3.5 w-3.5" />}
                          {statusMeta.label}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1.5 text-lg font-medium text-slate-500">
                        <Users className="h-4 w-4" />
                        {table.seating_capacity} seats
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {table.location && (
                    <div className="flex items-start gap-2 mb-5">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-muted-foreground">{table.location}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-2 border-t border-border/60">
                    <div className="text-sm text-slate-600 font-medium">
                      {activityLabel}
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingTable(table)
                          setViewMode('table-form')
                        }}
                        className="gap-2"
                      >
                        <Edit className="h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeleteTable(table)}
                        disabled={deleteTableMutation.isPending || occupied}
                        className="gap-2 text-red-600 hover:text-red-700 hover:border-red-300"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function getTableStatusMeta(occupied: boolean): { label: string; className: string; dotClass: string } {
  if (occupied) {
    return {
      label: 'occupied',
      className:
        'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-100 hover:text-slate-800 hover:border-slate-300',
      dotClass: 'bg-slate-500',
    }
  }

  return {
    label: 'available',
    className:
      'bg-green-100 text-green-800 border-green-200 hover:bg-green-100 hover:text-green-800 hover:border-green-200',
    dotClass: 'bg-green-500',
  }
}

function getTableActivityLabel(table: DiningTable, occupied: boolean): string {
  const withCurrentOrder = table as DiningTable & { current_order?: { created_at?: string | null } }
  const openedAt = withCurrentOrder.current_order?.created_at

  if (occupied && openedAt) {
    return `Opened ${formatRelativeTime(openedAt)}`
  }

  if (occupied) {
    return 'Currently occupied'
  }

  if (table.last_booked_at) {
    return `Last booked ${formatRelativeTime(table.last_booked_at)}`
  }

  return 'Never booked'
}

function formatRelativeTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'recently'
  const diffMs = Date.now() - date.getTime()
  const diffMins = Math.max(1, Math.round(diffMs / 60000))

  if (diffMins < 60) {
    return `${diffMins}m ago`
  }

  const diffHours = Math.round(diffMins / 60)
  if (diffHours < 24) {
    return `${diffHours}h ago`
  }

  const diffDays = Math.round(diffHours / 24)
  return `${diffDays}d ago`
}
