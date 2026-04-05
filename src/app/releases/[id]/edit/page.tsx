import EditReleaseClient from './PageClient'

export function generateStaticParams() { return [] }

export default function Page({ params }: { params: { id: string } }) {
  return <EditReleaseClient params={params} />
}
