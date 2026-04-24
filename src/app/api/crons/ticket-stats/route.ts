import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSms } from '@/lib/sms'
import { createNotification } from '@/lib/notifications'
import {
  fetchRaStats, fetchDiceStats,
  extractRaEventId, extractDiceEventSlug,
  type DiceTier,
} from '@/lib/ticket-stats'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Hourly poll. For each future gig with an RA or Dice URL, pull fresh stats
// and compare against the previous snapshot stored on the row. Fire SMS on:
//   1. RA `attending` crossing a new 50-mark (50, 100, 150, …).
//   2. Any Dice tier flipping from non-sold-out to `sold-out`.
// SMS target follows the same tenant-phone pattern as /night-before.

async function tenantPhone(userId: string | null): Promise<string | null> {
  if (!userId) return process.env.ARTIST_PHONE || null
  const { data } = await supabase
    .from('artist_settings')
    .select('team')
    .eq('user_id', userId)
    .maybeSingle()
  const team = ((data?.team as any[]) || []).filter(Boolean)
  const hit = team.find((t: any) => t.phone && (t.role || '').toLowerCase().includes('artist'))
  return hit?.phone || process.env.ARTIST_PHONE || null
}

function diceAlerts(prev: DiceTier[] | null | undefined, next: DiceTier[]): string[] {
  const alerts: string[] = []
  const prevMap = new Map((prev || []).map((t) => [t.name, t.status]))
  for (const t of next) {
    const was = prevMap.get(t.name)
    if (t.status === 'sold-out' && was && was !== 'sold-out') {
      alerts.push(t.name)
    }
  }
  return alerts
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization') || ''
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const today = new Date().toISOString().slice(0, 10)
  const { data: gigs, error } = await supabase
    .from('gigs')
    .select('id, user_id, title, venue, date, ticket_url, ra_event_id, ra_attending, ra_capacity, dice_event_id, dice_tiers')
    .gte('date', today)
    .neq('status', 'cancelled')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results: Array<{ gig: string; ra?: any; dice?: any; alerts: string[]; error?: string }> = []

  for (const gig of (gigs || [])) {
    try {
      // Back-fill event IDs from ticket_url on first run
      const raId = gig.ra_event_id || extractRaEventId(gig.ticket_url)
      const diceSlug = gig.dice_event_id || extractDiceEventSlug(gig.ticket_url)
      const patch: Record<string, any> = {
        ticket_stats_checked_at: new Date().toISOString(),
      }
      const alerts: string[] = []

      if (raId) {
        const ra = await fetchRaStats(raId)
        patch.ra_event_id = raId
        patch.ra_attending = ra.attending
        patch.ra_capacity = ra.capacity
        // 50-mark crossover — only when attending actually went up
        const oldA = gig.ra_attending ?? 0
        const newA = ra.attending ?? 0
        if (newA > oldA && Math.floor(newA / 50) > Math.floor(oldA / 50)) {
          const mark = Math.floor(newA / 50) * 50
          alerts.push(`RA_MARK:${mark}:${newA}`)
        }
      }

      if (diceSlug) {
        const dice = await fetchDiceStats(diceSlug)
        patch.dice_event_id = diceSlug
        patch.dice_tiers = dice.tiers
        for (const name of diceAlerts(gig.dice_tiers as DiceTier[] | null, dice.tiers)) {
          alerts.push(`DICE_SOLDOUT:${name}`)
        }
      }

      await supabase.from('gigs').update(patch).eq('id', gig.id)

      if (alerts.length) {
        const phone = await tenantPhone(gig.user_id)
        const whenDays = Math.round((new Date(gig.date).getTime() - Date.now()) / 86400000)
        const label = gig.venue || gig.title || 'Gig'
        const lines = alerts.map((a) => {
          if (a.startsWith('RA_MARK:')) {
            const [, mark, now] = a.split(':')
            return `RA: ${now} going (crossed ${mark}).`
          }
          if (a.startsWith('DICE_SOLDOUT:')) {
            return `Dice: "${a.slice('DICE_SOLDOUT:'.length)}" sold out.`
          }
          return a
        })
        const body = `${label} · ${whenDays}d\n${lines.join('\n')}`

        if (phone) await sendSms({ to: phone, body })

        await createNotification({
          user_id: gig.user_id || undefined,
          type: 'system',
          title: `Ticket movement: ${label}`,
          message: lines.join(' '),
          href: `/gigs/${gig.id}`,
        })
      }

      results.push({
        gig: gig.id,
        ra: patch.ra_attending != null ? { attending: patch.ra_attending, capacity: patch.ra_capacity } : undefined,
        dice: patch.dice_tiers ? patch.dice_tiers : undefined,
        alerts,
      })
    } catch (err: any) {
      results.push({ gig: gig.id, alerts: [], error: err?.message || String(err) })
    }
  }

  return NextResponse.json({ ran: true, count: results.length, results })
}
