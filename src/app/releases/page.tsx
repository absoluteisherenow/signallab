// /releases is the pre-Phase-3 URL for the Drop Lab tab shell.
// After the Phase 3 route rename it redirects to /promo, preserving the
// ?tab=promo query so existing bookmarks and DMs still land on the right tab.
// The detail/edit/new/campaign sub-routes under /releases/[id]/* are
// untouched — only the index page is aliased.
// See docs/plans/promo-hub-migration.md.

import { redirect } from 'next/navigation'

export default function ReleasesRedirect({ searchParams }: { searchParams: { tab?: string } }) {
  const tab = searchParams?.tab
  redirect(tab ? `/promo?tab=${encodeURIComponent(tab)}` : '/promo')
}
