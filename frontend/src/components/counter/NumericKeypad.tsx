import { Button } from '@/components/ui/button'
import { Delete } from 'lucide-react'

type Props = {
  value: string
  onChange: (next: string) => void
  maxDigits?: number
  className?: string
}

export function NumericKeypad({ value, onChange, maxDigits = 3, className }: Props) {
  const append = (d: string) => {
    if (value.length >= maxDigits) return
    if (value === '' && d === '0') return
    if (value === '0' && d !== '0') onChange(d)
    else if (value === '0' && d === '0') return
    else onChange(value === '' ? d : value + d)
  }

  const backspace = () => onChange(value.slice(0, -1))
  const clear = () => onChange('')

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'bs']

  return (
    <div className={className}>
      <div className="grid grid-cols-3 gap-2">
        {keys.map((k, i) => {
          if (k === '')
            return (
              <Button key={`e-${i}`} type="button" variant="outline" className="h-14 text-lg" disabled>
                —
              </Button>
            )
          if (k === 'bs')
            return (
              <Button
                key="bs"
                type="button"
                variant="outline"
                className="h-14 text-lg"
                onClick={backspace}
              >
                <Delete className="h-6 w-6 mx-auto" />
              </Button>
            )
          return (
            <Button
              key={k}
              type="button"
              variant="secondary"
              className="h-14 text-xl font-semibold min-h-[48px]"
              onClick={() => append(k)}
            >
              {k}
            </Button>
          )
        })}
      </div>
      <Button type="button" variant="ghost" className="w-full mt-2 h-11" onClick={clear}>
        Clear
      </Button>
    </div>
  )
}
