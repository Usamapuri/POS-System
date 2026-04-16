import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toastHelpers } from '@/lib/toast-helpers'
import apiClient from '@/api/client'
import type { DiningTable } from '@/types'
import { X } from 'lucide-react'
import { FloorCombobox } from '@/components/tables/FloorCombobox'

interface TableFormProps {
  table?: DiningTable
  floors?: string[]
  onCreateFloor?: (name: string) => Promise<void>
  onRenameFloor?: (from: string, to: string) => Promise<void>
  onDeleteFloor?: (name: string, moveTo: string) => Promise<void>
  onSuccess?: () => void
  onCancel?: () => void
  mode?: 'create' | 'edit'
}

export function TableForm({
  table,
  floors = [],
  onCreateFloor,
  onRenameFloor,
  onDeleteFloor,
  onSuccess,
  onCancel,
  mode = 'create',
}: TableFormProps) {
  const queryClient = useQueryClient()
  const isEditing = mode === 'edit' && table
  const [tableNumber, setTableNumber] = useState(isEditing ? table.table_number : '')
  const [seatingCapacity, setSeatingCapacity] = useState(isEditing ? table.seating_capacity : 4)
  const [location, setLocation] = useState(isEditing ? (table.location ?? '') : '')
  const [status, setStatus] = useState<'available' | 'occupied'>(
    isEditing && (table.has_active_order ?? table.is_occupied) ? 'occupied' : 'available'
  )

  useEffect(() => {
    if (!location && floors.length > 0) {
      setLocation(floors[0])
    }
  }, [floors, location])

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.createTable({
        table_number: tableNumber,
        seating_capacity: seatingCapacity,
        location: location || null,
        zone: null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tables'] })
      queryClient.invalidateQueries({ queryKey: ['tables'] })
      queryClient.invalidateQueries({ queryKey: ['tables-summary'] })
      toastHelpers.tableCreated(tableNumber)
      onSuccess?.()
    },
    onError: (error) => {
      toastHelpers.apiError('Create table', error)
    },
  })

  const updateMutation = useMutation({
    mutationFn: () =>
      apiClient.updateTable(table.id, {
        table_number: tableNumber,
        seating_capacity: seatingCapacity,
        location: location || null,
        zone: null,
        is_occupied: status === 'occupied',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tables'] })
      queryClient.invalidateQueries({ queryKey: ['tables'] })
      queryClient.invalidateQueries({ queryKey: ['tables-summary'] })
      toastHelpers.apiSuccess('Update', `Table ${tableNumber}`)
      onSuccess?.()
    },
    onError: (error) => {
      toastHelpers.apiError('Update table', error)
    },
  })

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!tableNumber.trim()) {
      toastHelpers.warning('Missing table number', 'Please provide a unique table number.')
      return
    }
    if (seatingCapacity < 1 || seatingCapacity > 20) {
      toastHelpers.warning('Invalid seat count', 'Seats must be between 1 and 20.')
      return
    }
    if (!location.trim()) {
      toastHelpers.warning('Location required', 'Choose or create a floor / location.')
      return
    }
    if (isEditing) {
      updateMutation.mutate()
      return
    }
    createMutation.mutate()
  }

  const isLoading = createMutation.isPending || updateMutation.isPending
  const handleCreateFloor = onCreateFloor ?? (async () => {})

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{isEditing ? 'Edit Table' : 'Create New Table'}</CardTitle>
        {onCancel && (
          <Button variant="ghost" size="icon" onClick={onCancel} disabled={isLoading}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-6">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Table Number</label>
              <Input
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                placeholder="Enter table number (e.g., T1, BAR01)"
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Location / Floor</label>
              <FloorCombobox
                value={location}
                onValueChange={(v) => setLocation(v)}
                options={floors}
                onCreateFloor={handleCreateFloor}
                onRenameFloor={onRenameFloor}
                onDeleteFloor={onDeleteFloor}
                disabled={isLoading}
                placeholder="Search, select, or type a new name and press Enter"
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                Type to filter. Press Enter to add a new floor to the list.
              </p>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Seats</label>
              <Input
                type="number"
                min={1}
                max={20}
                value={seatingCapacity}
                onChange={(e) => setSeatingCapacity(Number(e.target.value) || 1)}
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Status</label>
              <select
                className="w-full p-2 border border-input rounded-md bg-background"
                value={status}
                onChange={(e) => setStatus(e.target.value as 'available' | 'occupied')}
                disabled={isLoading}
              >
                <option value="available">Available</option>
                <option value="occupied">Occupied</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="submit" disabled={isLoading} className="flex-1">
              {isLoading ? (isEditing ? 'Updating...' : 'Creating...') : isEditing ? 'Update Table' : 'Create Table'}
            </Button>

            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading} className="flex-1">
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
