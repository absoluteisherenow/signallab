import { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import { signStreamToken } from '@/lib/promoTokens'
import PromoClient from './PromoClient'
import DropPlayer, { DropTrack } from '@/components/promo/DropPlayer'

export function generateStaticParams() { return [] }

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Props = { params: Promise<{ code: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params

  const { data: link } = await supabase
    .from('promo_tracked_links')
    .select('blast_id')
    .eq('code', code)
    .single()

  if (!link) {
    return { title: 'NIGHT manoeuvres' }
  }

  const { data: blast } = await supabase
    .from('promo_blasts')
    .select('track_title, track_artist, track_label')
    .eq('id', link.blast_id)
    .single()

  const title = blast?.track_title
    ? `${blast.track_title} — ${blast.track_artist || 'NIGHT manoeuvres'}`
    : 'NIGHT manoeuvres'

  const description = blast?.track_label
    ? `New release on ${blast.track_label}. Listen now.`
    : 'New release. Listen now.'

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://signallabos.com'

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'music.song',
      siteName: 'NIGHT manoeuvres',
      images: [`${siteUrl}/nm-logo-bw-sm.png`],
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  }
}

export default async function PromoPage({ params }: Props) {
  const { code } = await params

  const { data: link } = await supabase
    .from('promo_tracked_links')
    .select('id, code, blast_id, contact_id')
    .eq('code', code)
    .single()

  if (link) {
    const { data: tracks } = await supabase
      .from('promo_tracks')
      .select('id, title, artist, label, duration_sec, waveform_peaks, position')
      .eq('blast_id', link.blast_id)
      .order('position', { ascending: true })

    if (tracks && tracks.length > 0) {
      const [blastRes, contactRes] = await Promise.all([
        supabase
          .from('promo_blasts')
          .select('track_title, track_artist, track_label, message')
          .eq('id', link.blast_id)
          .single(),
        supabase
          .from('dj_contacts')
          .select('name')
          .eq('id', link.contact_id)
          .single(),
      ])

      // Mint a stream token per track, server-side
      const hydrated: DropTrack[] = await Promise.all(
        tracks.map(async t => ({
          id: t.id,
          title: t.title,
          artist: t.artist,
          label: t.label,
          duration_sec: t.duration_sec,
          waveform_peaks: t.waveform_peaks,
          stream_token: await signStreamToken(t.id, link.id),
        }))
      )

      // Bump click counter server-side (SSR-safe)
      const { data: existing } = await supabase
        .from('promo_tracked_links')
        .select('clicks, first_clicked_at')
        .eq('id', link.id)
        .single()
      const now = new Date().toISOString()
      await supabase
        .from('promo_tracked_links')
        .update({
          clicks: (existing?.clicks || 0) + 1,
          first_clicked_at: existing?.first_clicked_at || now,
          last_clicked_at: now,
        })
        .eq('id', link.id)

      return (
        <DropPlayer
          tracks={hydrated}
          dropTitle={blastRes.data?.track_title || 'Untitled'}
          dropArtist={blastRes.data?.track_artist || 'NIGHT manoeuvres'}
          dropLabel={blastRes.data?.track_label || null}
          message={blastRes.data?.message || null}
          recipientName={contactRes.data?.name || null}
          linkId={link.id}
          code={code}
        />
      )
    }
  }

  // Fallback: legacy SoundCloud-based promo
  return <PromoClient />
}
