// Ticket-stats scrapers for RA + Dice.
//
// RA: the public HTML page is behind DataDome, but /graphql is not — we can
// pull `attending` (interested count) and `venue.capacity` directly. Most
// events are on their LEGACY ticketing which hides sold numbers; `attending`
// is the honest signal we always get.
//
// Dice: the event JSON lives at `api.dice.fm/events/<id>/ticket_types`. No
// auth, no captcha. We don't get sold counts — we get tier status
// (`on-sale` / `sold-out` / `off-sale`) and prices, which is the real
// sell-through signal (tier-flip moments).

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'

export type DiceTier = { name: string; status: string; price?: number; currency?: string }

export type RaStats = { attending: number | null; capacity: number | null }
export type DiceStats = { tiers: DiceTier[] }

export function extractRaEventId(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/ra\.co\/events\/(\d+)/i)
  return m ? m[1] : null
}

export function extractDiceEventSlug(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/dice\.fm\/event\/([a-z0-9-]+?)(?:\?|$|\/)/i)
  return m ? m[1] : null
}

export async function fetchRaStats(eventId: string): Promise<RaStats> {
  const res = await fetch('https://ra.co/graphql', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'ra-content-language': 'en',
      'user-agent': UA,
      'referer': `https://ra.co/events/${eventId}`,
    },
    body: JSON.stringify({
      operationName: 'E',
      variables: { id: eventId },
      query: `query E($id: ID!) { event(id: $id) { id attending venue { capacity } } }`,
    }),
  })
  if (!res.ok) throw new Error(`RA ${res.status}`)
  const json = await res.json() as { data?: { event?: { attending?: number; venue?: { capacity?: string | number } } } }
  const ev = json.data?.event
  if (!ev) return { attending: null, capacity: null }
  const cap = ev.venue?.capacity
  return {
    attending: typeof ev.attending === 'number' ? ev.attending : null,
    capacity: cap == null ? null : Number(cap),
  }
}

// Dice resolves slugs to event IDs via the HTML page's embedded NEXT_DATA.
// We don't store the slug's resolved ID separately — once resolved we call
// ticket_types by ID. Slug can shift if the promoter edits the title, so we
// re-resolve each poll rather than caching.
export async function fetchDiceStats(slug: string): Promise<DiceStats> {
  const pageRes = await fetch(`https://dice.fm/event/${slug}`, { headers: { 'user-agent': UA } })
  if (!pageRes.ok) throw new Error(`Dice page ${pageRes.status}`)
  const html = await pageRes.text()
  const m = html.match(/id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/)
  if (!m) throw new Error('Dice: __NEXT_DATA__ not found')
  const root = JSON.parse(m[1]) as any
  const raw = root?.props?.pageProps?.initialState
  const state = typeof raw === 'string' ? JSON.parse(raw) : raw
  const id = state?.event?.event?.id
  if (!id) throw new Error('Dice: event id missing')

  const ttRes = await fetch(`https://api.dice.fm/events/${id}/ticket_types`, {
    headers: { 'user-agent': UA, accept: 'application/json' },
  })
  if (!ttRes.ok) throw new Error(`Dice ticket_types ${ttRes.status}`)
  const tt = await ttRes.json() as { ticket_types?: any[] }
  const tiers: DiceTier[] = (tt.ticket_types || []).map((t: any) => ({
    name: String(t.name || ''),
    status: String(t.status || 'unknown'),
    price: t.price?.amount ? Number(t.price.amount) / 100 : undefined,
    currency: t.price?.currency,
  }))
  return { tiers }
}

// Short, human summary for the gig card. Examples:
//   "32 GOING · T2/3 ON SALE"
//   "32 GOING"
//   "T1/3 ON SALE"
export function summariseTicketStats(opts: {
  ra_attending?: number | null
  dice_tiers?: DiceTier[] | null
}): string {
  const parts: string[] = []
  if (typeof opts.ra_attending === 'number') parts.push(`${opts.ra_attending} GOING`)
  const tiers = opts.dice_tiers || []
  if (tiers.length) {
    const onSaleIdx = tiers.findIndex((t) => t.status === 'on-sale')
    if (onSaleIdx === -1) {
      const anyAvail = tiers.some((t) => t.status !== 'sold-out' && t.status !== 'off-sale')
      parts.push(anyAvail ? 'DICE SOON' : 'DICE SOLD OUT')
    } else {
      parts.push(`T${onSaleIdx + 1}/${tiers.length} ON SALE`)
    }
  }
  return parts.join(' · ')
}
