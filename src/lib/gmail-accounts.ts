import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { global: { headers: { 'Accept-Encoding': 'identity' } } }
)

export interface ConnectedAccount {
  id: string
  email: string
  label: string
  needs_reauth?: boolean
  last_error_at?: string | null
  last_error?: string | null
}

// ── Raw fetch Gmail client ──────────────────────────────────────────────────
// Replaces googleapis/gaxios which corrupts responses on Cloudflare Workers.
// Returns an object that matches the shape consumers expect:
//   gmail.users.messages.list({ userId, q, maxResults })
//   gmail.users.messages.get({ userId, id, format })

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1'

interface GmailTokens {
  access_token: string
  refresh_token: string
  expiry_date: number
  accountId: string  // for persisting refreshed tokens
}

async function refreshAccessToken(tokens: GmailTokens): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept-Encoding': 'identity',
    },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json() as { access_token?: string; expires_in?: number; error?: string; error_description?: string }
  if (!data.access_token) {
    // invalid_grant = refresh token revoked/expired. Flag account so scanner
    // skips it silently on future runs until user reconnects in Settings.
    if (data.error === 'invalid_grant' && tokens.accountId && tokens.accountId !== 'legacy') {
      await supabase.from('connected_email_accounts').update({
        needs_reauth: true,
        last_error_at: new Date().toISOString(),
        last_error: data.error_description || data.error,
      }).eq('id', tokens.accountId)
    }
    throw new Error(`Failed to refresh Gmail access token: ${data.error || 'unknown'}`)
  }
  // Persist refreshed token
  const newExpiry = Date.now() + (data.expires_in || 3600) * 1000
  await supabase.from('connected_email_accounts').update({
    access_token: data.access_token,
    token_expiry: newExpiry,
  }).eq('id', tokens.accountId)

  tokens.access_token = data.access_token
  tokens.expiry_date = newExpiry
  return data.access_token
}

async function gmailFetch(tokens: GmailTokens, path: string): Promise<any> {
  // Refresh if expired or expiring in next 60s
  if (tokens.expiry_date < Date.now() + 60_000) {
    await refreshAccessToken(tokens)
  }

  const res = await fetch(`${GMAIL_API}${path}`, {
    headers: {
      'Authorization': `Bearer ${tokens.access_token}`,
      'Accept-Encoding': 'identity',
    },
  })

  if (res.status === 401) {
    // Token expired mid-request — refresh and retry once
    await refreshAccessToken(tokens)
    const retry = await fetch(`${GMAIL_API}${path}`, {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
        'Accept-Encoding': 'identity',
      },
    })
    return retry.json()
  }

  return res.json()
}

async function gmailPost(tokens: GmailTokens, path: string, body: any): Promise<any> {
  if (tokens.expiry_date < Date.now() + 60_000) {
    await refreshAccessToken(tokens)
  }
  const res = await fetch(`${GMAIL_API}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${tokens.access_token}`,
      'Content-Type': 'application/json',
      'Accept-Encoding': 'identity',
    },
    body: JSON.stringify(body),
  })
  return res.json()
}

