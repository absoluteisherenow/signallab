import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// Native device registration. Capacitor app calls this after the user grants
// push permission and APNs returns a device token. Also called when the app
// resumes and the token has been refreshed — iOS silently rotates tokens on
// restore-from-backup, major OS upgrades, and app reinstalls.
//
// Idempotent: upserts on (user_id, token) so repeated registrations just
// bump last_seen_at rather than growing the table.
//
// Body: { platform, token, bundle_id?, environment?, app_version?, device_name? }

interface RegisterBody {
  platform?: string
  token?: string
  bundle_id?: string
  environment?: string
  app_version?: string
  device_name?: string
}

const ALLOWED_PLATFORMS = new Set(['ios', 'android', 'web'])
const ALLOWED_ENVS = new Set(['production', 'sandbox'])

export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user, serviceClient: sb } = gate

  let body: RegisterBody = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const platform = (body.platform || '').toLowerCase()
  const token = (body.token || '').trim()

  if (!ALLOWED_PLATFORMS.has(platform)) {
    return NextResponse.json({ error: `platform must be one of: ${Array.from(ALLOWED_PLATFORMS).join(', ')}` }, { status: 400 })
  }
  if (!token || token.length < 32 || token.length > 400) {
    return NextResponse.json({ error: 'token missing or wrong length' }, { status: 400 })
  }

  const environment = body.environment && ALLOWED_ENVS.has(body.environment) ? body.environment : 'production'

  // Upsert — unique index on (user_id, token) handles the conflict.
  const { data, error } = await sb.from('user_devices')
    .upsert({
      user_id: user.id,
      platform,
      token,
      bundle_id: body.bundle_id || null,
      environment,
      app_version: body.app_version || null,
      device_name: body.device_name || null,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'user_id,token' })
    .select('id, platform, environment')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, device: data })
}

// Allow the app to surrender a token explicitly (user disabled push in
// Settings, or logged out). Also used when APNs responds 410 Gone server-side
// via a separate cleanup routine.
export async function DELETE(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user, serviceClient: sb } = gate

  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'token query param required' }, { status: 400 })

  const { error } = await sb.from('user_devices')
    .delete()
    .eq('user_id', user.id)
    .eq('token', token)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
