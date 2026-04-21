'use client'

/**
 * Public guest-list signup page at /gl/<slug>.
 *
 * Reached via WhatsApp share from GigDetail. Shows gig title/venue/date and a
 * short form: name (required), +1s, response type, one contact field, notes.
 * No login, no cookie — submits to /api/gl/<slug>.
 */

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

type Gig = { title: string; date: string; venue: string; lineup: string; artwork_url?: string }

const S = {
  bg: '#050505',
  panel: '#0e0e0e',
  panelAlt: '#141414',
  border: '#1d1d1d',
  text: '#f2f2f2',
  dim: '#b0b0b0',
  dimmer: '#6a6a6a',
  accent: '#ff2a1a',
  font: "'Helvetica Neue', Helvetica, Arial, sans-serif",
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: S.bg,
  border: `1px solid ${S.border}`,
  color: S.text,
  fontFamily: S.font,
  fontSize: '14px',
  padding: '12px 14px',
  outline: 'none',
}

const labelStyle: React.CSSProperties = {
  fontSize: '10px',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: S.dim,
  marginBottom: '6px',
  display: 'block',
}

export default function GuestListPage() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug || ''

  const [gig, setGig] = useState<Gig | null>(null)
  const [offersDiscount, setOffersDiscount] = useState(true)
  const [offersGuestlist, setOffersGuestlist] = useState(true)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [response, setResponse] = useState<'coming' | 'guestlist'>('coming')
  const [email, setEmail] = useState('')
  const [phoneCode, setPhoneCode] = useState('+44')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!slug) return
    fetch(`/api/gl/${slug}`)
      .then(async r => {
        if (r.status === 404) { setNotFound(true); return null }
        return r.json()
      })
      .then(d => {
        if (!d) return
        if (d.gig) setGig(d.gig)
        const od = d.offers_discount !== false
        const og = d.offers_guestlist !== false
        setOffersDiscount(od)
        setOffersGuestlist(og)
        // Default response to first offered option
        if (od) setResponse('coming')
        else if (og) setResponse('guestlist')
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [slug])

  const bothOffered = offersDiscount && offersGuestlist
  const onlyOne = (offersDiscount ? 1 : 0) + (offersGuestlist ? 1 : 0) === 1
  const singleOfferLabel = offersDiscount ? 'Discount ticket' : 'Guest list'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!firstName.trim()) { setError('First name is required'); return }
    if (!lastName.trim()) { setError('Last name is required'); return }
    if (!email.trim()) { setError('Email is required'); return }
    if (!phone.trim()) { setError('Phone is required'); return }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`/api/gl/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${firstName.trim()} ${lastName.trim()}`.trim(),
          plus_ones: 0,
          response,
          email: email.trim(),
          phone: `${phoneCode} ${phone.trim()}`.trim(),
          city: city.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Submission failed')
      setSubmitted(true)
    } catch (err: any) {
      setError(err.message || 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  const wrapperStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: S.bg,
    color: S.text,
    fontFamily: S.font,
    padding: '60px 20px',
    display: 'flex',
    justifyContent: 'center',
  }

  if (loading) {
    return <div style={wrapperStyle}><div style={{ color: S.dim, fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase' }}>Loading…</div></div>
  }

  if (notFound) {
    return (
      <div style={wrapperStyle}>
        <div style={{ maxWidth: '420px', width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', letterSpacing: '0.22em', textTransform: 'uppercase', color: S.accent, marginBottom: '12px' }}>
            Not found
          </div>
          <div style={{ fontSize: '13px', color: S.dim, lineHeight: 1.7 }}>
            This guest-list link is invalid or has been taken down.
          </div>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div style={{ ...wrapperStyle, alignItems: 'center', padding: '20px', minHeight: '100dvh' }}>
        <div style={{ maxWidth: '520px', width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', letterSpacing: '0.24em', textTransform: 'uppercase', color: S.accent, marginBottom: '32px' }}>
            Submitted
          </div>
          <div style={{ fontSize: '28px', color: S.text, marginBottom: '24px', fontWeight: 300, lineHeight: 1.25 }}>
            Thanks {firstName.trim() || 'mate'}.
          </div>
          <div style={{ fontSize: '18px', color: S.dim, lineHeight: 1.5, fontWeight: 300 }}>
            You'll get a text once NIGHT manoeuvres has confirmed you on the guest list.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={wrapperStyle}>
      <div style={{ maxWidth: '480px', width: '100%' }}>
        {/* Gig header */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.22em', textTransform: 'uppercase', color: S.accent, marginBottom: '10px' }}>
            Guest list
          </div>
          {gig && (
            <>
              {gig.artwork_url && (
                <img
                  src={gig.artwork_url}
                  alt=""
                  style={{ width: '100%', height: 'auto', display: 'block', marginBottom: 20, border: `1px solid ${S.border}` }}
                />
              )}
              <div style={{ fontSize: '22px', color: S.text, lineHeight: 1.2, marginBottom: '8px', fontWeight: 300 }}>
                {gig.title}
              </div>
              <div style={{ fontSize: '12px', color: S.dim, letterSpacing: '0.06em' }}>
                {gig.venue}{gig.venue && gig.date ? ' · ' : ''}{fmtDate(gig.date)}
              </div>
              {gig.lineup && (
                <div style={{ fontSize: '11px', color: S.dimmer, marginTop: '8px', letterSpacing: '0.04em' }}>
                  {gig.lineup}
                </div>
              )}
            </>
          )}
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>First name</label>
              <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)}
                placeholder="First" required maxLength={40} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Second name</label>
              <input type="text" value={lastName} onChange={e => setLastName(e.target.value)}
                placeholder="Last" required maxLength={40} style={inputStyle} />
            </div>
          </div>

          {bothOffered && (
            <div>
              <label style={labelStyle}>I'm…</label>
              <select value={response} onChange={e => setResponse(e.target.value as any)} style={{ ...inputStyle, appearance: 'none' }}>
                <option value="coming">Discount ticket</option>
                <option value="guestlist">Asking for guest list</option>
              </select>
            </div>
          )}

          {onlyOne && (
            <div>
              <label style={labelStyle}>Requesting</label>
              <div style={{
                fontSize: '13px', color: S.text, padding: '12px 14px',
                border: `1px solid ${S.border}`, background: S.panel, letterSpacing: '0.02em',
              }}>
                {singleOfferLabel}
              </div>
            </div>
          )}

          <div>
            <label style={labelStyle}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@email.com" required maxLength={120} style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Phone</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select value={phoneCode} onChange={e => setPhoneCode(e.target.value)}
                style={{ ...inputStyle, width: '110px', appearance: 'none', flexShrink: 0 }}>
                <option value="+44">UK +44</option>
                <option value="+1">US/CA +1</option>
                <option value="+33">FR +33</option>
                <option value="+49">DE +49</option>
                <option value="+31">NL +31</option>
                <option value="+32">BE +32</option>
                <option value="+34">ES +34</option>
                <option value="+39">IT +39</option>
                <option value="+30">GR +30</option>
                <option value="+351">PT +351</option>
                <option value="+353">IE +353</option>
                <option value="+41">CH +41</option>
                <option value="+43">AT +43</option>
                <option value="+45">DK +45</option>
                <option value="+46">SE +46</option>
                <option value="+47">NO +47</option>
                <option value="+48">PL +48</option>
                <option value="+420">CZ +420</option>
                <option value="+36">HU +36</option>
                <option value="+90">TR +90</option>
                <option value="+61">AU +61</option>
                <option value="+64">NZ +64</option>
                <option value="+81">JP +81</option>
                <option value="+82">KR +82</option>
                <option value="+86">CN +86</option>
                <option value="+852">HK +852</option>
                <option value="+65">SG +65</option>
                <option value="+971">AE +971</option>
                <option value="+972">IL +972</option>
                <option value="+27">ZA +27</option>
                <option value="+52">MX +52</option>
                <option value="+55">BR +55</option>
              </select>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="7700 000000" required maxLength={20} style={{ ...inputStyle, flex: 1 }} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>City <span style={{ color: S.dimmer, textTransform: 'none', letterSpacing: 0, fontSize: '10px' }}>(optional)</span></label>
            <input type="text" value={city} onChange={e => setCity(e.target.value)}
              placeholder="e.g. Athens" maxLength={80} style={inputStyle} />
          </div>

          {error && (
            <div style={{ fontSize: '12px', color: S.accent, letterSpacing: '0.04em' }}>
              {error}
            </div>
          )}

          <div style={{ fontSize: '11px', color: S.dimmer, lineHeight: 1.6, letterSpacing: '0.02em' }}>
            By sending you agree to be added to the Night Manoeuvres mailing list.
          </div>

          <button type="submit" disabled={submitting || !firstName.trim() || !lastName.trim()}
            style={{
              background: submitting || !firstName.trim() || !lastName.trim() ? S.panelAlt : S.accent,
              border: `1px solid ${submitting || !firstName.trim() || !lastName.trim() ? S.border : S.accent}`,
              color: submitting || !firstName.trim() || !lastName.trim() ? S.dim : S.bg,
              fontFamily: S.font,
              fontSize: '11px',
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              padding: '16px 24px',
              cursor: submitting || !firstName.trim() || !lastName.trim() ? 'not-allowed' : 'pointer',
              marginTop: '8px',
            }}>
            {submitting ? 'Sending…' : response === 'coming' ? 'Send me the link' : 'Put me down'}
          </button>
        </form>
      </div>
    </div>
  )
}

function fmtDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}
