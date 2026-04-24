'use client'

// Push opt-in control for Settings. Wraps the subscribe/unsubscribe flow so
// users don't have to paste console snippets. Does nothing (renders nothing)
// in browsers without Push support — iOS Safari on older versions, private
// windows, etc.
//
// Lives in Settings → Notifications next to the existing email/SMS toggles.

import { useEffect, useState } from 'react'
import {
  webPushSupported,
  currentPushSubscription,
  subscribeToWebPush,
  unsubscribeFromWebPush,
} from '@/lib/web-push-client'

type State = 'loading' | 'unsupported' | 'disabled' | 'denied' | 'enabled' | 'busy'

export function PushOptIn() {
  const [state, setState] = useState<State>('loading')
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!webPushSupported()) {
        if (alive) setState('unsupported')
        return
      }
      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
        if (alive) setState('denied')
        return
      }
      const sub = await currentPushSubscription()
      if (alive) setState(sub ? 'enabled' : 'disabled')
    })()
    return () => { alive = false }
  }, [])

  if (state === 'loading' || state === 'unsupported') return null

  async function enable() {
    setState('busy')
    setMsg(null)
    const sub = await subscribeToWebPush()
    if (!sub) {
      setMsg('Could not enable — check your browser notification settings.')
      setState(typeof Notification !== 'undefined' && Notification.permission === 'denied' ? 'denied' : 'disabled')
      return
    }
    setState('enabled')
  }

  async function disable() {
    setState('busy')
    setMsg(null)
    await unsubscribeFromWebPush()
    setState('disabled')
  }

  async function sendTest() {
    setMsg(null)
    try {
      const res = await fetch('/api/push/test', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Signal Lab', body: 'Push works ✓', href: '/today' }),
      })
      const body = await res.json()
      if (!res.ok) setMsg(body.error || `test failed: ${res.status}`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'test failed')
    }
  }

  const busy = state === 'busy'

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-night-light">
          Browser push notifications
          {state === 'denied' && (
            <span className="ml-2 text-xs text-red-400">Blocked — change it in your browser permissions</span>
          )}
        </span>
        {state === 'enabled' ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={sendTest}
              className="text-xs uppercase tracking-wider px-3 py-2 border border-night-dark-gray text-night-silver hover:bg-night-dark-gray/50"
            >
              Test
            </button>
            <button
              type="button"
              onClick={disable}
              disabled={busy}
              className="text-xs uppercase tracking-wider px-3 py-2 border border-night-dark-gray text-night-silver hover:bg-night-dark-gray/50 disabled:opacity-50"
            >
              Disable
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={enable}
            disabled={busy || state === 'denied'}
            className="text-xs uppercase tracking-wider px-3 py-2 border border-night-silver text-night-silver hover:bg-night-silver hover:text-night-black disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? 'Enabling…' : 'Enable'}
          </button>
        )}
      </div>
      {msg && <p className="text-xs text-red-400">{msg}</p>}
    </div>
  )
}
