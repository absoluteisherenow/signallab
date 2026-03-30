import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const MISSING_TABLE = '42P01'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const unread_only = searchParams.get('unread') === 'true'

    let query = supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (unread_only) query = query.eq('read', false)

    const { data, error } = await query
    if (error?.code === MISSING_TABLE) return NextResponse.json({ notifications: [], unread: 0 })
    if (error) throw error

    const unread = (data || []).filter(n => !n.read).length
    return NextResponse.json({ notifications: data || [], unread })
  } catch (err: any) {
    return NextResponse.json({ notifications: [], unread: 0, error: err.message })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { data, error } = await supabase
      .from('notifications')
      .insert([{
        type: body.type || 'system',
        title: body.title,
        message: body.message || null,
        href: body.href || null,
        gig_id: body.gig_id || null,
        metadata: body.metadata || null,
        read: false,
      }])
      .select()
      .single()
    if (error?.code === MISSING_TABLE) return NextResponse.json({ success: false, error: 'Table not created yet' })
    if (error) throw error
    return NextResponse.json({ notification: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PATCH — mark one or all as read
export async function PATCH(req: NextRequest) {
  try {
    const { id, all } = await req.json()
    let error

    if (all) {
      ;({ error } = await supabase.from('notifications').update({ read: true }).eq('read', false))
    } else if (id) {
      ;({ error } = await supabase.from('notifications').update({ read: true }).eq('id', id))
    }

    if (error?.code === MISSING_TABLE) return NextResponse.json({ success: true })
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
