import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://signallabos.com'

function slugify(str: string) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)
}

// POST — create a new comment automation / campaign
export async function POST(req: NextRequest) {
  try {
    const {
      campaign_name,
      trigger_keyword,
      dm_message,
      platform_post_id,
      follow_required,
      reward_type,
      reward_url,
    } = await req.json()

    if (!campaign_name || !dm_message) {
      return NextResponse.json({ error: 'campaign_name and dm_message required' }, { status: 400 })
    }

    const campaign_slug = slugify(campaign_name) + '-' + Date.now().toString(36)
    const claim_url = `${APP_URL}/claim/${campaign_slug}`

    // Auto-insert claim URL into DM if {claim_url} placeholder present, or append if reward_url is set
    let finalMessage = dm_message
    if (dm_message.includes('{claim_url}')) {
      finalMessage = dm_message.replace('{claim_url}', claim_url)
    }

    const { data, error } = await supabase
      .from('comment_automations')
      .insert({
        campaign_name,
        campaign_slug,
        trigger_keyword: trigger_keyword || '',
        dm_message: finalMessage,
        platform_post_id: platform_post_id || null,
        follow_required: follow_required || false,
        reward_type: reward_type || 'download',
        reward_url: reward_url || null,
        claim_url,
        enabled: true,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ automation: data, claim_url })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET — list all automations with lead counts
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const slug = searchParams.get('slug')

    if (slug) {
      // Fetch single automation by slug (used by claim page)
      const { data, error } = await supabase
        .from('comment_automations')
        .select('*')
        .eq('campaign_slug', slug)
        .eq('enabled', true)
        .single()
      if (error || !data) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
      return NextResponse.json({ automation: data })
    }

    const { data, error } = await supabase
      .from('comment_automations')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error

    // Attach lead counts
    const automations = await Promise.all((data || []).map(async (a) => {
      const { count } = await supabase
        .from('dm_leads')
        .select('*', { count: 'exact', head: true })
        .eq('automation_id', a.id)
      return { ...a, lead_count: count || 0 }
    }))

    return NextResponse.json({ automations })
  } catch (err: any) {
    return NextResponse.json({ automations: [] })
  }
}

// PATCH — toggle enabled / update
export async function PATCH(req: NextRequest) {
  try {
    const { id, enabled, dm_message, trigger_keyword, reward_url, follow_required } = await req.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const update: Record<string, unknown> = {}
    if (enabled !== undefined) update.enabled = enabled
    if (dm_message !== undefined) update.dm_message = dm_message
    if (trigger_keyword !== undefined) update.trigger_keyword = trigger_keyword
    if (reward_url !== undefined) update.reward_url = reward_url
    if (follow_required !== undefined) update.follow_required = follow_required

    const { error } = await supabase.from('comment_automations').update(update).eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const { error } = await supabase.from('comment_automations').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
