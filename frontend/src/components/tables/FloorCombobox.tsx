import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export type FloorComboboxProps = {
  value: string
  onValueChange: (v: string) => void
  options: string[]
  onCreateFloor: (name: string) => Promise<void>
  onRenameFloor?: (from: string, to: string) => Promise<void>
  onDeleteFloor?: (name: string, moveTo: string) => Promise<void>
  disabled?: boolean
  id?: string
  className?: string
  placeholder?: string
  /**
   * When false, the input stays empty while the list is closed (placeholder only).
   * Parent `value` still drives the selected floor. Opening always clears the filter so the full list shows.
   */
  commitDisplayWhenClosed?: boolean
}

function sortFloors(list: string[]): string[] {
  return [...new Set(list.map((s) => s.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  )
}

export function FloorCombobox({
  value,
  onValueChange,
  options,
  onCreateFloor,
  onRenameFloor,
  onDeleteFloor,
  disabled,
  id,
  className,
  placeholder = 'Search or type a floor name…',
  commitDisplayWhenClosed = true,
}: FloorComboboxProps) {
  const floors = useMemo(() => sortFloors(options), [options])
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(() => (commitDisplayWhenClosed ? value : ''))
  const wrapRef = useRef<HTMLDivElement>(null)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameTo, setRenameTo] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [moveTo, setMoveTo] = useState('')

  const closeList = useCallback(() => {
    setOpen(false)
    if (commitDisplayWhenClosed) {
      setText(value)
    } else {
      setText('')
    }
  }, [value, commitDisplayWhenClosed])

  const openList = useCallback(() => {
    setText('')
    setOpen(true)
  }, [])

  useEffect(() => {
    if (open || !commitDisplayWhenClosed) return
    setText(value)
  }, [value, open, commitDisplayWhenClosed])

  useEffect(() => {
    if (!deleteOpen || !value) return
    const others = floors.filter((f) => f !== value)
    setMoveTo(others[0] || '')
  }, [deleteOpen, value, floors])

  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase()
    if (!q) return floors
    return floors.filter((f) => f.toLowerCase().includes(q))
  }, [floors, text])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) closeList()
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [closeList])

  const pickExact = (name: string) => {
    const found = floors.find((f) => f.toLowerCase() === name.toLowerCase().trim())
    const next = found ?? name.trim()
    if (!next) return
    onValueChange(next)
    setOpen(false)
    if (commitDisplayWhenClosed) {
      setText(next)
    } else {
      setText('')
    }
  }

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      closeList()
      return
    }
    if (e.key !== 'Enter') return
    e.preventDefault()
    const raw = text.trim()
    if (!raw) return

    const existing = floors.find((f) => f.toLowerCase() === raw.toLowerCase())
    if (existing) {
      pickExact(existing)
      return
    }

    await onCreateFloor(raw)
    onValueChange(raw)
    setOpen(false)
    if (commitDisplayWhenClosed) {
      setText(raw)
    } else {
      setText('')
    }
  }

  const canManage = Boolean(value) && (onRenameFloor || onDeleteFloor)
  const otherFloors = floors.filter((f) => f !== value)

  return (
    <div className={cn('relative flex gap-1', className)}>
      <div ref={wrapRef} className="relative min-w-0 flex-1">
        <Input
          id={id}
          disabled={disabled}
          value={text}
          placeholder={placeholder}
          className="pr-9"
          onFocus={openList}
          onChange={(e) => {
            setText(e.target.value)
            setOpen(true)
          }}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          disabled={disabled}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
          onClick={() => {
            if (open) closeList()
            else openList()
          }}
          aria-label="Show floors"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
        {open && !disabled && (
          <ul
            className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md"
            role="listbox"
          >
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted-foreground">No match — press Enter to create</li>
            )}
            {filtered.map((f) => (
              <li key={f}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickExact(f)}
                >
                  {f}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="icon" disabled={disabled} aria-label="Floor actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onRenameFloor && (
              <DropdownMenuItem
                onSelect={() => {
                  setRenameTo(value)
                  setRenameOpen(true)
                }}
              >
                Rename floor…
              </DropdownMenuItem>
            )}
            {onDeleteFloor && (
              <DropdownMenuItem
                disabled={otherFloors.length === 0}
                className="text-destructive focus:text-destructive"
                onSelect={() => setDeleteOpen(true)}
              >
                Delete floor…
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename floor</DialogTitle>
          </DialogHeader>
          <Input value={renameTo} onChange={(e) => setRenameTo(e.target.value)} placeholder="New name" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const next = renameTo.trim()
                if (!next || !onRenameFloor) return
                await onRenameFloor(value, next)
                setRenameOpen(false)
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete floor</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Move all tables from <strong>{value}</strong> to another floor, then remove this name from the list.
          </p>
          {otherFloors.length > 0 ? (
            <Select value={moveTo} onValueChange={setMoveTo}>
              <SelectTrigger>
                <SelectValue placeholder="Move tables to" />
              </SelectTrigger>
              <SelectContent>
                {otherFloors.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-destructive">Add another floor before deleting this one.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!moveTo || otherFloors.length === 0}
              onClick={async () => {
                if (!onDeleteFloor || !moveTo) return
                await onDeleteFloor(value, moveTo)
                setDeleteOpen(false)
              }}
            >
              Delete floor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
