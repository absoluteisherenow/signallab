'use client'

import { useState } from 'react'

const DEVICES = [
  {
    id: 'chord-engine',
    name: 'Chord Engine',
    version: '1.0.0',
    type: 'MIDI Effect',
    description: 'Real-time chord voicings from Sonix Lab. Play a root note and the device outputs the full voiced chord based on your current key — actual note names, not theory labels.',
    params: [
      { name: 'Key', range: 'C – B', default: 'A' },
      { name: 'Mode', range: 'Major / Minor / Dorian / Phrygian', default: 'Minor' },
      { name: 'Voicing', range: 'Close / Open / Wide', default: 'Open' },
      { name: 'Tension', range: '0 – 100%', default: '40%' },
    ],
    midi_in: 'Root note trigger',
    midi_out: 'Voiced chord',
    color: 'var(--gold)',
    colorRaw: '#b08d57',
  },
  {
    id: 'energy-arc',
    name: 'Energy Arc',
    version: '1.0.0',
    type: 'Audio Effect',
    description: 'Maps SetLab energy arc to Ableton arrangement markers. Drops, builds and breakdowns from your set analysis become clip markers automatically.',
    params: [
      { name: 'Set', range: 'Load from SetLab', default: '—' },
      { name: 'BPM sync', range: 'On / Off', default: 'On' },
      { name: 'Marker style', range: 'Locator / Clip / Both', default: 'Locator' },
      { name: 'Offset', range: '-16 – +16 bars', default: '0' },
    ],
    midi_in: 'Transport sync',
    midi_out: 'Arrangement markers',
    color: 'var(--green)',
    colorRaw: '#3d6b4a',
  },
  {
    id: 'mix-chain',
    name: 'Mix Chain',
    version: '1.0.0',
    type: 'Audio Effect',
    description: 'Loads tailored signal chains from Sonix Lab as Ableton rack presets. Chains are built for your actual installed plugins and session context — not generic presets.',
    params: [
      { name: 'Chain', range: '18 categories', default: 'Vocal — Warmth' },
      { name: 'Intensity', range: '0 – 100%', default: '70%' },
      { name: 'Parallel', range: '0 – 100%', default: '30%' },
      { name: 'Air', range: '0 – 100%', default: '50%' },
    ],
    midi_in: '—',
    midi_out: '—',
    color: 'var(--blue)',
    colorRaw: '#6a7a9a',
  },
  {
    id: 'arrangement',
    name: 'Arrangement',
    version: '1.0.0',
    type: 'MIDI Effect',
    description: 'Generates section structure and pushes energy curves directly into Ableton arrangement markers. Drops, builds, peaks and breakdowns are shaped by a per-section energy curve — not just a flat marker — so the tension arc of your set is visible and editable in the timeline.',
    params: [
      { name: 'Source', range: 'Reference track / SetLab arc / Manual', default: 'SetLab arc' },
      { name: 'Sections', range: '4 – 32', default: '8' },
      { name: 'Curve shape', range: 'Linear / Exponential / S-curve', default: 'S-curve' },
      { name: 'Peak position', range: '0 – 100%', default: '72%' },
      { name: 'Drop depth', range: '0 – 100%', default: '55%' },
      { name: 'Marker style', range: 'Locator / Clip colour / Both', default: 'Both' },
    ],
    midi_in: 'Transport sync',
    midi_out: 'Arrangement markers + clip colours',
    color: '#8a6a9a',
    colorRaw: '#8a6a9a',
  },
]

const INSTALL_STEPS = [
  { n: '01', title: 'Download the package', body: 'Download the Artist OS M4L package below. Contains all four devices as .amxd files.' },
  { n: '02', title: 'Open Ableton Live', body: 'Open Live 11 or 12. Max for Live must be included (Suite edition or add-on).' },
  { n: '03', title: 'Drop into SONIX Lab folder', body: 'A dedicated SONIX Lab folder already exists in your User Library. In Ableton browser: Places → User Library → SONIX Lab. All four devices live here in one place.' },
  { n: '04', title: 'Connect to Artist OS', body: 'In each device, enter your Artist OS API key from Settings → Integrations. Devices sync in real time.' },
  { n: '05', title: 'Start playing', body: 'Chord Engine on a MIDI track, Energy Arc + Arrangement on the Master, Mix Chain on any audio channel.' },
]

