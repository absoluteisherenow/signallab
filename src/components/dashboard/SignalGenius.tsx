'use client'

import { useState, useRef, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useMobile } from '@/hooks/useMobile'
import { SKILL_SOCIAL_STRATEGY, SKILL_VOICE_ENGINE, SKILL_ADS_MANAGER, SKILL_INSTAGRAM_GROWTH } from '@/lib/skillPromptsClient'

// Module-level guard — shared across all component instances
let uploadInProgress = false

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface ArtistContext {
  gigs: any[]
  invoices: any[]
  posts: any[]
  mixScans: any[]
  revenueStreams: any[]
  profile: any
  quarterStats: { gigs: number; posts: number; revenue: number }
  voiceProfiles: any[]
  postPerformance: any[]
  connectedSocialAccounts: any[]
  releases: any[]
  instagramPosts: any[]
  instagramStats: any
}

/** Stream Claude response — yields text chunks as they arrive */
async function streamClaude(
  system: string,
  messages: { role: string; content: string }[],
  onChunk: (text: string) => void,
  maxTokens: number = 2400,
): Promise<string> {
  const res = await fetch('/api/claude/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      system,
      max_tokens: maxTokens,
      messages,
    }),
  })
  if (!res.ok || !res.body) {
    let detail = `Status ${res.status}`
    try { const err = await res.json(); detail = err?.error?.message || err?.error || detail } catch {}
    throw new Error(detail)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let fullText = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // Parse SSE events
    const lines = buffer.split('\n')
    buffer = lines.pop() || '' // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') continue

      try {
        const event = JSON.parse(data)
        if (event.type === 'content_block_delta' && event.delta?.text) {
          fullText += event.delta.text
          onChunk(fullText)
        }
      } catch {
        // Skip malformed JSON
      }
    }
  }

  return fullText || 'Sorry, I couldn\'t process that.'
}

