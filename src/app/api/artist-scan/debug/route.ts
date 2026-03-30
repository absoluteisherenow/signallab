import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { handle } = await req.json()
  const username = (handle || 'fredagainxx').replace('@', '')

  const res = await fetch(
    `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${process.env.APIFY_API_KEY}&timeout=60`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usernames: [username],
        resultsLimit: 3,
      }),
      signal: AbortSignal.timeout(55000),
    }
  )

  const raw = await res.json()
  const firstItem = Array.isArray(raw) ? raw[0] : raw

  return NextResponse.json({
    status: res.status,
    isArray: Array.isArray(raw),
    length: Array.isArray(raw) ? raw.length : 'n/a',
    firstItemKeys: firstItem ? Object.keys(firstItem) : [],
    firstItem,
  })
}
