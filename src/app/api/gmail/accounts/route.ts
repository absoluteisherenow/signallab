import { NextRequest, NextResponse } from 'next/server'
import { listConnectedAccounts, disconnectAccount } from '@/lib/gmail-accounts'
import { requireUser } from '@/lib/api-auth'

// Dashboard endpoints — always user-scoped. Previously an open endpoint
// which let any visitor list/disconnect any tenant's connected Gmail.
export async function GET(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  try {
    const accounts = await listConnectedAccounts(gate.user.id)
    return NextResponse.json({ accounts })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ accounts: [], error: message })
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    await disconnectAccount(id, gate.user.id)
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
