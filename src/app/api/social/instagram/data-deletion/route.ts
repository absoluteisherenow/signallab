import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://signallabos.com'

// Meta calls this when a user requests their data be deleted.
// Required format: return { url, confirmation_code }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const userId = body?.signed_request ? parseSignedRequest(body.signed_request) : null
    const confirmationCode = `del_${userId || 'unknown'}_${Date.now()}`

    if (userId) {
      await supabase
        .from('connected_social_accounts')
        .delete()
        .eq('platform', 'instagram')
        .eq('platform_user_id', userId)
    }

    return NextResponse.json({
      url: `${APP_URL}/privacy`,
      confirmation_code: confirmationCode,
    })
  } catch {
    return NextResponse.json({
      url: `${APP_URL}/privacy`,
      confirmation_code: `del_error_${Date.now()}`,
    })
  }
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
