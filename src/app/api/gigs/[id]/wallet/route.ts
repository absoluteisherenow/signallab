import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Fetch gig
    const { data: gig, error } = await supabase
      .from('gigs')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error || !gig) {
      return new NextResponse('Gig not found', { status: 404 })
    }

    // Fetch travel bookings
    const { data: travel } = await supabase
      .from('travel_bookings')
      .select('*')
      .eq('gig_id', params.id)
      .order('created_at', { ascending: true })

    // Fetch advance status
    const { data: advance } = await supabase
      .from('advance_requests')
      .select('id, completed')
      .eq('gig_id', params.id)
      .limit(1)
      .single()

    const advanceStatus = advance
      ? advance.completed ? 'Complete' : 'Sent'
      : 'Not sent'

    const gigDate = new Date(gig.date)
    const dateFormatted = gigDate.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).toUpperCase()

    const setTime = gig.slot_time || gig.set_time || gig.time || null
    const doorsTime = gig.doors_time || gig.doors || null
    const loadInTime = gig.load_in || gig.load_in_time || null
    const venueAddress = gig.venue_address || gig.address || null

    const mapsUrl = venueAddress
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueAddress)}`
      : gig.location
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(gig.venue + ' ' + gig.location)}`
        : null

    const travelBookings = travel || []
    const flights = travelBookings.filter((t: any) => t.type === 'flight')
    const hotels = travelBookings.filter((t: any) => t.type === 'hotel')
    const transport = travelBookings.filter((t: any) => t.type === 'transport' || t.type === 'transfer' || t.type === 'taxi')

    const advanceBadgeColor = advanceStatus === 'Complete' ? '#3d6b4a' : advanceStatus === 'Sent' ? '#b08d57' : '#8a4a3a'
    const advanceBadgeBg = advanceStatus === 'Complete' ? 'rgba(61,107,74,0.15)' : advanceStatus === 'Sent' ? 'rgba(176,141,87,0.15)' : 'rgba(138,74,58,0.15)'

    function formatTime(t: string | null) {
      if (!t) return null
      // Handle HH:MM or HH:MM:SS
      const parts = t.split(':')
      if (parts.length >= 2) {
        const h = parseInt(parts[0])
        const m = parts[1]
        return `${h}:${m}`
      }
      return t
    }

    function formatDateTime(dt: string | null) {
      if (!dt) return null
      try {
        const d = new Date(dt)
        return d.toLocaleString('en-GB', {
          weekday: 'short', day: 'numeric', month: 'short',
          hour: '2-digit', minute: '2-digit', hour12: false,
        })
      } catch { return dt }
    }

    function esc(str: string | null | undefined): string {
      if (!str) return ''
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    }

    // Build contact rows
    let contactsHtml = ''

    if (gig.al_name || gig.al_phone || gig.al_email) {
      contactsHtml += `
        <div style="padding:16px 0;border-bottom:1px solid #1a1917">
          <div style="font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:#52504c;margin-bottom:8px">Local Contact</div>
          <div style="font-size:15px;color:#f0ebe2;margin-bottom:4px">${esc(gig.al_name)}</div>
          ${gig.al_phone ? `<a href="tel:${esc(gig.al_phone)}" style="display:inline-block;font-size:13px;color:#b08d57;text-decoration:none;margin-right:16px">${esc(gig.al_phone)}</a>` : ''}
          ${gig.al_email ? `<a href="mailto:${esc(gig.al_email)}" style="font-size:13px;color:#8a8780;text-decoration:none">${esc(gig.al_email)}</a>` : ''}
        </div>`
    }

    if (gig.promoter_name || gig.promoter_email || gig.promoter_phone) {
      contactsHtml += `
        <div style="padding:16px 0;border-bottom:1px solid #1a1917">
          <div style="font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:#52504c;margin-bottom:8px">Promoter</div>
          ${gig.promoter_name ? `<div style="font-size:15px;color:#f0ebe2;margin-bottom:4px">${esc(gig.promoter_name)}</div>` : ''}
          ${gig.promoter_phone ? `<a href="tel:${esc(gig.promoter_phone)}" style="display:inline-block;font-size:13px;color:#b08d57;text-decoration:none;margin-right:16px">${esc(gig.promoter_phone)}</a>` : ''}
          ${gig.promoter_email ? `<a href="mailto:${esc(gig.promoter_email)}" style="font-size:13px;color:#8a8780;text-decoration:none">${esc(gig.promoter_email)}</a>` : ''}
        </div>`
    }

    if (gig.driver_name || gig.driver_phone) {
      contactsHtml += `
        <div style="padding:16px 0;border-bottom:1px solid #1a1917">
          <div style="font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:#52504c;margin-bottom:8px">Driver</div>
          <div style="font-size:15px;color:#f0ebe2;margin-bottom:4px">${esc(gig.driver_name)}</div>
          ${gig.driver_phone ? `<a href="tel:${esc(gig.driver_phone)}" style="display:inline-block;font-size:13px;color:#b08d57;text-decoration:none">${esc(gig.driver_phone)}</a>` : ''}
        </div>`
    }

    if (venueAddress) {
      contactsHtml += `
        <div style="padding:16px 0;border-bottom:1px solid #1a1917">
          <div style="font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:#52504c;margin-bottom:8px">Venue Address</div>
          <a href="${mapsUrl}" target="_blank" rel="noopener" style="font-size:14px;color:#b08d57;text-decoration:none;line-height:1.5">${esc(venueAddress)}</a>
        </div>`
    } else if (gig.location) {
      contactsHtml += `
        <div style="padding:16px 0;border-bottom:1px solid #1a1917">
          <div style="font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:#52504c;margin-bottom:8px">Location</div>
          <a href="${mapsUrl}" target="_blank" rel="noopener" style="font-size:14px;color:#b08d57;text-decoration:none;line-height:1.5">${esc(gig.location)}</a>
        </div>`
    }

    // Build travel section
    let travelHtml = ''
    if (flights.length > 0 || hotels.length > 0 || transport.length > 0) {
      travelHtml += `
        <div style="margin-top:32px">
          <div style="font-size:9px;letter-spacing:0.3em;text-transform:uppercase;color:#b08d57;margin-bottom:20px;padding-bottom:8px;border-bottom:1px solid #1a1917">Travel</div>`

      for (const f of flights) {
        travelHtml += `
          <div style="background:#0d0d0b;border:1px solid #1a1917;padding:20px;margin-bottom:12px;border-radius:2px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
              <div style="font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#52504c">Flight</div>
              ${f.flight_number ? `<div style="font-size:14px;color:#b08d57;font-weight:500;letter-spacing:0.05em">${esc(f.flight_number)}</div>` : ''}
            </div>
            <div style="display:flex;justify-content:space-between;align-items:flex-end">
              <div>
                <div style="font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:#52504c;margin-bottom:4px">From</div>
                <div style="font-size:14px;color:#f0ebe2">${esc(f.from_location) || '---'}</div>
                ${f.departure_at ? `<div style="font-size:12px;color:#8a8780;margin-top:2px">${formatDateTime(f.departure_at)}</div>` : ''}
              </div>
              <div style="color:#52504c;font-size:18px;padding:0 16px">---</div>
              <div style="text-align:right">
                <div style="font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:#52504c;margin-bottom:4px">To</div>
                <div style="font-size:14px;color:#f0ebe2">${esc(f.to_location) || '---'}</div>
                ${f.arrival_at ? `<div style="font-size:12px;color:#8a8780;margin-top:2px">${formatDateTime(f.arrival_at)}</div>` : ''}
              </div>
            </div>
            ${f.reference ? `<div style="margin-top:12px;font-size:11px;color:#52504c">Ref: ${esc(f.reference)}</div>` : ''}
          </div>`
      }

      for (const h of hotels) {
        travelHtml += `
          <div style="background:#0d0d0b;border:1px solid #1a1917;padding:20px;margin-bottom:12px;border-radius:2px">
            <div style="font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#52504c;margin-bottom:8px">Hotel</div>
            <div style="font-size:16px;color:#f0ebe2;margin-bottom:8px">${esc(h.name)}</div>
            ${h.notes ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(h.notes)}" target="_blank" rel="noopener" style="font-size:13px;color:#b08d57;text-decoration:none;display:block;margin-bottom:8px">${esc(h.notes)}</a>` : ''}
            <div style="display:flex;gap:24px;margin-top:8px">
              ${h.check_in ? `<div><div style="font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:#52504c;margin-bottom:4px">Check-in</div><div style="font-size:13px;color:#f0ebe2">${formatDateTime(h.check_in)}</div></div>` : ''}
              ${h.check_out ? `<div><div style="font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:#52504c;margin-bottom:4px">Check-out</div><div style="font-size:13px;color:#f0ebe2">${formatDateTime(h.check_out)}</div></div>` : ''}
            </div>
            ${h.reference ? `<div style="margin-top:10px;font-size:11px;color:#52504c">Ref: ${esc(h.reference)}</div>` : ''}
          </div>`
      }

      for (const t of transport) {
        travelHtml += `
          <div style="background:#0d0d0b;border:1px solid #1a1917;padding:20px;margin-bottom:12px;border-radius:2px">
            <div style="font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#52504c;margin-bottom:8px">Transport</div>
            <div style="font-size:15px;color:#f0ebe2;margin-bottom:4px">${esc(t.name)}</div>
            ${t.notes ? `<div style="font-size:13px;color:#8a8780;margin-top:4px">${esc(t.notes)}</div>` : ''}
            ${t.departure_at ? `<div style="font-size:12px;color:#8a8780;margin-top:6px">${formatDateTime(t.departure_at)}</div>` : ''}
            ${t.reference ? `<div style="margin-top:8px;font-size:11px;color:#52504c">Ref: ${esc(t.reference)}</div>` : ''}
          </div>`
      }

      travelHtml += '</div>'
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="theme-color" content="#070706">
  <meta name="mobile-web-app-capable" content="yes">
  <title>${esc(gig.venue)} - ${dateFormatted} | Signal Lab OS</title>
  <link rel="apple-touch-icon" href="/icon-192.png">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #070706;
      color: #f0ebe2;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Mono', 'Fira Code', 'Fira Mono', 'Roboto Mono', monospace;
      -webkit-font-smoothing: antialiased;
      min-height: 100vh;
      min-height: 100dvh;
    }
    a { transition: opacity 0.15s; }
    a:active { opacity: 0.7; }
  </style>
</head>
<body>
  <div style="max-width:440px;margin:0 auto;padding:0">

    <!-- Top bar -->
    <div style="padding:16px 24px 12px;display:flex;justify-content:space-between;align-items:center">
      <div style="font-size:8px;letter-spacing:0.4em;text-transform:uppercase;color:#52504c">Signal Lab OS</div>
      <div style="font-size:8px;letter-spacing:0.3em;text-transform:uppercase;color:#52504c">${gig.status === 'confirmed' ? 'Confirmed' : gig.status === 'pending' ? 'Pending' : gig.status}</div>
    </div>

    <!-- Ticket notch top -->
    <div style="position:relative;margin:0 24px">
      <div style="background:#0d0d0b;border:1px solid #1a1917;border-bottom:none;border-radius:12px 12px 0 0;padding:36px 28px 28px;position:relative">

        <!-- Venue hero -->
        <div style="margin-bottom:8px">
          <div style="font-size:clamp(26px, 7vw, 36px);font-weight:300;color:#f0ebe2;line-height:1.05;letter-spacing:-0.02em">${esc(gig.venue)}</div>
        </div>
        <div style="font-size:14px;color:#8a8780;margin-bottom:0">${esc(gig.location || gig.title)}</div>
      </div>
    </div>

    <!-- Perforated divider -->
    <div style="position:relative;margin:0 24px;height:20px;overflow:hidden">
      <!-- Left notch -->
      <div style="position:absolute;left:-10px;top:0;width:20px;height:20px;background:#070706;border-radius:50%;z-index:2"></div>
      <!-- Right notch -->
      <div style="position:absolute;right:-10px;top:0;width:20px;height:20px;background:#070706;border-radius:50%;z-index:2"></div>
      <!-- Dashed line -->
      <div style="position:absolute;left:16px;right:16px;top:9px;border-top:1px dashed #2a2a28"></div>
      <!-- Side borders -->
      <div style="position:absolute;left:0;top:0;bottom:0;width:1px;background:#1a1917"></div>
      <div style="position:absolute;right:0;top:0;bottom:0;width:1px;background:#1a1917"></div>
    </div>

    <!-- Main info section -->
    <div style="margin:0 24px">
      <div style="background:#0d0d0b;border:1px solid #1a1917;border-top:none;border-bottom:none;padding:24px 28px 28px">

        <!-- Info grid -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0">
          <!-- Set time -->
          <div style="padding:12px 0;border-bottom:1px solid #1a1917;border-right:1px solid #1a1917;padding-right:20px">
            <div style="font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:#52504c;margin-bottom:8px">Set Time</div>
            <div style="font-size:28px;font-weight:300;color:#b08d57;letter-spacing:-0.02em">${setTime ? formatTime(setTime) : '---'}</div>
          </div>
          <!-- Date -->
          <div style="padding:12px 0 12px 20px;border-bottom:1px solid #1a1917">
            <div style="font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:#52504c;margin-bottom:8px">Date</div>
            <div style="font-size:20px;font-weight:300;color:#f0ebe2;letter-spacing:0.02em">${dateFormatted}</div>
          </div>
          <!-- Doors -->
          <div style="padding:16px 0 12px;border-right:1px solid #1a1917;padding-right:20px">
            <div style="font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:#52504c;margin-bottom:8px">Doors</div>
            <div style="font-size:18px;font-weight:300;color:#f0ebe2">${doorsTime ? formatTime(doorsTime) : '---'}</div>
          </div>
          <!-- Load in -->
          <div style="padding:16px 0 12px 20px">
            <div style="font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:#52504c;margin-bottom:8px">Load In</div>
            <div style="font-size:18px;font-weight:300;color:#f0ebe2">${loadInTime ? formatTime(loadInTime) : '---'}</div>
          </div>
        </div>

        <!-- Divider -->
        <div style="border-top:1px solid #1a1917;margin:20px 0"></div>

        <!-- Contacts -->
        ${contactsHtml || '<div style="padding:12px 0;font-size:13px;color:#52504c">No contact details available</div>'}

        <!-- Travel -->
        ${travelHtml}

        <!-- Advance status -->
        <div style="margin-top:28px;display:flex;align-items:center;gap:12px">
          <div style="font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:#52504c">Advance</div>
          <div style="font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:${advanceBadgeColor};background:${advanceBadgeBg};padding:5px 14px;border-radius:2px">${advanceStatus}</div>
        </div>
      </div>
    </div>

    <!-- Ticket bottom with rounded corners -->
    <div style="margin:0 24px">
      <div style="background:#0d0d0b;border:1px solid #1a1917;border-top:none;border-radius:0 0 12px 12px;padding:24px 28px 28px;text-align:center">
        <div style="width:48px;height:1px;background:#1a1917;margin:0 auto 16px"></div>
        <a href="https://signallabos.com/waitlist" style="display:inline-flex;align-items:center;gap:5px;font-size:8px;letter-spacing:0.35em;text-transform:uppercase;color:#2a2a28;text-decoration:none"><svg width="10" height="10" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="8" width="48" height="48" rx="12" fill="none" stroke="#b08d57" stroke-width="1.5" opacity="0.4"/><polyline points="14,32 22,32 26,20 30,44 34,16 38,40 42,28 46,32 52,32" stroke="#b08d57" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>Powered by Signal Lab OS</a>
      </div>
    </div>

    <!-- Quick actions -->
    <div style="padding:24px 24px 16px;display:flex;flex-direction:column;gap:10px">
      ${mapsUrl ? `<a href="${mapsUrl}" target="_blank" rel="noopener" style="display:block;text-align:center;padding:14px 20px;border:1px solid #b08d57;color:#b08d57;text-decoration:none;font-size:11px;letter-spacing:0.14em;text-transform:uppercase">Get directions</a>` : ''}
      ${gig.driver_phone ? `
        <div style="display:flex;gap:10px">
          <a href="tel:${esc(gig.driver_phone)}" style="flex:1;text-align:center;padding:14px 12px;border:1px solid #1a1917;color:#8a8780;text-decoration:none;font-size:11px;letter-spacing:0.14em;text-transform:uppercase">Call driver</a>
          <a href="sms:${esc(gig.driver_phone)}" style="flex:1;text-align:center;padding:14px 12px;border:1px solid #1a1917;color:#8a8780;text-decoration:none;font-size:11px;letter-spacing:0.14em;text-transform:uppercase">Message driver</a>
        </div>` : ''}
      ${gig.al_phone ? `
        <div style="display:flex;gap:10px">
          <a href="tel:${esc(gig.al_phone)}" style="flex:1;text-align:center;padding:14px 12px;border:1px solid #1a1917;color:#8a8780;text-decoration:none;font-size:11px;letter-spacing:0.14em;text-transform:uppercase">Call ${esc(gig.al_name) || 'contact'}</a>
          <a href="sms:${esc(gig.al_phone)}" style="flex:1;text-align:center;padding:14px 12px;border:1px solid #1a1917;color:#8a8780;text-decoration:none;font-size:11px;letter-spacing:0.14em;text-transform:uppercase">Message</a>
        </div>` : ''}
      ${!gig.al_phone && gig.promoter_phone ? `
        <div style="display:flex;gap:10px">
          <a href="tel:${esc(gig.promoter_phone)}" style="flex:1;text-align:center;padding:14px 12px;border:1px solid #1a1917;color:#8a8780;text-decoration:none;font-size:11px;letter-spacing:0.14em;text-transform:uppercase">Call promoter</a>
          <a href="sms:${esc(gig.promoter_phone)}" style="flex:1;text-align:center;padding:14px 12px;border:1px solid #1a1917;color:#8a8780;text-decoration:none;font-size:11px;letter-spacing:0.14em;text-transform:uppercase">Message</a>
        </div>` : ''}
      ${gig.promoter_email ? `<a href="mailto:${esc(gig.promoter_email)}" style="display:block;text-align:center;padding:14px 20px;border:1px solid #1a1917;color:#8a8780;text-decoration:none;font-size:11px;letter-spacing:0.14em;text-transform:uppercase">Email promoter</a>` : ''}
      <a href="/gig-pass/${params.id}" style="display:block;text-align:center;padding:14px;border:1px solid rgba(176,141,87,0.3);color:#b08d57;text-decoration:none;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;margin:0">Open full gig pass</a>
      <a href="/dashboard" style="display:block;text-align:center;padding:14px 20px;border:1px solid #1a1917;color:#52504c;text-decoration:none;font-size:11px;letter-spacing:0.14em;text-transform:uppercase">← Back to dashboard</a>
    </div>

    <!-- Rider / hospitality notes -->
    ${gig.hospitality || gig.backline ? `
    <div style="margin:0 24px 24px">
      <div style="background:#0d0d0b;border:1px solid #1a1917;padding:20px 28px;border-radius:8px">
        ${gig.hospitality ? `
        <div style="margin-bottom:${gig.backline ? '16px' : '0'}">
          <div style="font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:#52504c;margin-bottom:8px">Rider / Hospitality</div>
          <div style="font-size:13px;color:#8a8780;line-height:1.6;white-space:pre-wrap">${esc(gig.hospitality)}</div>
        </div>` : ''}
        ${gig.backline ? `
        <div>
          <div style="font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:#52504c;margin-bottom:8px">Backline</div>
          <div style="font-size:13px;color:#8a8780;line-height:1.6;white-space:pre-wrap">${esc(gig.backline)}</div>
        </div>` : ''}
      </div>
    </div>` : ''}

    <!-- Add to home screen hint -->
    <div style="text-align:center;padding:24px 0 12px;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#52504c">
      Tap <span style="color:#b08d57">Share</span> then <span style="color:#b08d57">Add to Home Screen</span> to save offline
    </div>

  </div>
  <script>
    // Cache this page data in localStorage for offline access
    try {
      const data = {
        url: window.location.href,
        title: document.title,
        timestamp: Date.now()
      };
      localStorage.setItem('wallet-pass-${params.id}', JSON.stringify(data));
    } catch(e) {}
  </script>
</body>
</html>`

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    })
  } catch (err: any) {
    return new NextResponse(`Error: ${err.message}`, { status: 500 })
  }
}
