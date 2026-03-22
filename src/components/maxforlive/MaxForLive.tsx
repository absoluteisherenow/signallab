'use client'

import { useState } from 'react'

const DEVICES = [
  {
    id: 'chord-engine',
    name: 'Chord Engine',
    version: '1.0.0',
    type: 'MIDI Effect',
    description: 'Real-time chord suggestions from Sonix Lab. Play a root note, device outputs voiced chords based on your current key and progression.',
    params: [
      { name: 'Key', range: 'C – B', default: 'A' },
      { name: 'Mode', range: 'Major / Minor / Dorian / Phrygian', default: 'Minor' },
      { name: 'Voicing', range: 'Close / Open / Wide', default: 'Open' },
      { name: 'Tension', range: '0 – 100%', default: '40%' },
    ],
    midi_in: 'Root note trigger',
    midi_out: 'Voiced chord',
    color: '#b08d57',
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
    color: '#3d6b4a',
  },
  {
    id: 'mix-chain',
    name: 'Mix Chain',
    version: '1.0.0',
    type: 'Audio Effect',
    description: 'Loads Sonix Lab mixdown chains as Ableton rack presets. Select a chain type — Vocal Warmth, Bass Sub, Synth Pad — and the device configures itself.',
    params: [
      { name: 'Chain', range: '18 presets', default: 'Vocal — Warmth' },
      { name: 'Intensity', range: '0 – 100%', default: '70%' },
      { name: 'Parallel', range: '0 – 100%', default: '30%' },
      { name: 'Air', range: '0 – 100%', default: '50%' },
    ],
    midi_in: '—',
    midi_out: '—',
    color: '#6a7a9a',
  },
]

const INSTALL_STEPS = [
  { n: '01', title: 'Download the package', body: 'Download the Signal Lab M4L package below. Contains all three devices as .amxd files.' },
  { n: '02', title: 'Open Ableton Live', body: 'Open Live 11 or 12. Max for Live must be included (Suite edition or add-on).' },
  { n: '03', title: 'Add to User Library', body: 'Drag the .amxd files into your User Library → Max for Live folder in the browser sidebar.' },
  { n: '04', title: 'Connect to Signal Lab', body: 'In each device, enter your Signal Lab API key from Settings → Integrations. Devices sync in real time.' },
  { n: '05', title: 'Start playing', body: 'Drop Chord Engine on a MIDI track, Energy Arc on the Master, Mix Chain on any audio channel.' },
]

