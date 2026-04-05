import ClaimPageClient from './PageClient'

export function generateStaticParams() { return [] }

export default function Page({ params }: { params: { slug: string } }) {
  return <ClaimPageClient params={params} />
}
