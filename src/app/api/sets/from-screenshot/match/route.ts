import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface ExtractedTrack {
  title: string
  artist: string
  bpm?: number | null
  key?: string | null
  position: number
}

export async function POST(req: NextRequest) {
  try {
    const { tracks } = await req.json() as { tracks: ExtractedTrack[] }

    if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
      return NextResponse.json({ error: 'No tracks provided' }, { status: 400 })
    }

    // Fetch the full library once for matching
    const { data: library, error } = await supabase
      .from('dj_tracks')
      .select('id, title, artist, bpm, key, camelot, energy, genre, moment_type')
      .limit(1000)

    if (error) throw error

    const libraryTracks = library || []

    const matches = tracks.map(extracted => {
      // Try exact match first (case-insensitive)
      let match = libraryTracks.find(
        lib => lib.title.toLowerCase() === extracted.title.toLowerCase() &&
               lib.artist.toLowerCase() === extracted.artist.toLowerCase()
      )

      if (match) {
        return {
          extracted,
          library_match: match,
          confidence: 'exact' as const,
        }
      }

      // Try partial match — title contains or artist contains
      match = libraryTracks.find(
        lib => (
          lib.title.toLowerCase().includes(extracted.title.toLowerCase()) ||
          extracted.title.toLowerCase().includes(lib.title.toLowerCase())
        ) && (
          lib.artist.toLowerCase().includes(extracted.artist.toLowerCase()) ||
          extracted.artist.toLowerCase().includes(lib.artist.toLowerCase())
        )
      )

      if (match) {
        return {
          extracted,
          library_match: match,
          confidence: 'partial' as const,
        }
      }

      // Try title-only match as a last resort
      match = libraryTracks.find(
        lib => lib.title.toLowerCase() === extracted.title.toLowerCase()
      )

      if (match) {
        return {
          extracted,
          library_match: match,
          confidence: 'partial' as const,
        }
      }

      return {
        extracted,
        library_match: null,
        confidence: 'none' as const,
      }
    })

    return NextResponse.json({ matches })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
