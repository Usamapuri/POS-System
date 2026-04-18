import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import type { ExpenseCategoryDefinition } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toastHelpers } from '@/lib/toast-helpers'
import { useExpenseCategoryDefs } from './use-expense-category-defs'

const COLOR_PRESETS = [
  { label: 'Default', value: 'bg-muted text-muted-foreground' },
  { label: 'Blue', value: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200' },
  { label: 'Yellow', value: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200' },
  { label: 'Purple', value: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200' },
  { label: 'Green', value: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200' },
  { label: 'Orange', value: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200' },
  { label: 'Pink', value: 'bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-200' },
  { label: 'Cyan', value: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200' },
]

export function ManageExpenseCategoriesDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const qc = useQueryClient()
  const { data: defs = [], isLoading, refetch } = useExpenseCategoryDefs(open)
  const [newLabel, setNewLabel] = useState('')
  const [editing, setEditing] = useState<ExpenseCategoryDefinition | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editColor, setEditColor] = useState('')
  const [editSort, setEditSort] = useState('0')
  const [editActive, setEditActive] = useState(true)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<ExpenseCategoryDefinition | null>(null)

  const sorted = useMemo(() => [...defs].sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label)), [defs])

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['expenseCategoryDefs'] })
  }

  const createMut = useMutation({
    mutationFn: () => apiClient.createExpenseCategoryDefinition({ label: newLabel.trim() }),
    onSuccess: () => {
      invalidate()
      setNewLabel('')
      toastHelpers.success('Category added')
      void refetch()
    },
    onError: (err: Error) => toastHelpers.apiError('Add category', err),
  })

  const updateMut = useMutation({
    mutationFn: () => {
      if (!editing) return Promise.reject(new Error('No row'))
      const so = parseInt(editSort, 10)
      return apiClient.updateExpenseCategoryDefinition(editing.id, {
        label: editLabel.trim(),
        color: editColor.trim() || undefined,
        sort_order: Number.isFinite(so) ? so : editing.sort_order,
        is_active: editActive,
      })
    },
    onSuccess: () => {
      invalidate()
      setEditing(null)
      toastHelpers.success('Category updated')
      void refetch()
    },
    onError: (err: Error) => toastHelpers.apiError('Update category', err),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiClient.deleteExpenseCategoryDefinition(id),
    onSuccess: () => {
      invalidate()
      toastHelpers.success('Category deleted')
      void refetch()
      setDeleteDialogOpen(false)
      setPendingDelete(null)
    },
    onError: (err: Error) => toastHelpers.apiError('Delete category', err),
  })

  const startEdit = (d: ExpenseCategoryDefinition) => {
    setEditing(d)
    setEditLabel(d.label)
    setEditColor(d.color)
    setEditSort(String(d.sort_order))
    setEditActive(d.is_active)
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,720px)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage expense categories</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="rounded-lg border p-3">
            <Label className="text-xs text-muted-foreground">New category</Label>
            <div className="mt-2 flex gap-2">
              <Input
                placeholder="Label (e.g. Licenses)"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newLabel.trim() && !createMut.isPending) createMut.mutate()
                }}
              />
              <Button
                type="button"
                disabled={!newLabel.trim() || createMut.isPending}
                onClick={() => createMut.mutate()}
              >
                Add
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              That name is what people see when they pick a category. Categories that came with the app cannot be removed.
            </p>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="space-y-2">
              {sorted.map(d => (
                <div
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card p-2 text-sm"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Badge className={d.color}>{d.label}</Badge>
                    <span className="truncate font-mono text-xs text-muted-foreground">{d.slug}</span>
                    {d.is_system && (
                      <Badge variant="secondary" className="text-xs">
                        System
                      </Badge>
                    )}
                    {!d.is_active && (
                      <Badge variant="outline" className="text-xs">
                        Inactive
                      </Badge>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button type="button" variant="ghost" size="sm" onClick={() => startEdit(d)}>
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      disabled={d.is_system || deleteMut.isPending}
                      onClick={() => {
                        setPendingDelete(d)
                        setDeleteDialogOpen(true)
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {editing && (
          <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
            <p className="text-sm font-medium">Edit “{editing.label}”</p>
            <div className="grid gap-2">
              <Label>Label</Label>
              <Input value={editLabel} onChange={e => setEditLabel(e.target.value)} disabled={editing.is_system} />
            </div>
            <div className="grid gap-2">
              <Label>Badge color</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={COLOR_PRESETS.some(p => p.value === editColor) ? editColor : '__custom__'}
                onChange={e => {
                  if (e.target.value === '__custom__') return
                  setEditColor(e.target.value)
                }}
              >
                {COLOR_PRESETS.map(p => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
                <option value="__custom__">Custom (edit field below)</option>
              </select>
              <Input
                placeholder="Tailwind classes, e.g. bg-rose-100 text-rose-800"
                value={editColor}
                onChange={e => setEditColor(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Sort order</Label>
              <Input type="number" value={editSort} onChange={e => setEditSort(e.target.value)} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="cat-active">Active (shown in pickers)</Label>
              <Switch id="cat-active" checked={editActive} onCheckedChange={setEditActive} />
            </div>
            <DialogFooter className="gap-2 sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel edit
              </Button>
              <Button
                type="button"
                disabled={!editLabel.trim() || updateMut.isPending}
                onClick={() => updateMut.mutate()}
              >
                {updateMut.isPending ? 'Saving…' : 'Save changes'}
              </Button>
            </DialogFooter>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog
      open={deleteDialogOpen}
      onOpenChange={o => {
        setDeleteDialogOpen(o)
        if (!o) setPendingDelete(null)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete this category?</DialogTitle>
          <DialogDescription>
            {pendingDelete
              ? `Delete "${pendingDelete.label}"? This only works if no expenses use this category. If it is deleted, you cannot bring it back.`
              : 'Delete this category? This only works if no expenses use this category. If it is deleted, you cannot bring it back.'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setDeleteDialogOpen(false)
              setPendingDelete(null)
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!pendingDelete || deleteMut.isPending}
            onClick={() => {
              if (pendingDelete) deleteMut.mutate(pendingDelete.id)
            }}
          >
            {deleteMut.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
