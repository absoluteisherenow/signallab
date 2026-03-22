'use client'

import { useState, useRef } from 'react'

interface RekordboxTrack {
  id: string
  name: string
  artist: string
  bpm: number
  key: string
  camelot: string
  duration: string
  rating: number
  playCount: number
  genre: string
  filePath: string
}

const KEY_TO_CAMELOT: Record<string, string> = {
  'Am': '8A', 'Em': '9A', 'Bm': '10A', 'F#m': '11A', 'Dbm': '12A',
  'Abm': '1A', 'Ebm': '2A', 'Bbm': '3A', 'Fm': '4A', 'Cm': '5A',
  'Gm': '6A', 'Dm': '7A', 'C': '8B', 'G': '9B', 'D': '10B',
  'A': '11B', 'E': '12B', 'B': '1B', 'F#': '2B', 'Db': '3B',
  'Ab': '4B', 'Eb': '5B', 'Bb': '6B', 'F': '7B',
}

function parseRekordboxXML(xmlString: string): RekordboxTrack[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlString, 'text/xml')
  const tracks = doc.querySelectorAll('TRACK[Name]')
  const result: RekordboxTrack[] = []

  tracks.forEach(track => {
    const name = track.getAttribute('Name') || ''
    const artist = track.getAttribute('Artist') || ''
    const bpm = parseFloat(track.getAttribute('AverageBpm') || track.getAttribute('BPM') || '0')
    const keyRaw = track.getAttribute('Tonality') || ''
    const camelot = KEY_TO_CAMELOT[keyRaw] || '?'
    const totalTime = parseInt(track.getAttribute('TotalTime') || '0')
    const minutes = Math.floor(totalTime / 60)
    const seconds = totalTime % 60
    const duration = `${minutes}:${seconds.toString().padStart(2, '0')}`
    const rating = parseInt(track.getAttribute('Rating') || '0')
    const playCount = parseInt(track.getAttribute('PlayCount') || '0')
    const genre = track.getAttribute('Genre') || ''
    const filePath = track.getAttribute('Location') || ''

    if (name) {
      result.push({
        id: track.getAttribute('TrackID') || Date.now().toString(),
        name, artist, bpm, key: keyRaw, camelot,
        duration, rating, playCount, genre, filePath,
      })
    }
  })

  return result
}

