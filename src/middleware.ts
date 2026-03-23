import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC = ['/login', '/welcome', '/onboarding', '/advance', '/api']

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname
  const isPublic = pathname === '/' || PUBLIC.some(p => pathname.startsWith(p))
  
  // Placeholder: Auth check would go here
  // For now, allow all routes — replace with real auth once implemented
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
