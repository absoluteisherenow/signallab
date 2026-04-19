import { redirect } from 'next/navigation'

/**
 * /grow — landing for the Grow Lab. No standalone home page; the most-used
 * sub-view is Growth (follower trajectory), so we drop straight in. Sidebar
 * still shows "Grow Lab" because the header auto-detects `/grow/*`.
 */
export default function GrowHomePage() {
  redirect('/grow/growth')
}
