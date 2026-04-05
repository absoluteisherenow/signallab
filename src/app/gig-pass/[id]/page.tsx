import GigPassPageClient from './PageClient'

export function generateStaticParams() { return [] }

export default function Page({ params }: { params: { id: string } }) {
  return <GigPassPageClient params={params} />
}
