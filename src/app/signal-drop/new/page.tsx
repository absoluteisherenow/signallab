'use client'

import { useEffect, useState } from 'react'
import DropUploader from '@/components/promo/DropUploader'
import { PageHeader } from '@/components/ui/PageHeader'

type Contact = { id: string; name: string; instagram_handle?: string | null; email?: string | null }

export default function NewDropPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/contacts')
      .then(r => r.json())
      .then(d => setContacts(d.contacts || []))
      .finally(() => setLoading(false))
  }, [])

  return (
    <main style={page}>
      <PageHeader
        breadcrumb={[{ label: 'SIGNAL DROP', href: '/signal-drop' }, { label: 'NEW DROP' }]}
        section="SIGNAL DROP"
        title="New drop"
        subtitle="Private stream for promoters, press, A&R. Upload tracks, pick recipients, send links."
      />
      <div style={container}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#7a7a7a', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 12 }}>
            LOADING CONTACTS…
          </div>
        ) : (
          <DropUploader contacts={contacts} />
        )}
      </div>
    </main>
  )
}

const page: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--bg)',
  color: 'var(--text)',
}

const container: React.CSSProperties = {
  padding: '32px 48px 64px',
  maxWidth: 820,
  display: 'flex',
  flexDirection: 'column',
  gap: 32,
}
