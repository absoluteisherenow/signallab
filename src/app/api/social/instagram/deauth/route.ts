import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Meta calls this when a user removes the app from their Instagram/Facebook settings.
// We remove the stored credentials for that user.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const userId = body?.signed_request ? parseSignedRequest(body.signed_request) : null

    if (userId) {
      await supabase
        .from('connected_social_accounts')
        .delete()
        .eq('platform', 'instagram')
        .eq('platform_user_id', userId)
    }
  } catch {
    // Best-effort — always return 200 to Meta
  }

  return NextResponse.json({ success: true })
}

function parseSignedRequest(signedRequest: string): string | null {
  try {
    const [, payload] = signedRequest.split('.')
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'))
    return decoded.user_id || null
  } catch {
    return null
  }
}
