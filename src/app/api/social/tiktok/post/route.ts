import { NextRequest, NextResponse } from 'next/server'
import { requireConfirmed } from '@/lib/require-confirmed'
import { publishTikTok } from '@/lib/social-publish/tiktok'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const body = await req.json()
  const gate = requireConfirmed(body)
  if (gate) return gate
  const { caption, video_url, handle } = body as { caption?: string; video_url?: string; handle?: string | null }

  const result = await publishTikTok({
    caption: caption || '',
    video_url: video_url || '',
    handle: handle ?? null,
  })

  if (result.ok) {
    return NextResponse.json({ success: true, publish_id: result.publish_id, privacy_level: result.privacy_level })
  }
  return NextResponse.json({ error: result.error }, { status: result.status })
}
