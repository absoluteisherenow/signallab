import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS mix_scans (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       timestamptz  NOT NULL DEFAULT now(),
  filename         text         NOT NULL,
  duration_seconds integer      NOT NULL DEFAULT 0,
  bpm_estimate     integer,
  tracklist        text         NOT NULL DEFAULT '',
  detected_tracks  jsonb        NOT NULL DEFAULT '[]'::jsonb,
  context          text,
  result           jsonb,
  status           text         NOT NULL DEFAULT 'detected'
);
`

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('mix_scans')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({ success: true, scans: data || [] })
  } catch (err: any) {
    const is42P01 = err.message?.includes('42P01') || err.code === '42P01' || err.message?.includes('relation') && err.message?.includes('does not exist')
    if (is42P01) {
      return NextResponse.json({
        success: false,
        error: 'Table mix_scans does not exist. Run this SQL in Supabase:\n' + CREATE_TABLE_SQL,
        scans: [],
      })
    }
    return NextResponse.json({ success: false, error: err.message, scans: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { data, error } = await supabase
      .from('mix_scans')
      .insert([{
        filename:         body.filename || 'Untitled mix',
        duration_seconds: parseInt(body.duration_seconds) || 0,
        bpm_estimate:     body.bpm_estimate ? parseInt(body.bpm_estimate) : null,
        tracklist:        body.tracklist || '',
        detected_tracks:  body.detected_tracks || [],
        context:          body.context || null,
        result:           body.result || null,
        status:           body.status || 'detected',
      }])
      .select()
    if (error) throw error
    return NextResponse.json({ success: true, scan: data?.[0] })
  } catch (err: any) {
    const is42P01 = err.message?.includes('42P01') || err.code === '42P01' || err.message?.includes('relation') && err.message?.includes('does not exist')
    if (is42P01) {
      return NextResponse.json({
        success: false,
        error: 'Table mix_scans does not exist. Run this SQL in Supabase:\n' + CREATE_TABLE_SQL,
      }, { status: 500 })
    }
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
