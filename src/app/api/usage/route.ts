import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const MONTHLY_BUDGET_USD = 150 // $150 Anthropic limit

// GET /api/usage — returns current month spend summary
export async function GET() {
  try {
    const month = new Date().toISOString().slice(0, 7)

    const { data, error } = await supabase
      .from('api_usage')
      .select('model, input_tokens, output_tokens, cost_usd')
      .eq('month', month)

    if (error) throw error

    const rows = data || []
    const totalCostUsd = rows.reduce((sum, r) => sum + (r.cost_usd || 0), 0)
    const totalCalls = rows.length
    const totalInputTokens = rows.reduce((sum, r) => sum + (r.input_tokens || 0), 0)
    const totalOutputTokens = rows.reduce((sum, r) => sum + (r.output_tokens || 0), 0)

    const byModel = rows.reduce((acc: Record<string, any>, r) => {
      if (!acc[r.model]) acc[r.model] = { calls: 0, cost_usd: 0 }
      acc[r.model].calls++
      acc[r.model].cost_usd += r.cost_usd || 0
      return acc
    }, {})

    const percentUsed = (totalCostUsd / MONTHLY_BUDGET_USD) * 100

    return NextResponse.json({
      month,
      totalCostUsd: Math.round(totalCostUsd * 10000) / 10000,
      totalCalls,
      totalInputTokens,
      totalOutputTokens,
      byModel,
      budget: MONTHLY_BUDGET_USD,
      percentUsed: Math.round(percentUsed * 10) / 10,
      warning: percentUsed >= 80,
      critical: percentUsed >= 95,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
