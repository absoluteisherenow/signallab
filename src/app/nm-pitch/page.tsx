'use client'

import { BRT, BRT_FONT_DISPLAY, BRT_FONT_MONO, BRT_OVERLAY } from '@/lib/design/brt'

const SECTIONS = [
  {
    label: '01 / THE WORLD',
    title: 'Three elements. Nothing else.',
    body: null,
    items: [
      {
        heading: 'The Ferrari',
        text: "Dot's red Ferrari as a recurring character. In unlikely places. Not a flex. Can it open every release, build the world, become the merch?",
      },
      {
        heading: 'Beautiful landscapes',
        text: 'British, cinematic. Moorland, coastline, ploughed fields, fog, rain, dawn, dusk. Never summer postcard.',
      },
      {
        heading: 'Derelict buildings',
        text: 'Farmhouses, industrial estates, warehouses, empty venues. The romantic-decay end of it.',
      },
    ],
    note: 'No people in frame. The world is inhabited only by implication. An empty chair. A lamp left on. An OB-6 running with nobody playing it. The track is the narrator.',
  },
  {
    label: '02 / WHY IT WORKS',
    title: 'Four reasons.',
    body: null,
    items: [
      { heading: 'Colour', text: 'The red maps directly to Vermilion in our palette. Visual cohesion for free.' },
      { heading: 'Subversion', text: 'Anti-flex by staging. Ferrari in a ploughed field reads as chic-raw, not lifestyle.' },
      { heading: 'Already real', text: 'April 8 breakdown. Not confected. The story exists.' },
      { heading: 'Extensible', text: 'Scenarios write themselves. We never run out of locations.' },
    ],
    note: null,
  },
  {
    label: '03 / FIRST APPLICATION',
    title: 'Visions.',
    body: 'Release artwork + launch video + 9:16 Reels + 16:9 long-form. Cinematic, no dialogue, no people in frame.',
    items: [
      { heading: 'Cold open', text: 'Ferrari at the edge of a ploughed field, blue hour. No fade. Full opacity frame 1.' },
      { heading: 'Interior', text: 'Derelict farmhouse kitchen. OB-6 on the table, one warm lamp on, chair pulled back. Nobody there.' },
      { heading: 'Movement', text: 'Ferrari from behind, driving away down a track. Nobody visible through the windows.' },
      { heading: 'Final', text: 'Wide on the Ferrari alone in fog, lights just on. Held.' },
    ],
    note: null,
  },
  {
    label: '04 / PALETTE',
    title: 'No new colours.',
    body: null,
    items: [
      { heading: 'Releases', text: 'Noctum (black) + Vermilion (deep red)' },
      { heading: 'Hybrid Live', text: 'Solstice + Dusk (warm amber, muted warm)' },
      { heading: 'Daylight', text: 'Ash (off-white) + Midnight Blue (deep navy)' },
    ],
    note: 'One NM LUT applied to everything, forever. Warm shadows, desaturated mids, Vermilion push on reds, slight green in deep shadow. Film grain always present.',
  },
  {
    label: '05 / PRODUCTION',
    title: 'Direction.',
    body: null,
    items: [
      { heading: 'No people', text: 'World inhabited by implication only. Empty chair, lamp left on, OB-6 running. Someone was here.' },
      { heading: 'No fade-in', text: 'Full opacity from frame 1. The hook is the first frame, not a build.' },
      { heading: 'Macro or wide', text: 'Extreme close or extreme wide. Nothing in between. Rain on red paint, or Ferrari alone in fog.' },
      { heading: 'Wrong place', text: 'Ferrari always out of context. Rural, derelict, weathered. Never glamorous.' },
    ],
    note: null,
  },
  {
    label: '06 / QUESTIONS',
    title: 'What I need from you.',
    body: null,
    items: [
      { heading: '1.', text: 'Does the three-element, people-free world land? Ferrari + landscapes + derelict interiors.' },
      { heading: '2.', text: 'Dot, are you in on the Ferrari? Your car, your call.' },
      { heading: '3.', text: 'Scenario ideas welcome. Push it further.' },
      { heading: '4.', text: 'Anything missing? Different world, different tone, something I haven\'t thought of.' },
    ],
    note: 'Not trying to lock anything in. Want the conversation.',
  },
]

