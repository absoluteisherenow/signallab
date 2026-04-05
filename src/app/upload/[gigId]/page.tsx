import UploadPageClient from './PageClient'

export function generateStaticParams() { return [] }

export default function Page({ params }: { params: { gigId: string } }) {
  return <UploadPageClient params={params} />
}
