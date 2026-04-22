'use client'

// Runs once when the Capacitor wrapper hydrates. Requests push permission,
// registers the APNs/FCM token with /api/devices/register, and wires listeners
// so token rotation gets re-upserted.
//
// Silent no-op in web / PWA — the Capacitor global doesn't exist so none of
// this code runs past the first `isNative()` check. Safe to mount
// unconditionally in the root layout.

import { useEffect } from 'react'
import { isNative, platform } from '@/lib/native-bridge'

let booted = false

async function registerToken(token: string) {
  try {
    await fetch('/api/devices/register', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: platform() === 'ios-native' ? 'ios' : 'android',
        token,
        bundle_id: 'com.signallab.os',
        environment: 'production',
      }),
    })
  } catch (e) {
    console.warn('[native-boot] register failed', e)
  }
}

export function NativeBoot() {
  useEffect(() => {
    if (booted || !isNative()) return
    booted = true

    ;(async () => {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications')

        const perm = await PushNotifications.checkPermissions()
        if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
          const req = await PushNotifications.requestPermissions()
          if (req.receive !== 'granted') return
        } else if (perm.receive !== 'granted') {
          return
        }

        await PushNotifications.register()

        await PushNotifications.addListener('registration', (t) => {
          void registerToken(t.value)
        })

        await PushNotifications.addListener('registrationError', (e) => {
          console.warn('[native-boot] push registration error', e)
        })

        // Tap on a delivered notification — route to the href we stashed in
        // the APNs payload (see src/lib/notifications.ts step 3).
        await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
          const data = action.notification.data as { href?: string } | undefined
          const href = data?.href
          if (href && typeof href === 'string' && href.startsWith('/')) {
            try { window.location.assign(href) } catch {}
          }
        })
      } catch (e) {
        console.warn('[native-boot] plugin load failed', e)
      }
    })()
  }, [])

  return null
}
