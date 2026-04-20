import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Edit,
  Trash2,
  Shield,
  Mail,
  Calendar,
  Key,
} from "lucide-react"
import type { User } from "@/types"
import { staffRoleLabel } from "@/lib/staff-roles"
import { staffAvatarImageUrl } from "@/lib/staff-avatar"
import { formatDateDDMMYYYY } from "@/lib/utils"

interface AdminStaffTableProps {
  data: (User & { has_pin?: boolean })[]
  onEdit: (user: User) => void
  onDelete: (user: User) => void
  onSetPin?: (user: User) => void
  isLoading?: boolean
}

export function AdminStaffTable({
  data,
  onEdit,
  onDelete,
  onSetPin,
  isLoading = false
}: AdminStaffTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])

  const getRoleBadgeColor = (role: string) => {
    const colors: Record<string, string> = {
      admin: 'bg-red-100 text-red-800 hover:bg-red-200',
      inventory_manager: 'bg-teal-100 text-teal-800 hover:bg-teal-200',
      counter: 'bg-green-100 text-green-800 hover:bg-green-200',
      kitchen: 'bg-orange-100 text-orange-800 hover:bg-orange-200',
    }
    return colors[role.toLowerCase()] || 'bg-gray-100 text-gray-800'
  }

  const columns: ColumnDef<User>[] = [
    {
      accessorKey: "first_name",
      header: ({ column }) => {
        const isSorted = column.getIsSorted()
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-8 px-2 lg:px-3"
          >
            Name
            {isSorted === "asc" ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : isSorted === "desc" ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        )
      },
      cell: ({ row }) => {
        const user = row.original
        const displayName = `${user.first_name} ${user.last_name}`.trim() || user.username
        const src = staffAvatarImageUrl(user)
        return (
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <img
                src={src}
                alt={displayName}
                width={40}
                height={40}
                className="h-10 w-10 rounded-full object-cover ring-2 ring-amber-100/90 bg-amber-50 shadow-sm"
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const el = e.currentTarget
                  if (el.dataset.fallback === "1") return
                  el.dataset.fallback = "1"
                  el.src =
                    "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f600.png"
                }}
              />
            </div>
            <div>
              <div className="font-medium text-gray-900">
                {user.first_name} {user.last_name}
              </div>
              <div className="text-sm text-gray-500">@{user.username}</div>
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: "email",
      header: ({ column }) => {
        const isSorted = column.getIsSorted()
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-8 px-2 lg:px-3"
          >
            <Mail className="mr-2 h-4 w-4" />
            Email
            {isSorted === "asc" ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : isSorted === "desc" ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        )
      },
      cell: ({ getValue }) => {
        const email = getValue() as string
        return (
          <div className="flex items-center">
            <span className="text-gray-900">{email}</span>
          </div>
        )
      },
    },
    {
      accessorKey: "role",
      header: ({ column }) => {
        const isSorted = column.getIsSorted()
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-8 px-2 lg:px-3"
          >
            <Shield className="mr-2 h-4 w-4" />
            Role
            {isSorted === "asc" ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : isSorted === "desc" ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        )
      },
      cell: ({ getValue }) => {
        const role = getValue() as string
        return (
          <Badge className={getRoleBadgeColor(role)}>
            {staffRoleLabel(role)}
          </Badge>
        )
      },
    },
    {
      accessorKey: "is_active",
      header: "Status",
      cell: ({ getValue }) => {
        const isActive = getValue() as boolean
        return (
          <Badge variant={isActive ? "default" : "secondary"}>
            <div className={`w-2 h-2 rounded-full mr-2 ${isActive ? 'bg-green-400' : 'bg-gray-400'}`} />
            {isActive ? "Active" : "Inactive"}
          </Badge>
        )
      },
    },
    {
      accessorKey: "created_at",
      header: ({ column }) => {
        const isSorted = column.getIsSorted()
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-8 px-2 lg:px-3"
          >
            <Calendar className="mr-2 h-4 w-4" />
            Joined
            {isSorted === "asc" ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : isSorted === "desc" ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        )
      },
      cell: ({ getValue }) => {
        const date = getValue() as string
        return (
          <div className="text-gray-900">
            {formatDateDDMMYYYY(date)}
          </div>
        )
      },
    },
    {
      id: "pin",
      header: () => (
        <div className="flex items-center">
          <Key className="mr-2 h-4 w-4" />
          PIN
        </div>
      ),
      cell: ({ row }) => {
        const user = row.original as User & { has_pin?: boolean }
        const canHavePin = user.role === 'admin'
        if (!canHavePin) return <span className="text-gray-300">—</span>
        return (
          <div className="flex items-center gap-2">
            {(user as any).has_pin ? (
              <Badge variant="secondary" className="text-xs">
                <Key className="w-3 h-3 mr-1" /> ****
              </Badge>
            ) : (
              <span className="text-gray-400 text-xs">Not set</span>
            )}
            {onSetPin && (
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => onSetPin(user)}>
                {(user as any).has_pin ? 'Change' : 'Set'}
              </Button>
            )}
          </div>
        )
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const user = row.original
        return (
          <div className="flex items-center space-x-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onEdit(user)}
              className="h-8 px-2 lg:px-3"
            >
              <Edit className="h-4 w-4" />
              <span className="sr-only lg:not-sr-only lg:ml-2">Edit</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onDelete(user)}
              className="h-8 px-2 lg:px-3 text-red-600 hover:text-red-700 hover:border-red-300"
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only lg:not-sr-only lg:ml-2">Delete</span>
            </Button>
          </div>
        )
      },
    },
  ]

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
  })

  return (
    <div className="w-full">
      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id} className="px-4">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 bg-gray-200 rounded animate-pulse" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="hover:bg-gray-50"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                      <Shield className="w-6 h-6 text-gray-400" />
                    </div>
                    <p className="text-gray-500">No staff members found</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
