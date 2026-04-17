import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Resolve Instagram handle → user ID using existing connected account token
async function resolveIGUserId(handle: string, accessToken: string, igUserId: string): Promise<string | null> {
  try {
    // Search for user via the Graph API
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${igUserId}?fields=business_discovery.fields(id,username)&business_discovery_user=${handle}&access_token=${accessToken}`
    )
    if (!res.ok) return null
    const data = await res.json()
    return data?.business_discovery?.id || null
  } catch {
    return null
  }
}

async function sendDM(accessToken: string, igUserId: string, recipientId: string, message: string): Promise<boolean> {
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text: message },
        access_token: accessToken,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  try {
    const { contact_ids, message, promo_url, track_title, track_artist, hosted } = await req.json()
    if (!contact_ids?.length || !message) {
      return NextResponse.json({ error: 'contact_ids and message required' }, { status: 400 })
    }

    // Get connected Instagram account
    const { data: account } = await supabase
      .from('connected_social_accounts')
      .select('access_token, platform_user_id, token_expiry')
      .eq('platform', 'instagram')
      .single()

    if (!account?.access_token) {
      return NextResponse.json({ error: 'No Instagram account connected' }, { status: 400 })
    }
    if (account.token_expiry && Date.now() > Number(account.token_expiry)) {
      return NextResponse.json({ error: 'Instagram token expired — reconnect in Settings' }, { status: 401 })
    }

    // Load contacts
    const { data: contacts } = await supabase
      .from('dj_contacts')
      .select('*')
      .in('id', contact_ids)

    if (!contacts?.length) {
      return NextResponse.json({ error: 'No contacts found' }, { status: 400 })
    }

    // Create blast record for tracking.
    // When `hosted` is true, tracks live in promo_tracks (R2-hosted stream-only).
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://signallabos.com'
    const { data: blast } = await supabase
      .from('promo_blasts')
      .insert({
        track_url: hosted ? null : (promo_url || null),
        track_title: track_title || null,
        track_artist: track_artist || null,
        message,
        contact_count: contacts.length,
      })
      .select()
      .single()

    // Generate tracked links per contact.
    // Hosted drops always get a /go/[code] link (the destination_url points back at the drop).
    const trackedLinks: Record<string, string> = {}
    const shouldGenerateLinks = hosted || !!promo_url
    if (shouldGenerateLinks && blast) {
      for (const contact of contacts) {
        const code = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)
        const landing = `${APP_URL}/go/${code}`
        await supabase.from('promo_tracked_links').insert({
          blast_id: blast.id,
          contact_id: contact.id,
          code,
          destination_url: hosted ? landing : promo_url,
        })
        trackedLinks[contact.id] = landing
      }
    }

    const results: { name: string; handle: string; sent: boolean; error?: string; contact_id?: string }[] = []

    for (const contact of contacts) {
      if (!contact.instagram_handle && !contact.instagram_user_id) {
        results.push({ name: contact.name, handle: contact.instagram_handle || '?', sent: false, error: 'No Instagram handle', contact_id: contact.id })
        continue
      }

      let recipientId = contact.instagram_user_id

      // Resolve user ID if we don't have it cached
      if (!recipientId && contact.instagram_handle) {
        recipientId = await resolveIGUserId(contact.instagram_handle, account.access_token, account.platform_user_id)
        if (recipientId) {
          await supabase.from('dj_contacts').update({ instagram_user_id: recipientId }).eq('id', contact.id)
        }
      }

      if (!recipientId) {
        results.push({ name: contact.name, handle: contact.instagram_handle || '?', sent: false, error: 'Could not resolve Instagram ID — they may not follow you', contact_id: contact.id })
        continue
      }

      // Use tracked link instead of raw URL
      const contactUrl = trackedLinks[contact.id] || promo_url
      const fullMessage = contactUrl ? `${message}\n\n${contactUrl}` : message

      const sent = await sendDM(account.access_token, account.platform_user_id, recipientId, fullMessage)
      results.push({ name: contact.name, handle: contact.instagram_handle || '?', sent, contact_id: contact.id })

      if (sent) {
        await supabase.from('dj_contacts').update({
          last_sent_at: new Date().toISOString(),
          total_promos_sent: (contact.total_promos_sent || 0) + 1,
        }).eq('id', contact.id)
      }

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 300))
    }

    const sent = results.filter(r => r.sent).length
    const failed = results.filter(r => !r.sent).length

    // Update blast with results
    if (blast) {
      await supabase.from('promo_blasts').update({ sent_count: sent, failed_count: failed }).eq('id', blast.id)
    }

    return NextResponse.json({ ok: true, sent, failed, results, blast_id: blast?.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
