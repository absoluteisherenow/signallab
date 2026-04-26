import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import type { SupabaseClient } from '@supabase/supabase-js'

const BUCKET = 'documents'

async function ensureBucket(svc: SupabaseClient) {
  const { data: buckets } = await svc.storage.listBuckets()
  const exists = buckets?.some(b => b.name === BUCKET)
  if (!exists) {
    await svc.storage.createBucket(BUCKET, { public: true })
  }
}

export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { supabase } = gate
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
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user, supabase, serviceClient } = gate
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

    // Ensure bucket exists (service client — bucket admin)
    await ensureBucket(serviceClient)

    const fileId = crypto.randomUUID()
    const filePath = `${user.id}/${fileId}/${file.name}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await serviceClient.storage
      .from(BUCKET)
      .upload(filePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })

    if (uploadError) throw uploadError

    const { data: urlData } = serviceClient.storage
      .from(BUCKET)
      .getPublicUrl(filePath)

    const { data, error } = await supabase
      .from('documents')
      .insert([{
        user_id: user.id,
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
    const message = err instanceof Error ? err.message
      : (err as any)?.message
      || (err as any)?.error_description
      || (err as any)?.hint
      || JSON.stringify(err)
      || 'Unknown error'
    console.error('[documents POST]', err)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { supabase, serviceClient } = gate
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
        await serviceClient.storage.from(BUCKET).remove([decodeURIComponent(pathParts[1])])
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
    const message = err instanceof Error ? err.message
      : (err as any)?.message
      || (err as any)?.error_description
      || (err as any)?.hint
      || JSON.stringify(err)
      || 'Unknown error'
    console.error('[documents POST]', err)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
