import React from 'react'
import { Control, FieldPath, FieldValues } from 'react-hook-form'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Loader2 } from 'lucide-react'
import { getCurrencySymbolPrefix } from '@/lib/currency'

/** Digits + at most one '.'; strips leading zeros on the integer part (0999 → 999); keeps 0.x */
function sanitizeDecimalTyping(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '')
  const dot = cleaned.indexOf('.')
  let intPart: string
  let frac: string
  if (dot === -1) {
    intPart = cleaned
    frac = ''
  } else {
    intPart = cleaned.slice(0, dot)
    frac = cleaned.slice(dot + 1).replace(/\./g, '')
  }
  intPart = intPart.replace(/^0+(?=\d)/, '')
  if (dot === -1) return intPart
  return frac.length > 0 ? `${intPart}.${frac}` : `${intPart}.`
}

function formatPriceDisplay(n: unknown): string {
  if (n == null || typeof n !== 'number' || Number.isNaN(n)) return ''
  if (n === 0) return ''
  const rounded = Math.round(n * 100) / 100
  return String(rounded)
}

function parsePriceOnBlur(text: string): number {
  const t = text.replace(/\.$/, '')
  if (t === '' || t === '.') return 0
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : 0
}

function sanitizeIntegerTyping(raw: string): string {
  return raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
}

function formatIntDisplay(n: unknown): string {
  if (n == null || typeof n !== 'number' || Number.isNaN(n)) return ''
  return String(Math.trunc(n))
}

function clampInt(n: number, min?: number, max?: number): number {
  let x = n
  if (min != null && x < min) x = min
  if (max != null && x > max) x = max
  return x
}

// Generic form field wrapper
interface FormFieldWrapperProps<T extends FieldValues> {
  control: Control<T>
  name: FieldPath<T>
  label: string
  description?: string
  children: React.ReactNode
}

export function FormFieldWrapper<T extends FieldValues>({
  control,
  name,
  label,
  description,
  children,
}: FormFieldWrapperProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={() => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            {children}
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

// Text Input Field
interface TextInputFieldProps<T extends FieldValues> {
  control: Control<T>
  name: FieldPath<T>
  label: string
  placeholder?: string
  description?: string
  type?: 'text' | 'email' | 'password' | 'tel'
  autoComplete?: string
}

export function TextInputField<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  description,
  type = 'text',
  autoComplete,
}: TextInputFieldProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              type={type}
              placeholder={placeholder}
              autoComplete={autoComplete}
              {...field}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

// Number Input Field
interface NumberInputFieldProps<T extends FieldValues> {
  control: Control<T>
  name: FieldPath<T>
  label: string
  placeholder?: string
  description?: string
  min?: number
  max?: number
}

function IntegerTextInput({
  value,
  onChange,
  onBlur,
  name,
  inputRef,
  placeholder,
  min,
  max,
}: {
  value: number
  onChange: (v: number) => void
  onBlur: () => void
  name: string
  inputRef: React.Ref<HTMLInputElement>
  placeholder?: string
  min?: number
  max?: number
}) {
  const [text, setText] = React.useState(() => formatIntDisplay(value))
  const [focused, setFocused] = React.useState(false)

  React.useEffect(() => {
    if (!focused) {
      setText(formatIntDisplay(value))
    }
  }, [value, focused])

  return (
    <Input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      name={name}
      ref={inputRef}
      placeholder={placeholder}
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        const s = sanitizeIntegerTyping(e.target.value)
        setText(s)
        if (s === '') {
          onChange(0)
          return
        }
        const n = parseInt(s, 10)
        if (!Number.isNaN(n)) {
          onChange(n)
        }
      }}
      onBlur={() => {
        setFocused(false)
        const raw = sanitizeIntegerTyping(text)
        let n = raw === '' ? NaN : parseInt(raw, 10)
        if (Number.isNaN(n)) {
          n = min != null ? min : 0
        }
        n = clampInt(n, min, max)
        onChange(n)
        onBlur()
        setText(formatIntDisplay(n))
      }}
    />
  )
}

export function NumberInputField<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  description,
  min,
  max,
}: NumberInputFieldProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <IntegerTextInput
              value={typeof field.value === 'number' ? field.value : 0}
              onChange={field.onChange}
              onBlur={field.onBlur}
              name={field.name}
              inputRef={field.ref}
              placeholder={placeholder}
              min={min}
              max={max}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

// Price Input Field (specialized number field)
interface PriceInputFieldProps<T extends FieldValues> {
  control: Control<T>
  name: FieldPath<T>
  label: string
  placeholder?: string
  description?: string
  currency?: string
}

