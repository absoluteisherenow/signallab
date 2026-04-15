/**
 * BRT — Brutalist design system tokens.
 * Single source of truth for the Night Manoeuvres / Signal Lab system.
 * Inspired by Berghain · Circoloco · Helvetica · brutalist boarding passes.
 *
 * To switch a component to BRT, import this and use:
 *   import { BRT } from '@/lib/design/brt'
 *   <div style={{ background: BRT.bg, color: BRT.ink }}>
 */

export const BRT = {
  // Surfaces
  bg: '#050505',
  ticket: '#111',
  ticketHi: '#1a1a1a',
  ticketLo: '#0a0a0a',
  surface: '#0e0e0e',
  surfaceHi: '#161616',

  // Ink
  ink: '#f2f2f2',
  inkSoft: '#bbb',
  inkDim: '#777',
  inkFaint: '#3a3a3a',
  divide: '#222',
  divideSoft: '#1d1d1d',

  // Accent — bright Circoloco red
  red: '#ff2a1a',
  redDeep: '#a01510',

  // Status
  positive: '#f2f2f2',  // off-white, no green clash
  negative: '#ff2a1a',
} as const

export const BRT_FONT_DISPLAY = '"Helvetica Neue", Helvetica, Arial, sans-serif'
export const BRT_FONT_MONO = 'var(--font-mono)'

/** CSS for the BRT scanline + grain overlay (apply to a fixed full-screen div). */
export const BRT_OVERLAY = {
  scanlines: {
    position: 'fixed' as const,
    inset: 0,
    backgroundImage: `repeating-linear-gradient(0deg, transparent 0 2px, rgba(255,255,255,0.012) 2px 3px)`,
    pointerEvents: 'none' as const,
    zIndex: 1,
  },
  grain: {
    position: 'fixed' as const,
    inset: 0,
    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E")`,
    opacity: 0.06,
    mixBlendMode: 'overlay' as const,
    pointerEvents: 'none' as const,
    zIndex: 1,
  },
}
