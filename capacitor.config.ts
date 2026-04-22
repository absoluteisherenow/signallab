import type { CapacitorConfig } from '@capacitor/cli'

// Capacitor config for the iOS (and later Android) wrapper.
//
// Architecture: the native app loads https://signallabos.com directly. We're
// NOT shipping a bundled static build — that would double the codebase and
// force a TestFlight submission for every web-side change. The Cloudflare
// Workers deploy is the source of truth; the shell just provides a webview
// + native plugin bridge (push, camera, share, haptics, biometrics).
//
// `webDir` is still required by the CLI but is unused when `server.url` is
// set. Pointing it at `public/` avoids creating a dummy folder.
const config: CapacitorConfig = {
  appId: 'com.signallab.os',
  appName: 'Signal Lab',
  webDir: 'public',

  server: {
    url: 'https://signallabos.com',
    cleartext: false,
    androidScheme: 'https',
    // Allow navigation to Supabase (auth callback) + Vercel preview domains
    // if we ever fall back to them. Never Vercel for prod — see memory.
    allowNavigation: [
      'signallabos.com',
      '*.signallabos.com',
      'zyxqdaeewyzwscsurxin.supabase.co',
      '*.supabase.co',
      'accounts.google.com',
      'appleid.apple.com',
    ],
  },

  ios: {
    // Respect the iOS home indicator — webview content uses its own
    // safe-area CSS (viewportFit: cover + env(safe-area-inset-*)).
    contentInset: 'never',
    // Disable the swipe-left-to-go-back gesture — conflicts with internal
    // nav. App nav handles back via the shell's bottom bar.
    allowsLinkPreview: false,
    // Limit web content mixed-content surface. Prod site is HTTPS only.
    limitsNavigationsToAppBoundDomains: false,
    // Scheme used for native-to-web links + universal links fallback.
    scheme: 'Signal Lab',
  },

  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#050505',
      overlaysWebView: true,
    },
    SplashScreen: {
      launchShowDuration: 0, // no Capacitor splash — iOS storyboard handles it
      backgroundColor: '#050505',
    },
  },
}

export default config
