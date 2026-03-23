# Email Contract Workflow Setup

## Overview
Agents forward booking contracts to **advancingabsolute@gmail.com**, which automatically:
1. Parses the email + attachments with Claude
2. Extracts gig details (venue, date, time, fee, etc.)
3. Creates gig in Supabase
4. Sends artist a confirmation email

## Architecture

```
Agent Email (contracts@venue.com)
    ↓
Gmail: advancingabsolute@gmail.com
    ↓
Resend Email Forwarding (via Rules/Integration)
    ↓
POST /api/contracts/email
    ↓
Claude (extract contract)
    ↓
Supabase: CREATE gigs
    ↓
Resend: Send artist notification
```

## Implementation Steps

### 1. **Email Inbox Setup** (Gmail / Email Provider)
- **Email:** advancingabsolute@gmail.com
- **Create a filter/rule** to forward all incoming emails to your webhook
- OR set up Resend Email Forwarding to post to your webhook

### 2. **Resend Email Forwarding** (Anthony / Your DevOps)
Resend provides email forwarding via their API. Set up a rule like:

```
Forward advancingabsolute@gmail.com → POST to:
https://signal-lab-rebuild.vercel.app/api/contracts/email
```

**Request body format (Resend sends):**
```json
{
  "from": "agent@venue.com",
  "to": "advancingabsolute@gmail.com",
  "subject": "Booking Confirmation: Electric Nights Festival",
  "text": "...",
  "html": "...",
  "attachments": [
    {
      "filename": "contract.pdf",
      "content": "base64-encoded-pdf",
      "contentType": "application/pdf"
    }
  ]
}
```

**Resend Setup Reference:**
- Docs: https://resend.com/docs/features/email-routing
- Dashboard: https://resend.com/emails
- Create a "Route" for advancingabsolute@gmail.com → webhook

### 3. **Webhook Endpoint**
- **Path:** `/api/contracts/email`
- **Method:** POST
- **Status:** Ready to receive emails

**Response on success (200):**
```json
{
  "success": true,
  "message": "Contract processed and gig created",
  "gig": {
    "id": "uuid",
    "title": "Electric Nights Festival",
    "venue": "Tresor Club",
    "date": "2026-04-15",
    "fee": 5000
  }
}
```

**Response on error (400/500):**
```json
{
  "success": false,
  "error": "Could not extract required fields",
  "extracted": { ... }
}
```

### 4. **Claude Extraction**
The endpoint parses the email body + attachments using Claude to extract:
- Event title
- Venue & location
- Date (YYYY-MM-DD)
- Set time (HH:MM)
- Fee & currency
- Promoter name + email
- Special notes (load-in times, backline, hotel, etc.)

### 5. **Gig Creation**
Once extracted, creates a gig in Supabase with status `confirmed`.

**Table:** `gigs`
```
id, title, venue, location, date, time, fee, currency, 
promoter_email, promoter_name, status, notes, created_at
```

### 6. **Artist Notification Email**
Sends the artist an email via Resend:

**From:** Signal Lab <bookings@nightmanoeuvres.com>
**To:** ${ARTIST_EMAIL} (env var or default)
**Subject:** "New gig confirmed: [title] on [date]"
**Body:** Formatted gig details (venue, time, fee, promoter contact)

---

## Testing

### Manual Test Email
Send a test booking email to advancingabsolute@gmail.com:

```
Subject: Test Booking: Test Fest

Body:
Hi Night Manoeuvres,

We confirm your booking for Test Fest.

Details:
- Venue: Test Club
- Location: Berlin, Germany
- Date: 15 April 2026
- Set time: 23:00 - 01:00
- Fee: EUR 3000 (50% deposit)
- Promoter: Test Promoter (test@testclub.com)

Load-in: 21:00
Soundcheck: 22:00
Hotel: Hotel Test
Backline: Pioneer equipment

Best,
Test Promoter
```

### Check Results
1. Verify gig appears in `/logistics` page
2. Check Supabase `gigs` table for new record
3. Verify artist received notification email
4. Check `/api/contracts/email` logs (Vercel dashboard)

---

## Env Variables Required

```bash
# Already set:
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
ANTHROPIC_API_KEY
RESEND_API_KEY

# Optional (for artist notification):
ARTIST_EMAIL=bookings@nightmanoeuvres.com
```

---

## Fallback: Manual Contract Parsing
If email forwarding isn't set up, agents can still:
1. Go to `/contracts`
2. Paste the booking email or PDF text
3. Click "Extract details"
4. Review and save to create gig

---

## PDF Attachment Handling
Currently, PDFs are extracted as base64-encoded text. For full PDF parsing:
- Use `pdfjs-dist` or similar library
- Or send base64 to Claude directly (it can parse PDFs)
- Implement in `convertPdfToText()` function

---

## Success Metrics
✅ Gig created in Supabase within 5 seconds of email received
✅ Artist receives notification within 10 seconds
✅ All contract details extracted accurately (>95%)
✅ Failed extractions logged for manual review
✅ Zero manual data entry required

---

## Support
For issues:
1. Check Vercel logs: `/api/contracts/email` endpoint
2. Check Supabase audit log
3. Verify Resend email forwarding is active
4. Test with manual contract parsing at `/contracts`
