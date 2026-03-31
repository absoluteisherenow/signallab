import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { email, name, role } = await req.json()

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { success: false, error: 'Valid email required' },
        { status: 400 }
      )
    }

    // Check if email already exists
    const { data: existing } = await supabase
      .from('waitlist')
      .select('id')
      .eq('email', email)
      .single()

    if (existing) {
      return NextResponse.json(
        { success: true, message: 'Already on waitlist', isNew: false },
        { status: 200 }
      )
    }

    // Insert new waitlist entry
    const record: Record<string, string> = {
      email,
      joined_at: new Date().toISOString(),
      status: 'pending',
    }
    if (name) record.name = name
    if (role) record.role = role

    const { data, error } = await supabase
      .from('waitlist')
      .insert([record])
      .select()

    if (error) throw error

    return NextResponse.json({
      success: true,
      message: 'Added to waitlist',
      isNew: true,
      id: data?.[0]?.id,
    })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to join waitlist' },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  try {
    // Get waitlist stats (admin only, but no auth check for now)
    const { data, error } = await supabase
      .from('waitlist')
      .select('count')

    if (error) throw error

    return NextResponse.json({ success: true, count: data?.length || 0 })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    )
  }
}
