import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { uploadFile } from '@/lib/storage'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// POST — upload a single audio file to R2 + create promo_tracks row.
// Expects multipart form data:
//   file:            audio file (required)
//   blast_id:        existing promo_blasts row (required)
//   title:           track title (required)
//   artist:          optional
//   label:           optional
//   position:        integer (required)
//   duration_sec:    numeric (client-computed from Web Audio API)
//   waveform_peaks:  JSON-encoded array of floats 0-1
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    const blast_id = form.get('blast_id') as string | null
    const title = form.get('title') as string | null

    if (!file || !blast_id || !title) {
      return NextResponse.json({ error: 'file, blast_id, title required' }, { status: 400 })
    }

    const artist = (form.get('artist') as string) || null
    const label = (form.get('label') as string) || null
    const position = Number(form.get('position') || 0)
    const duration_sec = Number(form.get('duration_sec') || 0) || null
    const peaksRaw = (form.get('waveform_peaks') as string) || ''
    let waveform_peaks: number[] | null = null
    try {
      if (peaksRaw) waveform_peaks = JSON.parse(peaksRaw)
    } catch {
      waveform_peaks = null
    }

    // Pre-create the track row to get a UUID for the file key
    const { data: trackRow, error: insertErr } = await supabase
      .from('promo_tracks')
      .insert({
        blast_id,
        position,
        title,
        artist,
        label,
        duration_sec,
        file_key: 'pending',
        waveform_peaks,
        file_size: file.size,
        format: file.type || file.name.split('.').pop() || null,
      })
      .select()
      .single()

    if (insertErr || !trackRow) {
      return NextResponse.json({ error: insertErr?.message || 'Failed to insert track' }, { status: 500 })
    }

    const ext = (file.name.split('.').pop() || 'mp3').toLowerCase()
    const file_key = `promo/${blast_id}/${trackRow.id}.${ext}`

    const buf = await file.arrayBuffer()
    await uploadFile(buf, file_key, file.type || `audio/${ext}`)

    const { error: updErr } = await supabase
      .from('promo_tracks')
      .update({ file_key })
      .eq('id', trackRow.id)

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, track_id: trackRow.id, file_key })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 })
  }
}
