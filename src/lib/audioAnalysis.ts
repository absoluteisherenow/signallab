/**
 * Client-side audio analysis using Web Audio API
 * Extracts BPM from audio files (MP3, WAV, FLAC, AAC)
 * No server-side dependencies needed
 */

export interface AudioAnalysisResult {
  bpm: number
  duration: string    // M:SS format
  durationSec: number
  fileName: string
  artist: string
  title: string
  confidence: 'high' | 'medium' | 'low'
}

/**
 * Decode audio file and extract BPM + duration
 */
export async function analyseAudioFile(file: File): Promise<AudioAnalysisResult> {
  // Parse artist/title from filename
  const { artist, title } = parseFilename(file.name)

  // Decode audio
  const arrayBuffer = await file.arrayBuffer()
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

  // Get duration
  const durationSec = Math.round(audioBuffer.duration)
  const minutes = Math.floor(durationSec / 60)
  const seconds = durationSec % 60
  const duration = `${minutes}:${seconds.toString().padStart(2, '0')}`

  // Extract BPM
  const { bpm, confidence } = detectBPM(audioBuffer)

  audioContext.close()

  return { bpm, duration, durationSec, fileName: file.name, artist, title, confidence }
}

/**
 * Parse artist and title from common filename formats:
 * "Artist - Title.mp3"
 * "Artist — Title.mp3"
 * "01 Artist - Title.mp3"
 * "Title.mp3" (no artist)
 */
function parseFilename(filename: string): { artist: string; title: string } {
  // Remove extension
  const name = filename.replace(/\.(mp3|wav|flac|aac|m4a|ogg|aiff?)$/i, '').trim()

  // Remove leading track numbers like "01 " or "01. " or "01 - "
  const cleaned = name.replace(/^\d{1,3}[\s.\-_]+/, '').trim()

  // Try splitting on common delimiters
  const delimiters = [' — ', ' - ', ' – ', ' _ ']
  for (const delim of delimiters) {
    if (cleaned.includes(delim)) {
      const parts = cleaned.split(delim)
      return {
        artist: parts[0].trim(),
        title: parts.slice(1).join(delim).trim(),
      }
    }
  }

  // No delimiter found — just use as title
  return { artist: '', title: cleaned }
}

/**
 * BPM detection using onset detection + autocorrelation
 * Works on the low-frequency band (kick drum detection)
 */
function detectBPM(audioBuffer: AudioBuffer): { bpm: number; confidence: 'high' | 'medium' | 'low' } {
  // Get mono channel data
  const channelData = audioBuffer.getChannelData(0)
  const sampleRate = audioBuffer.sampleRate

  // Use a section from the middle of the track (most stable rhythm)
  const analysisLength = Math.min(sampleRate * 30, channelData.length) // 30 seconds max
  const startOffset = Math.max(0, Math.floor((channelData.length - analysisLength) / 2))
  const samples = channelData.slice(startOffset, startOffset + analysisLength)

  // Low-pass filter to isolate kick/bass (< 200Hz)
  const filtered = lowPassFilter(samples, sampleRate, 200)

  // Compute energy envelope
  const hopSize = Math.floor(sampleRate / 100) // 10ms hops
  const envelope = computeEnvelope(filtered, hopSize)

  // Onset detection (spectral flux)
  const onsets = detectOnsets(envelope)

  // Autocorrelation on onset signal
  const { bpm, confidence } = autocorrelationBPM(onsets, sampleRate / hopSize)

  return { bpm, confidence }
}

/**
 * Simple low-pass filter (single-pole IIR)
 */
function lowPassFilter(data: Float32Array, sampleRate: number, cutoff: number): Float32Array {
  const rc = 1.0 / (2.0 * Math.PI * cutoff)
  const dt = 1.0 / sampleRate
  const alpha = dt / (rc + dt)
  const filtered = new Float32Array(data.length)
  filtered[0] = data[0]
  for (let i = 1; i < data.length; i++) {
    filtered[i] = filtered[i - 1] + alpha * (data[i] - filtered[i - 1])
  }
  return filtered
}

/**
 * Compute RMS energy envelope
 */
function computeEnvelope(data: Float32Array, hopSize: number): Float32Array {
  const numFrames = Math.floor(data.length / hopSize)
  const envelope = new Float32Array(numFrames)
  for (let i = 0; i < numFrames; i++) {
    let sum = 0
    const start = i * hopSize
    const end = Math.min(start + hopSize, data.length)
    for (let j = start; j < end; j++) {
      sum += data[j] * data[j]
    }
    envelope[i] = Math.sqrt(sum / (end - start))
  }
  return envelope
}

/**
 * Simple onset detection via first-order difference
 */
function detectOnsets(envelope: Float32Array): Float32Array {
  const onsets = new Float32Array(envelope.length)
  for (let i = 1; i < envelope.length; i++) {
    onsets[i] = Math.max(0, envelope[i] - envelope[i - 1])
  }
  return onsets
}

/**
 * Autocorrelation-based BPM detection
 * Searches for periodicities in the 60-180 BPM range
 */
function autocorrelationBPM(
  onsets: Float32Array,
  frameRate: number
): { bpm: number; confidence: 'high' | 'medium' | 'low' } {
  const minBPM = 60
  const maxBPM = 180

  // Convert BPM range to lag range (in frames)
  const minLag = Math.floor((60 / maxBPM) * frameRate)
  const maxLag = Math.ceil((60 / minBPM) * frameRate)

  // Compute autocorrelation for each lag
  let bestLag = minLag
  let bestCorr = -Infinity
  let totalCorr = 0
  let corrCount = 0

  for (let lag = minLag; lag <= maxLag && lag < onsets.length; lag++) {
    let corr = 0
    let count = 0
    for (let i = 0; i < onsets.length - lag; i++) {
      corr += onsets[i] * onsets[i + lag]
      count++
    }
    if (count > 0) {
      corr /= count
      totalCorr += corr
      corrCount++
      if (corr > bestCorr) {
        bestCorr = corr
        bestLag = lag
      }
    }
  }

  // Convert lag to BPM
  let bpm = Math.round((60 * frameRate) / bestLag)

  // Normalize BPM to common range (handle half-time / double-time)
  if (bpm < 70) bpm *= 2
  if (bpm > 170) bpm = Math.round(bpm / 2)

  // Confidence based on how strong the peak is vs average
  const avgCorr = corrCount > 0 ? totalCorr / corrCount : 0
  const peakRatio = avgCorr > 0 ? bestCorr / avgCorr : 0

  let confidence: 'high' | 'medium' | 'low'
  if (peakRatio > 3.0) confidence = 'high'
  else if (peakRatio > 1.8) confidence = 'medium'
  else confidence = 'low'

  return { bpm, confidence }
}
