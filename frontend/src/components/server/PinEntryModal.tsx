import { useState, useRef, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { Button } from '@/components/ui/button'
import { Ban, CheckCircle, X } from 'lucide-react'
import { useCurrency } from '@/contexts/CurrencyContext'

interface PinEntryModalProps {
  orderId: string
  itemId: string
  itemName: string
  quantity: number
  unitPrice: number
  onSuccess: (itemId: string) => void
  onClose: () => void
}

const VOID_REASONS = [
  'Customer Request',
  'Kitchen Error',
  'Wrong Order',
  'Manager Decision',
  'Quality Issue',
  'Other',
]

export function PinEntryModal({
  orderId,
  itemId,
  itemName,
  quantity,
  unitPrice,
  onSuccess,
  onClose,
}: PinEntryModalProps) {
  const { formatCurrency } = useCurrency()
  const [pin, setPin] = useState(['', '', '', ''])
  const [reason, setReason] = useState(VOID_REASONS[0])
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [shake, setShake] = useState(false)
  const inputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ]

  useEffect(() => {
    inputRefs[0].current?.focus()
  }, [])

  const voidMutation = useMutation({
    mutationFn: async () => {
      const pinStr = pin.join('')
      return apiClient.voidItem(orderId, itemId, { pin: pinStr, reason })
    },
    onSuccess: (res) => {
      if (res.success) {
        const authorizedBy = (res.data as any)?.authorized_by || 'Manager'
        setSuccessMsg(`Voided by ${authorizedBy}`)
        setTimeout(() => {
          onSuccess(itemId)
        }, 1200)
      } else {
        triggerShake()
      }
    },
    onError: () => {
      triggerShake()
    },
  })

  const triggerShake = () => {
    setError('Invalid PIN. Try again.')
    setShake(true)
    setPin(['', '', '', ''])
    setTimeout(() => setShake(false), 500)
    setTimeout(() => inputRefs[0].current?.focus(), 100)
  }

  const handleDigit = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return
    const newPin = [...pin]
    newPin[index] = value
    setPin(newPin)
    setError('')

    if (value && index < 3) {
      inputRefs[index + 1].current?.focus()
    }

    if (value && index === 3 && newPin.every(d => d !== '')) {
      // Auto-submit when all 4 digits entered
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      inputRefs[index - 1].current?.focus()
    }
  }

  const handleSubmit = () => {
    const pinStr = pin.join('')
    if (pinStr.length !== 4) {
      setError('Please enter a 4-digit PIN')
      return
    }
    voidMutation.mutate()
  }

  if (successMsg) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-8 w-96 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-900">Item Voided</h3>
          <p className="text-gray-500 mt-2">{successMsg}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-96 overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="bg-red-50 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ban className="w-5 h-5 text-red-600" />
            <h3 className="font-bold text-red-900">Void Item</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Item info */}
        <div className="p-4 border-b">
          <div className="font-medium text-gray-900">{itemName}</div>
          <div className="text-sm text-gray-500 mt-1">
            Qty: {quantity} &times; {formatCurrency(unitPrice)} = {formatCurrency(quantity * unitPrice)}
          </div>
        </div>

        {/* Reason */}
        <div className="p-4 border-b">
          <label className="text-sm font-medium text-gray-700 block mb-2">Reason</label>
          <select
            value={reason}
            onChange={e => setReason(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {VOID_REASONS.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        {/* PIN Input */}
        <div className="p-6">
          <label className="text-sm font-medium text-gray-700 block mb-3 text-center">
            Enter Manager PIN
          </label>
          <div className={`flex gap-3 justify-center ${shake ? 'animate-shake' : ''}`}>
            {pin.map((digit, i) => (
              <input
                key={i}
                ref={inputRefs[i]}
                type="password"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={e => handleDigit(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
                className="w-14 h-14 text-center text-2xl font-bold border-2 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
            ))}
          </div>
          {error && (
            <p className="text-red-500 text-sm text-center mt-3">{error}</p>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 border-t flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            onClick={handleSubmit}
            disabled={pin.some(d => d === '') || voidMutation.isPending}
          >
            {voidMutation.isPending ? 'Verifying...' : 'Void Item'}
          </Button>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }
        .animate-shake { animation: shake 0.3s ease-in-out 2; }
      `}</style>
    </div>
  )
}
