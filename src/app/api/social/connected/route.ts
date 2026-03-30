import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// GET — list all connected social accounts (no tokens returned)
export async function GET() {
  const { data, error } = await supabase
    .from('connected_social_accounts')
    .select('id, platform, handle, platform_user_id, scope, token_expiry, created_at, updated_at')
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Flag tokens that are within 7 days of expiry
  const now = Date.now()
  const accounts = (data || []).map(a => ({
    ...a,
    expiring_soon: a.token_expiry ? (a.token_expiry - now) < 7 * 24 * 60 * 60 * 1000 : false,
  }))

  return NextResponse.json({ accounts })
}

// DELETE — disconnect a social account
export async function DELETE(req: NextRequest) {
  const { platform, handle } = await req.json()

  if (!platform || !handle) {
    return NextResponse.json({ error: 'platform and handle required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('connected_social_accounts')
    .delete()
    .eq('platform', platform)
    .eq('handle', handle)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