function PriceTextInput({
  value,
  onChange,
  onBlur,
  name,
  inputRef,
  placeholder,
  symbol,
}: {
  value: number
  onChange: (v: number) => void
  onBlur: () => void
  name: string
  inputRef: React.Ref<HTMLInputElement>
  placeholder?: string
  symbol: string
}) {
  const [text, setText] = React.useState(() => formatPriceDisplay(value))
  const [focused, setFocused] = React.useState(false)

  React.useEffect(() => {
    if (!focused) {
      setText(formatPriceDisplay(value))
    }
  }, [value, focused])

  const pushPriceFromString = (s: string) => {
    if (s === '' || s === '.') {
      onChange(0)
      return
    }
    if (s.endsWith('.')) {
      const head = s.slice(0, -1)
      if (head === '') {
        onChange(0)
        return
      }
      const n = parseFloat(head)
      if (!Number.isNaN(n)) {
        onChange(n)
      }
      return
    }
    const n = parseFloat(s)
    if (!Number.isNaN(n)) {
      onChange(n)
    }
  }

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
        {symbol}
      </span>
      <Input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        name={name}
        ref={inputRef}
        placeholder={placeholder}
        className="pl-8"
        value={text}
        onFocus={() => setFocused(true)}
        onChange={(e) => {
          const s = sanitizeDecimalTyping(e.target.value)
          setText(s)
          pushPriceFromString(s)
        }}
        onBlur={() => {
          setFocused(false)
          const n = parsePriceOnBlur(text)
          onChange(n)
          onBlur()
          setText(formatPriceDisplay(n))
        }}
      />
    </div>
  )
}

export function PriceInputField<T extends FieldValues>({
  control,
  name,
  label,
  placeholder = '0.00',
  description,
  currency,
}: PriceInputFieldProps<T>) {
  const symbol = currency ?? getCurrencySymbolPrefix()
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <PriceTextInput
              value={typeof field.value === 'number' ? field.value : 0}
              onChange={field.onChange}
              onBlur={field.onBlur}
              name={field.name}
              inputRef={field.ref}
              placeholder={placeholder}
              symbol={symbol}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

// Select Field
interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface SelectFieldProps<T extends FieldValues> {
  control: Control<T>
  name: FieldPath<T>
  label: string
  placeholder?: string
  description?: string
  options: SelectOption[]
}

export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  placeholder = "Select an option",
  description,
  options,
}: SelectFieldProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select onValueChange={field.onChange} value={field.value ?? undefined}>
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {options.map((option) => (
                <SelectItem 
                  key={option.value} 
                  value={option.value}
                  disabled={option.disabled}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

// Textarea Field
interface TextareaFieldProps<T extends FieldValues> {
  control: Control<T>
  name: FieldPath<T>
  label: string
  placeholder?: string
  description?: string
  rows?: number
}

export function TextareaField<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  description,
  rows = 3,
}: TextareaFieldProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Textarea
              placeholder={placeholder}
              rows={rows}
              {...field}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

// Switch Field
interface SwitchFieldProps<T extends FieldValues> {
  control: Control<T>
  name: FieldPath<T>
  label: string
  description?: string
}

export function SwitchField<T extends FieldValues>({
  control,
  name,
  label,
  description,
}: SwitchFieldProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <FormLabel className="text-base">{label}</FormLabel>
            {description && <FormDescription>{description}</FormDescription>}
          </div>
          <FormControl>
            <Switch
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          </FormControl>
        </FormItem>
      )}
    />
  )
}

// Submit Button with loading state
interface FormSubmitButtonProps {
  isLoading?: boolean
  loadingText?: string
  children: React.ReactNode
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  className?: string
  disabled?: boolean
}

export function FormSubmitButton({
  isLoading = false,
  loadingText = "Saving...",
  children,
  variant = "default",
  size = "default",
  className,
  disabled = false,
}: FormSubmitButtonProps) {
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      className={className}
      disabled={isLoading || disabled}
    >
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {loadingText}
        </>
      ) : (
        children
      )}
    </Button>
  )
}

// POS-specific role select options
export const roleOptions: SelectOption[] = [
  { value: 'admin', label: 'Administrator (full access)' },
  { value: 'inventory_manager', label: 'Inventory manager' },
  { value: 'counter', label: 'Counter (checkout, floor, menu & tables)' },
  { value: 'kitchen', label: 'Kitchen (KDS & stations)' },
]

// POS-specific status options
export const productStatusOptions: SelectOption[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

export const orderTypeOptions: SelectOption[] = [
  { value: 'dine-in', label: 'Dine In' },
  { value: 'take-away', label: 'Take Away' },
  { value: 'delivery', label: 'Delivery' },
]

export const tableStatusOptions: SelectOption[] = [
  { value: 'available', label: 'Available' },
  { value: 'occupied', label: 'Occupied' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'maintenance', label: 'Under Maintenance' },
]
