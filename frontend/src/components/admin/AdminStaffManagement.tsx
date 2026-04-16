import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UserPlus, Search, Key, X } from 'lucide-react'
import apiClient from '@/api/client'
import { toastHelpers } from '@/lib/toast-helpers'
import { UserForm } from '@/components/forms/UserForm'
import { AdminStaffTable } from '@/components/admin/AdminStaffTable'
import { PaginationControlsComponent } from '@/components/ui/pagination-controls'
import { usePagination } from '@/hooks/usePagination'
import { UserListSkeleton } from '@/components/ui/skeletons'
import { InlineLoading } from '@/components/ui/loading-spinner'
import type { User } from '@/types'

export function AdminStaffManagement() {
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [pinUser, setPinUser] = useState<User | null>(null)
  const [pinValue, setPinValue] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [pinError, setPinError] = useState('')

  const queryClient = useQueryClient()

  // Pagination hook
  const pagination = usePagination({ 
    initialPage: 1, 
    initialPageSize: 10,
    total: 0 
  })

  // Debounce search term
  useEffect(() => {
    if (searchTerm !== debouncedSearch) {
      setIsSearching(true)
    }
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm)
      pagination.goToFirstPage()
      setIsSearching(false)
    }, 500)
    return () => clearTimeout(timer)
  }, [searchTerm, debouncedSearch])

  // Fetch users with pagination
  const { data: usersData, isLoading, isFetching } = useQuery({
    queryKey: ['users', pagination.page, pagination.pageSize, debouncedSearch],
    queryFn: () => apiClient.getUsers({
      page: pagination.page,
      limit: pagination.pageSize,
      search: debouncedSearch || undefined
    }).then((res: any) => res.data)
  })

  // Extract data and pagination info
  const users = Array.isArray(usersData) ? usersData : (usersData as any)?.data || []
  const paginationInfo = (usersData as any)?.pagination || { total: 0 }

  // Delete user mutation (keep existing functionality)  
  const deleteUserMutation = useMutation({
    mutationFn: ({ id }: { id: string, username: string }) => apiClient.deleteUser(id),
    onSuccess: (_, { username: deletedUsername }) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toastHelpers.userDeleted(deletedUsername)
    },
    onError: (error: any) => {
      toastHelpers.apiError('Delete user', error)
    }
  })

  const setPinMutation = useMutation({
    mutationFn: ({ userId, pin }: { userId: string; pin: string }) => apiClient.setUserPin(userId, pin),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setPinUser(null)
      setPinValue('')
      setPinConfirm('')
      setPinError('')
    },
    onError: (error: any) => {
      setPinError(error.message || 'Failed to set PIN')
    },
  })

  const handleSetPin = () => {
    if (pinValue.length !== 4 || !/^\d{4}$/.test(pinValue)) {
      setPinError('PIN must be exactly 4 digits')
      return
    }
    if (pinValue !== pinConfirm) {
      setPinError('PINs do not match')
      return
    }
    if (!pinUser) return
    setPinMutation.mutate({ userId: pinUser.id, pin: pinValue })
  }

  const handleFormSuccess = () => {
    setShowCreateForm(false)
    setEditingUser(null)
  }

  const handleCancelForm = () => {
    setShowCreateForm(false)
    setEditingUser(null)
  }

  const handleDeleteUser = (user: User) => {
    const displayName = `${user.first_name} ${user.last_name}`
    if (confirm(`Are you sure you want to delete ${displayName}?`)) {
      deleteUserMutation.mutate({ 
        id: user.id.toString(), 
        username: displayName
      })
    }
  }

  // Data is already filtered on the server side
  const filteredUsers = users

  // Show form if creating or editing
  if (showCreateForm || editingUser) {
    return (
      <div className="p-6">
        <UserForm
          user={editingUser || undefined}
          mode={editingUser ? 'edit' : 'create'}
          onSuccess={handleFormSuccess}
          onCancel={handleCancelForm}
        />
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-8 w-48 bg-muted animate-pulse rounded-md" />
            <div className="h-4 w-72 bg-muted animate-pulse rounded-md" />
          </div>
          <div className="h-10 w-24 bg-muted animate-pulse rounded-md" />
        </div>
        
        {/* Search and Controls Skeleton */}
        <div className="flex items-center justify-between gap-4">
          <div className="h-10 w-full max-w-sm bg-muted animate-pulse rounded-md" />
        </div>
        
        {/* User List Skeleton */}
        <UserListSkeleton count={pagination.pageSize} />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Staff Management</h2>
          <p className="text-muted-foreground">
            Manage your restaurant staff and their permissions
          </p>
        </div>
        <Button onClick={() => setShowCreateForm(true)} className="gap-2">
          <UserPlus className="h-4 w-4" />
          Add New Staff
        </Button>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search staff by name, email, or username..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
            {isSearching && (
              <div className="absolute right-2 top-2.5">
                <InlineLoading size="sm" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Staff table */}
      <div className="space-y-4">
        <AdminStaffTable
          data={filteredUsers}
          onEdit={setEditingUser}
          onDelete={handleDeleteUser}
          onSetPin={setPinUser}
          isLoading={isLoading}
        />
      </div>

      {/* Pagination with loading state */}
      {filteredUsers.length > 0 && (
        <div className="mt-6 space-y-4">
          {isFetching && !isLoading && (
            <div className="flex justify-center">
              <InlineLoading text="Updating results..." />
            </div>
          )}
          <PaginationControlsComponent
            pagination={pagination}
            total={paginationInfo.total || users.length}
          />
        </div>
      )}

      {/* PIN Modal */}
      {pinUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-96 shadow-2xl">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-purple-600" />
                <h3 className="font-bold text-gray-900">Set Manager PIN</h3>
              </div>
              <button onClick={() => { setPinUser(null); setPinValue(''); setPinConfirm(''); setPinError('') }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="text-sm text-gray-600">
                Setting PIN for <span className="font-semibold">{pinUser.first_name} {pinUser.last_name}</span> ({pinUser.role})
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">4-Digit PIN</label>
                <Input
                  type="password"
                  maxLength={4}
                  placeholder="Enter 4-digit PIN"
                  value={pinValue}
                  onChange={e => { setPinValue(e.target.value.replace(/\D/g, '').slice(0, 4)); setPinError('') }}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Confirm PIN</label>
                <Input
                  type="password"
                  maxLength={4}
                  placeholder="Re-enter PIN"
                  value={pinConfirm}
                  onChange={e => { setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4)); setPinError('') }}
                />
              </div>
              {pinError && <p className="text-red-500 text-sm">{pinError}</p>}
            </div>
            <div className="p-4 border-t flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => { setPinUser(null); setPinValue(''); setPinConfirm(''); setPinError('') }}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleSetPin} disabled={setPinMutation.isPending}>
                {setPinMutation.isPending ? 'Saving...' : 'Save PIN'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}