'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

interface Campaign {
  id: string
  campaign_name: string
  reward_type: string
  reward_url: string | null
  follow_required: boolean
  claim_url: string
}

export default function ClaimPage() {
  const params = useParams()
  const slug = params?.slug as string

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [followConfirmed, setFollowConfirmed] = useState(false)
  const [email, setEmail] = useState('')
  const [igUsername, setIgUsername] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [rewardUrl, setRewardUrl] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!slug) return
    fetch(`/api/social/instagram/dm?slug=${slug}`)
      .then(r => r.json())
      .then(d => {
        if (d.automation) setCampaign(d.automation)
        else setNotFound(true)
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [slug])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_slug: slug,
          email: email.trim().toLowerCase(),
          instagram_username: igUsername.replace('@', '').trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error || 'Something went wrong — try again')
        return
      }
      setRewardUrl(data.reward_url)
      setDone(true)
    } catch {
      setError('Something went wrong — try again')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070706] flex items-center justify-center">
        <div className="flex gap-1.5">
          {[0,1,2].map(i => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#b08d57] animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
          ))}
        </div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#070706] flex items-center justify-center font-mono text-center px-6">
        <div>
          <div className="text-[10px] tracking-[.3em] uppercase text-[#52504c] mb-4">Night Manoeuvres</div>
          <div className="text-[13px] tracking-[.06em] text-[#8a8780]">This link is no longer active.</div>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="min-h-screen bg-[#070706] flex items-center justify-center font-mono px-6">
        <div className="max-w-sm w-full text-center">
          <div className="text-[9px] tracking-[.35em] uppercase text-[#52504c] mb-8">Night Manoeuvres</div>
          <div className="w-12 h-px bg-[#b08d57] mx-auto mb-8" />
          <div className="text-[15px] tracking-[.04em] text-[#f0ebe2] mb-3">you're in.</div>
          <div className="text-[11px] tracking-[.06em] text-[#8a8780] leading-relaxed mb-8">
            {rewardUrl
              ? "your download is ready."
              : "we've got your details — watch your inbox."}
          </div>
          {rewardUrl && (
            <a
              href={rewardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-[10px] tracking-[.2em] uppercase bg-[#b08d57] text-[#070706] px-8 py-3 hover:bg-[#c9a46e] transition-colors mb-6"
            >
              Download →
            </a>
          )}
          <div className="text-[9px] tracking-[.12em] uppercase text-[#3a3830] mt-6">
            follow for more
          </div>
          <a
            href="https://instagram.com/nightmanoeuvres"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] tracking-[.1em] text-[#52504c] hover:text-[#8a8780] transition-colors"
          >
            @nightmanoeuvres
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#070706] flex items-center justify-center font-mono px-6">
      <div className="max-w-sm w-full">
        <div className="text-center mb-10">
          <div className="text-[9px] tracking-[.35em] uppercase text-[#52504c] mb-6">Night Manoeuvres</div>
          <div className="w-12 h-px bg-[#b08d57] mx-auto mb-6" />
          <div className="text-[15px] tracking-[.04em] text-[#f0ebe2] mb-3">
            {campaign?.campaign_name || 'claim your download'}
          </div>
          {campaign?.follow_required && (
            <div className="text-[10px] tracking-[.08em] text-[#8a8780] leading-relaxed mt-3">
              make sure you're following{' '}
              <a href="https://instagram.com/nightmanoeuvres" target="_blank" rel="noopener noreferrer" className="text-[#b08d57] hover:underline">
                @nightmanoeuvres
              </a>
              {' '}to stay in the loop
            </div>
          )}
        </div>

        {/* Follow gate step */}
        {campaign?.follow_required && !followConfirmed && (
          <div className="mb-8 text-center">
            <div className="text-[10px] tracking-[.08em] text-[#8a8780] leading-relaxed mb-5">
              follow us first to unlock your {campaign.reward_type}
            </div>
            <a
              href="https://instagram.com/nightmanoeuvres"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-[10px] tracking-[.2em] uppercase border border-[#b08d57] text-[#b08d57] px-6 py-2.5 hover:bg-[#b08d57] hover:text-[#070706] transition-colors mb-4"
            >
              Follow @nightmanoeuvres →
            </a>
            <div className="mt-4">
              <button
                onClick={() => setFollowConfirmed(true)}
                className="text-[9px] tracking-[.14em] uppercase text-[#52504c] hover:text-[#8a8780] transition-colors underline underline-offset-2"
              >
                i'm following — continue
              </button>
            </div>
          </div>
        )}

        {/* Email form — shown once follow confirmed (or not required) */}
        {(!campaign?.follow_required || followConfirmed) && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="block text-[9px] tracking-[.2em] uppercase text-[#52504c] mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="w-full bg-[#0e0d0b] border border-white/10 text-[#f0ebe2] font-mono text-[12px] px-4 py-3 outline-none focus:border-[#b08d57] transition-colors placeholder-[#2e2c29]"
            />
          </div>
          <div>
            <label className="block text-[9px] tracking-[.2em] uppercase text-[#52504c] mb-2">Instagram handle <span className="text-[#2e2c29] normal-case tracking-normal">optional</span></label>
            <input
              type="text"
              value={igUsername}
              onChange={e => setIgUsername(e.target.value)}
              placeholder="@yourhandle"
              className="w-full bg-[#0e0d0b] border border-white/10 text-[#f0ebe2] font-mono text-[12px] px-4 py-3 outline-none focus:border-[#b08d57] transition-colors placeholder-[#2e2c29]"
            />
          </div>
          {error && (
            <div className="text-[10px] tracking-[.06em] text-red-400/80 py-2">{error}</div>
          )}
          <button
            type="submit"
            disabled={submitting || !email.trim()}
            className="mt-2 text-[10px] tracking-[.2em] uppercase bg-[#b08d57] text-[#070706] px-6 py-3 hover:bg-[#c9a46e] transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {submitting && <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />}
            {submitting ? 'sending...' : campaign?.reward_type === 'download' ? 'get download →' : 'claim →'}
          </button>
          <div className="text-center mt-8 text-[9px] tracking-[.1em] text-[#2e2c29]">
            your details stay private. no spam.
          </div>
        </form>
        )}

      </div>
    </div>
  )
}
