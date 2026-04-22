'use client'

import { BRT, BRT_FONT_MONO } from '@/lib/design/brt'
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
 * Sanitise dashes in scan-sourced strings before render. Scan prose comes
 * from Claude and occasionally bleeds an em/en-dash through the no-dash
 * rule, never want a violation to reach UI (feedback_no_em_dashes_in_captions).
 */
function cleanText(s: string | undefined | null): string {
  if (!s) return ''
  return s.replace(/\s?[\u2014\u2013]\s?/g, ', ').replace(/,\s*,/g, ',')
}

type DimKey = 'reach' | 'authenticity' | 'culture' | 'visual_identity' | 'shareable_core' | 'aesthetic'

const DIM_LABELS: Record<DimKey, string> = {
  reach: 'Reach',
  authenticity: 'Authenticity',
  culture: 'Culture fit',
  visual_identity: 'Visual ID',
  shareable_core: 'Shareable',
  aesthetic: 'Aesthetic',
}

const DIM_BLURB: Record<DimKey, string> = {
  reach: 'how far this travels',
  authenticity: 'real vs staged',
  culture: 'scene-native read',
  visual_identity: 'NM brand alignment',
  shareable_core: 'one-thing worth sharing',
  aesthetic: 'pure look score',
}

/**
 * PhaseScanVerdict — replaces PhaseScanResults.
 *
 * Full verdict sheet for a completed scan. Every visible number comes from
 * real scan output — no synthesised fields, no filler. Layout:
 *   TOP  — hero frame + composite meter + wow + post-it
 *   GRID — 5 sub-dimension bars (real content_score)  |  moment rail
 *   BOT  — platform ranking bars + action bar (energy, tone, tags, CTAs)
 */
