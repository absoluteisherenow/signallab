import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/', '/login', '/onboarding', '/advance', '/dashboard', '/broadcast', '/logistics', '/business', '/sonix', '/setlab', '/contracts', '/maxforlive', '/gigs', '/calendar', '/notifications', '/pricing']

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname
  
  // Check if path is public or API (includes subroutes)
  const isPublic = PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
    || pathname.startsWith('/api/social')   // social OAuth callbacks — must be public
    || pathname.startsWith('/api')
    || pathname.startsWith('/_next')
    || pathname === '/signal-genius.html'   // M4L jweb — public, no auth needed
    || pathname === '/mockup.html'          // Design mockups — no auth needed
  
  if (isPublic) {
    return NextResponse.next()
  }
  
  // Check for Supabase session cookie
  // The auth-helpers package sets a specific cookie
  const sessionCookie = req.cookies.get('sb-auth-token')
  const sbServerOnlyAuth = req.cookies.get('sb-lfcxdxfhffqeaqmq-auth-token')
  
  // If no session and path is protected, redirect to login
  if (!sessionCookie && !sbServerOnlyAuth && !isPublic) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }
  
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
