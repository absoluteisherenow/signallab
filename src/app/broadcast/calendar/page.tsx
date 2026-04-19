import { Suspense } from 'react'
import { BroadcastCalendar } from '@/components/broadcast/BroadcastCalendar'

export default function CalendarPage() {
  return (
    <Suspense fallback={null}>
      <BroadcastCalendar />
    </Suspense>
  )
}