export function PhaseScanVerdict({
  result,
  composite,
  fileName,
  isVideo,
  thumbnail,
  onNext,
  onSkip,
}: Props) {
  const cs = result.content_score || ({} as ChainScanResult['content_score'])
  const dims: { key: DimKey; value: number }[] = [
    { key: 'reach', value: cs.reach ?? 0 },
    { key: 'authenticity', value: cs.authenticity ?? 0 },
    { key: 'culture', value: cs.culture ?? 0 },
    { key: 'visual_identity', value: cs.visual_identity ?? 0 },
    { key: 'shareable_core', value: cs.shareable_core ?? 0 },
    ...(typeof cs.aesthetic === 'number' ? [{ key: 'aesthetic' as DimKey, value: cs.aesthetic }] : []),
  ]

  const platforms = [...(result.platform_ranking || [])]
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
  const topPlatform = platforms[0]

  const moments = [...(result.moments || [])]
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)

  const tags = (result.tags || []).slice(0, 8)

  const wow = cleanText(result.wow_note) || cleanText(result.caption_context)
  const postIt = cleanText(result.editorial_angle) || cleanText(result.post_recommendation)

  // composite ring geometry
  const RING_SIZE = 108
  const RING_STROKE = 8
  const ringR = (RING_SIZE - RING_STROKE) / 2
  const ringC = 2 * Math.PI * ringR
  const ringOffset = ringC - (Math.max(0, Math.min(100, composite)) / 100) * ringC

  return (
    <div
      style={{
        flex: 1,
        display: 'grid',
        gridTemplateRows: 'auto 1fr auto',
        gap: 10,
        minHeight: 0,
      }}
    >
      {/* TOP — hero band: frame + composite + wow + post-it */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(220px, 320px) 1fr minmax(160px, 200px)',
          gap: 10,
          minHeight: 0,
        }}
      >
        {/* Hero frame */}
        <div
          style={{
            position: 'relative',
            background: BRT.ticketLo,
            border: `1px solid ${BRT.red}`,
            aspectRatio: '4 / 5',
            maxHeight: 260,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbnail}
              alt={fileName}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <div style={{ fontSize: 10, letterSpacing: '0.24em', color: BRT.inkDim }}>
              NO PREVIEW
            </div>
          )}
          <div
            style={{
              position: 'absolute',
              top: 10,
              left: 10,
              fontSize: 9,
              letterSpacing: '0.28em',
              color: BRT.red,
              fontWeight: 800,
              textTransform: 'uppercase',
              background: 'rgba(0,0,0,0.65)',
              padding: '4px 8px',
              fontFamily: BRT_FONT_MONO,
            }}
          >
            {isVideo ? '◉ HERO · ' + fmtTs(result.best_moment?.timestamp ?? 0) : '◉ SCANNED'}
          </div>
          {topPlatform && (
            <div
              style={{
                position: 'absolute',
                bottom: 10,
                left: 10,
                right: 10,
                fontSize: 9,
                letterSpacing: '0.2em',
                color: BRT.ink,
                fontWeight: 700,
                textTransform: 'uppercase',
                background: 'rgba(0,0,0,0.7)',
                padding: '6px 8px',
                fontFamily: BRT_FONT_MONO,
                borderLeft: `2px solid ${BRT.red}`,
              }}
            >
              Post to: <span style={{ color: BRT.red }}>{topPlatform.platform}</span>
            </div>
          )}
        </div>

        {/* Wow + post-it */}
        <div
          style={{
            background: BRT.ticket,
            border: `1px solid ${BRT.red}`,
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            minWidth: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
            <div
              style={{
                fontSize: 9,
                letterSpacing: '0.3em',
                color: BRT.red,
                fontWeight: 800,
                textTransform: 'uppercase',
                fontFamily: BRT_FONT_MONO,
              }}
            >
              ◉ VERDICT
            </div>
            <div
              style={{
                fontSize: 10,
                letterSpacing: '0.22em',
                color: BRT.inkDim,
                fontWeight: 700,
                textTransform: 'uppercase',
                fontFamily: BRT_FONT_MONO,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '70%',
              }}
              title={fileName}
            >
              {fileName}
            </div>
          </div>
          {wow && (
            <div
              style={{
                fontSize: 17,
                lineHeight: 1.35,
                color: BRT.ink,
                fontWeight: 700,
                letterSpacing: '-0.005em',
              }}
            >
              {wow}
            </div>
          )}
          {postIt && (
            <div
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
                paddingTop: 8,
                borderTop: `1px solid ${BRT.divide}`,
              }}
            >
              <span
                style={{
                  fontSize: 9,
                  letterSpacing: '0.28em',
                  color: BRT.red,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  marginTop: 3,
                  fontFamily: BRT_FONT_MONO,
                  flexShrink: 0,
                }}
              >
                ◉ POST IT
              </span>
              <span style={{ fontSize: 13, lineHeight: 1.45, color: BRT.inkSoft }}>
                {postIt}
              </span>
            </div>
          )}
          {cs.reasoning && (
            <div
              style={{
                fontSize: 11,
                lineHeight: 1.55,
                color: BRT.inkDim,
                paddingTop: 6,
                borderTop: `1px solid ${BRT.divide}`,
                marginTop: 'auto',
              }}
            >
              {cleanText(cs.reasoning)}
            </div>
          )}
        </div>

        {/* Composite score meter */}
        <div
          style={{
            background: BRT.ticket,
            border: `1px solid ${BRT.borderBright}`,
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <div
            style={{
              fontSize: 9,
              letterSpacing: '0.3em',
              color: BRT.inkDim,
              fontWeight: 800,
              textTransform: 'uppercase',
              fontFamily: BRT_FONT_MONO,
            }}
          >
            COMPOSITE
          </div>
          <div style={{ position: 'relative', width: RING_SIZE, height: RING_SIZE }}>
            <svg
              width={RING_SIZE}
              height={RING_SIZE}
              style={{ transform: 'rotate(-90deg)' }}
              aria-hidden
            >
              <circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={ringR}
                stroke={BRT.divide}
                strokeWidth={RING_STROKE}
                fill="none"
              />
              <circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={ringR}
                stroke={BRT.red}
                strokeWidth={RING_STROKE}
                fill="none"
                strokeDasharray={ringC}
                strokeDashoffset={ringOffset}
                strokeLinecap="butt"
                style={{ transition: 'stroke-dashoffset 480ms ease-out' }}
              />
            </svg>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 40,
                fontWeight: 900,
                letterSpacing: '-0.04em',
                color: BRT.red,
                lineHeight: 1,
                fontFamily: BRT_FONT_MONO,
              }}
            >
              {composite}
            </div>
          </div>
          <div
            style={{
              fontSize: 9,
              letterSpacing: '0.26em',
              color: BRT.inkDim,
              fontWeight: 700,
              textTransform: 'uppercase',
              fontFamily: BRT_FONT_MONO,
              textAlign: 'center',
            }}
          >
            post-worthy / 100
          </div>
        </div>
      </div>

      {/* MID — sub-dimensions | moments rail */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.2fr 1fr',
          gap: 10,
          minHeight: 0,
        }}
      >
        {/* Sub-dimension bars */}
        <div
          style={{
            background: BRT.ticket,
            border: `1px solid ${BRT.borderBright}`,
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
            }}
          >
            <div
              style={{
                fontSize: 9,
                letterSpacing: '0.3em',
                color: BRT.inkDim,
                fontWeight: 800,
                textTransform: 'uppercase',
                fontFamily: BRT_FONT_MONO,
              }}
            >
              ◉ SCORE BREAKDOWN
            </div>
            <div
              style={{
                fontSize: 9,
                letterSpacing: '0.2em',
                color: BRT.inkFaint,
                fontWeight: 700,
                textTransform: 'uppercase',
                fontFamily: BRT_FONT_MONO,
              }}
            >
              /100
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dims.map((d) => (
              <DimBar key={d.key} label={DIM_LABELS[d.key]} blurb={DIM_BLURB[d.key]} value={d.value} />
            ))}
          </div>
          {cs.shareable_core_note && cs.shareable_core_note.toLowerCase() !== 'none found' && (
            <div
              style={{
                marginTop: 6,
                padding: '8px 10px',
                background: BRT.ticketLo,
                borderLeft: `2px solid ${BRT.red}`,
                fontSize: 11,
                lineHeight: 1.5,
                color: BRT.inkSoft,
              }}
            >
              <span
                style={{
                  fontSize: 9,
                  letterSpacing: '0.24em',
                  color: BRT.red,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  fontFamily: BRT_FONT_MONO,
                  marginRight: 6,
                }}
              >
                SHARE CORE:
              </span>
              {cleanText(cs.shareable_core_note)}
            </div>
          )}
        </div>

        {/* Moment rail */}
        <div
          style={{
            background: BRT.ticket,
            border: `1px solid ${BRT.borderBright}`,
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            minWidth: 0,
            minHeight: 0,
          }}
        >
          <div
            style={{
              fontSize: 9,
              letterSpacing: '0.3em',
              color: BRT.inkDim,
              fontWeight: 800,
              textTransform: 'uppercase',
              fontFamily: BRT_FONT_MONO,
            }}
          >
            ◉ {isVideo ? 'MOMENTS' : 'WHAT THE SCANNER SAW'}
          </div>
          {moments.length === 0 ? (
            <div style={{ fontSize: 12, color: BRT.inkFaint, padding: '12px 0' }}>
              No standout moments flagged.
            </div>
          ) : (
            moments.map((m, i) => <MomentRow key={`${m.timestamp}-${i}`} moment={m} rank={i + 1} isVideo={isVideo} />)
          )}
        </div>
      </div>

      {/* BOT — platform bars + action bar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10 }}>
        {/* Platform ranking */}
        <div
          style={{
            background: BRT.ticket,
            border: `1px solid ${BRT.borderBright}`,
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div
            style={{
              fontSize: 9,
              letterSpacing: '0.3em',
              color: BRT.inkDim,
              fontWeight: 800,
              textTransform: 'uppercase',
              fontFamily: BRT_FONT_MONO,
            }}
          >
            ◉ PLATFORM FIT
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(platforms.length, 1)}, 1fr)`, gap: 8 }}>
            {platforms.length === 0 ? (
              <div style={{ fontSize: 12, color: BRT.inkFaint }}>No ranking returned.</div>
            ) : (
              platforms.map((p, i) => <PlatformBar key={p.platform} platform={p} rank={i + 1} />)
            )}
          </div>
        </div>

        {/* Action bar — energy + tone + tags + skip + next */}
        <div
          style={{
            background: BRT.ticket,
            border: `1px solid ${BRT.red}`,
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <StatChip
              label="Energy"
              value={`${result.overall_energy ?? 0}/10`}
            />
            {result.tone_match && (
              <StatChip
                label="Tone"
                value={cleanText(result.tone_match).split(/[,.]/)[0].slice(0, 32)}
              />
            )}
          </div>
          {tags.length > 0 && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {tags.map((t, i) => (
                <span
                  key={`${t}-${i}`}
                  style={{
                    padding: '3px 7px',
                    border: `1px solid ${i < 3 ? BRT.red : BRT.borderBright}`,
                    color: i < 3 ? BRT.red : BRT.inkDim,
                    fontSize: 9,
                    letterSpacing: '0.2em',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    fontFamily: BRT_FONT_MONO,
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 6 }}>
            {onSkip && (
              <button
                onClick={onSkip}
                style={{
                  flex: '0 1 auto',
                  padding: '12px 16px',
                  background: 'transparent',
                  border: `1px solid ${BRT.borderBright}`,
                  color: BRT.inkDim,
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
                flex: 1,
                padding: '12px 20px',
                background: BRT.red,
                border: 'none',
                color: BRT.bg,
                fontSize: 12,
                letterSpacing: '0.26em',
                fontWeight: 800,
                textTransform: 'uppercase',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Generate captions →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function DimBar({ label, blurb, value }: { label: string; blurb: string; value: number }) {
  const pct = Math.max(0, Math.min(100, value))
  const isHot = pct >= 70
  const isCold = pct < 40
  const barColor = isHot ? BRT.red : isCold ? BRT.inkDim : BRT.inkSoft
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 44px', gap: 10, alignItems: 'center' }}>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '-0.005em',
            color: BRT.ink,
            textTransform: 'uppercase',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 9,
            letterSpacing: '0.08em',
            color: BRT.inkFaint,
            marginTop: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {blurb}
        </div>
      </div>
      <div
        style={{
          height: 8,
          background: BRT.ticketLo,
          border: `1px solid ${BRT.divide}`,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: `${pct}%`,
            background: barColor,
            transition: 'width 520ms ease-out',
          }}
        />
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 800,
          color: isHot ? BRT.red : BRT.ink,
          letterSpacing: '-0.01em',
          textAlign: 'right',
          fontFamily: BRT_FONT_MONO,
        }}
      >
        {pct}
      </div>
    </div>
  )
}

function MomentRow({ moment, rank, isVideo }: { moment: ChainScanResult['moments'][number]; rank: number; isVideo: boolean }) {
  const score = Math.max(0, Math.min(100, moment.score ?? 0))
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '22px auto 1fr 32px',
        gap: 8,
        alignItems: 'center',
        padding: '6px 8px',
        background: rank === 1 ? 'rgba(255,42,26,0.06)' : BRT.ticketLo,
        border: rank === 1 ? `1px solid ${BRT.red}` : '1px solid transparent',
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 9,
          letterSpacing: '0.14em',
          color: rank === 1 ? BRT.red : BRT.inkDim,
          fontWeight: 800,
          fontFamily: BRT_FONT_MONO,
        }}
      >
        #{rank}
      </div>
      {isVideo && (
        <div
          style={{
            fontSize: 10,
            letterSpacing: '0.1em',
            color: BRT.red,
            fontWeight: 800,
            fontFamily: BRT_FONT_MONO,
            minWidth: 32,
          }}
        >
          {fmtTs(moment.timestamp)}
        </div>
      )}
      {!isVideo && (
        <div
          style={{
            fontSize: 9,
            letterSpacing: '0.22em',
            color: BRT.inkDim,
            fontWeight: 700,
            fontFamily: BRT_FONT_MONO,
            textTransform: 'uppercase',
          }}
        >
          {moment.type}
        </div>
      )}
      <div
        style={{
          fontSize: 11,
          color: BRT.inkSoft,
          lineHeight: 1.4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          minWidth: 0,
        }}
      >
        {cleanText(moment.reason)}
      </div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: score >= 70 ? BRT.red : BRT.ink,
          textAlign: 'right',
          fontFamily: BRT_FONT_MONO,
        }}
      >
        {score}
      </div>
    </div>
  )
}

function PlatformBar({
  platform,
  rank,
}: {
  platform: { platform: string; score: number; reason: string }
  rank: number
}) {
  const score = Math.max(0, Math.min(100, platform.score ?? 0))
  const isTop = rank === 1
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '8px 10px',
        background: isTop ? 'rgba(255,42,26,0.05)' : BRT.ticketLo,
        border: isTop ? `1px solid ${BRT.red}` : `1px solid ${BRT.divide}`,
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.12em',
            color: isTop ? BRT.red : BRT.ink,
            textTransform: 'uppercase',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontFamily: BRT_FONT_MONO,
          }}
          title={platform.platform}
        >
          {platform.platform}
        </div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 900,
            color: isTop ? BRT.red : BRT.ink,
            letterSpacing: '-0.02em',
            fontFamily: BRT_FONT_MONO,
          }}
        >
          {score}
        </div>
      </div>
      <div
        style={{
          height: 4,
          background: BRT.divide,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: `${score}%`,
            background: isTop ? BRT.red : BRT.inkSoft,
            transition: 'width 520ms ease-out',
          }}
        />
      </div>
      {platform.reason && (
        <div
          style={{
            fontSize: 10,
            color: BRT.inkDim,
            lineHeight: 1.4,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            marginTop: 2,
          }}
        >
          {cleanText(platform.reason)}
        </div>
      )}
    </div>
  )
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 6,
        padding: '4px 8px',
        background: BRT.ticketLo,
        border: `1px solid ${BRT.borderBright}`,
      }}
    >
      <span
        style={{
          fontSize: 9,
          letterSpacing: '0.22em',
          color: BRT.inkDim,
          fontWeight: 700,
          textTransform: 'uppercase',
          fontFamily: BRT_FONT_MONO,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 12,
          fontWeight: 800,
          color: BRT.ink,
          letterSpacing: '-0.005em',
        }}
      >
        {value}
      </span>
    </div>
  )
}
