import { createFileRoute } from '@tanstack/react-router'
import { CounterInterface } from '@/components/counter/CounterInterface'

function CounterRoutePage() {
  return (
    <div className="flex h-svh min-h-0 flex-col overflow-hidden bg-background">
      <CounterInterface />
    </div>
  )
}

export const Route = createFileRoute('/admin/counter')({
  component: CounterRoutePage,
})
