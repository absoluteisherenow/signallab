import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BUCKET = 'documents'

async function ensureBucket() {
  const { data: buckets } = await supabase.storage.listBuckets()
  const exists = buckets?.some(b => b.name === BUCKET)
  if (!exists) {
    await supabase.storage.createBucket(BUCKET, { public: true })
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type')

    let query = supabase
      .from('documents')
      .select('*')
      .order('created_at', { ascending: false })

    if (type) query = query.eq('type', type)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ success: true, documents: data || [] })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message, documents: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const type = (formData.get('type') as string) || 'other'
    const notes = (formData.get('notes') as string) || null
    const tagsRaw = formData.get('tags') as string | null
    const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : null

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 })
    }

    // Ensure bucket exists
    await ensureBucket()

    const fileId = crypto.randomUUID()
    const filePath = `${fileId}/${file.name}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })

    if (uploadError) throw uploadError

    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(filePath)

    const { data, error } = await supabase
      .from('documents')
      .insert([{
        name: file.name,
        type,
        file_url: urlData.publicUrl,
        file_size: file.size,
        mime_type: file.type || 'application/octet-stream',
        notes,
        tags,
      }])
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ success: true, document: data })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ success: false, error: 'No id provided' }, { status: 400 })
    }

    // Get document to find file path
    const { data: doc, error: fetchError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError) throw fetchError

    // Extract storage path from public URL
    if (doc?.file_url) {
      const url = new URL(doc.file_url)
      const pathParts = url.pathname.split(`/storage/v1/object/public/${BUCKET}/`)
      if (pathParts[1]) {
        await supabase.storage.from(BUCKET).remove([decodeURIComponent(pathParts[1])])
      }
    }

    // Delete from table
    const { error: deleteError } = await supabase
      .from('documents')
      .delete()
      .eq('id', id)

    if (deleteError) throw deleteError
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
