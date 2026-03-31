import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Paths accessible without a login session
const PUBLIC_PATHS = [
  '/login',
  '/join',      // invoice landing / waitlist signup
  '/pricing',   // public pricing page
  '/advance',   // external advance request forms (promoters/venues fill these in)
  '/upload',    // public media upload links (pre-show briefs)
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
    || pathname.startsWith('/_next')
    || pathname === '/signal-genius.html'   // M4L jweb — public
    || pathname === '/mockup.html'

  if (isPublic) {
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
