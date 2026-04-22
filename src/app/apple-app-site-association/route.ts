import { NextResponse } from 'next/server'

export const dynamic = 'force-static'

// Apple App Site Association (AASA) — iOS fetches this when the user taps a
// signallabos.com link anywhere in the OS. If the file validates, iOS opens
// our native app instead of Safari.
//
// Must:
//   - Serve at https://signallabos.com/.well-known/apple-app-site-association
//   - Content-Type: application/json
//   - No redirects (hence served direct from this Next route, not via R2)
//   - Signed HTTPS — already covered by Cloudflare
//
// appID format: <TEAM_ID>.<BUNDLE_ID>
//   - TEAM_ID = 10-char string from developer.apple.com → Membership
//   - BUNDLE_ID = com.signallab.os (matches capacitor.config.ts)
//
// TEAM_ID isn't set until Apple Developer enrolment completes (order
// W1678285843, in flight). Using env var so we can fill it without code
// change. Fallback is a placeholder Apple will reject — that's intentional:
// prod won't validate until the real Team ID is live.

const TEAM_ID = process.env.APPLE_TEAM_ID || 'TEAMID1234'
const BUNDLE_ID = 'com.signallab.os'

const aasa = {
  applinks: {
    // Empty apps array is legacy — modern iOS ignores it. Kept for older OS.
    apps: [],
    details: [
      {
        appID: `${TEAM_ID}.${BUNDLE_ID}`,
        // Everything on signallabos.com deep-links into the app, EXCEPT:
        //  - /auth/* (OAuth callbacks must stay in browser for Supabase)
        //  - /api/* (backend only, never a user-facing URL)
        //  - /admin/* (desktop-only surfaces)
        //  - /_next/* + static assets
        paths: [
          'NOT /auth/*',
          'NOT /api/*',
          'NOT /admin/*',
          'NOT /_next/*',
          'NOT /favicon*',
          'NOT /*.png',
          'NOT /*.jpg',
          'NOT /*.svg',
          'NOT /*.js',
          'NOT /*.css',
          'NOT /*.woff*',
          '*',
        ],
      },
    ],
  },
  // webcredentials lets Safari offer our app's stored passwords on the site.
  webcredentials: {
    apps: [`${TEAM_ID}.${BUNDLE_ID}`],
  },
}

export async function GET() {
  return NextResponse.json(aasa, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