export default function NMPitchPage() {
  return (
    <div style={{ background: BRT.bg, minHeight: '100vh', color: BRT.ink, fontFamily: BRT_FONT_DISPLAY }}>
      {/* Scanline overlay */}
      <div style={BRT_OVERLAY.scanlines} />
      <div style={BRT_OVERLAY.grain} />

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '80px 24px 120px', position: 'relative', zIndex: 2 }}>

        {/* Header */}
        <div style={{ borderBottom: `1px solid ${BRT.divide}`, paddingBottom: 40, marginBottom: 64 }}>
          <div style={{ fontFamily: BRT_FONT_MONO, fontSize: 11, color: BRT.red, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 20 }}>
            NIGHT manoeuvres / Visual Identity
          </div>
          <h1 style={{ fontSize: 'clamp(32px, 6vw, 56px)', fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.03em', margin: '0 0 16px' }}>
            Building a world.
          </h1>
          <p style={{ fontSize: 16, color: BRT.inkSoft, lineHeight: 1.7, maxWidth: 520, margin: 0 }}>
            We have a great logo. What we don't have yet is a world. A recurring visual anchor that means NIGHT manoeuvres the second you see it, without reading the name.
          </p>
          <div style={{ marginTop: 32, display: 'flex', gap: 12, flexWrap: 'wrap' as const }}>
            <Tag text="Brainstorm stage" />
            <Tag text="Nothing locked" />
            <Tag text="Reactions welcome" />
          </div>
        </div>

        {/* Reference line */}
        <div style={{
          background: BRT.ticket,
          border: `1px solid ${BRT.divide}`,
          borderLeft: `3px solid ${BRT.red}`,
          padding: '16px 20px',
          marginBottom: 64,
          fontFamily: BRT_FONT_MONO,
          fontSize: 12,
          color: BRT.inkSoft,
          lineHeight: 1.6,
        }}>
          Reference mechanic: Overmono and their dogs. A specific, recurring thing that shows up across every release, every video, every shoot. Over time it becomes inseparable from the act.
        </div>

        {/* Sections */}
        {SECTIONS.map((section, i) => (
          <div key={i} style={{ marginBottom: 72 }}>
            <div style={{ fontFamily: BRT_FONT_MONO, fontSize: 10, color: BRT.red, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 8 }}>
              {section.label}
            </div>
            <h2 style={{ fontSize: 'clamp(22px, 4vw, 32px)', fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 24px' }}>
              {section.title}
            </h2>
            {section.body && (
              <p style={{ fontSize: 15, color: BRT.inkSoft, lineHeight: 1.75, marginBottom: 24 }}>
                {section.body}
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 1 }}>
              {section.items.map((item, j) => (
                <div key={j} style={{
                  background: j % 2 === 0 ? BRT.ticket : BRT.ticketLo,
                  padding: '14px 18px',
                  display: 'grid',
                  gridTemplateColumns: '120px 1fr',
                  gap: 16,
                  alignItems: 'start',
                }}>
                  <div style={{ fontFamily: BRT_FONT_MONO, fontSize: 11, color: BRT.red, textTransform: 'uppercase', letterSpacing: '0.05em', paddingTop: 2 }}>
                    {item.heading}
                  </div>
                  <div style={{ fontSize: 14, color: BRT.ink, lineHeight: 1.65 }}>
                    {item.text}
                  </div>
                </div>
              ))}
            </div>
            {section.note && (
              <div style={{
                marginTop: 16,
                padding: '14px 18px',
                background: BRT.surface,
                borderLeft: `2px solid ${BRT.divide}`,
                fontSize: 13,
                color: BRT.inkDim,
                lineHeight: 1.7,
                fontStyle: 'italic',
              }}>
                {section.note}
              </div>
            )}
          </div>
        ))}

        {/* Footer */}
        <div style={{ borderTop: `1px solid ${BRT.divide}`, paddingTop: 40, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' as const, gap: 16 }}>
          <div style={{ fontFamily: BRT_FONT_MONO, fontSize: 11, color: BRT.inkDim, letterSpacing: '0.1em' }}>
            NIGHT manoeuvres · Visual Identity Proposal · Apr 2026
          </div>
          <div style={{ fontFamily: BRT_FONT_MONO, fontSize: 11, color: BRT.inkDim }}>
            More detail behind any of this if useful. Just ask.
          </div>
        </div>

      </div>
    </div>
  )
}

function Tag({ text }: { text: string }) {
  return (
    <span style={{
      fontFamily: BRT_FONT_MONO,
      fontSize: 10,
      color: BRT.inkDim,
      border: `1px solid ${BRT.divide}`,
      padding: '4px 10px',
      letterSpacing: '0.1em',
      textTransform: 'uppercase' as const,
    }}>
      {text}
    </span>
  )
}
