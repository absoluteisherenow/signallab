import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export interface ConnectedAccount {
  id: string
  email: string
  label: string
}

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'https://signal-lab-rebuild.vercel.app/api/gmail/callback'
  )
}

// Returns a Gmail client for a single connected account row
function makeGmailClient(account: {
  id: string
  email: string
  label: string
  access_token: string
  refresh_token: string
  token_expiry: number
}) {
  const oauth2Client = getOAuthClient()
  oauth2Client.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
    expiry_date: account.token_expiry,
  })
  // Auto-refresh
  oauth2Client.on('tokens', async (tokens) => {
    await supabase.from('connected_email_accounts').update({
      access_token: tokens.access_token,
      token_expiry: tokens.expiry_date,
    }).eq('id', account.id)
  })
  return google.gmail({ version: 'v1', auth: oauth2Client })
}

// Returns all connected Gmail clients + their metadata
export async function getGmailClients(): Promise<Array<{
  gmail: ReturnType<typeof google.gmail>
  email: string
  label: string
  id: string
}>> {
  const { data: accounts } = await supabase
    .from('connected_email_accounts')
    .select('*')
    .order('created_at', { ascending: true })

  if (!accounts || accounts.length === 0) {
    // Fall back to legacy single-account in artist_settings
    const { data: settings } = await supabase
      .from('artist_settings')
      .select('gmail_access_token, gmail_refresh_token, gmail_token_expiry')
      .single()

    if (!settings?.gmail_refresh_token) {
      throw new Error('No Gmail accounts connected — visit Settings to connect')
    }

    const legacyAccount = {
      id: 'legacy',
      email: 'primary',
      label: 'Primary',
      access_token: settings.gmail_access_token,
      refresh_token: settings.gmail_refresh_token,
      token_expiry: settings.gmail_token_expiry,
    }
    return [{ gmail: makeGmailClient(legacyAccount), email: 'primary', label: 'Primary', id: 'legacy' }]
  }

  return accounts.map((acc: any) => ({
    gmail: makeGmailClient(acc),
    email: acc.email,
    label: acc.label,
    id: acc.id,
  }))
}

// Get connected accounts list (no tokens — safe for client display)
export async function listConnectedAccounts(): Promise<ConnectedAccount[]> {
  const { data } = await supabase
    .from('connected_email_accounts')
    .select('id, email, label, created_at')
    .order('created_at', { ascending: true })
  return (data || []) as ConnectedAccount[]
}

export async function disconnectAccount(id: string) {
  await supabase.from('connected_email_accounts').delete().eq('id', id)
}
