import twilio from 'twilio'

const client = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null

interface SendSmsOptions {
  to: string
  body: string
}

export async function sendSms({ to, body }: SendSmsOptions): Promise<{ success: boolean; sid?: string; error?: string }> {
  if (!client) {
    console.warn('SMS: Twilio not configured — set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN')
    return { success: false, error: 'Twilio not configured' }
  }

  // Prefer Messaging Service SID when set (supports A2P 10DLC + alpha senders);
  // otherwise fall back to a bare from-number. Accept either env-var naming
  // since prod historically uses TWILIO_FROM_NUMBER and older code wrote
  // TWILIO_PHONE_NUMBER.
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID
  const fromNumber = process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER

  if (!messagingServiceSid && !fromNumber) {
    console.warn('SMS: neither TWILIO_MESSAGING_SERVICE_SID nor TWILIO_FROM_NUMBER/TWILIO_PHONE_NUMBER set')
    return { success: false, error: 'No sender phone number' }
  }

  try {
    const payload: Record<string, string> = { to, body: body.slice(0, 1600) }
    if (messagingServiceSid) payload.messagingServiceSid = messagingServiceSid
    else if (fromNumber) payload.from = fromNumber
    const message = await client.messages.create(payload as any)
    return { success: true, sid: message.sid }
  } catch (err: any) {
    console.error('SMS send failed:', err.message)
    return { success: false, error: err.message }
  }
}
