import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { requireConfirmed } from '@/lib/require-confirmed'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Shape of a single scheduled-post row the route accepts. Backward-compatible
// with the original shape (platform/caption/format/scheduled_at/media_url) —
// the new fields below are all optional additions for carousel, tags, and
// preview-approval tracking.
interface SchedulePostInput {
  platform?: string
  caption?: string
  format?: string               // 'post' | 'reel' | 'carousel' | 'story'
  scheduled_at?: string
  status?: string
  buffer_post_id?: string
  gig_title?: string
  media_url?: string            // single-media path (unchanged)
  media_urls?: string[]         // carousel slides (new)
  user_tags?: unknown           // [{username, x, y, slide_index}] (new)
  first_comment?: string        // posted as comment #1 after publish (new)
  hashtags?: string[]           // flattened into first_comment at post time (new)
  location_name?: string
  location_id?: string
  preview_approved_at?: string  // ISO timestamp set by frontend on approval
}

function rowFromInput(p: SchedulePostInput, post_group_id: string | null) {
  return {
    platform: p.platform,
    caption: p.caption,
    format: p.format || 'post',
    scheduled_at: p.scheduled_at || new Date().toISOString(),
    status: p.status || 'scheduled',
    buffer_post_id: p.buffer_post_id || null,
    gig_title: p.gig_title || null,
    media_url: p.media_url || null,
    media_urls: p.media_urls && p.media_urls.length ? p.media_urls : null,
    user_tags: p.user_tags ?? null,
    first_comment: p.first_comment || null,
    hashtags: p.hashtags && p.hashtags.length ? p.hashtags : null,
    location_name: p.location_name || null,
    location_id: p.location_id || null,
    preview_approved_at: p.preview_approved_at || null,
    post_group_id,
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // HARD RULE: feedback_approve_before_send — every schedule write has to
    // come through the two-step preview/confirm flow. First call (no
    // `confirmed`) is rejected with requiresConfirmation: true so the
    // client opens the approval modal; second call carries `confirmed: true`
    // and proceeds to insert.
    const gate = requireConfirmed(body)
    if (gate) return gate

    // Batch mode — { posts: [...] } inserts N rows sharing a post_group_id.
    // Single mode — body IS the post (existing callers keep working).
    const isBatch = Array.isArray(body?.posts)
    const posts: SchedulePostInput[] = isBatch ? body.posts : [body]

    if (!posts.length) {
      return NextResponse.json({ success: false, error: 'no posts provided' }, { status: 400 })
    }

    // Ground truth for approval = server-side stamp at the moment
    // `confirmed` cleared the gate. Client-supplied preview_approved_at is
    // ignored so nobody can self-stamp around the modal.
    const approvedAt = new Date().toISOString()
    const post_group_id = isBatch ? randomUUID() : null
    const rows = posts.map(p => ({
      ...rowFromInput(p, post_group_id),
      preview_approved_at: approvedAt,
    }))

    const { data, error } = await supabase
      .from('scheduled_posts')
      .insert(rows)
      .select()

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json({
          success: false,
          error: 'scheduled_posts table not found. Run the SQL in Supabase to create it.',
        }, { status: 400 })
      }
      throw error
    }

    if (isBatch) {
      return NextResponse.json({ success: true, posts: data, post_group_id })
    }
    return NextResponse.json({ success: true, post: data?.[0] })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, ...updates } = await req.json()
    if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 })

    const { data, error } = await supabase
      .from('scheduled_posts')
      .update(updates)
      .eq('id', id)
      .select()

    if (error) throw error
    return NextResponse.json({ success: true, post: data?.[0] })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

// DELETE accepts either { id } (single) or { post_group_id } (cancel a whole batch)
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, post_group_id } = body
    if (!id && !post_group_id) {
      return NextResponse.json({ success: false, error: 'id or post_group_id required' }, { status: 400 })
    }

    const query = supabase.from('scheduled_posts').delete()
    if (id) query.eq('id', id)
    else query.eq('post_group_id', post_group_id)

    const { error } = await query
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

// GET accepts optional ?post_group_id=... to fetch a batch, otherwise returns all.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const groupId = searchParams.get('post_group_id')

    const q = supabase
      .from('scheduled_posts')
      .select('*')
      .order('scheduled_at', { ascending: true })
    if (groupId) q.eq('post_group_id', groupId)

    const { data, error } = await q
    if (error) throw error

    return NextResponse.json({ success: true, posts: data || [] })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    return NextResponse.json({ success: false, error: message, posts: [] }, { status: 500 })
  }
}