export function MaxForLive() {
  const [activeDevice, setActiveDevice] = useState(0)
  const [copied, setCopied] = useState(false)
  const [toast, setToast] = useState<{ msg: string } | null>(null)

  function showToast(msg: string) {
    setToast({ msg })
    setTimeout(() => setToast(null), 3000)
  }

  function copyApiKey() {
    navigator.clipboard.writeText('signallab_demo_key_replace_with_real')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    showToast('API key copied — paste into the device')
  }

  const device = DEVICES[activeDevice]

  const cardStyle: React.CSSProperties = {
    background: 'var(--panel)',
    border: '1px solid var(--border-dim)',
    padding: '24px 28px',
    marginBottom: '16px',
  }

  const fieldLabel: React.CSSProperties = {
    fontSize: '10px',
    letterSpacing: '0.22em',
    color: 'var(--text-dimmer)',
    textTransform: 'uppercase',
    marginBottom: '14px',
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>

      {/* ── Page header ── */}
      <div style={{ padding: '52px 56px 44px', borderBottom: '1px solid var(--border-dim)' }}>
        <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: 'var(--gold)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
          <span style={{ display: 'block', width: '28px', height: '1px', background: 'var(--gold)' }} />
          Artist OS — Ableton Integration
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div className="display" style={{ fontSize: 'clamp(40px, 5vw, 64px)', fontWeight: 300, letterSpacing: '-0.02em', lineHeight: 1.0 }}>Max for Live.</div>
            <div style={{ fontSize: '13px', color: 'var(--text-dimmer)', marginTop: '10px' }}>4 devices · Live 11 / 12 · M4L required</div>
          </div>
          <button
            onClick={() => window.location.href = '/api/download'}
            style={{
              background: 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)',
              border: '1px solid var(--gold)',
              color: 'var(--gold)',
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              padding: '14px 28px',
              cursor: 'pointer',
            }}
          >
            Download package →
          </button>
        </div>
      </div>

      <div style={{ padding: '44px 56px', display: 'grid', gridTemplateColumns: '260px 1fr', gap: '32px' }}>

        {/* ── Device selector ── */}
        <div>
          <div style={fieldLabel}>Devices</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
            {DEVICES.map((d, i) => (
              <div key={d.id} onClick={() => setActiveDevice(i)} style={{
                background: activeDevice === i ? 'rgba(255,255,255,0.03)' : 'var(--panel)',
                border: `1px solid ${activeDevice === i ? d.colorRaw : 'var(--border-dim)'}`,
                padding: '16px 18px',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                  <div style={{ fontSize: '13px', color: activeDevice === i ? 'var(--text)' : 'var(--text-dim)' }}>{d.name}</div>
                  <div style={{ fontSize: '9px', letterSpacing: '0.12em', color: d.colorRaw, textTransform: 'uppercase', border: `1px solid ${d.colorRaw}33`, padding: '2px 6px' }}>{d.type}</div>
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-dimmest)', lineHeight: '1.5' }}>{d.description.slice(0, 64)}…</div>
              </div>
            ))}
          </div>

          {/* API key */}
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border-dim)', padding: '18px' }}>
            <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: 'var(--text-dimmer)', textTransform: 'uppercase', marginBottom: '8px' }}>Your API key</div>
            <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', marginBottom: '12px', lineHeight: '1.5' }}>Paste into each device to connect to Artist OS</div>
            <button onClick={copyApiKey} style={{
              width: '100%',
              background: copied ? 'linear-gradient(180deg, #1a2e1c 0%, #121e0e 100%)' : 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)',
              border: `1px solid ${copied ? 'var(--green)' : 'var(--gold)'}`,
              color: copied ? 'var(--green)' : 'var(--gold)',
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              padding: '10px',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}>
              {copied ? 'Copied ✓' : 'Copy API key'}
            </button>
          </div>
        </div>

        {/* ── Device detail ── */}
        <div>

          {/* Device header */}
          <div style={{ ...cardStyle, border: `1px solid ${device.colorRaw}33` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
              <div>
                <div className="display" style={{ fontSize: '22px', fontWeight: 300, color: device.colorRaw, letterSpacing: '0.1em', marginBottom: '6px' }}>{device.name}</div>
                <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: 'var(--text-dimmer)', textTransform: 'uppercase' }}>{device.type} · v{device.version}</div>
              </div>
              <div style={{ textAlign: 'right', fontSize: '10px', color: 'var(--text-dimmer)', lineHeight: '2.2' }}>
                <div>MIDI in: <span style={{ color: 'var(--text-dim)' }}>{device.midi_in}</span></div>
                <div>MIDI out: <span style={{ color: 'var(--text-dim)' }}>{device.midi_out}</span></div>
              </div>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-dim)', lineHeight: '1.8' }}>{device.description}</div>
          </div>

          {/* Parameters */}
          <div style={cardStyle}>
            <div style={{ ...fieldLabel, color: device.colorRaw }}>Parameters</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {device.params.map(p => (
                <div key={p.name} style={{ background: 'var(--bg)', border: '1px solid var(--border-dim)', padding: '14px 16px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text)', marginBottom: '6px' }}>{p.name}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', marginBottom: '4px' }}>{p.range}</div>
                  <div style={{ fontSize: '10px', color: device.colorRaw }}>Default: {p.default}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Install guide */}
          <div style={cardStyle}>
            <div style={fieldLabel}>Installation</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {INSTALL_STEPS.map((step, i) => (
                <div key={step.n} style={{ display: 'flex', gap: '20px', padding: '14px 0', borderBottom: i < INSTALL_STEPS.length - 1 ? '1px solid var(--border-dim)' : 'none' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-dimmest)', flexShrink: 0, width: '24px' }}>{step.n}</div>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text)', marginBottom: '4px' }}>{step.title}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: '1.6' }}>{step.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Compatibility */}
          <div style={{ ...cardStyle, marginBottom: 0 }}>
            <div style={fieldLabel}>Compatibility</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              {[
                { label: 'Ableton Live', val: '11, 12' },
                { label: 'Max for Live', val: '8.6+' },
                { label: 'macOS', val: '12+' },
                { label: 'Windows', val: '10, 11' },
              ].map(c => (
                <div key={c.label} style={{ background: 'var(--bg)', border: '1px solid var(--border-dim)', padding: '12px 14px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '4px' }}>{c.label}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text)' }}>{c.val}</div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '32px', right: '32px', background: 'rgba(14,13,11,0.97)', border: '1px solid var(--border)', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '4px', zIndex: 1000, backdropFilter: 'blur(16px)', minWidth: '240px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'var(--gold)', textTransform: 'uppercase' }}>Artist OS</div>
          <div style={{ fontSize: '13px', color: 'var(--text)' }}>{toast.msg}</div>
        </div>
      )}
    </div>
  )
}
