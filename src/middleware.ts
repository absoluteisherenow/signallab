import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/', '/login', '/onboarding', '/advance']

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname
  
  // Check if path is public or API
  const isPublic = PUBLIC_PATHS.includes(pathname) || pathname.startsWith('/api') || pathname.startsWith('/_next')
  
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
