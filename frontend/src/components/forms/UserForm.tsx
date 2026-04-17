import { useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Form } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { 
  TextInputField, 
  SelectField, 
  FormSubmitButton,
  roleOptions 
} from '@/components/forms/FormComponents'
import { createUserSchema, updateUserSchema, type CreateUserData, type UpdateUserData } from '@/lib/form-schemas'
import { toastHelpers } from '@/lib/toast-helpers'
import apiClient from '@/api/client'
import type { User } from '@/types'
import { X } from 'lucide-react'

interface UserFormProps {
  user?: User // If provided, we're editing; otherwise creating
  onSuccess?: () => void
  onCancel?: () => void
  mode?: 'create' | 'edit'
}

export function UserForm({ user, onSuccess, onCancel, mode = 'create' }: UserFormProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isEditing = mode === 'edit' && user

  // Choose the appropriate schema and default values
  const schema = isEditing ? updateUserSchema : createUserSchema
  const defaultValues = isEditing 
    ? {
        id: user.id,
        username: user.username,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role as any,
        password: '', // Don't pre-fill password for editing
        profile_image_url: user.profile_image_url ?? '',
      }
    : {
        username: '',
        email: '',
        password: '',
        first_name: '',
        last_name: '',
        role: 'server' as const,
        profile_image_url: '',
      }

  const form = useForm<CreateUserData | UpdateUserData>({
    resolver: zodResolver(schema),
    defaultValues,
  })

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateUserData) => {
      const payload = { ...data } as Record<string, unknown>
      if (!String(payload.profile_image_url ?? '').trim()) delete payload.profile_image_url
      return apiClient.createUser(payload)
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toastHelpers.userCreated(`${form.getValues('first_name')} ${form.getValues('last_name')}`)
      form.reset()
      onSuccess?.()
    },
    onError: (error) => {
      toastHelpers.apiError('Create user', error)
    },
  })

  // Update mutation  
  const updateMutation = useMutation({
    mutationFn: (data: UpdateUserData) => {
      const payload = { ...data } as Record<string, unknown>
      if (payload.profile_image_url !== undefined && !String(payload.profile_image_url ?? '').trim()) {
        payload.profile_image_url = ''
      }
      return apiClient.updateUser(String(data.id), payload)
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toastHelpers.apiSuccess('Update', `User ${form.getValues('first_name')} ${form.getValues('last_name')}`)
      onSuccess?.()
    },
    onError: (error) => {
      toastHelpers.apiError('Update user', error)
    },
  })

  const onSubmit = (data: CreateUserData | UpdateUserData) => {
    if (isEditing) {
      // Filter out empty password for updates
      const updateData = { ...data } as UpdateUserData
      if (!updateData.password || updateData.password.trim() === '') {
        delete updateData.password
      }
      updateMutation.mutate(updateData)
    } else {
      createMutation.mutate(data as CreateUserData)
    }
  }

  const isLoading = createMutation.isPending || updateMutation.isPending

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>
          {isEditing ? 'Edit User' : 'Create New User'}
        </CardTitle>
        {onCancel && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onCancel}
            disabled={isLoading}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Personal Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TextInputField
                control={form.control}
                name="first_name"
                label="First Name"
                placeholder="Enter first name"
                autoComplete="given-name"
              />
              
              <TextInputField
                control={form.control}
                name="last_name"
                label="Last Name"
                placeholder="Enter last name"
                autoComplete="family-name"
              />
            </div>

            {/* Account Information */}
            <div className="space-y-4">
              <TextInputField
                control={form.control}
                name="username"
                label="Username"
                placeholder="Enter username"
                autoComplete="username"
                description="Used for logging into the system"
              />

              <TextInputField
                control={form.control}
                name="email"
                label="Email Address"
                type="email"
                placeholder="Enter email address"
                autoComplete="email"
              />

              <TextInputField
                control={form.control}
                name="password"
                label={isEditing ? "New Password (leave blank to keep current)" : "Password"}
                type="password"
                placeholder={isEditing ? "Enter new password or leave blank" : "Enter password"}
                autoComplete={isEditing ? "new-password" : "new-password"}
                description={isEditing ? "Leave blank to keep the current password" : "Minimum 6 characters"}
              />
            </div>

            {/* Role Selection */}
            <SelectField
              control={form.control}
              name="role"
              label="Role"
              placeholder="Select user role"
              options={roleOptions}
              description="Determines what features the user can access"
            />

            <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
              <div>
                <Label className="text-base">Profile photo</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Paste a public image link (HTTPS recommended), or pick a small file — it is stored as a data URL in the database.
                  For production, host images on your CDN and paste the URL only.
                </p>
              </div>
              <TextInputField
                control={form.control}
                name="profile_image_url"
                label="Image URL"
                placeholder="https://example.com/photo.jpg"
              />
              <div className="space-y-1.5">
                <Label htmlFor="staff-profile-file" className="text-sm font-medium">
                  Or upload a small image
                </Label>
                <input
                  id="staff-profile-file"
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                  className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    if (f.size > 350_000) {
                      toastHelpers.error('Image too large', 'Please use a file under ~350KB or paste an HTTPS link instead.')
                      e.target.value = ''
                      return
                    }
                    const reader = new FileReader()
                    reader.onload = () => {
                      const result = String(reader.result || '')
                      form.setValue('profile_image_url', result, { shouldValidate: true, shouldDirty: true })
                    }
                    reader.readAsDataURL(f)
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs text-muted-foreground"
                  onClick={() => {
                    form.setValue('profile_image_url', '', { shouldValidate: true, shouldDirty: true })
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                >
                  Clear photo
                </Button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <FormSubmitButton
                isLoading={isLoading}
                loadingText={isEditing ? "Updating..." : "Creating..."}
                className="flex-1"
              >
                {isEditing ? 'Update User' : 'Create User'}
              </FormSubmitButton>
              
              {onCancel && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onCancel}
                  disabled={isLoading}
                  className="flex-1"
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
