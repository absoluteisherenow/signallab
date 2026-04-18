// /drop-lab was the pre-Phase-3 standalone contacts + blast page. Its content
// was merged into the /promo hub. This stub keeps the URL alive (bookmarks,
// old screenshots, comment links) and forwards to the DJ Promo tab.
// See docs/plans/promo-hub-migration.md.

import { redirect } from 'next/navigation'

export default function DropLabRedirect() {
  redirect('/promo?tab=promo')
}
