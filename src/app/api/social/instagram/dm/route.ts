import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// POST — save or update a comment automation for a post
export async function POST(req: NextRequest) {
  try {
    const { platform_post_id, release_id, trigger_keyword, dm_message, enabled } = await req.json()
    if (!platform_post_id || !dm_message) {
      return NextResponse.json({ error: 'platform_post_id and dm_message required' }, { status: 400 })
    }

    // Upsert — one automation per post
    const { data, error } = await supabase
      .from('comment_automations')
      .upsert({
        platform_post_id,
        release_id: release_id || null,
        trigger_keyword: trigger_keyword || '◼',
        dm_message,
        enabled: enabled !== false,
      }, { onConflict: 'platform_post_id' })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ automation: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET — list automations for a release or post
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const release_id = searchParams.get('release_id')
    const platform_post_id = searchParams.get('platform_post_id')

    let query = supabase.from('comment_automations').select('*').order('created_at', { ascending: false })
    if (release_id) query = query.eq('release_id', release_id)
    if (platform_post_id) query = query.eq('platform_post_id', platform_post_id)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ automations: data || [] })
  } catch (err: any) {
    return NextResponse.json({ automations: [] })
  }
}

// PATCH — toggle enabled / update DM message
export async function PATCH(req: NextRequest) {
  try {
    const { id, enabled, dm_message } = await req.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const update: Record<string, unknown> = {}
    if (enabled !== undefined) update.enabled = enabled
    if (dm_message !== undefined) update.dm_message = dm_message

    const { error } = await supabase.from('comment_automations').update(update).eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
