import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const { code } = params

  const { data: link } = await supabase
    .from('promo_tracked_links')
    .select('id, destination_url, clicks, first_clicked_at')
    .eq('code', code)
    .single()

  if (!link) return NextResponse.redirect(new URL('/', req.url))

  const now = new Date().toISOString()
  await supabase.from('promo_tracked_links').update({
    clicks: (link.clicks || 0) + 1,
    first_clicked_at: link.first_clicked_at || now,
    last_clicked_at: now,
  }).eq('id', link.id)

  return NextResponse.redirect(link.destination_url)
}
