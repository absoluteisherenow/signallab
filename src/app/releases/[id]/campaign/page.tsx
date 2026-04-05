import CampaignPageClient from './PageClient'

export function generateStaticParams() { return [] }

export default function Page({ params }: { params: { id: string } }) {
  return <CampaignPageClient params={params} />
}
