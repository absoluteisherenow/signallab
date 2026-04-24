'use client'

import { useCallback, useRef, useState } from 'react'
import { BRT } from '@/lib/design/brt'
import { isMtsFile, transcodeMtsToMp4 } from '@/lib/ffmpeg-transcode'

interface Props {
  onMedia: (files: File[]) => void
  voiceTrained?: boolean
  onReject?: (message: string) => void
}

type TranscodeStatus =
  | { kind: 'idle' }
  | { kind: 'loading'; fileName: string }
  | { kind: 'running'; fileName: string; percent: number; index: number; total: number }

/**
 * PhaseDrop — Phase 1 of the chain. Full-body hero dropzone.
 *
 * Uses the native `<label htmlFor>` pattern to trigger the file picker.
 * That's the only click path guaranteed to open the picker in every browser
 * without dispatching synthetic click events that can bubble, be suppressed
 * by focus rules, or get blocked when the trigger isn't in the event loop's
 * user-gesture stack. No programmatic `.click()` call, no re-entry guards.
 */
export function PhaseDrop({ onMedia, voiceTrained = false, onReject }: Props) {
  const inputId = 'chain-phase-drop-input'
  const [drag, setDrag] = useState(false)
  const [transcode, setTranscode] = useState<TranscodeStatus>({ kind: 'idle' })
  const dragDepthRef = useRef(0) // track nested dragenter/leave across children

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const all = Array.from(files)

    // MTS / M2TS: MPEG-TS camera containers. Chrome has no decoder, so we
    // transcode in-browser via ffmpeg.wasm (remux H.264 stream, re-encode
    // audio only — ~50× faster than full re-encode) before handing the
    // resulting MP4 to the scan pipeline.
    const mts = all.filter(isMtsFile)
    const nonMts = all.filter((f) => !isMtsFile(f))

    let converted: File[] = []
    if (mts.length > 0) {
      try {
        for (let i = 0; i < mts.length; i++) {
          const f = mts[i]
          setTranscode({ kind: 'loading', fileName: f.name })
          const mp4 = await transcodeMtsToMp4(f, (p) => {
            if (p.stage === 'transcoding') {
              setTranscode({
                kind: 'running',
                fileName: f.name,
                percent: p.percent ?? 0,
                index: i,
                total: mts.length,
              })
            }
          })
          converted.push(mp4)
        }
      } catch (e) {
        setTranscode({ kind: 'idle' })
        onReject?.(
          'MTS transcode failed: ' +
            (e instanceof Error ? e.message : String(e)) +
            '. Fallback: convert with ffmpeg CLI instead.',
        )
        return
      } finally {
        setTranscode({ kind: 'idle' })
      }
    }

    const merged = [...nonMts, ...converted]
    const arr = merged.filter((f) => /^image\/|^video\//.test(f.type))
    if (arr.length === 0) {
      onReject?.('No supported media in that drop. Use images or video (MP4 / MOV / WebM).')
      return
    }
    onMedia(arr)
  }, [onMedia, onReject])

  return (
    <label
      htmlFor={inputId}
      onDragEnter={(e) => {
        e.preventDefault()
        dragDepthRef.current++
        setDrag(true)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        // must stay true while we're over any descendant; don't toggle here
      }}
      onDragLeave={(e) => {
        e.preventDefault()
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
        if (dragDepthRef.current === 0) setDrag(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        dragDepthRef.current = 0
        setDrag(false)
        handleFiles(e.dataTransfer.files)
      }}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        border: `2px dashed ${drag ? BRT.red : BRT.borderBright}`,
        background: drag ? 'rgba(255,42,26,0.03)' : 'transparent',
        cursor: 'pointer',
        position: 'relative',
        transition: 'border-color .15s ease, background .15s ease',
      }}
    >
      {/* Visually hidden but focusable + clickable via the wrapping label.
          `display: none` can fail to open the picker in some edge cases —
          off-screen positioning keeps the element in the accessibility tree
          and guarantees the native click path works. */}
      <input
        id={inputId}
        type="file"
        accept="image/*,video/*"
        multiple
        onChange={(e) => {
          handleFiles(e.target.files)
          // allow re-selecting the same file later
          e.target.value = ''
        }}
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: 'none',
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: 14,
          left: 16,
          fontSize: 10,
          letterSpacing: '0.26em',
          color: '#5a5a5a',
          fontWeight: 700,
          textTransform: 'uppercase',
        }}
      >
        ◉ Drop media
      </div>
      <div
        style={{
          position: 'absolute',
          top: 14,
          right: 16,
          fontSize: 10,
          letterSpacing: '0.26em',
          color: BRT.red,
          fontWeight: 700,
          textTransform: 'uppercase',
        }}
      >
        1 file · or 5 · any
      </div>

      <div
        style={{
          fontSize: 11,
          letterSpacing: '0.32em',
          color: '#5a5a5a',
          fontWeight: 700,
          textTransform: 'uppercase',
        }}
      >
        What happened?
      </div>
      <div
        style={{
          fontSize: 'clamp(180px, 24vw, 380px)',
          fontWeight: 900,
          lineHeight: 0.82,
          letterSpacing: '-0.06em',
          textAlign: 'center',
          color: BRT.ink,
        }}
      >
        DROP
      </div>
      <div
        style={{
          fontSize: 11,
          letterSpacing: '0.22em',
          color: BRT.dimmest,
          fontWeight: 700,
          textTransform: 'uppercase',
        }}
      >
        MP4 · MOV · PNG · JPG · or paste a link
      </div>

      {transcode.kind !== 'idle' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.72)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            zIndex: 10,
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: '0.32em',
              color: BRT.red,
              fontWeight: 700,
              textTransform: 'uppercase',
            }}
          >
            ◉ Transcoding MTS → MP4
          </div>
          <div
            style={{
              fontSize: 'clamp(48px, 8vw, 96px)',
              fontWeight: 900,
              lineHeight: 0.9,
              letterSpacing: '-0.04em',
              color: BRT.ink,
            }}
          >
            {transcode.kind === 'loading'
              ? 'LOADING'
              : `${transcode.percent}%`}
          </div>
          <div
            style={{
              fontSize: 11,
              letterSpacing: '0.22em',
              color: BRT.dimmest,
              fontWeight: 700,
              textTransform: 'uppercase',
              maxWidth: '80%',
              textAlign: 'center',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {transcode.kind === 'loading'
              ? `Loading ffmpeg · ${transcode.fileName}`
              : `${transcode.fileName} · ${transcode.index + 1} / ${transcode.total}`}
          </div>
          {transcode.kind === 'running' && (
            <div
              style={{
                width: '60%',
                height: 4,
                background: 'rgba(255,255,255,0.08)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${transcode.percent}%`,
                  height: '100%',
                  background: BRT.red,
                  transition: 'width .2s ease',
                }}
              />
            </div>
          )}
          <div
            style={{
              fontSize: 10,
              letterSpacing: '0.22em',
              color: BRT.dimmest,
              fontWeight: 700,
              textTransform: 'uppercase',
            }}
          >
            H.264 remux · ~50× faster than re-encode
          </div>
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          right: 16,
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 10,
          letterSpacing: '0.22em',
          color: BRT.dimmest,
          fontWeight: 700,
          textTransform: 'uppercase',
        }}
      >
        <span>Click or drag · anywhere on this page</span>
        <span>
          Voice ·{' '}
          <span style={{ color: voiceTrained ? BRT.green : BRT.red }}>
            ● {voiceTrained ? 'trained' : 'not trained'}
          </span>
        </span>
      </div>
    </label>
  )
}