export function SignalGenius() {
  const mobile = useMobile()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = localStorage.getItem('signal_chat_messages')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [savedNotes, setSavedNotes] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      const saved = localStorage.getItem('signal_saved_notes')
      return new Set(saved ? JSON.parse(saved) : [])
    } catch { return new Set() }
  })
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [context, setContext] = useState<ArtistContext | null>(null)
  const [contextLoaded, setContextLoaded] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [speaking, setSpeaking] = useState(false)
  const [recording, setRecording] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pendingInvoice, setPendingInvoice] = useState<any>(null)
  const [createdInvoice, setCreatedInvoice] = useState<any>(null)
  const [creatingInvoice, setCreatingInvoice] = useState(false)
  const [pendingEmail, setPendingEmail] = useState<{ html: string; invoiceId: string } | null>(null)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [pendingEmailFindings, setPendingEmailFindings] = useState<any[]>([])
  const [importingEmails, setImportingEmails] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  // Persist chat messages to localStorage (survives navigation + refresh)
  useEffect(() => {
    try { localStorage.setItem('signal_chat_messages', JSON.stringify(messages)) } catch {}
  }, [messages])

  function saveNote(msgId: string) {
    const msg = messages.find(m => m.id === msgId)
    if (!msg) return
    const newSaved = new Set(savedNotes)
    if (newSaved.has(msgId)) {
      newSaved.delete(msgId)
    } else {
      newSaved.add(msgId)
    }
    setSavedNotes(newSaved)
    try { localStorage.setItem('signal_saved_notes', JSON.stringify([...newSaved])) } catch {}
  }

  function clearChat() {
    // Keep saved notes, clear everything else
    const saved = messages.filter(m => savedNotes.has(m.id))
    setMessages(saved)
  }

  // Voice output — speak response via OpenAI TTS
  async function speakResponse(text: string) {
    if (!voiceEnabled) return
    setSpeaking(true)
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) { setSpeaking(false); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      if (audioRef.current) { audioRef.current.pause(); URL.revokeObjectURL(audioRef.current.src) }
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => { setSpeaking(false); URL.revokeObjectURL(url) }
      audio.onerror = () => { setSpeaking(false); URL.revokeObjectURL(url) }
      audio.play().catch(() => setSpeaking(false))
    } catch { setSpeaking(false) }
  }

  function stopSpeaking() {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0 }
    setSpeaking(false)
  }

  // Voice input — record from mic, send to Whisper
  async function toggleRecording() {
    if (recording) {
      mediaRecorderRef.current?.stop()
      setRecording(false)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Pick a supported mime type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4'
        : MediaRecorder.isTypeSupported('audio/ogg') ? 'audio/ogg'
        : ''
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
      const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm'
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        if (chunksRef.current.length === 0) return
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' })
        const formData = new FormData()
        formData.append('audio', blob, `recording.${ext}`)
        try {
          const res = await fetch('/api/transcribe', { method: 'POST', body: formData })
          const data = await res.json()
          if (data.text) {
            handleSend(data.text)
          }
        } catch { /* transcription failed */ }
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setRecording(true)
    } catch { /* mic permission denied */ }
  }

  // File upload — PDFs, images, statements
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (uploadInProgress) return
    uploadInProgress = true
    setUploading(true)
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: `📎 ${file.name}` }
    const assistantId = crypto.randomUUID()
    setMessages(prev => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '' }])
    setLoading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('context', 'Extract all data from this document: amounts, currencies, dates, parties, line items, totals, reference numbers. Return raw extracted data only — no commentary.')

      const res = await fetch('/api/analyse-document', { method: 'POST', body: formData })
      if (!res.ok) throw new Error('Failed to read document')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      const extracted = data.text || ''
      if (!extracted) throw new Error('Empty response')

      try {
        // Filter out any empty-content messages — Anthropic API rejects them
        const cleanHistory = messages.filter(m => m.content && m.content.trim() !== '').map(m => ({ role: m.role, content: m.content }))
        const fullResponse = await streamClaude(
          buildSystemPrompt(`uploaded ${file.name} invoice payment`),
          [
            ...cleanHistory,
            { role: userMsg.role, content: userMsg.content },
            {
              role: 'user',
              content: `I just uploaded "${file.name}". Here is the extracted content:\n\n${extracted}\n\nRespond in one sentence only — name what it is and the key amount. Then on a new line ask: "Shall I create your invoice for that?" No markdown, no headers, no bullet points. If you have enough data to create the invoice, end your message with the [INVOICE_READY:{...}] marker as instructed.`,
            },
          ],
          (partialText) => {
            const display = partialText.replace(/\[INVOICE_READY:[^\]]*\]/g, '').trim()
            setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: display } : m))
          },
        )
        const invoiceMatch = fullResponse.match(/\[INVOICE_READY:(\{.*?\})\]/)
        const displayText = fullResponse.replace(/\[INVOICE_READY:[^\]]*\]/g, '').trim()
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: displayText } : m))
        if (invoiceMatch) {
          try {
            setPendingInvoice(JSON.parse(invoiceMatch[1]))
            setCreatedInvoice(null)
            setPendingEmail(null)
          } catch { /* malformed JSON */ }
        }
        speakResponse(displayText)
      } catch {
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: 'Something went wrong — try again.' } : m))
      }
    } catch {
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: 'Failed to read document — try again.' } : m))
    } finally {
      setLoading(false)
      setUploading(false)
      uploadInProgress = false
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Load full artist context when chat opens
  useEffect(() => {
    if (!open || contextLoaded) return
    Promise.allSettled([
      fetch('/api/gigs').then(r => r.json()),
      fetch('/api/invoices').then(r => r.json()),
      fetch('/api/schedule').then(r => r.json()),
      fetch('/api/settings').then(r => r.json()),
      fetch('/api/mix-scans?limit=3').then(r => r.json()).catch(() => ({ scans: [] })),
      fetch('/api/revenue-streams').then(r => r.json()).catch(() => ({ revenue_streams: [] })),
      fetch('/api/voice-profiles').then(r => r.json()).catch(() => ({ voiceProfiles: [] })),
      fetch('/api/post-performance').then(r => r.json()).catch(() => ({ posts: [] })),
      fetch('/api/social/connected').then(r => r.json()).catch(() => ({ accounts: [] })),
      fetch('/api/releases').then(r => r.json()).catch(() => ({ releases: [] })),
      fetch('/api/instagram/posts').then(r => r.json()).catch(() => ({ posts: [], synced: false, stats: null })),
    ]).then(results => {
      const gigs = results[0].status === 'fulfilled' ? results[0].value.gigs || [] : []
      const invoices = results[1].status === 'fulfilled' ? results[1].value.invoices || [] : []
      const posts = results[2].status === 'fulfilled' ? results[2].value.posts || [] : []
      const settings = results[3].status === 'fulfilled' ? results[3].value.settings || {} : {}
      const mixScans = results[4].status === 'fulfilled' ? results[4].value.scans || [] : []
      const revenueStreams = results[5].status === 'fulfilled' ? results[5].value.revenue_streams || [] : []
      const voiceProfiles = results[6].status === 'fulfilled' ? results[6].value.voiceProfiles || [] : []
      const postPerformance = results[7].status === 'fulfilled' ? results[7].value.posts || [] : []
      const connectedSocialAccounts = results[8].status === 'fulfilled' ? results[8].value.accounts || [] : []
      const releases = results[9].status === 'fulfilled' ? results[9].value.releases || [] : []
      const igResult = results[10].status === 'fulfilled' ? results[10].value : { posts: [], stats: null }
      const instagramPosts = igResult.posts || []
      const instagramStats = igResult.stats || null

      const today = new Date()
      const yr = today.getFullYear()
      const q = Math.floor(today.getMonth() / 3)
      const qStart = new Date(yr, q * 3, 1).toISOString().slice(0, 10)
      const qEnd = new Date(yr, q * 3 + 3, 0).toISOString().slice(0, 10)
      const qGigs = gigs.filter((g: any) => g.date >= qStart && g.date <= qEnd && g.status !== 'cancelled')

      setContext({
        gigs,
        invoices,
        posts,
        mixScans,
        revenueStreams,
        profile: settings.profile || {},
        quarterStats: {
          gigs: qGigs.length,
          posts: posts.filter((p: any) => p.status === 'posted').length,
          revenue: qGigs.reduce((s: number, g: any) => s + (g.fee || 0), 0),
        },
        voiceProfiles,
        postPerformance,
        connectedSocialAccounts,
        releases,
        instagramPosts,
        instagramStats,
      })
      setContextLoaded(true)
    })
  }, [open, contextLoaded])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100)
  }, [open])

  // Email scan — extracted so it can be called on-demand from chat
  function buildEmailSummary(findings: any[]): string {
    const lines = findings.map((f: any) => {
      const e = f.extracted || {}
      switch (f.type) {
        case 'new_gig':
          return `a gig booking — ${e.title || 'new show'}${e.venue ? ` at ${e.venue}` : ''}${e.date ? ` on ${e.date}` : ''}${e.fee ? ` (${e.currency || ''}${e.fee})` : ''}`
        case 'hotel':
          return `a hotel booking — ${e.name || 'hotel'}${e.check_in ? `, ${e.check_in}` : ''}${e.cost ? ` (${e.currency || ''}${e.cost})` : ''}`
        case 'flight':
          return `a flight — ${e.name || ''} ${e.flight_number || ''} ${e.from || ''} → ${e.to || ''}${e.departure_at ? ` · ${e.departure_at.slice(0, 16).replace('T', ' ')}` : ''}`
        case 'train':
          return `a train — ${e.name || ''} ${e.from || ''} → ${e.to || ''}${e.departure_at ? ` · ${e.departure_at.slice(0, 16).replace('T', ' ')}` : ''}`
        case 'invoice':
          return `an invoice — ${e.description || e.gig_title || 'payment'}${e.amount ? ` (${e.currency || ''}${e.amount})` : ''}`
        case 'release':
          return `a release confirmation — ${e.title || 'release'}${e.type ? ` (${e.type})` : ''}`
        case 'rider':
          return `a rider confirmation${f.subject ? ` — "${f.subject}"` : ''}`
        case 'tech_spec':
          return `a tech spec${f.subject ? ` — "${f.subject}"` : ''}`
        case 'gig_update':
          return `a gig update${e.update ? ` — ${e.update}` : ''}`
        default:
          return `a ${f.type} email`
      }
    })
    const intro = findings.length === 1
      ? `Something came in for you —`
      : `${findings.length} things came in for you —`
    return `${intro} ${lines.join('; ')}.\n\nShall I add ${findings.length === 1 ? 'it' : 'these'} to your schedule?`
  }

  async function checkEmailInbox(force = false) {
    const THROTTLE_MS = 25 * 60 * 1000
    const last = localStorage.getItem('sg_email_scan_at')
    if (!force && last && Date.now() - parseInt(last) < THROTTLE_MS) return
    localStorage.setItem('sg_email_scan_at', Date.now().toString())

    try {
      const res = await fetch('/api/gmail/scan')
      if (!res.ok) return
      const data = await res.json()
      const findings: any[] = data.findings || []
      if (findings.length === 0) return

      // Filter out already-surfaced or dismissed findings
      const surfaced: string[] = JSON.parse(localStorage.getItem('sg_surfaced_emails') || '[]')
      const dismissed: string[] = JSON.parse(localStorage.getItem('sg_dismissed_emails') || '[]')
      const newFindings = findings.filter((f: any) =>
        !surfaced.includes(f.messageId) && !dismissed.includes(f.messageId)
      )
      if (newFindings.length === 0) return

      // Mark as surfaced
      const updated = [...surfaced, ...newFindings.map((f: any) => f.messageId)].slice(-200)
      localStorage.setItem('sg_surfaced_emails', JSON.stringify(updated))

      setPendingEmailFindings(newFindings)
      const summary = buildEmailSummary(newFindings)
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: summary }])
    } catch {
      // Silent — no Gmail connected or network error
    }
  }

  // Auto-scan inbox every 25 minutes
  useEffect(() => {
    checkEmailInbox()
    const t = setInterval(() => checkEmailInbox(), 25 * 60 * 1000)
    return () => clearInterval(t)
  }, [])

  async function handleImportEmailFindings() {
    if (pendingEmailFindings.length === 0) return
    setImportingEmails(true)
    try {
      const res = await fetch('/api/gmail/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ findings: pendingEmailFindings }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error('Import failed')
      const count = (data.created || []).length
      const msg = count > 0
        ? `Done. ${count} item${count !== 1 ? 's' : ''} added to your schedule.`
        : 'Done — everything checked.'
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: msg }])
      setPendingEmailFindings([])
    } catch {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: 'Something went wrong importing those — try again.' }])
    } finally {
      setImportingEmails(false)
    }
  }

  function handleDismissEmailFindings() {
    // Store dismissed message IDs in localStorage so they're never re-surfaced
    const dismissed: string[] = JSON.parse(localStorage.getItem('sg_dismissed_emails') || '[]')
    const updated = [...dismissed, ...pendingEmailFindings.map((f: any) => f.messageId)].slice(-200)
    localStorage.setItem('sg_dismissed_emails', JSON.stringify(updated))
    setPendingEmailFindings([])
  }

  function buildSystemPrompt(lastUserMessage?: string): string {
    const today = new Date().toISOString().slice(0, 10)
    const todayStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    const c = context

    // Query-aware filtering — only include heavy data sections when relevant
    const queryLower = (lastUserMessage || '').toLowerCase()
    const isMoneyQuery = /\b(invoice|payment|fee|money|paid|owe|revenue|earn|income|outstanding|overdue|cash|royalt)\b/.test(queryLower)
    const isContentQuery = /\b(post|content|caption|reel|story|social|voice|engage|strategy|plan|campaign|what should i|grow|follower|instagram|tiktok|audience|10k|sell out)\b/.test(queryLower)
    const isDJQuery = /\b(set|track|mix|bpm|key|camelot|energy|transition|dj|library|rekordbox|playlist)\b/.test(queryLower)
    const isMixScanQuery = /\b(mix scan|scan|mix.*feedback|how.*mix)\b/.test(queryLower)
    const isAdsQuery = /\b(ads?|advert|paid|boost|promot|spend|budget|campaign.*paid|meta ads|tiktok ads|spotify ad|target.*audience|retarget|lookalike|cpm|cpc|roas)\b/.test(queryLower)
    const isInstagramQuery = /\b(instagram|insta|ig|reel|reels|stories|story|grid|follower|followers|growth|engage|engagement|hashtag|algorithm|collab post|bio|profile.*optim)\b/.test(queryLower)

    let contextBlock = `Today is ${todayStr}.`

    if (c) {
      const upcoming = c.gigs.filter((g: any) => g.date >= today && g.status !== 'cancelled').slice(0, 8)
      const overdue = c.invoices.filter((i: any) => i.status !== 'paid' && i.due_date && i.due_date < today)
      const weekPosts = c.posts.filter((p: any) => {
        const d = (p.scheduled_at || '').slice(0, 10)
        const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
        return d >= today && d <= in7 && p.status === 'scheduled'
      })

      contextBlock += `\n\nArtist: ${c.profile.name || 'Unknown'} · ${c.profile.genre || 'Electronic'} · ${c.profile.country || ''}`
      const postsNote = c.quarterStats.posts > 0
        ? `${c.quarterStats.posts} posts scheduled via this system`
        : `post history not synced from Instagram (user posts directly on platform — do NOT say they have zero posts)`
      contextBlock += `\nThis quarter: ${c.quarterStats.gigs} gigs, ${postsNote}, ${c.quarterStats.revenue > 0 ? '£' + c.quarterStats.revenue.toLocaleString() + ' revenue' : 'no revenue logged'}.`

      // ── ALWAYS INCLUDED: Connected social accounts ──────────────────────────
      if (c.connectedSocialAccounts?.length > 0) {
        contextBlock += `\n\nConnected social accounts:`
        c.connectedSocialAccounts.forEach((a: any) => {
          let line = `- ${a.platform}: ${a.handle || '?'}`
          if (a.follower_count) line += ` · ${a.follower_count} followers`
          if (a.following_count) line += ` · ${a.following_count} following`
          if (a.post_count) line += ` · ${a.post_count} posts`
          if (a.avg_likes) line += ` · avg ${a.avg_likes} likes`
          if (a.avg_comments) line += ` · avg ${a.avg_comments} comments`
          if (a.last_synced) line += ` · last synced: ${new Date(a.last_synced).toLocaleDateString('en-GB')}`
          contextBlock += `\n${line}`
        })
      } else {
        contextBlock += `\n\nConnected social accounts: none connected yet`
      }

      // ── ALWAYS INCLUDED: Real Instagram post data ──────────────────────────
      if (c.instagramStats && c.instagramPosts?.length > 0) {
        const s = c.instagramStats
        contextBlock += `\n\nYour real Instagram performance (${c.instagramPosts.length} posts synced):`
        contextBlock += `\n- Avg likes: ${s.avgLikes} · Avg comments: ${s.avgComments} · Avg saves: ${s.avgSaves} · Avg engagement rate: ${s.avgEngagementRate}%`
        if (s.byFormat?.length > 0) {
          contextBlock += `\n- By format: ${s.byFormat.map((f: any) => `${f.type} → ${f.avgEngagement}% eng, ${f.avgSaves} saves avg (${f.count} posts)`).join(' | ')}`
        }
        if (s.topByEngagement?.length > 0) {
          contextBlock += `\n- Top posts by engagement:`
          s.topByEngagement.forEach((p: any) => {
            contextBlock += `\n  · ${p.media_type} · ${p.engagement_rate}% eng · ${p.likes}L · ${p.saves} saves: "${p.caption || '(no caption)'}"`
          })
        }
        if (s.topBySaves?.length > 0) {
          contextBlock += `\n- Top posts by saves: ${s.topBySaves.map((p: any) => `"${(p.caption || '').slice(0, 60)}" (${p.saves} saves, ${p.media_type})`).join(' | ')}`
        }

        // Quarter breakdown from real posts
        const qStart = new Date(new Date().getFullYear(), Math.floor(new Date().getMonth() / 3) * 3, 1)
        const qPosts = c.instagramPosts.filter((p: any) => p.posted_at && new Date(p.posted_at) >= qStart)
        if (qPosts.length > 0) {
          contextBlock += `\n- This quarter: ${qPosts.length} posts published on Instagram`
        }
      } else {
        contextBlock += `\n\nInstagram post history: not yet synced — user can sync via Broadcast Lab to unlock real engagement analytics`
      }

      // ── ALWAYS INCLUDED: Voice profiles ────────────────────────────────────
      if (c.voiceProfiles?.length > 0) {
        contextBlock += `\n\nVoice profiles (from Instagram analysis):`
        c.voiceProfiles.forEach((v: any) => {
          contextBlock += `\n- ${v.name}: ${v.style_rules} (${v.post_count_analysed || '?'} posts analysed via ${v.data_source || 'scrape'})`
        })
      }

      // ── ALWAYS INCLUDED: Releases ──────────────────────────────────────────
      if (c.releases?.length > 0) {
        const upcomingReleases = c.releases.filter((r: any) => r.release_date >= today)
        const recentReleases = c.releases.filter((r: any) => r.release_date < today).slice(0, 5)
        if (upcomingReleases.length > 0) {
          contextBlock += `\n\nUpcoming releases:`
          upcomingReleases.forEach((r: any) => {
            contextBlock += `\n- ${r.title} (${r.type || 'single'}) — ${r.release_date}${r.label ? ` on ${r.label}` : ''}${r.status ? ` [${r.status}]` : ''}`
          })
        }
        if (recentReleases.length > 0) {
          contextBlock += `\n\nRecent releases:`
          recentReleases.forEach((r: any) => {
            contextBlock += `\n- ${r.title} (${r.type || 'single'}) — ${r.release_date}${r.label ? ` on ${r.label}` : ''}`
          })
        }
      }

      // ── ALWAYS INCLUDED: Upcoming gigs ─────────────────────────────────────
      if (upcoming.length > 0) {
        contextBlock += `\n\nUpcoming gigs:\n${upcoming.map((g: any) => {
          let line = `- ${g.title} at ${g.venue || '?'} · ${g.date} · ${g.time || 'TBC'} · Fee: ${g.currency || ''}${g.fee || '?'} · Status: ${g.status}`
          if (g.notes) line += ` · Notes: ${g.notes}`
          const venueLower = (g.venue || '').toLowerCase()
          if (venueLower.includes('soho house') || venueLower.includes('members club') || venueLower.includes('private members')) {
            line += ' [PHONE-FREE VENUE — no filming on premises]'
          }
          return line
        }).join('\n')}`
      }

      // ── CONTENT QUERIES: Post performance + competitor analysis ─────────────
      if (isContentQuery || isInstagramQuery || isAdsQuery) {
        const artistName = c.profile.name || 'the artist'
        // context field stores artist name (own posts = matches name or no context, competitors = context contains @handle)
        const ownPosts = c.postPerformance?.filter((p: any) => !p.context || p.context === artistName || (p.context || '').startsWith(artistName)) || []
        const competitorPosts = c.postPerformance?.filter((p: any) => p.context && !p.context.startsWith(artistName) && (p.context || '').includes('@')) || []

        if (ownPosts.length > 0) {
          contextBlock += `\n\nYour top performing posts:`
          ownPosts.slice(0, 12).forEach((p: any) => {
            contextBlock += `\n- ${p.format} — ${p.actual_likes || 0}L/${p.actual_comments || 0}C (score ${p.estimated_score || '?'}): "${(p.caption || '').slice(0, 80)}"`
          })
        }

        if (competitorPosts.length > 0) {
          const byArtist: Record<string, any[]> = {}
          competitorPosts.forEach((p: any) => {
            const artist = (p.context || '').split(' | ')[0]
            if (!byArtist[artist]) byArtist[artist] = []
            byArtist[artist].push(p)
          })
          contextBlock += `\n\nCompetitor analysis:`
          Object.entries(byArtist).forEach(([artist, posts]) => {
            const meta = (posts[0].context || '').split(' | ')
            const followers = meta[2] || '?'
            const avgER = meta[3] || '?'
            const avgScore = Math.round(posts.reduce((s: number, p: any) => s + (p.estimated_score || 0), 0) / posts.length)
            const formats: Record<string, number> = {}
            posts.forEach((p: any) => { formats[p.format] = (formats[p.format] || 0) + 1 })
            const topFormat = Object.entries(formats).sort((a, b) => b[1] - a[1])[0]?.[0] || 'mixed'
            const topPost = posts[0]
            contextBlock += `\n- ${artist} (${followers}, ${avgER}): avg score ${avgScore}, favours ${topFormat}. Top post: ${topPost.estimated_score}pts ${topPost.format} "${(topPost.caption || '').slice(0, 60)}"`
          })
        }
      }

      // ── MONEY QUERIES: Full invoice + revenue detail ───────────────────────
      if (isMoneyQuery) {
        // Bank accounts — needed for invoice building
        if (c.profile.bankAccounts?.length > 0) {
          contextBlock += `\n\nBank accounts for invoicing:`
          c.profile.bankAccounts.forEach((acc: any) => {
            const parts = [`${acc.currency || ''} account`]
            if (acc.accountName) parts.push(`Name: ${acc.accountName}`)
            if (acc.bankName) parts.push(`Bank: ${acc.bankName}`)
            if (acc.iban) parts.push(`IBAN: ${acc.iban}`)
            if (acc.accountNumber) parts.push(`Account: ${acc.accountNumber}`)
            if (acc.sortCode) parts.push(`Sort code: ${acc.sortCode}`)
            if (acc.bic) parts.push(`BIC/SWIFT: ${acc.bic}`)
            if (acc.bankAddress) parts.push(`Address: ${acc.bankAddress}`)
            contextBlock += `\n- ${parts.join(' · ')}`
          })
        }

        if (c.invoices.length > 0) {
          const recentInvoices = c.invoices.slice(0, 30)
          contextBlock += `\n\nInvoice history (${c.invoices.length} total, showing ${recentInvoices.length} most recent):`
          recentInvoices.forEach((i: any) => {
            let line = `- [${i.status?.toUpperCase() || 'PENDING'}] ${i.gig_title}`
            if (i.artist_name) line += ` · Artist: ${i.artist_name}`
            line += ` · ${i.currency || ''}${i.amount}`
            if (i.type && i.type !== 'full') line += ` (${i.type})`
            if (i.due_date) line += ` · Due: ${i.due_date}`
            if (i.wht_rate) line += ` · WHT: ${i.wht_rate}%`
            if (i.notes) line += ` · Notes: ${i.notes}`
            if (i.created_at) line += ` · Created: ${i.created_at.slice(0, 10)}`
            contextBlock += `\n${line}`
          })
          if (overdue.length > 0) {
            contextBlock += `\n⚠ ${overdue.length} overdue`
          }
        }

        // Streaming / royalty revenue data
        if (c.revenueStreams?.length > 0) {
          const totalBySource: Record<string, number> = {}
          c.revenueStreams.forEach((r: any) => {
            totalBySource[r.source] = (totalBySource[r.source] || 0) + (r.amount || 0)
          })
          const paidTotal = c.revenueStreams.filter((r: any) => r.status === 'paid').reduce((s: number, r: any) => s + (r.amount || 0), 0)
          const pendingTotal = c.revenueStreams.filter((r: any) => r.status === 'pending').reduce((s: number, r: any) => s + (r.amount || 0), 0)

          contextBlock += `\n\nStreaming & royalty revenue (${c.revenueStreams.length} entries):`
          contextBlock += `\nPaid: ${paidTotal.toFixed(2)} · Pending: ${pendingTotal.toFixed(2)}`
          contextBlock += `\nBy source: ${Object.entries(totalBySource).map(([src, amt]) => `${src}: ${(amt as number).toFixed(2)}`).join(' · ')}`

          const recent = c.revenueStreams.slice(0, 5)
          contextBlock += `\nRecent entries:\n${recent.map((r: any) => `- ${r.source}: ${r.currency}${r.amount} — ${r.description} (${r.status})`).join('\n')}`
        }
      } else {
        // Non-money queries: just a brief summary
        const totalInvoices = c.invoices.length
        if (totalInvoices > 0) {
          contextBlock += `\n\n${totalInvoices} invoices on file${overdue.length > 0 ? ` (${overdue.length} overdue)` : ''} — ask about invoices for details.`
        }
      }

      // Management, booking & label contacts
      if (c.profile.management?.name || c.profile.management?.email) {
        contextBlock += `\nManagement: ${[c.profile.management.name, c.profile.management.email].filter(Boolean).join(' · ')}`
      }
      if (c.profile.booking?.name || c.profile.booking?.email) {
        contextBlock += `\nBooking: ${[c.profile.booking.name, c.profile.booking.email].filter(Boolean).join(' · ')}`
      }
      if (c.profile.label) {
        contextBlock += `\nLabel: ${c.profile.label}`
      }
      if (c.profile.vatRegistered && c.profile.vatNumber) {
        contextBlock += `\nVAT number: ${c.profile.vatNumber}`
      }

      if (weekPosts.length > 0) {
        contextBlock += `\n\nScheduled posts this week: ${weekPosts.length}`
      }

      // ── DJ/MIX QUERIES: Mix scan data ──────────────────────────────────────
      if (isDJQuery || isMixScanQuery) {
        if (c.mixScans?.length > 0) {
          const latestScan = c.mixScans[0]
          if (latestScan.result) {
            const r = latestScan.result
            contextBlock += `\n\nLatest mix scan (${latestScan.filename || 'Mix'}, scanned ${new Date(latestScan.created_at).toLocaleDateString('en-GB')}):`
            contextBlock += `\nScore: ${r.overall_score}/10 · Grade: ${r.grade}`
            if (r.headline) contextBlock += `\nHeadline: ${r.headline}`
            if (r.summary) contextBlock += `\nSummary: ${r.summary}`
            if (r.structure_analysis) contextBlock += `\nStructure: ${r.structure_analysis}`
            if (r.technical_assessment) contextBlock += `\nTechnical: ${r.technical_assessment}`
            if (r.strengths?.length) contextBlock += `\nStrengths: ${r.strengths.join('; ')}`
            if (r.improvements?.length) contextBlock += `\nImprovements: ${r.improvements.join('; ')}`
            if (r.tracks?.length) {
              contextBlock += `\nTracks with issues:`
              r.tracks.filter((t: any) => t.issue).forEach((t: any) => {
                contextBlock += `\n- #${t.position} ${t.artist} — ${t.title}: ${t.issue}${t.fix ? ` (Fix: ${t.fix})` : ''}`
              })
            }
            if (r.overall_verdict) contextBlock += `\nVerdict: ${r.overall_verdict}`
          }
          if (latestScan.tracklist) {
            contextBlock += `\nFull tracklist:\n${latestScan.tracklist}`
          }
        }
      }
    }

    // ── Skill prompts — always include core social intelligence ────────────
    let skillBlock = '\n\n' + SKILL_SOCIAL_STRATEGY + '\n\n' + SKILL_VOICE_ENGINE
    if (isAdsQuery) skillBlock += '\n\n' + SKILL_ADS_MANAGER
    if (isInstagramQuery) skillBlock += '\n\n' + SKILL_INSTAGRAM_GROWTH

    return `You are Signal — a genius embedded inside Signal Lab OS, a creative business platform for electronic music artists.

You know everything about music production (synthesis, mixing, mastering, Ableton, Max for Live, sound design), DJ culture (set building, reading crowds, key mixing, energy arcs), social media marketing (Instagram, TikTok, content strategy, growth), music business (invoicing, contracts, royalties, advances, booking), and touring (logistics, travel, rider management).

You have deep knowledge of underground dance music history and culture. You understand the lineage: disco through to Chicago house (Frankie Knuckles, Ron Hardy, the Warehouse), Detroit techno (Juan Atkins, Derrick May, Kevin Saunderson, Jeff Mills, Underground Resistance), New York garage (Larry Levan, Paradise Garage, the Loft), UK rave culture (acid house, the Hacienda, Second Summer of Love '88, jungle, drum & bass), the Berlin scene (Tresor, Berghain, Basic Channel, Hard Wax), Ibiza's role in dance music (Alfredo, Amnesia, DC10, the superclub era and its decline), the rise of minimal, the dubstep era, and the current underground landscape. You know the labels that matter — Innervisions, Kompakt, Perlon, Running Back, Permanent Vacation, Pampa, Drumcode, Defected, Ninja Tune, Warp. You understand sound system culture, vinyl culture, the importance of record shops, pirate radio, and how dance music has always been tied to marginalised communities — Black, queer, working class. You know the difference between commercial EDM and underground electronic music and you always lean underground. You understand that dance music is culture, not content.

You speak like a knowledgeable friend who happens to be brilliant at all of these things. Concise. Direct. No fluff. Use specifics — name exact plugins, techniques, strategies, labels, artists, tracks when relevant. When giving advice, make it actionable in the next 24 hours.

Never say you're an AI or assistant. You're Signal. You have the artist's full business context below.

CREATIVE SOVEREIGNTY — this is absolute:
- The art of DJing — reading the room, selecting records, building energy, the decisions made in the moment — belongs entirely to the artist. Signal never replaces or overrides that.
- When it comes to mix analysis or set feedback, Signal provides information and technical observations only. What the artist does with that information is always their call.
- Signal never tells an artist what to play, what order to play it in, or how to DJ. It can surface data, patterns, or technical issues — the artistic response to that data is the artist's alone.
- Never frame analysis as "you should play X" or "this is the right move creatively." Frame it as "here's what the data shows" or "here's what I'm hearing technically."
- The same principle applies to production: Signal can analyse technical elements (frequency balance, arrangement structure, level issues) but never makes aesthetic judgements about whether something sounds good. Taste is not Signal's domain.
- ONE EXCEPTION — surfacing from the artist's own history: If the artist asks for track suggestions or set ideas, Signal can work from data they have already inputted — play history, library scans, previous sets, key/BPM data, patterns in what they've chosen before. This is the artist's own taste and knowledge reflected back at them, not an external opinion. The point is to help them evolve faster as themselves — not toward some generic ideal. Always frame it as working from their own history and patterns. Present options, never a single prescription. Never introduce tracks or artists outside what they've already put into the system.

CRITICAL DJ KNOWLEDGE — never get these wrong:
- DJs do NOT soundcheck. They arrive, plug in USB/laptop, and play. There is no soundcheck for DJs. Only live bands soundcheck.
- DJs do NOT use microphones on stage (unless MCing, which this artist does not do).
- Content at gigs: the artist may not be able to film everywhere. Members clubs (Soho House, etc.) are PHONE-FREE zones — no filming, no photos on the floor. Content must be captured discreetly or in permitted areas only (e.g. DJ booth if allowed, outside the venue, before/after).
- Never suggest "behind the scenes" content that requires filming in phone-free venues.
- DJ sets are typically 1-4 hours. Set times in the gig data show when the artist plays.
- Riders for DJs include both technical (CDJs, mixer model, monitors, booth setup) and hospitality (drinks, food, green room). But technical riders for DJs are about equipment specs — never about soundchecks or mic checks.
- Never use markdown formatting (no ** bold **, no ## headers, no bullet points with -). Write in plain flowing text with line breaks only.

${contextBlock}

DEEP DIVE DATA — ALREADY LOADED:
- The context above contains voice profiles, top posts, competitor analysis, connected social accounts, upcoming gigs, and releases — ALL from real data.
- You have FULL ACCESS to this data. It is loaded above.
- NEVER say "I can't access a database", "paste it in", "I don't have a live link", or "that hasn't carried over".
- NEVER say social accounts are not connected or not populated — check the connected social accounts section above first.
- NEVER ask the user to share data that is already in the context — read it and use it.
- When the user says "you have the data" or "it's connected", they are correct — look at the context above.
- When suggesting captions, match the voice patterns from voice profiles.
- When suggesting formats, cite which formats get the best engagement from competitor analysis.
- When discussing follower counts or growth, use connected social accounts numbers.
- Reference specific numbers and patterns — these are REAL data, not assumptions.

${skillBlock}

Rules:
- Be concise. Short paragraphs. No lists longer than 5 items.
- Use the artist's actual data when relevant (upcoming gigs, overdue invoices, etc.)
- If asked about something outside your data, answer from your deep knowledge of the music industry.
- Format with line breaks for readability, not markdown headers.
- Currency: use the same currency as the artist's invoices/gigs.
- BANK ACCOUNT CURRENCY MATCHING — CRITICAL: When building or referencing an invoice, always use the bank account whose currency matches the invoice currency. If the invoice is in EUR, use the EUR bank account. If GBP, use the GBP account. If a document is uploaded and its amounts are in a specific currency, automatically use the matching bank account for any invoice you build from it. Never mix currencies across bank accounts.
- INTERMEDIARY BANK DETAILS: Only include intermediary bank details when the payment is coming from outside the EU to an EU account (e.g. a US or UK promoter paying in EUR). For EU-to-EU transfers, intermediary details are not needed and should not be included.
- EMAIL SCANNING: Gmail is scanned automatically in the background every 25 minutes for gig offers, travel logistics, invoices, and release info. If the artist asks you to "scan email" or "check my inbox", tell them: "Your inbox is being scanned automatically — any new gig offers, travel details, or invoices will appear as a prompt above this chat. I'll flag anything that needs your attention." Do NOT attempt to scan email yourself or claim you can't access email. The system handles it.
- OUTGOING CORRESPONDENCE — CRITICAL: Never send any email, invoice, or message without first showing the exact copy to the artist and receiving explicit confirmation. This applies every single time, with no exceptions. Show the full text before any send action.
- INVOICE CREATION: When you have enough data to create an invoice (from a document upload, a conversation, or a confirmed gig), append this marker at the very end of your message (after all your text): [INVOICE_READY:{"gig_title":"...","amount":0.00,"currency":"EUR","due_date":"YYYY-MM-DD","artist_name":"...","wht_rate":null,"notes":"..."}] — fill in every field you know, leave unknown fields null. Only include this marker when you are ready to create the invoice and have asked the artist to confirm.
- PAYMENT TERMS — ROYALTIES & STATEMENTS: Default due_date is 7 days from today. Money has already been received by the label/distributor so payment should be prompt.
- PAYMENT TERMS — GIG INVOICES: Always split into two invoices unless contract states otherwise. Deposit invoice: 50% of fee, due_date is today (invoice date). Balance invoice: 50% of fee, due_date is 7 days before the performance date. If you only have enough info for one invoice, raise the deposit first and flag that the balance invoice needs to be raised separately. Never use a single full-amount invoice for gigs unless the artist explicitly asks.`
  }

  async function handleSend(text?: string) {
    const msg = text || input.trim()
    if (!msg || loading) return

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: msg }
    const assistantId = crypto.randomUUID()
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    // Add empty assistant message that will be filled by streaming
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }])

    const msgLower = msg.toLowerCase()
    const isEmailQuery = /\b(email|inbox|gmail|scan.*mail|mail.*scan|check.*mail)\b/.test(msgLower)

    try {
      // Limit conversation history to last 20 messages to avoid context overflow
      // Also ensure alternating user/assistant roles (API requirement)
      const filtered = newMessages.filter(m => m.content && m.content.trim() !== '').slice(-20)
      const conversationHistory: { role: string; content: string }[] = []
      for (const m of filtered) {
        const last = conversationHistory[conversationHistory.length - 1]
        if (last && last.role === m.role) {
          // Merge consecutive same-role messages
          last.content += '\n\n' + m.content
        } else {
          conversationHistory.push({ role: m.role, content: m.content })
        }
      }
      // Ensure first message is from user
      if (conversationHistory.length > 0 && conversationHistory[0].role !== 'user') {
        conversationHistory.shift()
      }
      const fullResponse = await streamClaude(
        buildSystemPrompt(msg),
        conversationHistory,
        (partialText) => {
          // Strip INVOICE_READY marker from display while streaming
          const display = partialText.replace(/\[INVOICE_READY:[^\]]*\]/g, '').trim()
          setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: display } : m))
        },
      )
      // Parse and strip INVOICE_READY marker from final response
      const invoiceMatch = fullResponse.match(/\[INVOICE_READY:(\{.*?\})\]/)
      const displayText = fullResponse.replace(/\[INVOICE_READY:[^\]]*\]/g, '').trim()
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: displayText } : m))
      if (invoiceMatch) {
        try {
          setPendingInvoice(JSON.parse(invoiceMatch[1]))
          setCreatedInvoice(null)
          setPendingEmail(null)
        } catch { /* malformed JSON — ignore */ }
      }
      speakResponse(displayText)
      // Trigger email scan after response completes (avoids state race)
      if (isEmailQuery) checkEmailInbox(true)
    } catch (err: any) {
      console.error('Signal error:', err)
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: `Something went wrong — ${err?.message || 'unknown error'}. Try again.` } : m))
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateInvoice() {
    if (!pendingInvoice) return
    setCreatingInvoice(true)
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pendingInvoice),
      })
      const data = await res.json()
      if (!data.success) throw new Error('Failed to create invoice')
      setCreatedInvoice(data.invoice)
      setPendingInvoice(null)
    } catch {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: 'Failed to create the invoice — try again.' }])
    } finally {
      setCreatingInvoice(false)
    }
  }

  async function handlePreviewEmail() {
    if (!createdInvoice) return
    try {
      const res = await fetch(`/api/invoices/${createdInvoice.id}/send`)
      const html = await res.text()
      setPendingEmail({ html, invoiceId: createdInvoice.id })
    } catch {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: 'Failed to load email preview — try again.' }])
    }
  }

  async function handleSendEmail() {
    if (!pendingEmail) return
    setSendingEmail(true)
    try {
      const res = await fetch(`/api/invoices/${pendingEmail.invoiceId}/send`, { method: 'POST' })
      const data = await res.json()
      const sentMsg = data.sent
        ? `Invoice sent to ${data.to} from ${data.sentFrom}.`
        : 'Email client opened — send from there.'
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: sentMsg }])
      setPendingEmail(null)
      setCreatedInvoice(null)
    } catch {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: 'Failed to send — try again.' }])
    } finally {
      setSendingEmail(false)
    }
  }

  const suggestedPrompts = [
    'What should I focus on this week?',
    'Help me chase my overdue invoices',
    'Content ideas for my next gig',
    'How do I get more bookings?',
    'Review my set building strategy',
    'What\'s my financial position?',
  ]

  const [deviceType, setDeviceType] = useState<'unknown' | 'mobile' | 'desktop'>('unknown')
  useEffect(() => {
    // Check immediately with window.innerWidth — no waiting for React state
    setDeviceType(window.innerWidth <= 768 ? 'mobile' : 'desktop')
  }, [])

  const pathname = usePathname()
  if (deviceType === 'unknown') return null
  if (pathname.startsWith('/go/')) return null

  // Mobile: floating mic centred above the toolbar
  if (deviceType === 'mobile') {
    return (
      <div className="signal-desktop-fab" style={{
        position: 'fixed', bottom: 72, left: 0, right: 0,
        display: 'flex', justifyContent: 'center',
        zIndex: 999, pointerEvents: 'none',
      }}>
        <a
          href="/signal?speak=1"
          style={{
            width: 64, height: 64, borderRadius: '50%',
            background: '#0e0d0b',
            border: '1.5px solid rgba(176,141,87,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            textDecoration: 'none', pointerEvents: 'auto',
            boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
          }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
          </svg>
        </a>
      </div>
    )
  }

  // Desktop: floating button opens chat panel
  if (!open) {
    return (
      <button
        className="signal-desktop-fab"
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 28, right: 28,
          width: 56, height: 56, borderRadius: '50%',
          background: '#0e0d0b',
          border: '1.5px solid rgba(176,141,87,0.35)',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, transition: 'all 0.2s ease',
          boxShadow: 'none',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.06)'; e.currentTarget.style.borderColor = 'rgba(176,141,87,0.6)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = 'rgba(176,141,87,0.35)' }}
        title="Signal"
      >
        <svg width="24" height="24" viewBox="0 0 64 64" fill="none">
          <polyline points="8,32 18,32 24,18 30,46 36,14 42,42 48,26 54,32 62,32" stroke="var(--gold)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </button>
    )
  }

  // Chat panel
  return (
    <div className="signal-desktop-fab" style={{
      position: 'fixed',
      bottom: 28,
      right: 28,
      left: 'auto',
      width: 440,
      maxHeight: 'calc(100vh - 100px)',
      background: 'var(--bg)', border: '1px solid var(--border-dim)',
      display: 'flex', flexDirection: 'column',
      zIndex: 1000, boxShadow: 'none',
      fontFamily: 'var(--font-mono)',
    }}>

      {/* Header */}
      <div style={{
        padding: '18px 22px', borderBottom: '1px solid var(--border-dim)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <svg width="18" height="18" viewBox="0 0 64 64" fill="none">
            <polyline points="8,32 18,32 24,18 30,46 36,14 42,42 48,26 54,32 62,32" stroke="var(--gold)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          <div style={{ fontSize: '11px', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--gold)' }}>
            Signal
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {speaking && (
            <button onClick={stopSpeaking} style={{
              background: 'none', border: '1px solid rgba(176,141,87,0.3)', color: 'var(--gold)',
              fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.1em',
              textTransform: 'uppercase', padding: '3px 8px', cursor: 'pointer',
            }}>Stop</button>
          )}
          {messages.length > 0 && (
            <button onClick={() => { if (window.confirm('Clear chat history?')) clearChat() }} title="Clear chat (keeps saved)" style={{
              background: 'none', border: 'none', color: 'var(--text-dimmer)',
              cursor: 'pointer', fontSize: '10px', fontFamily: 'var(--font-mono)',
              letterSpacing: '0.08em', padding: '2px 4px',
            }}>clear</button>
          )}
          <button onClick={() => setVoiceEnabled(!voiceEnabled)} title={voiceEnabled ? 'Voice on' : 'Voice off'} style={{
            background: 'none', border: 'none', color: voiceEnabled ? 'var(--gold)' : 'var(--text-dimmer)',
            cursor: 'pointer', fontSize: '14px', padding: '2px', transition: 'color 0.15s',
          }}>{voiceEnabled ? '🔊' : '🔇'}</button>
          <button onClick={() => setOpen(false)} style={{
            background: 'none', border: 'none', color: 'var(--text-dimmer)',
            cursor: 'pointer', fontSize: '16px', padding: '0 4px', lineHeight: 1,
          }}>×</button>
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '18px 22px',
        display: 'flex', flexDirection: 'column', gap: '14px',
        minHeight: 240, maxHeight: 420, scrollbarWidth: 'thin',
      }}>
        {messages.length === 0 && !loading && (
          <div style={{ padding: '20px 0', textAlign: 'center' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.7, marginBottom: '6px' }}>
              Music. Marketing. Money. Gigs.
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', lineHeight: 1.6 }}>
              I have your full context. Ask me anything.
            </div>
          </div>
        )}

        {messages.filter(m => m.content !== '').map(msg => {
          const isSaved = savedNotes.has(msg.id)
          return (
            <div key={msg.id} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%' }}>
              <div style={{
                padding: '11px 15px',
                background: msg.role === 'user' ? 'rgba(176,141,87,0.08)' : isSaved ? 'rgba(176,141,87,0.04)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${msg.role === 'user' ? 'rgba(176,141,87,0.25)' : isSaved ? 'rgba(176,141,87,0.3)' : 'var(--border-dim)'}`,
                fontSize: '12px', lineHeight: 1.7, color: 'var(--text)',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {msg.content}
              </div>
              {msg.role === 'assistant' && msg.content.length > 50 && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <button
                    onClick={() => saveNote(msg.id)}
                    style={{ background: 'none', border: 'none', fontSize: '10px', color: isSaved ? 'var(--gold)' : 'var(--text-dimmer)', cursor: 'pointer', padding: '2px 0', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}
                  >
                    {isSaved ? '★ saved' : '☆ save'}
                  </button>
                  <button
                    onClick={() => { navigator.clipboard.writeText(msg.content) }}
                    style={{ background: 'none', border: 'none', fontSize: '10px', color: 'var(--text-dimmer)', cursor: 'pointer', padding: '2px 0', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}
                  >
                    copy
                  </button>
                </div>
              )}
            </div>
          )
        })}

        {loading && messages.length > 0 && messages[messages.length - 1].content === '' && (
          <div style={{
            alignSelf: 'flex-start', padding: '11px 15px',
            background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-dim)',
            display: 'flex', gap: '6px', alignItems: 'center',
          }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: 5, height: 5, borderRadius: '50%', background: 'var(--gold)',
                animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
              }} />
            ))}
          </div>
        )}

        {/* Invoice action cards */}
        {pendingInvoice && !loading && (
          <div style={{
            alignSelf: 'flex-start', padding: '14px 16px',
            background: 'rgba(176,141,87,0.06)', border: '1px solid rgba(176,141,87,0.3)',
            maxWidth: '88%',
          }}>
            <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '10px', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--gold)' }}>{pendingInvoice.gig_title}</strong>
              {pendingInvoice.artist_name && ` · ${pendingInvoice.artist_name}`}
              {` · ${pendingInvoice.currency || ''}${pendingInvoice.amount}`}
              {pendingInvoice.due_date && ` · Due ${pendingInvoice.due_date}`}
              {pendingInvoice.wht_rate && ` · WHT ${pendingInvoice.wht_rate}%`}
            </div>
            <button onClick={handleCreateInvoice} disabled={creatingInvoice}
              style={{
                background: 'var(--gold)', border: 'none', color: '#070706',
                fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.14em',
                textTransform: 'uppercase', padding: '8px 16px', cursor: 'pointer',
                opacity: creatingInvoice ? 0.6 : 1,
              }}>
              {creatingInvoice ? 'Creating...' : 'Create invoice →'}
            </button>
          </div>
        )}

        {createdInvoice && !pendingEmail && (
          <div style={{
            alignSelf: 'flex-start', padding: '14px 16px',
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(176,141,87,0.3)',
            maxWidth: '88%',
          }}>
            <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '10px' }}>
              Invoice created. Would you like to send it?
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <a href={`/api/invoices/${createdInvoice.id}?preview=1`} target="_blank" rel="noreferrer"
                style={{
                  background: 'transparent', border: '1px solid var(--border-dim)',
                  color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '10px',
                  letterSpacing: '0.12em', textTransform: 'uppercase', padding: '8px 14px',
                  textDecoration: 'none', cursor: 'pointer',
                }}>
                View invoice ↗
              </a>
              <button onClick={handlePreviewEmail}
                style={{
                  background: 'var(--gold)', border: 'none', color: '#070706',
                  fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.14em',
                  textTransform: 'uppercase', padding: '8px 16px', cursor: 'pointer',
                }}>
                Preview email →
              </button>
            </div>
          </div>
        )}

        {pendingEmail && (
          <div style={{
            alignSelf: 'flex-start', width: '100%', maxWidth: '100%',
            border: '1px solid rgba(176,141,87,0.3)',
          }}>
            <div style={{
              padding: '10px 14px', borderBottom: '1px solid var(--border-dim)',
              fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase',
              color: 'var(--gold)',
            }}>
              Email preview — confirm before sending
            </div>
            <iframe
              srcDoc={pendingEmail.html}
              style={{ width: '100%', height: '320px', border: 'none', background: '#fff' }}
              title="Email preview"
            />
            <div style={{ padding: '10px 14px', display: 'flex', gap: '8px', borderTop: '1px solid var(--border-dim)' }}>
              <button onClick={() => setPendingEmail(null)}
                style={{
                  background: 'transparent', border: '1px solid var(--border-dim)',
                  color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '10px',
                  letterSpacing: '0.12em', textTransform: 'uppercase', padding: '8px 14px',
                  cursor: 'pointer',
                }}>
                Cancel
              </button>
              <button onClick={handleSendEmail} disabled={sendingEmail}
                style={{
                  background: 'var(--gold)', border: 'none', color: '#070706',
                  fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.14em',
                  textTransform: 'uppercase', padding: '8px 16px', cursor: 'pointer',
                  opacity: sendingEmail ? 0.6 : 1,
                }}>
                {sendingEmail ? 'Sending...' : 'Confirm & send →'}
              </button>
            </div>
          </div>
        )}

        {/* Email inbox findings confirmation */}
        {pendingEmailFindings.length > 0 && !loading && (
          <div style={{
            alignSelf: 'flex-start', padding: '14px 16px',
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(176,141,87,0.25)',
            maxWidth: '100%', width: '100%',
          }}>
            <div style={{ fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dimmer)', marginBottom: '10px' }}>
              {pendingEmailFindings.length} item{pendingEmailFindings.length !== 1 ? 's' : ''} from inbox
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '12px' }}>
              {pendingEmailFindings.map((f: any, i: number) => {
                const e = f.extracted || {}
                let detail = ''
                if (f.type === 'new_gig') detail = `${e.title || 'Gig'}${e.venue ? ` · ${e.venue}` : ''}${e.date ? ` · ${e.date}` : ''}`
                else if (f.type === 'hotel') detail = `${e.name || 'Hotel'}${e.check_in ? ` · ${e.check_in}` : ''}`
                else if (f.type === 'flight') detail = `${e.flight_number || 'Flight'} ${e.from || ''} → ${e.to || ''}`
                else if (f.type === 'train') detail = `${e.name || 'Train'} ${e.from || ''} → ${e.to || ''}`
                else if (f.type === 'invoice') detail = `${e.description || e.gig_title || 'Invoice'}${e.amount ? ` · ${e.currency || ''}${e.amount}` : ''}`
                else if (f.type === 'release') detail = `${e.title || 'Release'}`
                else detail = f.subject || f.type
                return (
                  <div key={i} style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                    <span style={{ color: 'var(--gold)', marginRight: '6px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      {f.type.replace('_', ' ')}
                    </span>
                    {detail}
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleDismissEmailFindings}
                style={{
                  background: 'transparent', border: '1px solid var(--border-dim)',
                  color: 'var(--text-dimmer)', fontFamily: 'var(--font-mono)', fontSize: '10px',
                  letterSpacing: '0.12em', textTransform: 'uppercase', padding: '7px 14px',
                  cursor: 'pointer',
                }}>
                Dismiss
              </button>
              <button onClick={handleImportEmailFindings} disabled={importingEmails}
                style={{
                  background: 'var(--gold)', border: 'none', color: '#070706',
                  fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.14em',
                  textTransform: 'uppercase', padding: '7px 16px', cursor: 'pointer',
                  opacity: importingEmails ? 0.6 : 1,
                }}>
                {importingEmails ? 'Adding...' : 'Add to schedule →'}
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested prompts */}
      {messages.length === 0 && !loading && (
        <div style={{ padding: '0 22px 14px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {suggestedPrompts.map(prompt => (
            <button key={prompt} onClick={() => handleSend(prompt)} disabled={loading}
              style={{
                background: 'rgba(176,141,87,0.06)', border: '1px solid rgba(176,141,87,0.18)',
                color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontSize: '10px',
                padding: '6px 12px', cursor: 'pointer', transition: 'all 0.12s', letterSpacing: '0.03em',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(176,141,87,0.12)'; e.currentTarget.style.borderColor = 'rgba(176,141,87,0.35)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(176,141,87,0.06)'; e.currentTarget.style.borderColor = 'rgba(176,141,87,0.18)' }}
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.csv" onChange={handleFileUpload} style={{ display: 'none' }} />
      <div style={{ padding: '14px 22px 18px', borderTop: '1px solid var(--border-dim)', display: 'flex', gap: '8px' }}>
        <button onClick={() => fileInputRef.current?.click()} disabled={loading || uploading} title="Upload document"
          style={{
            background: 'transparent', border: '1px solid var(--border-dim)',
            color: 'var(--text-dimmer)', width: 40, height: 40, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0, fontSize: '16px',
            opacity: uploading ? 0.4 : 1, alignSelf: 'center',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--gold)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(176,141,87,0.4)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-dimmer)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-dim)' }}
        >📎</button>
        <button onClick={toggleRecording} disabled={loading} title={recording ? 'Stop recording' : 'Voice input'} style={{
          background: recording ? 'rgba(200,60,60,0.15)' : 'transparent',
          border: `1px solid ${recording ? 'rgba(200,60,60,0.5)' : 'rgba(176,141,87,0.3)'}`,
          color: recording ? '#c83c3c' : 'var(--text-dimmer)',
          width: 56, height: 56, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
          boxShadow: 'none',
        }}
          onMouseEnter={e => { if (!recording) { (e.currentTarget as HTMLElement).style.color = 'var(--gold)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(176,141,87,0.4)' } }}
          onMouseLeave={e => { if (!recording) { (e.currentTarget as HTMLElement).style.color = 'var(--text-dimmer)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(176,141,87,0.3)' } }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
          </svg>
        </button>
        <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder={recording ? 'Listening...' : 'Ask Signal anything...'}
          disabled={loading || recording}
          style={{
            flex: 1, background: 'var(--bg)', border: '1px solid var(--border-dim)',
            color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '12px',
            padding: '11px 14px', outline: 'none', transition: 'border-color 0.15s',
          }}
          onFocus={e => e.currentTarget.style.borderColor = 'rgba(176,141,87,0.4)'}
          onBlur={e => e.currentTarget.style.borderColor = 'var(--border-dim)'}
        />
        <button onClick={() => handleSend()} disabled={!input.trim() || loading}
          style={{
            background: 'var(--gold)', border: 'none', color: '#070706',
            fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.16em',
            textTransform: 'uppercase', padding: '11px 18px',
            cursor: !input.trim() || loading ? 'not-allowed' : 'pointer',
            opacity: !input.trim() || loading ? 0.5 : 1,
          }}>→</button>
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:0.3;transform:scale(0.8)} 50%{opacity:1;transform:scale(1)} }`}</style>
    </div>
  )
}
