import { NextResponse } from 'next/server'

// TODO: Replace with real per-user token generation backed by a `vst_tokens`
// Supabase table once auth is wired up. For now this returns a stable demo
// token so the Sonix Lab VST plugin has something to authenticate against
// without blocking development.
export async function GET() {
  return NextResponse.json({
    token: 'demo-token-signallab-2026',
    artist: 'Night Manoeuvres',
  })
}
