import { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import PromoClient from './PromoClient'

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
    return { title: 'Night Manoeuvres' }
  }

  const { data: blast } = await supabase
    .from('promo_blasts')
    .select('track_title, track_artist, track_label')
    .eq('id', link.blast_id)
    .single()

  const title = blast?.track_title
    ? `${blast.track_title} — ${blast.track_artist || 'Night Manoeuvres'}`
    : 'Night Manoeuvres'

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
      siteName: 'Night Manoeuvres',
      images: [`${siteUrl}/nm-logo-bw-sm.png`],
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  }
}

export default function PromoPage() {
  return <PromoClient />
}
