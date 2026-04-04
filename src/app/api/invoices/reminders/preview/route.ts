import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// GET ?id=<draft_id> — preview a specific reminder draft as HTML
export async function GET(req: NextRequest) {
  try {
    const draftId = req.nextUrl.searchParams.get('id')
    if (!draftId) return NextResponse.json({ error: 'Missing draft id' }, { status: 400 })

    const { data: draft, error } = await supabase
      .from('invoice_reminder_drafts')
      .select('*')
      .eq('id', draftId)
      .single()

    if (error || !draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })

    // Return full preview data
    return NextResponse.json({
      id: draft.id,
      to: draft.promoter_email,
      promoterName: draft.promoter_name,
      subject: draft.subject,
      bodyText: draft.body_text,
      bodyHtml: draft.body_html,
      milestone: draft.milestone,
      status: draft.status,
      generatedAt: draft.generated_at,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
