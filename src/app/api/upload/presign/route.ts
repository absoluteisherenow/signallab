import { NextRequest, NextResponse } from 'next/server'
import { AwsClient } from 'aws4fetch'

// Direct-to-R2 presigned PUT. Browser uploads straight to R2 using the signed
// URL we return — Worker never sees the bytes, so the 100 MB body cap does
// not apply. Needed for gig footage (MTS/MOV from cameras can be multi-GB).
//
// Requires CORS on the R2 bucket:
//   [{ AllowedOrigins: ["https://signallabos.com"], AllowedMethods: ["PUT"],
//      AllowedHeaders: ["*"], MaxAgeSeconds: 3600 }]

export async function POST(req: NextRequest) {
  try {
    const { fileName, contentType, size, gigId } = await req.json()

    if (!fileName) return NextResponse.json({ error: 'fileName required' }, { status: 400 })

    const accountId = process.env.R2_ACCOUNT_ID
    const accessKeyId = process.env.R2_ACCESS_KEY_ID
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
    const bucket = process.env.R2_BUCKET
    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
      return NextResponse.json({ error: 'R2 env not configured' }, { status: 500 })
    }

    // Uniqueness without reading the file: timestamp + random suffix. Same-file
    // re-upload is cheap (R2 overwrites if keys ever collide), and we can't
    // hash a file we never receive.
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_')
    const prefix = gigId ? `media/gigs/${gigId}` : 'media'
    const key = `${prefix}/${stamp}-${safeName}`

    const aws = new AwsClient({
      accessKeyId,
      secretAccessKey,
      service: 's3',
      region: 'auto',
    })

    const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${encodeURI(key)}`
    const url = new URL(endpoint)
    // 15-minute expiry — plenty for large uploads but not indefinite.
    url.searchParams.set('X-Amz-Expires', '900')

    const signed = await aws.sign(
      new Request(url, {
        method: 'PUT',
        headers: contentType ? { 'Content-Type': contentType } : undefined,
      }),
      { aws: { signQuery: true } }
    )

    const publicBase = process.env.R2_CUSTOM_DOMAIN || process.env.R2_PUBLIC_URL
    const publicUrl = publicBase
      ? `${publicBase.replace(/\/$/, '')}/${key}`
      : `${process.env.NEXT_PUBLIC_APP_URL || 'https://signallabos.com'}/api/media/file/${encodeURIComponent(key)}`

    // Echo back Content-Type: browser MUST send the exact same value or the
    // signature mismatches. Undefined = browser will likely send nothing.
    return NextResponse.json({
      uploadUrl: signed.url,
      key,
      publicUrl,
      contentType: contentType || null,
      sizeLimit: size ?? null,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
