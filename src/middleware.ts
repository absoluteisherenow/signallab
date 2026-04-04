import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Paths accessible without a login session
const PUBLIC_PATHS = [
  '/login',
  '/join',      // invoice landing / waitlist signup
  '/pricing',   // public pricing page
  '/landing',   // public sales / landing page
  '/advance',   // external advance request forms (promoters/venues fill these in)
  '/upload',    // public media upload links (pre-show briefs)
  '/privacy',   // public privacy policy (required for Meta App Review)
  '/go',        // promo landing pages for DJs (reaction-gated download)
]

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname

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
    || pathname.startsWith('/api/promo-click') // promo landing page API (public for DJs)
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
