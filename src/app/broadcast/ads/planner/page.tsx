import { redirect } from 'next/navigation'

/** Old /broadcast/ads/planner route — moved to /grow/ads/planner. */
export default function BroadcastAdsPlannerRedirect() {
  redirect('/grow/ads/planner')
}
