import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

/**
 * GET /api/content-plan/matches?format=POST&keywords=foo,bar&idea=caption text
 * Ranks the user's media_scans for a given content card.
 *
 * Response: { matches: [{ id, thumbnail_url, media_type, filename, score }] }
 *
 * Score = composite_score (base) + format match bonus + keyword/tag overlap bonus
 * No fabrication — pulls real scan tags/moments from the `result` jsonb.
 */
export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user, serviceClient } = gate

  try {
    const qp = req.nextUrl.searchParams
    const format = (qp.get('format') || 'POST').toUpperCase()
    const keywords = (qp.get('keywords') || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
    const idea = (qp.get('idea') || '').toLowerCase()

    const { data: scans, error } = await serviceClient
      .from('media_scans')
      .select('id, file_name, mime_type, thumbnail_url, composite_score, result')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) return NextResponse.json({ matches: [], error: error.message })
    if (!scans || scans.length === 0) return NextResponse.json({ matches: [] })

    const wantsVideo = format === 'REEL' || format === 'STORY'

    const scored = scans.map(s => {
      const base = Number(s.composite_score || 0)
      const mime = String(s.mime_type || '').toLowerCase()
      const isVideo = mime.startsWith('video/')
      const formatBonus = (wantsVideo && isVideo) || (!wantsVideo && !isVideo) ? 15 : -10

      // Pull tags + moment reasons for keyword matching
      const tags: string[] = Array.isArray(s.result?.tags) ? s.result.tags.map((t: any) => String(t).toLowerCase()) : []
      const momentText = Array.isArray(s.result?.moments)
        ? s.result.moments.map((m: any) => `${m.type || ''} ${m.reason || ''}`).join(' ').toLowerCase()
        : ''
      const haystack = `${tags.join(' ')} ${momentText} ${String(s.file_name || '').toLowerCase()}`

      let keywordBonus = 0
      for (const kw of keywords) {
        if (kw.length < 3) continue
        if (haystack.includes(kw)) keywordBonus += 6
      }

      // Light bonus if idea text overlaps with tags
      let ideaBonus = 0
      if (idea && tags.length) {
        for (const t of tags) {
          if (t.length >= 4 && idea.includes(t)) { ideaBonus += 4; break }
        }
      }

      return {
        id: s.id,
        thumbnail_url: s.thumbnail_url || null,
        media_type: isVideo ? 'video' : 'image',
        filename: s.file_name || '',
        score: Math.round(base + formatBonus + keywordBonus + ideaBonus),
      }
    })

    const matches = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)

    return NextResponse.json({ matches })
  } catch (err: any) {
    return NextResponse.json({ matches: [], error: err.message }, { status: 500 })
  }
}
