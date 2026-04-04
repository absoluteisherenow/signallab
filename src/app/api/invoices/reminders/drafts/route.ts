import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// GET — list all pending reminder drafts
export async function GET(req: NextRequest) {
  try {
    const { data, error } = await supabase
      .from('invoice_reminder_drafts')
      .select('*, invoices(gig_title, amount, currency, due_date, status)')
      .eq('status', 'draft')
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ drafts: data || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