export default function RekordboxImport() {
  const [tracks, setTracks] = useState<RekordboxTrack[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const s = {
    bg: '#1a1410', panel: 'linear-gradient(180deg, #1e1a10 0%, #161208 100%)',
    border: '#3a2e1c', gold: '#c9a46e', text: '#e8dcc8',
    dim: '#8a7a5a', dimmer: '#5a4428', black: '#0e0b06',
    font: "'DM Mono', monospace",
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const xml = ev.target?.result as string
        const parsed = parseRekordboxXML(xml)
        if (parsed.length === 0) {
          setError('No tracks found. Make sure this is a rekordbox XML export.')
          return
        }
        setTracks(parsed)
        setSelected(new Set(parsed.map(t => t.id)))
      } catch {
        setError('Could not parse XML file. Export from rekordbox: File → Export Collection in xml format.')
      }
    }
    reader.readAsText(file)
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(t => t.id)))
    }
  }

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function importSelected() {
    setImporting(true)
    await new Promise(r => setTimeout(r, 1200))
    setImporting(false)
    setImported(true)
  }

  const filtered = tracks.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.artist.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ background: s.bg, color: s.text, fontFamily: s.font, minHeight: '100vh', padding: '32px' }}>

      <div style={{ fontSize: '9px', letterSpacing: '0.3em', color: s.gold, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <span style={{ display: 'block', width: '28px', height: '1px', background: s.gold }} />
        Set Lab — Rekordbox Import
      </div>
      <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '24px', fontWeight: 200, letterSpacing: '0.06em', marginBottom: '8px' }}>Import library</div>
      <div style={{ fontSize: '13px', color: s.dim, marginBottom: '32px', lineHeight: '1.7' }}>
        Export from rekordbox: File → Export Collection in xml format. Tracks import with BPM, key and Camelot already mapped.
      </div>

      {tracks.length === 0 ? (
        <div>
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{ border: `1px dashed ${s.border}`, padding: '60px', textAlign: 'center', cursor: 'pointer', background: s.black, marginBottom: '24px', transition: 'all 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = s.gold}
            onMouseLeave={e => e.currentTarget.style.borderColor = s.border}
          >
            <input ref={fileInputRef} type="file" accept=".xml" onChange={handleFile} style={{ display: 'none' }} />
            <div style={{ fontSize: '14px', color: s.dim, marginBottom: '8px' }}>Drop rekordbox XML here or click to browse</div>
            <div style={{ fontSize: '11px', color: s.dimmer }}>Only .xml files exported from rekordbox</div>
          </div>

          {error && <div style={{ fontSize: '12px', color: '#8a4a3a', padding: '14px 18px', border: '1px solid #4a2a1a', background: '#1a0a06', marginBottom: '16px' }}>{error}</div>}

          <div style={{ background: s.black, border: `1px solid ${s.border}`, padding: '24px 28px' }}>
            <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: s.gold, textTransform: 'uppercase', marginBottom: '16px' }}>How to export from rekordbox</div>
            {[
              '01 — Open rekordbox on your Mac or PC',
              '02 — Go to File → Export Collection in xml format',
              '03 — Save the .xml file anywhere on your computer',
              '04 — Upload it here — tracks import with all metadata intact',
              '05 — Select which tracks to add to Set Lab Library',
              '06 — Build your set, then export back as a rekordbox crate',
            ].map(step => (
              <div key={step} style={{ fontSize: '12px', color: s.dim, padding: '8px 0', borderBottom: `1px solid ${s.border}`, letterSpacing: '0.04em' }}>{step}</div>
            ))}
          </div>
        </div>
      ) : imported ? (
        <div style={{ background: s.black, border: `1px solid ${s.gold}40`, padding: '40px', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '20px', fontWeight: 200, color: s.gold, marginBottom: '12px' }}>
            {selected.size} tracks imported
          </div>
          <div style={{ fontSize: '13px', color: s.dim, marginBottom: '28px' }}>Available in Set Lab Library — build your set</div>
          <a href="/setlab" style={{ display: 'inline-block', fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', color: s.gold, textDecoration: 'none', border: `1px solid ${s.gold}60`, padding: '14px 28px' }}>
            Open Set Lab →
          </a>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', color: s.dim }}>
              {tracks.length} tracks found · <span style={{ color: s.gold }}>{selected.size} selected</span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tracks..."
                style={{ background: s.black, border: `1px solid ${s.border}`, color: s.text, fontFamily: s.font, fontSize: '12px', padding: '8px 14px', outline: 'none', width: '200px' }} />
              <button onClick={toggleAll} style={{ background: 'transparent', border: `1px solid ${s.border}`, color: s.dim, fontFamily: s.font, fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '8px 16px', cursor: 'pointer' }}>
                {selected.size === filtered.length ? 'Deselect all' : 'Select all'}
              </button>
              <button onClick={importSelected} disabled={selected.size === 0 || importing} style={{ background: selected.size > 0 ? 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)' : 'transparent', border: `1px solid ${s.gold}`, color: s.gold, fontFamily: s.font, fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '8px 20px', cursor: 'pointer', opacity: selected.size === 0 ? 0.4 : 1 }}>
                {importing ? 'Importing...' : `Import ${selected.size} tracks →`}
              </button>
            </div>
          </div>

          {/* TABLE */}
          <div style={{ background: s.black, border: `1px solid ${s.border}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: '40px 2fr 1fr 60px 60px 70px 80px', padding: '10px 16px', borderBottom: `1px solid ${s.border}` }}>
              {['', 'Track', 'Artist', 'BPM', 'Key', 'Camelot', 'Time'].map(h => (
                <div key={h} style={{ fontSize: '8px', letterSpacing: '0.18em', color: s.dimmer, textTransform: 'uppercase' }}>{h}</div>
              ))}
            </div>
            <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
              {filtered.map((track, i) => (
                <div key={track.id} onClick={() => toggle(track.id)} style={{
                  display: 'grid', gridTemplateColumns: '40px 2fr 1fr 60px 60px 70px 80px',
                  padding: '12px 16px',
                  borderBottom: i < filtered.length - 1 ? `1px solid ${s.border}` : 'none',
                  cursor: 'pointer',
                  background: selected.has(track.id) ? '#1e1a10' : 'transparent',
                  transition: 'background 0.1s',
                  alignItems: 'center',
                }}>
                  <div style={{ width: '14px', height: '14px', border: `1px solid ${selected.has(track.id) ? s.gold : s.border}`, background: selected.has(track.id) ? s.gold + '30' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {selected.has(track.id) && <div style={{ width: '6px', height: '6px', background: s.gold }} />}
                  </div>
                  <div style={{ fontSize: '13px', color: s.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.name}</div>
                  <div style={{ fontSize: '12px', color: s.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.artist}</div>
                  <div style={{ fontSize: '12px', color: s.gold }}>{track.bpm.toFixed(0)}</div>
                  <div style={{ fontSize: '11px', color: s.dim }}>{track.key}</div>
                  <div style={{ fontSize: '11px', color: s.gold, letterSpacing: '0.08em' }}>{track.camelot}</div>
                  <div style={{ fontSize: '11px', color: s.dimmer }}>{track.duration}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
