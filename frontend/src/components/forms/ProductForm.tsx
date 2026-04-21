import { useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Form } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { 
  TextInputField, 
  TextareaField,
  PriceInputField,
  NumberInputField,
  SelectField,
  FormSubmitButton
} from '@/components/forms/FormComponents'
import { createProductSchema, updateProductSchema, type CreateProductData, type UpdateProductData } from '@/lib/form-schemas'
import { toastHelpers } from '@/lib/toast-helpers'
import apiClient from '@/api/client'
import type { Product } from '@/types'
import { useCurrency } from '@/contexts/CurrencyContext'

/** Raw file size cap before readAsDataURL (aligned with productImageUrlSchema in form-schemas) */
const MAX_MENU_PHOTO_FILE_BYTES = 5 * 1024 * 1024
import { currencyInputPrefix } from '@/lib/formatMoney'
import { X } from 'lucide-react'

interface ProductFormProps {
  product?: Product // If provided, we're editing; otherwise creating
  onSuccess?: () => void
  onCancel?: () => void
  mode?: 'create' | 'edit'
}

export function ProductForm({ product, onSuccess, onCancel, mode = 'create' }: ProductFormProps) {
  const { currencyCode } = useCurrency()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isEditing = mode === 'edit' && product

  // Fetch categories for dropdown
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiClient.getCategories().then(res => res.data)
  })

  // Create category options for select field
  const categoryOptions = categories.map(cat => ({
    value: cat.id.toString(),
    label: cat.name
  }))

  // Choose the appropriate schema and default values
  const schema = isEditing ? updateProductSchema : createProductSchema
  const defaultValues = isEditing 
    ? {
        id: product.id,
        name: product.name,
        description: product.description || '',
        price: product.price,
        category_id: product.category_id != null ? String(product.category_id) : '',
        image_url: product.image_url || '',
        preparation_time: product.preparation_time || 5,
      }
    : {
        name: '',
        description: '',
        price: 0,
        category_id: categories[0]?.id != null ? String(categories[0].id) : '',
        image_url: '',
        preparation_time: 5,
        is_available: true,
      }

  const form = useForm<CreateProductData | UpdateProductData>({
    resolver: zodResolver(schema),
    defaultValues,
  })

  const imagePreviewUrl = form.watch('image_url')?.trim() || ''

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateProductData) => apiClient.createProduct(data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      toastHelpers.productCreated(form.getValues('name'))
      form.reset()
      onSuccess?.()
    },
    onError: (error) => {
      toastHelpers.apiError('Create product', error)
    },
  })

  // Update mutation  
  const updateMutation = useMutation({
    mutationFn: (data: UpdateProductData) => apiClient.updateProduct(data.id.toString(), data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      toastHelpers.apiSuccess('Update', `Product "${form.getValues('name')}"`)
      onSuccess?.()
    },
    onError: (error) => {
      toastHelpers.apiError('Update product', error)
    },
  })

  const onSubmit = (data: CreateProductData | UpdateProductData) => {
    if (isEditing) {
      updateMutation.mutate(data as UpdateProductData)
    } else {
      createMutation.mutate(data as CreateProductData)
    }
  }

  const isLoading = createMutation.isPending || updateMutation.isPending

  if (categories.length === 0) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">
              You need to create at least one category before adding products.
            </p>
            <Button onClick={onCancel} variant="outline">
              Go Back
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>
          {isEditing ? 'Edit Product' : 'Create New Product'}
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
            {/* Basic Information */}
            <div className="space-y-4">
              <TextInputField
                control={form.control}
                name="name"
                label="Product Name"
                placeholder="Enter product name"
                description="The name that will appear on the menu"
              />
              
              <TextareaField
                control={form.control}
                name="description"
                label="Description"
                placeholder="Describe the product..."
                rows={3}
                description="Optional description for staff and customers"
              />

              <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                <div>
                  <Label className="text-base">Product photo</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Upload has a limit of 5 mb.
                  </p>
                </div>
                <TextInputField
                  control={form.control}
                  name="image_url"
                  label="Image URL"
                  placeholder="https://example.com/image.jpg"
                  description="Optional product image URL"
                />
                <div className="space-y-1.5">
                  <Label htmlFor="product-image-file" className="text-sm font-medium">
                    Or upload an image
                  </Label>
                  <input
                    id="product-image-file"
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                    className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (!f) return
                      if (f.size > MAX_MENU_PHOTO_FILE_BYTES) {
                        toastHelpers.error(
                          'Image too large',
                          'Please use a file under 5MB (try exporting or compressing the photo), or paste an HTTPS link instead.'
                        )
                        e.target.value = ''
                        return
                      }
                      const reader = new FileReader()
                      reader.onload = () => {
                        const result = String(reader.result || '')
                        form.setValue('image_url', result, { shouldValidate: true, shouldDirty: true })
                      }
                      reader.readAsDataURL(f)
                    }}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs text-muted-foreground"
                      onClick={() => {
                        form.setValue('image_url', '', { shouldValidate: true, shouldDirty: true })
                        if (fileInputRef.current) fileInputRef.current.value = ''
                      }}
                    >
                      Clear photo
                    </Button>
                  </div>
                  {imagePreviewUrl &&
                    (imagePreviewUrl.startsWith('http') || imagePreviewUrl.startsWith('data:image')) && (
                      <div className="pt-1">
                        <p className="mb-1 text-xs text-muted-foreground">Preview</p>
                        <img
                          src={imagePreviewUrl}
                          alt=""
                          className="h-24 w-24 rounded-md border object-cover"
                        />
                      </div>
                    )}
                </div>
              </div>
            </div>

            {/* Pricing & Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <PriceInputField
                control={form.control}
                name="price"
                label="Price"
                currency={currencyInputPrefix(currencyCode)}
                description="Product selling price"
              />
              
              <NumberInputField
                control={form.control}
                name="preparation_time"
                label="Preparation Time (minutes)"
                min={1}
                max={120}
                description="Estimated cooking/prep time"
              />
            </div>

            {/* Category */}
            <SelectField
              control={form.control}
              name="category_id"
              label="Category"
              options={categoryOptions}
              placeholder="Select a category"
              description="Product category for menu organization"
            />

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <FormSubmitButton
                isLoading={isLoading}
                loadingText={isEditing ? "Updating..." : "Creating..."}
                className="flex-1"
              >
                {isEditing ? 'Update Product' : 'Create Product'}
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
