import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as ReTooltip } from 'recharts'
import { Wallet } from 'lucide-react'
import { useCurrency } from '@/contexts/CurrencyContext'
import type { PaymentMixSlice } from '@/types'

interface PaymentMixDonutProps {
  data?: PaymentMixSlice[]
  isLoading: boolean
}

// Stable color per method id so the donut doesn't reshuffle when amounts change.
const METHOD_COLORS: Record<string, string> = {
  cash: '#22c55e',
  card: '#3b82f6',
  credit_card: '#3b82f6',
  debit_card: '#0ea5e9',
  digital_wallet: '#a855f7',
  online: '#f97316',
}

function colorFor(method: string, fallbackIdx: number): string {
  if (METHOD_COLORS[method]) return METHOD_COLORS[method]
  const palette = ['#94a3b8', '#facc15', '#ec4899', '#10b981', '#6366f1']
  return palette[fallbackIdx % palette.length]
}

export function PaymentMixDonut({ data, isLoading }: PaymentMixDonutProps) {
  const { formatCurrency } = useCurrency()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4 text-emerald-600" />
          Payment mix
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : !data || data.length === 0 ? (
          <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
            No payments captured yet.
          </div>
        ) : (
          <div className="grid items-center gap-4 sm:grid-cols-[1fr_minmax(0,1fr)]">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="amount"
                    nameKey="label"
                    innerRadius="55%"
                    outerRadius="85%"
                    paddingAngle={2}
                    isAnimationActive={false}
                  >
                    {data.map((slice, idx) => (
                      <Cell key={slice.method} fill={colorFor(slice.method, idx)} />
                    ))}
                  </Pie>
                  <ReTooltip
                    contentStyle={{
                      background: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      color: 'hsl(var(--popover-foreground))',
                      fontSize: 12,
                    }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-2 text-sm">
              {data.map((slice, idx) => (
                <li key={slice.method} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 truncate">
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: colorFor(slice.method, idx) }}
                    />
                    <span className="truncate">{slice.label}</span>
                  </span>
                  <span className="text-right tabular-nums">
                    <div className="text-sm font-medium">{formatCurrency(slice.amount)}</div>
                    <div className="text-[11px] text-muted-foreground">{slice.pct.toFixed(1)}%</div>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
