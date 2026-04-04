import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const allowed = ['jpg', 'jpeg', 'png', 'webp', 'gif']
    if (!allowed.includes(ext)) return NextResponse.json({ error: 'Only JPG, PNG, WebP or GIF allowed' }, { status: 400 })

    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const buffer = await file.arrayBuffer()

    const { error } = await supabase.storage
      .from('artwork')
      .upload(filename, buffer, { contentType: file.type, upsert: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const { data } = supabase.storage.from('artwork').getPublicUrl(filename)
    return NextResponse.json({ url: data.publicUrl })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
