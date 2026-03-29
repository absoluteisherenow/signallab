'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

// Web Speech API types
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition
    webkitSpeechRecognition: new () => SpeechRecognition
  }
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionResultList {
  [index: number]: SpeechRecognitionResult
  length: number
}

interface SpeechRecognitionResult {
  [index: number]: SpeechRecognitionAlternative
  isFinal: boolean
  length: number
}

interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: Event) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

export type VoiceState = 'idle' | 'listening' | 'processing' | 'unsupported'

interface UseVoiceInputOptions {
  onPartial?: (text: string) => void
  onFinal?: (text: string) => void
  onError?: (error: string) => void
  lang?: string
  autoSubmit?: boolean        // auto-call onFinal when speech ends (default: true)
}

export function useVoiceInput(options: UseVoiceInputOptions = {}) {
  const {
    onPartial,
    onFinal,
    onError,
    lang = 'en-GB',
    autoSubmit = true,
  } = options

  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [transcript, setTranscript] = useState('')
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const finalRef = useRef('')

  const isSupported = typeof window !== 'undefined' &&
    (!!window.SpeechRecognition || !!window.webkitSpeechRecognition)

  useEffect(() => {
    if (!isSupported) setVoiceState('unsupported')
  }, [isSupported])

  const start = useCallback(() => {
    if (!isSupported) {
      onError?.('Speech recognition not supported in this browser')
      return
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SR()

    recognition.continuous     = false
    recognition.interimResults = true
    recognition.lang           = lang

    recognition.onstart = () => {
      setVoiceState('listening')
      setTranscript('')
      finalRef.current = ''
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimText = ''
      let finalText   = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text   = result[0].transcript
        if (result.isFinal) {
          finalText += text
        } else {
          interimText += text
        }
      }

      const current = finalRef.current + finalText + interimText
      setTranscript(current)
      onPartial?.(current)

      if (finalText) {
        finalRef.current += finalText
      }
    }

    recognition.onend = () => {
      setVoiceState(autoSubmit ? 'processing' : 'idle')
      const finalTranscript = finalRef.current || transcript
      setTranscript(finalTranscript)
      if (autoSubmit && finalTranscript.trim()) {
        onFinal?.(finalTranscript.trim())
      }
      recognitionRef.current = null
    }

    recognition.onerror = (event: Event) => {
      const err = (event as unknown as { error: string }).error
      setVoiceState('idle')
      setTranscript('')
      recognitionRef.current = null
      if (err !== 'no-speech' && err !== 'aborted') {
        onError?.(err || 'Speech recognition error')
      }
    }

    recognitionRef.current = recognition
    recognition.start()
  }, [isSupported, lang, onPartial, onFinal, onError, autoSubmit, transcript])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
    setVoiceState('idle')
  }, [])

  const toggle = useCallback(() => {
    if (voiceState === 'listening') {
      stop()
    } else {
      start()
    }
  }, [voiceState, start, stop])

  return {
    voiceState,
    transcript,
    isSupported,
    isListening: voiceState === 'listening',
    start,
    stop,
    toggle,
  }
}
