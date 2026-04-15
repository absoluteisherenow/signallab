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

  if (!process.env.TWILIO_PHONE_NUMBER) {
    console.warn('SMS: TWILIO_PHONE_NUMBER not set')
    return { success: false, error: 'No sender phone number' }
  }

  try {
    const message = await client.messages.create({
      to,
      from: process.env.TWILIO_PHONE_NUMBER,
      body: body.slice(0, 1600), // Twilio max
    })
    return { success: true, sid: message.sid }
  } catch (err: any) {
    console.error('SMS send failed:', err.message)
    return { success: false, error: err.message }
  }
}
