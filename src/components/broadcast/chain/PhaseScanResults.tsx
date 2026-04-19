'use client'

import { BRT } from '@/lib/design/brt'
import type { ChainScanResult } from '@/lib/chainScan'

interface Props {
  result: ChainScanResult
  composite: number
  fileName: string
  isVideo: boolean
  thumbnail: string | null
  onNext: () => void
  onSkip?: () => void
}

function fmtTs(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Strip em/en-dashes from scan-sourced text before render. Scan output is a
 * Claude response that occasionally ignores the no-dash rule; we never want
 * a violation to leak into UI per feedback_no_em_dashes_in_captions. Comma
 * is the safest in-place substitute.
 */
function cleanText(s: string | undefined | null): string {
  if (!s) return ''
  return s.replace(/\s?[—–]\s?/g, ', ').replace(/,\s*,/g, ',')
}

export function PhaseScanResults({ result, composite, fileName, isVideo, thumbnail, onNext, onSkip }: Props) {
  const topRank = [...(result.platform_ranking || [])].sort((a, b) => b.score - a.score)[0]
  const formatLabel = isVideo ? 'Reel' : 'Post'
  const hookAt = isVideo ? fmtTs(result.best_moment?.timestamp || 0) : '0:00'
  const tags = (result.tags || []).slice(0, 6)
  const moments = (result.moments || []).slice(0, 3)

  return (
    <div
      style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '2fr 1fr',
        gap: 12,
        minHeight: 0,
      }}
    >
      {/* Main result panel */}
      <div
        style={{
          background: BRT.ticket,
          border: `1px solid ${BRT.red}`,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          minHeight: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.3em', color: BRT.red, fontWeight: 700, textTransform: 'uppercase' }}>
              ◉ Scanner · What's in it
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.025em', lineHeight: 1, marginTop: 6, color: BRT.ink }}>
              {fileName}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 44, fontWeight: 900, letterSpacing: '-0.04em', color: BRT.red, lineHeight: 1 }}>
              {composite}
            </div>
            <div style={{ fontSize: 9, letterSpacing: '0.26em', color: '#9a9a9a', fontWeight: 700, textTransform: 'uppercase', marginTop: 4 }}>
              post-worthy
            </div>
          </div>
        </div>
        <div
          style={{
            fontSize: 14,
            lineHeight: 1.5,
            color: BRT.ink,
            padding: '12px 14px',
            background: BRT.ticketLo,
            borderLeft: `2px solid ${BRT.red}`,
          }}
        >
          {cleanText(result.caption_context || result.post_recommendation)}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 10,
            marginTop: 'auto',
          }}
        >
          <Fact label="Format fit" value={formatLabel} accent={isVideo ? '9:16' : '1:1'} />
          <Fact label="Hook at" value={hookAt} accent={isVideo ? 'cut here' : ''} />
          <Fact label="Mood" value={cleanText(result.tone_match)?.split(/[,.]/)[0] || 'Raw'} />
          <Fact label="Top platform" value={topRank?.platform || '—'} accent={topRank ? `${topRank.score}` : ''} />
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            paddingTop: 12,
            borderTop: `1px solid ${BRT.divide}`,
          }}
        >
          <div style={{ fontSize: 11, letterSpacing: '0.22em', color: '#9a9a9a', fontWeight: 700, textTransform: 'uppercase' }}>
            Energy · <span style={{ color: BRT.ink }}>{result.overall_energy}/10</span>
          </div>
          {onSkip && (
            <button
              onClick={onSkip}
              style={{
                marginLeft: 'auto',
                padding: '14px 18px',
                background: 'transparent',
                border: `1px solid ${BRT.borderBright}`,
                color: '#9a9a9a',
                fontSize: 11,
                letterSpacing: '0.22em',
                fontWeight: 700,
                textTransform: 'uppercase',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Skip · save
            </button>
          )}
          <button
            onClick={onNext}
            style={{
              marginLeft: onSkip ? 0 : 'auto',
              padding: '14px 22px',
              background: BRT.red,
              border: 'none',
              color: BRT.bg,
              fontSize: 12,
              letterSpacing: '0.24em',
              fontWeight: 800,
              textTransform: 'uppercase',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Generate captions
          </button>
        </div>
      </div>

      {/* Right column: image hero first (this is what's being scored —
          the user should SEE it at size, not hunt for a 40px thumbnail),
          then tags + top moments below. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
        {thumbnail && (
          <div
            style={{
              position: 'relative',
              flex: '0 1 auto',
              minHeight: 220,
              maxHeight: '50%',
              background: BRT.ticketLo,
              border: `1px solid ${BRT.borderBright}`,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbnail}
              alt={fileName}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: 'block',
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: 10,
                left: 12,
                fontSize: 9,
                letterSpacing: '0.28em',
                color: BRT.red,
                fontWeight: 700,
                textTransform: 'uppercase',
                background: 'rgba(0,0,0,0.6)',
                padding: '4px 8px',
              }}
            >
              ◉ {isVideo ? 'Hero frame' : 'Scanned'}
            </div>
          </div>
        )}
        <div
          style={{
            background: BRT.ticket,
            border: `1px solid ${BRT.borderBright}`,
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ fontSize: 9, letterSpacing: '0.28em', color: '#9a9a9a', fontWeight: 700, textTransform: 'uppercase' }}>
            ◉ Detected
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {tags.length === 0 && (
              <span style={{ fontSize: 10, color: BRT.dimmest }}>(none flagged)</span>
            )}
            {tags.map((t, i) => (
              <span
                key={`${t}-${i}`}
                style={{
                  padding: '4px 8px',
                  border: `1px solid ${i < 3 ? BRT.red : BRT.borderBright}`,
                  color: i < 3 ? BRT.red : '#9a9a9a',
                  fontSize: 9,
                  letterSpacing: '0.2em',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
        <div
          style={{
            background: BRT.ticket,
            border: `1px solid ${BRT.borderBright}`,
            padding: 14,
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            minHeight: 0,
          }}
        >
          <div style={{ fontSize: 9, letterSpacing: '0.28em', color: '#9a9a9a', fontWeight: 700, textTransform: 'uppercase' }}>
            ◉ Top moments
          </div>
          {moments.length === 0 && (
            <div style={{ fontSize: 11, color: BRT.dimmest }}>No moments flagged.</div>
          )}
          {moments.map((m, i) => (
            <div
              key={`${m.timestamp}-${i}`}
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                fontSize: 11,
                padding: '6px 8px',
                background: BRT.ticketLo,
              }}
            >
              <span style={{ fontSize: 10, letterSpacing: '0.14em', color: BRT.red, fontWeight: 700, flexShrink: 0, minWidth: 32 }}>
                {fmtTs(m.timestamp)}
              </span>
              <span style={{ color: '#9a9a9a', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {cleanText(m.reason)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Fact({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div
      style={{
        padding: '8px 10px',
        background: BRT.ticketLo,
        border: `1px solid ${BRT.borderBright}`,
      }}
    >
      <div style={{ fontSize: 9, letterSpacing: '0.22em', color: '#9a9a9a', fontWeight: 700, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.01em', marginTop: 3, color: BRT.ink }}>
        {value}
        {accent && <span style={{ color: BRT.red, marginLeft: 6 }}>{accent}</span>}
      </div>
    </div>
  )
}
