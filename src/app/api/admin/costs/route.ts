import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// Admin gate: email must match ADMIN_EMAILS (comma-separated) or ARTIST_EMAIL.
// api_usage aggregates are returned in three slices: today, MTD, by feature, by user.
function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  const allow = new Set(
    (process.env.ADMIN_EMAILS || process.env.ARTIST_EMAIL || 'absoluteishere@gmail.com')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean)
  )
  return allow.has(email.toLowerCase())
}

export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  if (!isAdmin(gate.user.email)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const { serviceClient: supabase } = gate

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const last30d = new Date(Date.now() - 30 * 86400000).toISOString()

  const [todayRes, mtdRes, byFeatureRes, byUserRes, byModelRes, recentRes] = await Promise.all([
    supabase.from('api_usage').select('cost_usd,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens').gte('called_at', startOfToday),
    supabase.from('api_usage').select('cost_usd,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens').gte('called_at', startOfMonth),
    supabase.from('api_usage').select('feature,cost_usd').gte('called_at', last30d),
    supabase.from('api_usage').select('user_id,cost_usd').gte('called_at', startOfMonth),
    supabase.from('api_usage').select('model,cost_usd,input_tokens,output_tokens,cache_read_tokens').gte('called_at', last30d),
    supabase.from('api_usage').select('*').order('called_at', { ascending: false }).limit(25),
  ])

  const sum = (rows: any[], col: string) => (rows || []).reduce((n, r) => n + (Number(r[col]) || 0), 0)
  const group = (rows: any[], key: string) => {
    const out: Record<string, { cost: number; calls: number }> = {}
    for (const r of rows || []) {
      const k = r[key] || 'unknown'
      if (!out[k]) out[k] = { cost: 0, calls: 0 }
      out[k].cost += Number(r.cost_usd) || 0
      out[k].calls += 1
    }
    return Object.entries(out).map(([k, v]) => ({ [key]: k, cost: +v.cost.toFixed(4), calls: v.calls })).sort((a: any, b: any) => b.cost - a.cost)
  }

  return NextResponse.json({
    today: {
      cost: +sum(todayRes.data || [], 'cost_usd').toFixed(4),
      calls: (todayRes.data || []).length,
      input_tokens: sum(todayRes.data || [], 'input_tokens'),
      output_tokens: sum(todayRes.data || [], 'output_tokens'),
      cache_read_tokens: sum(todayRes.data || [], 'cache_read_tokens'),
    },
    mtd: {
      cost: +sum(mtdRes.data || [], 'cost_usd').toFixed(4),
      calls: (mtdRes.data || []).length,
      input_tokens: sum(mtdRes.data || [], 'input_tokens'),
      output_tokens: sum(mtdRes.data || [], 'output_tokens'),
      cache_read_tokens: sum(mtdRes.data || [], 'cache_read_tokens'),
    },
    byFeature: group(byFeatureRes.data || [], 'feature'),
    byUser: group(byUserRes.data || [], 'user_id').slice(0, 20),
    byModel: group(byModelRes.data || [], 'model'),
    recent: (recentRes.data || []).map((r: any) => ({
      called_at: r.called_at,
      feature: r.feature,
      model: r.model,
      cost: +(Number(r.cost_usd) || 0).toFixed(5),
      in: r.input_tokens,
      out: r.output_tokens,
      cache_read: r.cache_read_tokens,
    })),
  })
}
