import { redirect } from 'next/navigation'

/** Old /broadcast/automations route — Automations moved to /grow/automations.
 *  Keep as redirect so bookmarks stay alive during the transition. */
export default function BroadcastAutomationsRedirect() {
  redirect('/grow/automations')
}
