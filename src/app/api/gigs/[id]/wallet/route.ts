import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildGigPass } from '@/lib/pkpass'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'gig'
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const passCert = process.env.APPLE_PASS_CERT
    const passKey = process.env.APPLE_PASS_KEY
    const wwdrCert = process.env.APPLE_WWDR_CERT
    const passTypeId = process.env.APPLE_PASS_TYPE_ID
    const teamId = process.env.APPLE_TEAM_ID
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://signallabos.com'

    if (!passCert || !passKey || !wwdrCert || !passTypeId || !teamId) {
      return new NextResponse('Wallet pass not configured on this environment', { status: 503 })
    }

    const { data: gig, error } = await supabase
      .from('gigs').select('*').eq('id', params.id).single()
    if (error || !gig) return new NextResponse('Gig not found', { status: 404 })

    const { data: travel } = await supabase
      .from('travel_bookings').select('*').eq('gig_id', params.id)
      .order('created_at', { ascending: true })

    const buf = await buildGigPass({
      gig,
      travelBookings: travel || [],
      certs: { signerCert: passCert, signerKey: passKey, wwdr: wwdrCert },
      passTypeId,
      teamId,
      appUrl,
    })

    const slug = slugify(gig.venue || 'gig')
    return new NextResponse(buf as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Content-Disposition': `attachment; filename="${slug}.pkpass"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err: any) {
    console.error('pkpass build failed:', err)
    return new NextResponse(`Pass build failed: ${err?.message || 'unknown'}`, { status: 500 })
  }
}
