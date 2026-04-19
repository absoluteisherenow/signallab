import { redirect } from 'next/navigation'

/** Old /broadcast/growth route — Growth moved to /grow/growth. Keep as
 *  redirect so bookmarks stay alive during the transition. */
export default function BroadcastGrowthRedirect() {
  redirect('/grow/growth')
}
