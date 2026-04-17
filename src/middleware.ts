import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Paths accessible without a login session
const PUBLIC_PATHS = [
  '/login',
  '/join',      // legacy → redirects to /landing
  '/waitlist',  // legacy → redirects to /landing
  '/pricing',   // legacy → redirects to /landing (canonical marketing URL is /landing)
  '/landing',   // canonical public marketing page (pricing tiers + waitlist CTA)
  '/advance',   // external advance request forms (promoters/venues fill these in)
  '/upload',    // public media upload links (pre-show briefs)
  '/privacy',   // public privacy policy (required for Meta App Review)
  '/go',        // promo landing pages for DJs (reaction-gated download)
  '/pricing-preview', // temporary: restored deleted pricing page for review
  '/brt',       // brutalist marketing landing (preview)
  '/gl',        // public guest-list signup pages (/gl/<slug>)
]

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname

  // ── Root `/` ─────────────────────────────────────────────────────────────
  // Marketing page for unauth visitors. Authed users skip the marketing page
  // and land in the dashboard. We do NOT want a returning artist to see the
  // pitch every time they open the app.
  // `?preview=1` lets authed users review the marketing page without logging out.
  if (pathname === '/') {
    if (req.nextUrl.searchParams.has('preview')) {
      return NextResponse.next()
    }
    const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0] || ''
    const hasSession =
      req.cookies.get('sb-access-token')?.value ||
      req.cookies.get(`sb-${projectRef}-auth-token`)?.value ||
      req.cookies.get(`sb-${projectRef}-auth-token.0`)?.value
    if (hasSession) {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
    return NextResponse.next()
  }

  const isPublic = PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
    || pathname.startsWith('/api/auth')     // Supabase auth callbacks — public
    || pathname.startsWith('/auth')         // Supabase OAuth redirect — public
    || pathname.startsWith('/api/waitlist') // waitlist signup — public
    || pathname.startsWith('/api/social')   // social OAuth callbacks — public
    || pathname.startsWith('/api/advance')  // advance form submissions — public
    || pathname.startsWith('/api/invoices') // invoice view for promoters — public
    || pathname.startsWith('/api/gmail')    // Gmail cron + OAuth callbacks
    || pathname.startsWith('/api/agents')   // Vercel cron agents (weekly-content, post-gig, etc.)
    || pathname.startsWith('/api/crons')    // Vercel cron jobs (night-before, sync-performance, etc.)
    || pathname.startsWith('/api/promo')       // promo system (blast, click, stats, reactions)
    || pathname.startsWith('/api/tracks')  // Set Lab tracks API (uses service role key)
    || pathname.startsWith('/api/sets')    // Set Lab sets API
    || pathname.startsWith('/api/artist-scan') // artist scan API
    || pathname.startsWith('/api/instagram')   // instagram sync API
    || pathname.startsWith('/api/sms')        // Twilio inbound SMS webhook
    || pathname.startsWith('/api/crew-briefing') // crew briefing send endpoint
    || pathname.startsWith('/api/upload')     // public file upload (photographer content)
    || pathname.startsWith('/api/media/scan') // auto-scan after upload (server-side)
    || pathname.startsWith('/api/gl')         // public guest-list submission endpoints
    || pathname.startsWith('/_next')
    || pathname === '/signal-genius.html'   // M4L jweb — public
    || pathname === '/mockup.html'

  if (isPublic) {
    return NextResponse.next()
  }

  // Check for a Supabase session cookie (auth-helpers sets sb-<ref>-auth-token)
  const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0] || ''
  const token =
    req.cookies.get('sb-access-token')?.value ||
    req.cookies.get(`sb-${projectRef}-auth-token`)?.value ||
    req.cookies.get(`sb-${projectRef}-auth-token.0`)?.value

  if (!token) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$|.*\\.ico$|.*\\.webp$|manifest\\.json$|sw\\.js$).*)'],
}
