import { GigDetail } from '@/components/gigs/GigDetail'

export function generateStaticParams() { return [] }

export default function GigPage({ params }: { params: { id: string } }) {
  return <GigDetail gigId={params.id} />
}
