import { redirect } from 'next/navigation'

/**
 * /broadcast/plan — nav entry that collapses Ideas + Strategy. The two real
 * surfaces keep their own routes (deep-linkable), and PlanSubNav swaps
 * between them visibly. Ideas is the default landing because the content
 * brief shelf is the more-used surface of the two.
 */
export default function PlanPage() {
  redirect('/broadcast/ideas')
}
