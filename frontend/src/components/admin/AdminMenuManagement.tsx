import { useState, useEffect, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Plus, 
  Search,
  Package,
  Tag,
  Edit,
  Trash2,
  Table,
  Grid3X3,
  Clock
} from 'lucide-react'
import { useCurrency } from '@/contexts/CurrencyContext'
import apiClient from '@/api/client'
import { toastHelpers } from '@/lib/toast-helpers'
import { ProductForm } from '@/components/forms/ProductForm'
import { CategoryForm } from '@/components/forms/CategoryForm'
import { AdminMenuTable } from '@/components/admin/AdminMenuTable'
import { AdminCategoriesTable } from '@/components/admin/AdminCategoriesTable'
import { PaginationControlsComponent } from '@/components/ui/pagination-controls'
import { usePagination } from '@/hooks/usePagination'
import { ProductListSkeleton, CategoryListSkeleton, SearchingSkeleton } from '@/components/ui/skeletons'
import { InlineLoading } from '@/components/ui/loading-spinner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Product, Category } from '@/types'

type ViewMode = 'list' | 'product-form' | 'category-form'
type DisplayMode = 'table' | 'cards'
type ActiveTab = 'products' | 'categories'

export function AdminMenuManagement() {
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [displayMode, setDisplayMode] = useState<DisplayMode>('table')
  const [activeTab, setActiveTab] = useState<ActiveTab>('products')
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [categorySearch, setCategorySearch] = useState('')
  const [debouncedCategorySearch, setDebouncedCategorySearch] = useState('')
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [showCreateProductForm, setShowCreateProductForm] = useState(false)
  const [showCreateCategoryForm, setShowCreateCategoryForm] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkAvailabilityOpen, setBulkAvailabilityOpen] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [deleteProductOpen, setDeleteProductOpen] = useState(false)
  const [deleteCategoryOpen, setDeleteCategoryOpen] = useState(false)
  const [pendingDeleteProduct, setPendingDeleteProduct] = useState<Product | null>(null)
  const [pendingDeleteCategory, setPendingDeleteCategory] = useState<Category | null>(null)

  const queryClient = useQueryClient()
  const { formatCurrency } = useCurrency()

  // Pagination hooks
  const productsPagination = usePagination({ 
    initialPage: 1, 
    initialPageSize: 10,
    total: 0 
  })
  
  const categoriesPagination = usePagination({ 
    initialPage: 1, 
    initialPageSize: 10,
    total: 0 
  })

  // Debounce product search
  useEffect(() => {
    if (searchTerm !== debouncedSearch) {
      setIsSearching(true)
    }
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm)
      productsPagination.goToFirstPage()
      setIsSearching(false)
    }, 500)
    return () => clearTimeout(timer)
  }, [searchTerm, debouncedSearch])

  // Debounce category search
  useEffect(() => {
    if (categorySearch !== debouncedCategorySearch) {
      setIsSearching(true)
    }
    const timer = setTimeout(() => {
      setDebouncedCategorySearch(categorySearch)
      categoriesPagination.goToFirstPage()
      setIsSearching(false)
    }, 500)
    return () => clearTimeout(timer)
  }, [categorySearch, debouncedCategorySearch])

  // Fetch products with pagination
  const { data: productsData, isLoading: isLoadingProducts, isFetching: isFetchingProducts } = useQuery({
    queryKey: ['admin-products', productsPagination.page, productsPagination.pageSize, debouncedSearch],
    queryFn: () => apiClient.getAdminProducts({
      page: productsPagination.page,
      per_page: productsPagination.pageSize,
      search: debouncedSearch || undefined
    }).then((res: any) => res.data)
  })

  // Fetch categories with pagination
  const { data: categoriesData, isLoading: isLoadingCategories, isFetching: isFetchingCategories } = useQuery({
    queryKey: ['admin-categories', categoriesPagination.page, categoriesPagination.pageSize, debouncedCategorySearch],
    queryFn: () => apiClient.getAdminCategories({
      page: categoriesPagination.page,
      per_page: categoriesPagination.pageSize,
      search: debouncedCategorySearch || undefined
    }).then((res: any) => res.data)
  })

  // Extract data and pagination info
  const products = Array.isArray(productsData) ? productsData : (productsData as any)?.data || []
  const productsPaginationInfo = (productsData as any)?.pagination || { total: 0 }

  const categories = Array.isArray(categoriesData) ? categoriesData : (categoriesData as any)?.data || []
  const categoriesPaginationInfo = (categoriesData as any)?.pagination || { total: 0 }

  useEffect(() => {
    setSelectedProductIds(new Set())
  }, [productsPagination.page, productsPagination.pageSize, debouncedSearch])

  useEffect(() => {
    if (activeTab !== 'products') {
      setSelectedProductIds(new Set())
    }
  }, [activeTab])

  const toggleProductSelect = useCallback((id: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAllProductsOnPage = useCallback(() => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev)
      const allSelected =
        products.length > 0 && products.every((p: Product) => next.has(String(p.id)))
      if (allSelected) {
        products.forEach((p: Product) => next.delete(String(p.id)))
      } else {
        products.forEach((p: Product) => next.add(String(p.id)))
      }
      return next
    })
  }, [products])

  const allProductsPageSelected =
    products.length > 0 && products.every((p: Product) => selectedProductIds.has(String(p.id)))

  const bulkSelectedProducts = useMemo(() => {
    return products.filter((p: Product) => selectedProductIds.has(String(p.id)))
  }, [products, selectedProductIds])

  const runBulkDelete = async () => {
    const ids = [...selectedProductIds]
    const idToName = new Map(bulkSelectedProducts.map((p: Product) => [String(p.id), p.name]))
    setBulkBusy(true)
    try {
      const results = await Promise.allSettled(ids.map((id) => apiClient.deleteProduct(id)))
      let ok = 0
      const fails: string[] = []
      results.forEach((r, i) => {
        const id = ids[i]
        const label = idToName.get(id) || id
        if (r.status === 'fulfilled') {
          if (r.value.success) ok++
          else fails.push(`${label}: ${r.value.message || 'Failed'}`)
        } else {
          const err = r.reason instanceof Error ? r.reason.message : String(r.reason)
          fails.push(`${label}: ${err}`)
        }
      })
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setSelectedProductIds(new Set())
      setBulkDeleteOpen(false)
      if (fails.length === 0) {
        toastHelpers.success('Products deleted', `${ok} product(s) removed.`)
      } else {
        toastHelpers.warning(
          `Deleted ${ok}, ${fails.length} failed`,
          fails.slice(0, 4).join('; ') + (fails.length > 4 ? '…' : '')
        )
      }
    } finally {
      setBulkBusy(false)
    }
  }

  const runBulkSetAvailability = async (isAvailable: boolean) => {
    const ids = [...selectedProductIds]
    const idToName = new Map(bulkSelectedProducts.map((p: Product) => [String(p.id), p.name]))
    setBulkBusy(true)
    try {
      const results = await Promise.allSettled(
        ids.map((id) => apiClient.updateProduct(id, { is_available: isAvailable }))
      )
      let ok = 0
      const fails: string[] = []
      results.forEach((r, i) => {
        const id = ids[i]
        const label = idToName.get(id) || id
        if (r.status === 'fulfilled') {
          if (r.value.success) ok++
          else fails.push(`${label}: ${r.value.message || 'Failed'}`)
        } else {
          const err = r.reason instanceof Error ? r.reason.message : String(r.reason)
          fails.push(`${label}: ${err}`)
        }
      })
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setSelectedProductIds(new Set())
      setBulkAvailabilityOpen(false)
      if (fails.length === 0) {
        toastHelpers.success(
          'Availability updated',
          `${ok} product(s) marked ${isAvailable ? 'available' : 'unavailable'}.`
        )
      } else {
        toastHelpers.warning(
          `Updated ${ok}, ${fails.length} failed`,
          fails.slice(0, 4).join('; ') + (fails.length > 4 ? '…' : '')
        )
      }
    } finally {
      setBulkBusy(false)
    }
  }

  // Delete product mutation
  const deleteProductMutation = useMutation({
    mutationFn: ({ id }: { id: string; name: string }) => apiClient.deleteProduct(id),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      toastHelpers.productDeleted(variables.name)
    },
    onError: (error: any) => {
      toastHelpers.apiError('Delete product', error)
    }
  })

  // Delete category mutation
  const deleteCategoryMutation = useMutation({
    mutationFn: ({ id }: { id: string; name: string }) => apiClient.deleteCategory(id),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] })
      toastHelpers.categoryDeleted(variables.name)
    },
    onError: (error: any) => {
      toastHelpers.apiError('Delete category', error)
    }
  })

  // Toggle product availability mutation
  const toggleAvailabilityMutation = useMutation({
    mutationFn: ({ id, isAvailable }: { id: string; isAvailable: boolean }) =>
      apiClient.updateProduct(id, { is_available: isAvailable }),
    onMutate: async ({ id, isAvailable }) => {
      await queryClient.cancelQueries({ queryKey: ['admin-products'] })
      const previousProducts = queryClient.getQueryData(['admin-products', productsPagination.page, productsPagination.pageSize, debouncedSearch])
      queryClient.setQueryData(
        ['admin-products', productsPagination.page, productsPagination.pageSize, debouncedSearch],
        (old: any) => {
          if (!old) return old
          const data = Array.isArray(old) ? old : old.data || []
          const updatedData = data.map((p: Product) =>
            String(p.id) === id ? { ...p, is_available: isAvailable } : p
          )
          return Array.isArray(old) ? updatedData : { ...old, data: updatedData }
        }
      )
      return { previousProducts }
    },
    onSuccess: (_, { isAvailable }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toastHelpers.success(
        isAvailable ? 'Item available' : 'Item unavailable',
        isAvailable ? 'Product is now visible on the menu' : 'Product is now hidden from the menu'
      )
    },
    onError: (error: any, _, context) => {
      if (context?.previousProducts) {
        queryClient.setQueryData(
          ['admin-products', productsPagination.page, productsPagination.pageSize, debouncedSearch],
          context.previousProducts
        )
      }
      toastHelpers.apiError('Update availability', error)
    }
  })

  const handleToggleAvailability = useCallback((product: Product) => {
    toggleAvailabilityMutation.mutate({
      id: String(product.id),
      isAvailable: !product.is_available
    })
  }, [toggleAvailabilityMutation])

  const handleFormSuccess = () => {
    setShowCreateProductForm(false)
    setShowCreateCategoryForm(false)
    setEditingProduct(null)
    setEditingCategory(null)
    setViewMode('list')
  }

  const handleCancelForm = () => {
    setShowCreateProductForm(false)
    setShowCreateCategoryForm(false)
    setEditingProduct(null)
    setEditingCategory(null)
    setViewMode('list')
  }

  const handleDeleteProduct = (product: Product) => {
    setPendingDeleteProduct(product)
    setDeleteProductOpen(true)
  }

  const confirmDeleteProduct = () => {
    if (pendingDeleteProduct) {
      deleteProductMutation.mutate({
        id: pendingDeleteProduct.id.toString(),
        name: pendingDeleteProduct.name,
      })
    }
    setDeleteProductOpen(false)
    setPendingDeleteProduct(null)
  }

  const handleDeleteCategory = (category: Category) => {
    setPendingDeleteCategory(category)
    setDeleteCategoryOpen(true)
  }

  const confirmDeleteCategory = () => {
    if (pendingDeleteCategory) {
      deleteCategoryMutation.mutate({
        id: pendingDeleteCategory.id.toString(),
        name: pendingDeleteCategory.name,
      })
    }
    setDeleteCategoryOpen(false)
    setPendingDeleteCategory(null)
  }

  // Show form if creating or editing
  if (showCreateProductForm || editingProduct) {
    return (
      <div className="p-6">
        <ProductForm
          product={editingProduct || undefined}
          mode={editingProduct ? 'edit' : 'create'}
          onSuccess={handleFormSuccess}
          onCancel={handleCancelForm}
        />
      </div>
    )
  }

  if (showCreateCategoryForm || editingCategory) {
    return (
      <div className="p-6">
        <CategoryForm
          category={editingCategory || undefined}
          mode={editingCategory ? 'edit' : 'create'}
          onSuccess={handleFormSuccess}
          onCancel={handleCancelForm}
        />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Menu Management</h2>
          <p className="text-muted-foreground">
            Manage your restaurant's products and categories
          </p>
        </div>
        <div className="flex items-center space-x-4">
          {/* View Toggle */}
          <div className="flex items-center bg-muted rounded-lg p-1">
            <Button
              variant={displayMode === 'table' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setDisplayMode('table')}
              className="px-3"
            >
              <Table className="h-4 w-4 mr-1" />
              Table
            </Button>
            <Button
              variant={displayMode === 'cards' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setDisplayMode('cards')}
              className="px-3"
            >
              <Grid3X3 className="h-4 w-4 mr-1" />
              Cards
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ActiveTab)} className="w-full">
        <div className="flex items-center justify-between">
          <TabsList className="grid w-[400px] grid-cols-2">
            <TabsTrigger value="products" className="gap-2">
              <Package className="h-4 w-4" />
              Products ({products.length || 0})
            </TabsTrigger>
            <TabsTrigger value="categories" className="gap-2">
              <Tag className="h-4 w-4" />
              Categories ({categories.length || 0})
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Products Tab */}
        <TabsContent value="products" className="space-y-6">
          {/* Search and Add Product */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search products by name, category, or description..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                  {isSearching && activeTab === 'products' && (
                    <div className="absolute right-2 top-2.5">
                      <InlineLoading size="sm" />
                    </div>
                  )}
                </div>
                <Button onClick={() => setShowCreateProductForm(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Product
                </Button>
              </div>
            </CardContent>
          </Card>

          {displayMode === 'table' && selectedProductIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5">
              <span className="text-sm font-medium">
                {selectedProductIds.size} product{selectedProductIds.size !== 1 ? 's' : ''} selected
              </span>
              <div className="flex-1" />
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => setBulkAvailabilityOpen(true)}
              >
                Set availability…
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-8"
                onClick={() => setBulkDeleteOpen(true)}
              >
                Delete selected…
              </Button>
              <Button size="sm" variant="ghost" className="h-8" onClick={() => setSelectedProductIds(new Set())}>
                Clear
              </Button>
            </div>
          )}

          {/* Products List */}
          <div className="space-y-4">
            {displayMode === 'table' ? (
              <AdminMenuTable
                data={products}
                categories={categories}
                onEdit={setEditingProduct}
                onDelete={handleDeleteProduct}
                onToggleAvailability={handleToggleAvailability}
                isLoading={isLoadingProducts}
                selectedIds={selectedProductIds}
                onToggleSelect={toggleProductSelect}
                onToggleSelectAllPage={toggleAllProductsOnPage}
                allPageSelected={allProductsPageSelected}
              />
            ) : isLoadingProducts ? (
              <ProductListSkeleton />
            ) : products.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-8">
                    <Package className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No products</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {searchTerm ? 'No products match your search.' : 'Get started by adding your first product.'}
                    </p>
                    {!searchTerm && (
                      <div className="mt-6">
                        <Button onClick={() => setShowCreateProductForm(true)} className="gap-2">
                          <Plus className="h-4 w-4" />
                          Add Product
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {products.map((product: Product) => (
                  <Card key={product.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-3 flex-1">
                          <div className="flex-shrink-0">
                            {product.image_url ? (
                              <img 
                                src={product.image_url} 
                                alt={product.name}
                                className="h-16 w-16 rounded-lg object-cover"
                              />
                            ) : (
                              <div className="h-16 w-16 rounded-lg bg-gradient-to-r from-orange-400 to-pink-500 flex items-center justify-center">
                                <Package className="h-8 w-8 text-white" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="font-medium text-gray-900 truncate">{product.name}</h3>
                            <p className="text-sm text-gray-500 line-clamp-2">
                              {product.description || "No description"}
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge variant="outline" className="text-green-600">
                                {formatCurrency(product.price)}
                              </Badge>
                              <Badge variant="outline" className="text-blue-600">
                                <Clock className="w-3 h-3 mr-1" />
                                {product.preparation_time}min
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col space-y-1 ml-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingProduct(product)}
                            className="h-8 w-8 p-0"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeleteProduct(product)}
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:border-red-300"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Products Pagination */}
            {products.length > 0 && (
              <div className="mt-6 space-y-4">
                {isFetchingProducts && !isLoadingProducts && (
                  <div className="flex justify-center">
                    <InlineLoading text="Updating products..." />
                  </div>
                )}
                <PaginationControlsComponent
                  pagination={productsPagination}
                  total={productsPaginationInfo.total || products.length}
                />
              </div>
            )}
          </div>
        </TabsContent>

        {/* Categories Tab */}
        <TabsContent value="categories" className="space-y-6">
          {/* Search and Add Category */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search categories by name or description..."
                    value={categorySearch}
                    onChange={(e) => setCategorySearch(e.target.value)}
                    className="pl-8"
                  />
                  {isSearching && activeTab === 'categories' && (
                    <div className="absolute right-2 top-2.5">
                      <InlineLoading size="sm" />
                    </div>
                  )}
                </div>
                <Button onClick={() => setShowCreateCategoryForm(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Category
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Categories List */}
          <div className="space-y-4">
            {displayMode === 'table' ? (
              <AdminCategoriesTable
                data={categories}
                onEdit={setEditingCategory}
                onDelete={handleDeleteCategory}
                isLoading={isLoadingCategories}
              />
            ) : isLoadingCategories ? (
              <CategoryListSkeleton />
            ) : categories.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-8">
                    <Tag className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No categories</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {categorySearch ? 'No categories match your search.' : 'Get started by adding your first category.'}
                    </p>
                    {!categorySearch && (
                      <div className="mt-6">
                        <Button onClick={() => setShowCreateCategoryForm(true)} className="gap-2">
                          <Plus className="h-4 w-4" />
                          Add Category
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {categories.map((category: Category) => (
                  <Card key={category.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <div 
                          className="mx-auto h-16 w-16 rounded-lg flex items-center justify-center mb-4"
                          style={{ 
                            backgroundColor: category.color || '#6B7280',
                            color: 'white'
                          }}
                        >
                          <Tag className="h-8 w-8" />
                        </div>
                        <h3 className="font-medium text-gray-900 mb-2">{category.name}</h3>
                        <p className="text-sm text-gray-500 mb-4 line-clamp-2">
                          {category.description || "No description"}
                        </p>
                        <div className="flex justify-center space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingCategory(category)}
                            className="gap-1"
                          >
                            <Edit className="h-4 w-4" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeleteCategory(category)}
                            className="gap-1 text-red-600 hover:text-red-700 hover:border-red-300"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Categories Pagination */}
            {categories.length > 0 && (
              <div className="mt-6 space-y-4">
                {isFetchingCategories && !isLoadingCategories && (
                  <div className="flex justify-center">
                    <InlineLoading text="Updating categories..." />
                  </div>
                )}
                <PaginationControlsComponent
                  pagination={categoriesPagination}
                  total={categoriesPaginationInfo.total || categories.length}
                />
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={bulkDeleteOpen} onOpenChange={(o) => !bulkBusy && setBulkDeleteOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {selectedProductIds.size} product(s)?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>This cannot be undone. Products on active orders cannot be deleted.</p>
                <ul className="list-disc pl-4 space-y-1 text-foreground">
                  {bulkSelectedProducts.slice(0, 5).map((p: Product) => (
                    <li key={p.id}>{p.name}</li>
                  ))}
                </ul>
                {bulkSelectedProducts.length > 5 && (
                  <p>and {bulkSelectedProducts.length - 5} more…</p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)} disabled={bulkBusy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void runBulkDelete()} disabled={bulkBusy}>
              {bulkBusy ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkAvailabilityOpen} onOpenChange={(o) => !bulkBusy && setBulkAvailabilityOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set availability for {selectedProductIds.size} product(s)</DialogTitle>
            <DialogDescription>
              Applies to all selected products on this page. Unavailable products are hidden from the default menu where
              filtered.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setBulkAvailabilityOpen(false)} disabled={bulkBusy}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={() => void runBulkSetAvailability(false)} disabled={bulkBusy}>
              {bulkBusy ? 'Updating…' : 'Mark unavailable'}
            </Button>
            <Button onClick={() => void runBulkSetAvailability(true)} disabled={bulkBusy}>
              {bulkBusy ? 'Updating…' : 'Mark available'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteProductOpen} onOpenChange={setDeleteProductOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Product?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{pendingDeleteProduct?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteProductOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteProduct}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteCategoryOpen} onOpenChange={setDeleteCategoryOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Category?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{pendingDeleteCategory?.name}"? This action cannot be undone. Products in this category will become uncategorized.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteCategoryOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteCategory}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}