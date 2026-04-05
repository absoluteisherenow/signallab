'use client'

import { useRef, useEffect, useState, useCallback } from 'react'

interface WaveformProps {
  peaks: number[] | null       // normalized 0-1 peak values
  progress?: number            // 0-1 playback position
  onSeek?: (position: number) => void
  height?: number
  barWidth?: number
  barGap?: number
  color?: string
  progressColor?: string
  backgroundColor?: string
  mini?: boolean               // compact mode for track list
}

// Extract waveform peaks from audio URL using Web Audio API
export async function extractPeaks(audioUrl: string, numBars = 200): Promise<number[]> {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
  try {
    const response = await fetch(audioUrl)
    const arrayBuffer = await response.arrayBuffer()
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer)

    const channelData = audioBuffer.getChannelData(0) // mono or left channel
    const samplesPerBar = Math.floor(channelData.length / numBars)
    const peaks: number[] = []

    for (let i = 0; i < numBars; i++) {
      let sum = 0
      const start = i * samplesPerBar
      const end = Math.min(start + samplesPerBar, channelData.length)
      for (let j = start; j < end; j++) {
        sum += Math.abs(channelData[j])
      }
      peaks.push(sum / (end - start))
    }

    // Normalize to 0-1
    const max = Math.max(...peaks, 0.001)
    return peaks.map(p => p / max)
  } finally {
    ctx.close()
  }
}

// Extract peaks from a File object (no fetch needed)
export async function extractPeaksFromFile(file: File, numBars = 200): Promise<number[]> {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
  try {
    const arrayBuffer = await file.arrayBuffer()
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer)

    const channelData = audioBuffer.getChannelData(0)
    const samplesPerBar = Math.floor(channelData.length / numBars)
    const peaks: number[] = []

    for (let i = 0; i < numBars; i++) {
      let sum = 0
      const start = i * samplesPerBar
      const end = Math.min(start + samplesPerBar, channelData.length)
      for (let j = start; j < end; j++) {
        sum += Math.abs(channelData[j])
      }
      peaks.push(sum / (end - start))
    }

    const max = Math.max(...peaks, 0.001)
    return peaks.map(p => p / max)
  } finally {
    ctx.close()
  }
}

export function WaveformDisplay({
  peaks,
  progress = 0,
  onSeek,
  height = 48,
  barWidth = 2,
  barGap = 1,
  color = 'rgba(176, 141, 87, 0.4)',
  progressColor = 'rgba(176, 141, 87, 0.9)',
  backgroundColor = 'transparent',
  mini = false,
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [hovering, setHovering] = useState(false)
  const [hoverX, setHoverX] = useState(0)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !peaks?.length) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const w = rect.width
    const h = rect.height

    ctx.clearRect(0, 0, w, h)

    if (backgroundColor !== 'transparent') {
      ctx.fillStyle = backgroundColor
      ctx.fillRect(0, 0, w, h)
    }

    const totalBarWidth = barWidth + barGap
    const numBars = Math.floor(w / totalBarWidth)
    const step = peaks.length / numBars
    const progressX = progress * w

    for (let i = 0; i < numBars; i++) {
      const peakIdx = Math.floor(i * step)
      const peak = peaks[Math.min(peakIdx, peaks.length - 1)]
      const barH = Math.max(1, peak * (h - 2))
      const x = i * totalBarWidth
      const y = (h - barH) / 2

      ctx.fillStyle = x < progressX ? progressColor : color
      ctx.fillRect(x, y, barWidth, barH)
    }

    // Hover indicator
    if (hovering && onSeek) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.fillRect(hoverX, 0, 1, h)
    }
  }, [peaks, progress, hovering, hoverX, barWidth, barGap, color, progressColor, backgroundColor])

  useEffect(() => {
    draw()
  }, [draw])

  // Redraw on resize
  useEffect(() => {
    const observer = new ResizeObserver(draw)
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [draw])

  if (!peaks?.length) {
    // Placeholder waveform
    return (
      <div style={{
        width: '100%', height: mini ? 24 : height,
        display: 'flex', alignItems: 'center', gap: '1px',
        opacity: 0.15,
      }}>
        {Array.from({ length: mini ? 30 : 60 }, (_, i) => {
          const h = Math.sin(i * 0.3) * 0.3 + 0.4
          return <div key={i} style={{ flex: 1, height: `${h * 100}%`, background: color, minWidth: '1px' }} />
        })}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: mini ? 24 : height, cursor: onSeek ? 'pointer' : 'default', position: 'relative' }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onMouseMove={e => {
        const rect = e.currentTarget.getBoundingClientRect()
        setHoverX(e.clientX - rect.left)
      }}
      onClick={e => {
        if (!onSeek) return
        const rect = e.currentTarget.getBoundingClientRect()
        onSeek((e.clientX - rect.left) / rect.width)
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  )
}