export function MaxForLive() {
  const [activeDevice, setActiveDevice] = useState(0)
  const [copied, setCopied] = useState(false)
  const [toast, setToast] = useState<{msg:string}|null>(null)

  function showToast(msg: string) {
    setToast({msg})
    setTimeout(() => setToast(null), 3000)
  }

  function copyApiKey() {
    navigator.clipboard.writeText('signallab_demo_key_replace_with_real')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    showToast('API key copied — paste into the device')
  }

  const s = {
    bg: '#1a1410',
    panel: 'linear-gradient(180deg, #1e1a10 0%, #161208 100%)',
    border: '#3a2e1c',
    borderBright: '#5a4428',
    gold: '#c9a46e',
    goldDim: '#6a4e28',
    text: '#e8dcc8',
    textDim: '#8a7a5a',
    textDimmer: '#5a4428',
    black: '#0e0b06',
    font: "'DM Mono', monospace",
  }

  const device = DEVICES[activeDevice]

  return (
    <div style={{ minHeight: '100vh', background: s.bg, color: s.text, fontFamily: s.font }}>

      {/* HEADER */}
      <div style={{ background: 'linear-gradient(180deg, #2a2018 0%, #1e1710 100%)', borderBottom: `2px solid ${s.borderBright}`, padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div style={{ background: 'linear-gradient(135deg, #2e2416 0%, #1c1508 100%)', border: `1px solid ${s.borderBright}`, padding: '10px 20px' }}>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '18px', fontWeight: 300, letterSpacing: '0.2em', color: s.gold }}>MAX <span style={{ color: '#8a6a3a' }}>FOR LIVE</span></div>
            <div style={{ fontSize: '9px', letterSpacing: '0.3em', color: s.goldDim, marginTop: '2px' }}>SIGNAL LAB — ABLETON INTEGRATION</div>
          </div>
          <div style={{ fontSize: '11px', color: s.textDimmer, letterSpacing: '0.1em' }}>3 devices · Live 11/12 · M4L required</div>
        </div>
        <button onClick={() => window.location.href = '/api/download'} style={{
          background: 'linear-gradient(180deg, #4a3820 0%, #3a2810 100%)',
          border: `1px solid ${s.gold}`,
          color: s.gold,
          fontFamily: s.font,
          fontSize: '10px',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          padding: '12px 28px',
          cursor: 'pointer',
          boxShadow: '0 0 12px rgba(201,164,110,0.15)',
        }}>
          Download package →
        </button>
      </div>

      <div style={{ padding: '32px', display: 'grid', gridTemplateColumns: '280px 1fr', gap: '24px' }}>

        {/* DEVICE SELECTOR */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '9px', letterSpacing: '0.22em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '8px' }}>Devices</div>
          {DEVICES.map((d, i) => (
            <div key={d.id} onClick={() => setActiveDevice(i)} style={{
              background: activeDevice === i ? 'linear-gradient(180deg, #2e2416 0%, #1e1508 100%)' : s.black,
              border: activeDevice === i ? `1px solid ${d.color}` : `1px solid ${s.border}`,
              padding: '16px 18px',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                <div style={{ fontSize: '13px', color: activeDevice === i ? s.text : s.textDim }}>{d.name}</div>
                <div style={{ fontSize: '8px', letterSpacing: '0.12em', color: d.color, textTransform: 'uppercase' }}>{d.type}</div>
              </div>
              <div style={{ fontSize: '10px', color: s.textDimmer, lineHeight: '1.5' }}>{d.description.slice(0, 60)}...</div>
            </div>
          ))}

          {/* API KEY */}
          <div style={{ marginTop: '16px', background: s.black, border: `1px solid ${s.border}`, padding: '16px 18px' }}>
            <div style={{ fontSize: '9px', letterSpacing: '0.18em', color: s.textDimmer, textTransform: 'uppercase', marginBottom: '10px' }}>Your API key</div>
            <div style={{ fontSize: '10px', color: s.textDim, marginBottom: '10px', lineHeight: '1.5' }}>Paste into each device to connect to Signal Lab</div>
            <button onClick={copyApiKey} style={{
              width: '100%',
              background: copied ? 'linear-gradient(180deg, #2a3020 0%, #1a2010 100%)' : 'linear-gradient(180deg, #3a2e1c 0%, #2a200e 100%)',
              border: `1px solid ${copied ? '#4a6a38' : s.goldDim}`,
              color: copied ? '#8aba68' : s.gold,
              fontFamily: s.font,
              fontSize: '9px',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              padding: '10px',
              cursor: 'pointer',
            }}>
              {copied ? 'Copied ✓' : 'Copy API key'}
            </button>
          </div>
        </div>

        {/* DEVICE DETAIL */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Device header */}
          <div style={{ background: s.panel, border: `1px solid ${device.color}`, padding: '24px 28px', boxShadow: `0 0 20px ${device.color}15` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div>
                <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '22px', fontWeight: 300, color: device.color, letterSpacing: '0.1em', marginBottom: '4px' }}>{device.name}</div>
                <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: s.textDimmer, textTransform: 'uppercase' }}>{device.type} · v{device.version}</div>
              </div>
              <div style={{ textAlign: 'right', fontSize: '10px', color: s.textDimmer, lineHeight: '2' }}>
                <div>MIDI in: <span style={{ color: s.textDim }}>{device.midi_in}</span></div>
                <div>MIDI out: <span style={{ color: s.textDim }}>{device.midi_out}</span></div>
              </div>
            </div>
            <div style={{ fontSize: '13px', color: s.textDim, lineHeight: '1.8', letterSpacing: '0.04em' }}>{device.description}</div>
          </div>

          {/* Parameters */}
          <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '24px 28px' }}>
            <div style={{ fontSize: '9px', letterSpacing: '0.22em', color: device.color, textTransform: 'uppercase', marginBottom: '16px' }}>Parameters</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {device.params.map(p => (
                <div key={p.name} style={{ background: s.black, border: `1px solid ${s.border}`, padding: '14px 16px' }}>
                  <div style={{ fontSize: '11px', color: s.text, marginBottom: '6px' }}>{p.name}</div>
                  <div style={{ fontSize: '10px', color: s.textDimmer, marginBottom: '4px' }}>{p.range}</div>
                  <div style={{ fontSize: '10px', color: device.color }}>Default: {p.default}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Install guide */}
          <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '24px 28px' }}>
            <div style={{ fontSize: '9px', letterSpacing: '0.22em', color: s.gold, textTransform: 'uppercase', marginBottom: '20px' }}>Installation</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
              {INSTALL_STEPS.map((step, i) => (
                <div key={step.n} style={{ display: 'flex', gap: '20px', padding: '14px 0', borderBottom: i < INSTALL_STEPS.length - 1 ? `1px solid ${s.border}` : 'none' }}>
                  <div style={{ fontSize: '11px', color: s.goldDim, flexShrink: 0, width: '24px' }}>{step.n}</div>
                  <div>
                    <div style={{ fontSize: '12px', color: s.text, marginBottom: '4px' }}>{step.title}</div>
                    <div style={{ fontSize: '11px', color: s.textDim, lineHeight: '1.6' }}>{step.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Compatibility */}
          <div style={{ background: s.panel, border: `1px solid ${s.border}`, padding: '20px 28px' }}>
            <div style={{ fontSize: '9px', letterSpacing: '0.22em', color: s.gold, textTransform: 'uppercase', marginBottom: '14px' }}>Compatibility</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              {[
                { label: 'Ableton Live', val: '11, 12' },
                { label: 'Max for Live', val: '8.6+' },
                { label: 'macOS', val: '12+' },
                { label: 'Windows', val: '10, 11' },
              ].map(c => (
                <div key={c.label} style={{ background: s.black, border: `1px solid ${s.border}`, padding: '12px 14px' }}>
                  <div style={{ fontSize: '9px', color: s.textDimmer, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '4px' }}>{c.label}</div>
                  <div style={{ fontSize: '13px', color: s.text }}>{c.val}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: '28px', right: '28px', background: 'rgba(20,16,8,0.96)', border: `1px solid ${s.border}`, padding: '14px 20px', fontSize: '12px', letterSpacing: '0.07em', color: s.text, zIndex: 50, backdropFilter: 'blur(12px)' }}>
          <div style={{ fontSize: '8px', letterSpacing: '0.2em', textTransform: 'uppercase', color: s.gold, marginBottom: '4px' }}>Signal Lab</div>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
