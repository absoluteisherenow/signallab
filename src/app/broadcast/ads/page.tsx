import { redirect } from 'next/navigation'

/** Old /broadcast/ads route — Ads moved to /grow/ads. Keep as redirect so
 *  bookmarks and any stale links stay alive during the transition. */
export default function BroadcastAdsRedirect() {
  redirect('/grow/ads')
}
