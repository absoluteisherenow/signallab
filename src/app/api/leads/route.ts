import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// POST — submit email from claim page
export async function POST(req: NextRequest) {
  try {
    const { campaign_slug, email, instagram_username } = await req.json()
    if (!campaign_slug || !email) {
      return NextResponse.json({ error: 'campaign_slug and email required' }, { status: 400 })
    }

    // Verify campaign exists
    const { data: automation } = await supabase
      .from('comment_automations')
      .select('id, campaign_name, reward_url, reward_type, follow_required')
      .eq('campaign_slug', campaign_slug)
      .eq('enabled', true)
      .single()

    if (!automation) {
      return NextResponse.json({ error: 'Campaign not found or inactive' }, { status: 404 })
    }

    // Update the lead record with email (matched by username if we have it, else insert new)
    if (instagram_username) {
      const { data: existing } = await supabase
        .from('dm_leads')
        .select('id')
        .eq('automation_id', automation.id)
        .eq('username', instagram_username)
        .single()

      if (existing) {
        await supabase
          .from('dm_leads')
          .update({ email })
          .eq('id', existing.id)
      } else {
        // Email submitted without Instagram trigger (direct link share) — still capture it
        await supabase.from('dm_leads').insert({
          automation_id: automation.id,
          campaign_name: automation.campaign_name,
          instagram_user_id: 'direct-' + Date.now(),
          username: instagram_username || null,
          email,
          dm_sent: false,
        })
      }
    } else {
      // No instagram username — insert as direct lead
      await supabase.from('dm_leads').insert({
        automation_id: automation.id,
        campaign_name: automation.campaign_name,
        instagram_user_id: 'direct-' + Date.now(),
        email,
        dm_sent: false,
      })
    }

    return NextResponse.json({
      ok: true,
      reward_url: automation.reward_url,
      reward_type: automation.reward_type,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET — list leads, optionally filtered by automation_id
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const automation_id = searchParams.get('automation_id')

    let query = supabase
      .from('dm_leads')
      .select('*')
      .order('triggered_at', { ascending: false })
      .limit(500)

    if (automation_id) query = query.eq('automation_id', automation_id)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ leads: data || [] })
  } catch (err: any) {
    return NextResponse.json({ leads: [], error: err.message })
  }
}
