import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

const AD_ACCOUNT_ID = 'act_831371654092961'

/**
 * GET /api/ads
 * Fetches all campaigns + insights from Meta Marketing API.
 * Returns campaign list with spend, reach, clicks, etc.
 */
export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate

  const token = process.env.META_SYSTEM_USER_TOKEN
  if (!token) {
    return NextResponse.json({ campaigns: [], error: 'META_SYSTEM_USER_TOKEN not configured' }, { status: 500 })
  }

  try {
    // Fetch campaigns
    const campaignsUrl = `https://graph.facebook.com/v25.0/${AD_ACCOUNT_ID}/campaigns?fields=name,status,objective,daily_budget,lifetime_budget,start_time,stop_time&limit=50&access_token=${token}`
    const campaignsRes = await fetch(campaignsUrl, { signal: AbortSignal.timeout(10000) })

    if (!campaignsRes.ok) {
      const err = await campaignsRes.json().catch(() => ({}))
      return NextResponse.json({ campaigns: [], error: err?.error?.message || `Meta API ${campaignsRes.status}` }, { status: campaignsRes.status })
    }

    const campaignsData = await campaignsRes.json()
    const campaigns = campaignsData.data || []

    // Fetch insights only for truly active or recently paused campaigns
    const now = new Date()
    const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000)
    const relevantCampaigns = campaigns.filter((c: any) => {
      if (c.status === 'ACTIVE') return true
      if (c.status === 'PAUSED' && c.start_time && new Date(c.start_time) > sixMonthsAgo) return true
      return false
    })

    const insightsPromises = relevantCampaigns.map(async (campaign: any) => {
      try {
        const insightsUrl = `https://graph.facebook.com/v25.0/${campaign.id}/insights?fields=spend,impressions,reach,clicks,cpc,cpm,ctr,actions&metric_type=total_value&date_preset=maximum&access_token=${token}`
        const res = await fetch(insightsUrl, { signal: AbortSignal.timeout(8000) })
        if (!res.ok) return { id: campaign.id, insights: null }
        const data = await res.json()
        return { id: campaign.id, insights: data.data?.[0] || null }
      } catch {
        return { id: campaign.id, insights: null }
      }
    })

    const insightsResults = await Promise.all(insightsPromises)
    const insightsMap = Object.fromEntries(insightsResults.map(r => [r.id, r.insights]))

    // Fetch ad sets for truly active campaigns only (not expired)
    const activeCampaigns = campaigns.filter((c: any) =>
      c.status === 'ACTIVE' && (!c.stop_time || new Date(c.stop_time) > now)
    )
    const adsetPromises = activeCampaigns.map(async (campaign: any) => {
      try {
        const adsetsUrl = `https://graph.facebook.com/v25.0/${campaign.id}/adsets?fields=name,status,targeting,daily_budget,lifetime_budget&access_token=${token}`
        const res = await fetch(adsetsUrl, { signal: AbortSignal.timeout(8000) })
        if (!res.ok) return { id: campaign.id, adsets: [] }
        const data = await res.json()
        return { id: campaign.id, adsets: data.data || [] }
      } catch {
        return { id: campaign.id, adsets: [] }
      }
    })

    const adsetResults = await Promise.all(adsetPromises)
    const adsetsMap = Object.fromEntries(adsetResults.map(r => [r.id, r.adsets]))

    // Merge everything
    const merged = campaigns.map((c: any) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      objective: c.objective,
      daily_budget: c.daily_budget ? (parseInt(c.daily_budget) / 100).toFixed(2) : null,
      lifetime_budget: c.lifetime_budget ? (parseInt(c.lifetime_budget) / 100).toFixed(2) : null,
      start_time: c.start_time,
      stop_time: c.stop_time,
      insights: insightsMap[c.id] || null,
      adsets: adsetsMap[c.id] || [],
    }))

    return NextResponse.json({ campaigns: merged })
  } catch (err: any) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return NextResponse.json({ campaigns: [], error: 'timeout' }, { status: 504 })
    }
    return NextResponse.json({ campaigns: [], error: err.message }, { status: 500 })
  }
}

/**
 * POST /api/ads
 * Update campaign status (pause/activate)
 * Body: { campaignId: string, status: 'ACTIVE' | 'PAUSED' }
 */
export async function POST(req: NextRequest) {
  const gate2 = await requireUser(req)
  if (gate2 instanceof NextResponse) return gate2

  const token = process.env.META_SYSTEM_USER_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'META_SYSTEM_USER_TOKEN not configured' }, { status: 500 })
  }

  try {
    const body = await req.json()
    const { campaignId, status } = body

    if (!campaignId || !['ACTIVE', 'PAUSED'].includes(status)) {
      return NextResponse.json({ error: 'Invalid campaignId or status' }, { status: 400 })
    }

    const url = `https://graph.facebook.com/v25.0/${campaignId}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, access_token: token }),
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json({ error: err?.error?.message || `Meta API ${res.status}` }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json({ success: true, result: data })
  } catch (err: any) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return NextResponse.json({ error: 'timeout' }, { status: 504 })
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
