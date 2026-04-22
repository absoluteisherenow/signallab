// Native bridge detection + helpers.
//
// The web app runs in three places:
//   1. Browser (desktop/mobile Safari/Chrome)
//   2. PWA installed to Home Screen (iOS Safari standalone mode)
//   3. Native wrapper (Capacitor iOS — signallabos.com loaded in WKWebView)
//
// Most code doesn't need to care. But a few things DO:
//   - Share: native share sheet > Web Share API > clipboard fallback
//   - Haptics: only in native
//   - Push notifications: only in native (PWAs on iOS Safari can't receive)
//   - Camera roll access: native gets direct access, web goes through <input>
//
// Usage:
//   import { isNative, isStandalonePWA, platform } from '@/lib/native-bridge'
//   if (isNative()) { /* call Capacitor plugin */ }
//
// Zero runtime cost in browsers — the Capacitor global just doesn't exist.

export type Platform = 'web' | 'pwa' | 'ios-native' | 'android-native'

interface CapacitorGlobal {
  isNativePlatform(): boolean
  getPlatform(): 'web' | 'ios' | 'android'
}

declare global {
  interface Window {
    Capacitor?: CapacitorGlobal
  }
}

export function isNative(): boolean {
  if (typeof window === 'undefined') return false
  return window.Capacitor?.isNativePlatform() ?? false
}

export function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false
  // iOS Safari standalone mode indicator
  const nav = window.navigator as Navigator & { standalone?: boolean }
  if (nav.standalone) return true
  // Android + desktop PWA
  return window.matchMedia?.('(display-mode: standalone)').matches ?? false
}

export function platform(): Platform {
  if (typeof window === 'undefined') return 'web'
  if (window.Capacitor?.isNativePlatform()) {
    const p = window.Capacitor.getPlatform()
    if (p === 'ios') return 'ios-native'
    if (p === 'android') return 'android-native'
  }
  if (isStandalonePWA()) return 'pwa'
  return 'web'
}

// Capabilities — guards that let callers branch without importing Capacitor
// plugins upfront (plugins are bundled into the native app, dynamic-imported
// here so web bundles don't pay the cost).

export const canHaptic = (): boolean => isNative()
export const canPushNotify = (): boolean => isNative()
export const canUseNativeShare = (): boolean => isNative()
export const hasWebShare = (): boolean =>
  typeof navigator !== 'undefined' && typeof (navigator as Navigator & { share?: unknown }).share === 'function'

// Convenience: share that picks the best available surface. Safe to call from
// any environment — degrades to clipboard if nothing else works.
export async function shareOrCopy(payload: { url: string; title?: string; text?: string }): Promise<'native' | 'web-share' | 'clipboard' | 'failed'> {
  if (isNative()) {
    try {
      const { Share } = await import('@capacitor/share')
      await Share.share({ url: payload.url, title: payload.title, text: payload.text })
      return 'native'
    } catch { /* fall through */ }
  }
  if (hasWebShare()) {
    try {
      await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({
        url: payload.url, title: payload.title, text: payload.text,
      })
      return 'web-share'
    } catch { /* user may have cancelled — fall through to clipboard */ }
  }
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(payload.url)
      return 'clipboard'
    } catch {}
  }
  return 'failed'
}

// Light wrapper around native haptics — silent no-op on web.
export async function haptic(style: 'light' | 'medium' | 'heavy' = 'light'): Promise<void> {
  if (!isNative()) return
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
    const map = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy }
    await Haptics.impact({ style: map[style] })
  } catch {}
}
