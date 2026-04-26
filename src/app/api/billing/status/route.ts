import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { getUserTier } from '@/lib/tier'

export const runtime = 'nodejs'

// GET /api/billing/status — returns the authed user's current tier.
// Used by the onboarding completion redirect (free → /pricing, paid → /dashboard)
// and by paid-feature surfaces that want to render upgrade CTAs inline.

export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user } = gate
  const tier = await getUserTier(user.id)
  return NextResponse.json({ tier })
}
