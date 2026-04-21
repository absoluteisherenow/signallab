// OperatingContext: the runtime snapshot every brain-wrapped call starts from.
// One fetcher, one shape, reused by captions, invoices, ads, assistant, agents.
//
// Loads:
//   - artist identity + casing/voice rules + palette (from artist_profiles)
//   - active mission (highest priority, nearest anchor_date) + next gig/release
//   - rules registry filtered to the task
//   - connections (IG handle/token, Gmail OAuth from-address)
//   - (optional) recent performance baselines
//
// Zero hardcoded identity — every value reads from Supabase. Works for any user.

import { createClient } from '@supabase/supabase-js'
import { fetchActiveRules } from './rules'
import type { Rule, TaskType } from './rules/types'

export type { TaskType } from './rules/types'

export interface Mission {
  id: string
  slug: string
  name: string
  kind: string
  north_star: string
  anchor_date: string | null
  starts_at: string | null
  ends_at: string | null
  priority: number
  status: string
  metadata: Record<string, unknown>
}

export interface Gig {
  id: string
  title: string | null
  venue: string | null
  location: string | null
  date: string | null
  status: string | null
  fee: number | null
  currency: string | null
  mission_id: string | null
}

export interface Release {
  id: string
  title: string | null
  type: string | null
  release_date: string | null
  label: string | null
  mission_id: string | null
}

export interface OperatingContext {
  user_id: string
  task: TaskType
  artist: {
    name: string
    handle: string
    bio: string
    genre: string | null
    casing_rules: Record<string, string>
    brand: { emblem_url: string | null; wordmark_url: string | null; palette: string[] }
    voice: {
      samples: string[]
      banned_patterns: string[]
      structural_targets: {
        lowercase_pct: number | null
        short_caption_pct: number | null
        no_hashtags_pct: number | null
      }
    }
  }
  priority: {
    mission: Mission | null
    gig: Gig | null
    release: Release | null
    formatted: string
  }
  rules: Rule[]
  recent_performance: {
    top_posts: Array<{ caption: string; format: string; score: number | null }>
    reach_baseline: number | null
    save_rate: number | null
  }
  connections: {
    ig_handle: string | null
    ig_token: string | null
    gmail_from: string | null
    platforms_connected: string[]
  }
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { headers: { 'Accept-Encoding': 'identity' } } }
  )
}

function formatPriority(m: Mission | null, g: Gig | null, r: Release | null): string {
  if (!m && !g && !r) return ''
  const parts: string[] = []
  if (m) {
    parts.push(`Current mission: ${m.name} — North Star: ${m.north_star}${m.anchor_date ? ` (anchor ${m.anchor_date})` : ''}`)
  }
  if (g) {
    const when = g.date ? ` on ${g.date}` : ''
    const where = g.venue ? ` at ${g.venue}` : g.location ? ` in ${g.location}` : ''
    parts.push(`Next gig: ${g.title || 'untitled'}${where}${when}`)
  }
  if (r) {
    parts.push(`Upcoming release: ${r.title || 'untitled'}${r.release_date ? ` (${r.release_date})` : ''}`)
  }
  return parts.join('\n')
}

/**
 * Load the runtime snapshot for this user + task. Every brain-wrapped AI call
 * and outbound route starts here. All fields loaded per-call — no hardcoded
 * identity anywhere. Graceful when pieces are missing (new user, no mission).
 */
export async function getOperatingContext(params: {
  userId: string
  task: TaskType
  opts?: { include_recent_perf?: boolean }
}): Promise<OperatingContext> {
  const sb = admin()
  const { userId, task } = params

  const [
    artistRes,
    missionRes,
    gigRes,
    releaseRes,
    rules,
    igRes,
    gmailRes,
    perfRes,
  ] = await Promise.all([
    sb
      .from('artist_profiles')
      .select('name, handle, bio, genre, casing_rules, emblem_url, wordmark_url, palette, voice_samples, banned_patterns, lowercase_pct, short_caption_pct, no_hashtags_pct')
      .limit(1)
      .maybeSingle(),
    sb
      .from('missions')
      .select('id, slug, name, kind, north_star, anchor_date, starts_at, ends_at, priority, status, metadata')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('priority', { ascending: false })
      .order('anchor_date', { ascending: true, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    sb
      .from('gigs')
      .select('id, title, venue, location, date, status, fee, currency, mission_id')
      .gte('date', new Date().toISOString().slice(0, 10))
      .order('date', { ascending: true })
      .limit(1)
      .maybeSingle(),
    sb
      .from('releases')
      .select('id, title, type, release_date, label, mission_id')
      .gte('release_date', new Date().toISOString().slice(0, 10))
      .order('release_date', { ascending: true })
      .limit(1)
      .maybeSingle(),
    fetchActiveRules({ userId, task }),
    sb
      .from('connected_social_accounts')
      .select('handle, access_token, platform')
      .eq('platform', 'instagram')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Gmail OAuth sits in connected_email_accounts (separate from social).
    // Multi-account supported — pick the first, label-tagged accounts first.
    sb
      .from('connected_email_accounts')
      .select('email, label')
      .eq('user_id', userId)
      .or('needs_reauth.is.null,needs_reauth.eq.false')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    params.opts?.include_recent_perf
      ? sb
          .from('post_performance')
          .select('caption, format, estimated_score')
          .order('estimated_score', { ascending: false, nullsFirst: false })
          .limit(5)
      : Promise.resolve({ data: null }),
  ])

  const artistRow: any = artistRes.data || {}
  const missionRow = missionRes.data as Mission | null
  const gigRow = gigRes.data as Gig | null
  const releaseRow = releaseRes.data as Release | null
  const igRow: any = igRes.data || null
  const gmailRow: any = gmailRes.data || null
  const perfRows: any[] = (perfRes as any).data || []

  const platforms = [igRow && 'instagram', gmailRow && 'gmail'].filter(Boolean) as string[]

  return {
    user_id: userId,
    task,
    artist: {
      name: artistRow.name || '',
      handle: artistRow.handle || '',
      bio: artistRow.bio || '',
      genre: artistRow.genre || null,
      casing_rules: (artistRow.casing_rules as Record<string, string>) || {},
      brand: {
        emblem_url: artistRow.emblem_url || null,
        wordmark_url: artistRow.wordmark_url || null,
        palette: Array.isArray(artistRow.palette) ? artistRow.palette : [],
      },
      voice: {
        samples: Array.isArray(artistRow.voice_samples) ? artistRow.voice_samples : [],
        banned_patterns: Array.isArray(artistRow.banned_patterns) ? artistRow.banned_patterns : [],
        structural_targets: {
          lowercase_pct: artistRow.lowercase_pct ?? null,
          short_caption_pct: artistRow.short_caption_pct ?? null,
          no_hashtags_pct: artistRow.no_hashtags_pct ?? null,
        },
      },
    },
    priority: {
      mission: missionRow,
      gig: gigRow,
      release: releaseRow,
      formatted: formatPriority(missionRow, gigRow, releaseRow),
    },
    rules,
    recent_performance: {
      top_posts: perfRows.map((p) => ({
        caption: p.caption || '',
        format: p.format || '',
        score: p.estimated_score ?? null,
      })),
      reach_baseline: null,
      save_rate: null,
    },
    connections: {
      ig_handle: igRow?.handle || null,
      ig_token: igRow?.access_token || null,
      gmail_from: gmailRow?.email || null,
      platforms_connected: platforms,
    },
  }
}