function makeRawGmailClient(tokens: GmailTokens) {
  return {
    users: {
      threads: {
        async get(params: { userId: string; id: string; format?: string }) {
          const qs = new URLSearchParams()
          if (params.format) qs.set('format', params.format)
          const data = await gmailFetch(tokens, `/users/${params.userId}/threads/${params.id}?${qs}`)
          return { data }
        },
      },
      messages: {
        async list(params: { userId: string; q?: string; maxResults?: number; pageToken?: string }) {
          const qs = new URLSearchParams()
          if (params.q) qs.set('q', params.q)
          if (params.maxResults) qs.set('maxResults', String(params.maxResults))
          if (params.pageToken) qs.set('pageToken', params.pageToken)
          const data = await gmailFetch(tokens, `/users/${params.userId}/messages?${qs}`)
          return { data }
        },
        async get(params: { userId: string; id: string; format?: string }) {
          const qs = new URLSearchParams()
          if (params.format) qs.set('format', params.format)
          const data = await gmailFetch(tokens, `/users/${params.userId}/messages/${params.id}?${qs}`)
          return { data }
        },
        async send(params: { userId: string; requestBody: { raw: string } }) {
          const data = await gmailPost(tokens, `/users/${params.userId}/messages/send`, { raw: params.requestBody.raw })
          return { data }
        },
        async modify(params: { userId: string; id: string; requestBody: { addLabelIds?: string[]; removeLabelIds?: string[] } }) {
          const data = await gmailPost(tokens, `/users/${params.userId}/messages/${params.id}/modify`, params.requestBody)
          return { data }
        },
        attachments: {
          async get(params: { userId: string; messageId: string; id: string }) {
            const data = await gmailFetch(tokens, `/users/${params.userId}/messages/${params.messageId}/attachments/${params.id}`)
            return { data }
          },
        },
      },
    },
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

// Multi-tenant: every function here takes the caller's `userId` and scopes
// queries by it. `connected_email_accounts.user_id` and `artist_settings.user_id`
// are both populated, so no cross-tenant leak is possible if callers use
// `requireUser(req).user.id`.

export async function getGmailClients(userId: string): Promise<Array<{
  gmail: ReturnType<typeof makeRawGmailClient>
  email: string
  label: string
  id: string
}>> {
  if (!userId) throw new Error('getGmailClients: userId required')

  const { data: accounts } = await supabase
    .from('connected_email_accounts')
    .select('*')
    .eq('user_id', userId)
    .or('needs_reauth.is.null,needs_reauth.eq.false')
    .order('created_at', { ascending: true })

  if (!accounts || accounts.length === 0) {
    // Fall back to legacy single-account in artist_settings — also scoped
    // to this user so we don't hand back another tenant's legacy inbox.
    const { data: settings } = await supabase
      .from('artist_settings')
      .select('gmail_access_token, gmail_refresh_token, gmail_token_expiry')
      .eq('user_id', userId)
      .maybeSingle()

    if (!settings?.gmail_refresh_token) {
      throw new Error('No Gmail accounts connected — visit Settings to connect')
    }

    const tokens: GmailTokens = {
      access_token: settings.gmail_access_token,
      refresh_token: settings.gmail_refresh_token,
      expiry_date: settings.gmail_token_expiry,
      accountId: 'legacy',
    }
    return [{ gmail: makeRawGmailClient(tokens), email: 'primary', label: 'Primary', id: 'legacy' }]
  }

  // Build clients, skipping any accounts with invalid/corrupted tokens
  const clients: Array<{
    gmail: ReturnType<typeof makeRawGmailClient>
    email: string
    label: string
    id: string
  }> = []

  for (const acc of accounts) {
    try {
      const isValidToken = (t: unknown): t is string => {
        if (typeof t !== 'string' || t.length < 20) return false
        for (let i = 0; i < Math.min(t.length, 10); i++) {
          const code = t.charCodeAt(i)
          if (code < 32 || code > 126) return false
        }
        return true
      }
      if (!isValidToken(acc.refresh_token)) {
        console.error(`Skipping account ${acc.email}: invalid/corrupted refresh_token`)
        continue
      }
      if (!isValidToken(acc.access_token)) {
        console.error(`Skipping account ${acc.email}: invalid/corrupted access_token`)
        continue
      }

      const tokens: GmailTokens = {
        access_token: acc.access_token,
        refresh_token: acc.refresh_token,
        expiry_date: acc.token_expiry,
        accountId: acc.id,
      }
      clients.push({
        gmail: makeRawGmailClient(tokens),
        email: acc.email,
        label: acc.label,
        id: acc.id,
      })
    } catch (err) {
      console.error(`Skipping account ${acc.email}: ${err instanceof Error ? err.message : 'unknown error'}`)
    }
  }

  // If all multi-account entries failed, fall back to legacy artist_settings
  // — scoped to this caller so we don't return another tenant's legacy inbox.
  if (clients.length === 0) {
    const { data: settings } = await supabase
      .from('artist_settings')
      .select('gmail_access_token, gmail_refresh_token, gmail_token_expiry')
      .eq('user_id', userId)
      .maybeSingle()

    if (settings?.gmail_refresh_token) {
      const tokens: GmailTokens = {
        access_token: settings.gmail_access_token,
        refresh_token: settings.gmail_refresh_token,
        expiry_date: settings.gmail_token_expiry,
        accountId: 'legacy',
      }
      clients.push({ gmail: makeRawGmailClient(tokens), email: 'primary', label: 'Primary', id: 'legacy' })
    }
  }

  if (clients.length === 0) {
    throw new Error('No Gmail accounts connected — visit Settings to connect')
  }

  return clients
}

// Get connected accounts list (no tokens — safe for client display).
export async function listConnectedAccounts(userId: string): Promise<ConnectedAccount[]> {
  if (!userId) throw new Error('listConnectedAccounts: userId required')
  const { data } = await supabase
    .from('connected_email_accounts')
    .select('id, email, label, created_at, needs_reauth, last_error_at, last_error')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  return (data || []) as ConnectedAccount[]
}

// List accounts flagged as needing reauth — scanner surfaces these so user
// can reconnect via Settings instead of scanning silently failing forever.
export async function listAccountsNeedingReauth(userId: string): Promise<Array<{ id: string; email: string; label: string }>> {
  if (!userId) return []
  const { data } = await supabase
    .from('connected_email_accounts')
    .select('id, email, label')
    .eq('user_id', userId)
    .eq('needs_reauth', true)
  return (data || []) as Array<{ id: string; email: string; label: string }>
}

// Double-scoped on BOTH id and user_id — prevents a user from disconnecting
// another tenant's inbox by guessing/leaking an account id.
export async function disconnectAccount(id: string, userId: string) {
  if (!userId) throw new Error('disconnectAccount: userId required')
  await supabase.from('connected_email_accounts').delete().eq('id', id).eq('user_id', userId)
}
