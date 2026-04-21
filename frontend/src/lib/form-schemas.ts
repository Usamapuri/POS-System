import { z } from 'zod'

// Common validation patterns
export const emailSchema = z.string().email('Invalid email format')
export const passwordSchema = z.string().min(6, 'Password must be at least 6 characters')
export const requiredStringSchema = z.string().min(1, 'This field is required')
export const positiveNumberSchema = z.number().min(0, 'Must be a positive number')
export const priceSchema = z.number().min(0.01, 'Price must be greater than 0')

// User/Staff related schemas
export const userRoles = ['admin', 'manager', 'inventory_manager', 'counter', 'kitchen'] as const
export const userRoleSchema = z.enum(userRoles)

const profileImageUrlSchema = z
  .string()
  .max(600_000, 'Image data is too large — use a smaller file or an HTTPS link')
  .optional()
  .refine(
    (val) => {
      if (val == null || val.trim() === '') return true
      const t = val.trim()
      return (
        t.startsWith('https://') ||
        t.startsWith('http://') ||
        t.startsWith('data:image/png') ||
        t.startsWith('data:image/jpeg') ||
        t.startsWith('data:image/jpg') ||
        t.startsWith('data:image/webp') ||
        t.startsWith('data:image/gif')
      )
    },
    { message: 'Use an http(s) image URL or upload a PNG, JPEG, WebP, or GIF' }
  )

/** Menu product photo: HTTPS/HTTP link or browser data URL from file upload (~5MB file → ~7M chars base64) */
const productImageUrlSchema = z
  .string()
  .max(8_000_000, 'Image data is too large — use a file under 5MB or an HTTPS link')
  .refine(
    (val) => {
      if (val == null || val.trim() === '') return true
      const t = val.trim()
      return (
        t.startsWith('https://') ||
        t.startsWith('http://') ||
        t.startsWith('data:image/png') ||
        t.startsWith('data:image/jpeg') ||
        t.startsWith('data:image/jpg') ||
        t.startsWith('data:image/webp') ||
        t.startsWith('data:image/gif')
      )
    },
    { message: 'Use an http(s) image URL or upload a PNG, JPEG, WebP, or GIF' }
  )

export const createUserSchema = z.object({
  username: requiredStringSchema.min(3, 'Username must be at least 3 characters'),
  email: emailSchema,
  password: passwordSchema,
  first_name: requiredStringSchema,
  last_name: requiredStringSchema,
  role: userRoleSchema,
  profile_image_url: profileImageUrlSchema,
})

export const updateUserSchema = z.object({
  id: z.string().or(z.number()),
  username: requiredStringSchema.min(3, 'Username must be at least 3 characters').optional(),
  email: emailSchema.optional(),
  password: passwordSchema.optional(),
  first_name: requiredStringSchema.optional(),
  last_name: requiredStringSchema.optional(),
  role: userRoleSchema.optional(),
  profile_image_url: profileImageUrlSchema,
})

// Product related schemas
export const productStatusValues = ['active', 'inactive'] as const
export const productStatusSchema = z.enum(productStatusValues)

export const createProductSchema = z.object({
  name: requiredStringSchema.min(2, 'Product name must be at least 2 characters'),
  description: z.string().optional(),
  price: priceSchema,
  // DB uses UUID strings; Number(uuid) is NaN and becomes JSON null — breaks create/update.
  category_id: z
    .union([z.string(), z.number()])
    .transform((val) => (typeof val === 'string' ? val.trim() : String(val)))
    .pipe(z.string().min(1, 'Category is required')),
  image_url: productImageUrlSchema,
  status: productStatusSchema.default('active'),
  preparation_time: z.number().min(0).max(120).default(5), // minutes
})

export const updateProductSchema = createProductSchema.partial().extend({
  id: z.string().or(z.number()),
})

// Category related schemas
export const createCategorySchema = z.object({
  name: requiredStringSchema.min(2, 'Category name must be at least 2 characters'),
  description: z.string().optional(),
  image_url: z.string().url().optional().or(z.literal('')),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color').default('#6B7280'),
  sort_order: z.number().min(0).default(0),
  /** 'none' = unassigned; otherwise kitchen_stations.id */
  kitchen_station_id: z.string().optional().default('none'),
})

export const updateCategorySchema = createCategorySchema.partial().extend({
  id: z.string().or(z.number()),
})

// Table related schemas
export const tableStatusValues = ['available', 'occupied', 'reserved', 'maintenance'] as const
export const tableStatusSchema = z.enum(tableStatusValues)

export const createTableSchema = z.object({
  table_number: requiredStringSchema.min(1, 'Table number is required'),
  seats: z.number().min(1, 'Table must have at least 1 seat').max(20, 'Maximum 20 seats per table'),
  status: tableStatusSchema.default('available'),
  location: z.string().optional(),
})

export const updateTableSchema = createTableSchema.partial().extend({
  id: z.string().or(z.number()),
})

// Order related schemas
export const orderTypeValues = ['dine-in', 'take-away', 'delivery'] as const
export const orderTypeSchema = z.enum(orderTypeValues)

export const orderStatusValues = ['pending', 'confirmed', 'preparing', 'ready', 'served', 'cancelled'] as const
export const orderStatusSchema = z.enum(orderStatusValues)

export const orderItemSchema = z.object({
  product_id: z.number(),
  quantity: z.number().min(1, 'Quantity must be at least 1'),
  notes: z.string().optional(),
})

export const createOrderSchema = z.object({
  table_id: z.number().optional(),
  customer_name: z.string().optional(),
  order_type: orderTypeSchema,
  notes: z.string().optional(),
  items: z.array(orderItemSchema).min(1, 'Order must have at least one item'),
})

// Settings schemas
export const posSettingsSchema = z.object({
  restaurant_name: requiredStringSchema,
  address: z.string().optional(),
  phone: z.string().optional(),
  email: emailSchema.optional(),
  tax_rate: z.number().min(0).max(1), // 0.08 for 8%
  currency_symbol: requiredStringSchema.default('Rs.'),
  receipt_footer: z.string().optional(),
  auto_print_receipts: z.boolean().default(false),
  order_timeout_minutes: z.number().min(1).max(120).default(30),
})

// Login schema
export const loginSchema = z.object({
  username: requiredStringSchema,
  password: requiredStringSchema,
})

// Export types
export type CreateUserData = z.infer<typeof createUserSchema>
export type UpdateUserData = z.infer<typeof updateUserSchema>
export type CreateProductData = z.infer<typeof createProductSchema>
export type UpdateProductData = z.infer<typeof updateProductSchema>
export type CreateCategoryData = z.infer<typeof createCategorySchema>
export type UpdateCategoryData = z.infer<typeof updateCategorySchema>
export type CreateTableData = z.infer<typeof createTableSchema>
export type UpdateTableData = z.infer<typeof updateTableSchema>
export type CreateOrderData = z.infer<typeof createOrderSchema>
export type LoginData = z.infer<typeof loginSchema>
export type POSSettingsData = z.infer<typeof posSettingsSchema>
