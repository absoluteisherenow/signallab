import { NextRequest, NextResponse } from 'next/server'
import { listConnectedAccounts, disconnectAccount } from '@/lib/gmail-accounts'

export async function GET() {
  try {
    const accounts = await listConnectedAccounts()
    return NextResponse.json({ accounts })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ accounts: [], error: message })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    await disconnectAccount(id)
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
