import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://zyxqdaeewyzwscsurxin.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5eHFkYWVld3l6d3Njc3VyeGluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDEyODg5NiwiZXhwIjoyMDg5NzA0ODk2fQ.xgOqieFtUvWctccKtpbYi3is_sFoTty9jNcMDHPhHpU'
)

// ── GIGS ──────────────────────────────────────────────────────────────────────

const gigs = [
  {
    title: 'Southwave (b2b Bimini)',
    venue: 'Rainforest Green, South Bank',
    location: 'Brisbane, Australia',
    date: '2026-02-20',
    fee: 0,
    currency: 'AUD',
    status: 'completed',
    promoter_email: 'eliza@thetivoligroup.com.au',
    notes: 'Part of Poof Doof Australia tour — fee in tour settlement. With Rose Gray.',
  },
  {
    title: 'Mighty Hoopla Sydney',
    venue: 'Heaps Gay Stage',
    location: 'Sydney, Australia',
    date: '2026-02-21',
    fee: 0,
    currency: 'AUD',
    status: 'completed',
    promoter_email: 'hockers@poofdoof.com',
    notes: 'Part of Poof Doof Australia tour. ABSOLUTE. feat. Big Wett 18:45-19:45.',
  },
  {
    title: 'triple j Mix Up',
    venue: 'ABC Studios',
    location: 'Sydney, Australia',
    date: '2026-02-23',
    fee: 100,
    currency: 'AUD',
    status: 'completed',
    promoter_email: 'Crabbe.Kailyn@abc.net.au',
    notes: 'Radio mix feature. Recorded Feb 23, aired Feb 28. Split with Bimini — $100 each.',
  },
  {
    title: 'Poof Doof x Mardi Gras: Big Gay Boat',
    venue: 'Glass Island',
    location: 'Sydney, Australia',
    date: '2026-02-27',
    fee: 0,
    currency: 'AUD',
    status: 'completed',
    promoter_email: 'hockers@poofdoof.com',
    notes: 'Part of Poof Doof Australia tour.',
  },
  {
    title: 'Poof Doof Big Gay Block Party',
    venue: 'Ivy',
    location: 'Sydney, Australia',
    date: '2026-02-28',
    fee: 0,
    currency: 'AUD',
    status: 'completed',
    promoter_email: 'hockers@poofdoof.com',
    notes: 'Part of Poof Doof Australia tour.',
  },
  {
    title: 'Pitch Festival (Poof Doof float)',
    venue: 'The Grampians',
    location: 'Victoria, Australia',
    date: '2026-03-07',
    fee: 500,
    currency: 'AUD',
    status: 'cancelled',
    promoter_email: 'hockers@poofdoof.com',
    notes: 'Cancelled — poor ticket sales. Pitch paid $500 directly.',
  },
  {
    title: 'Poof Doof x Chillout After Party',
    venue: 'Daylesford',
    location: 'Victoria, Australia',
    date: '2026-03-08',
    fee: 0,
    currency: 'AUD',
    status: 'completed',
    promoter_email: 'hockers@poofdoof.com',
    notes: 'Part of Poof Doof Australia tour.',
  },
  {
    title: 'Gonzos (b2b Bimini)',
    venue: "Gonzo's Tea Room",
    location: 'Norwich, UK',
    date: '2026-03-27',
    fee: 1250,
    currency: 'GBP',
    status: 'completed',
    promoter_email: 'hello@gonzostearoom.com',
    notes: "50% of £2,500 show. Gonzo's Two Room LTD, 68 London Street, Norwich, NR21JT. VAT: 381068592.",
  },
  {
    title: 'Her Bar',
    venue: 'Her Bar, 270 Lonsdale St',
    location: 'Melbourne, Australia',
    date: '2026-03-31',
    fee: 200,
    currency: 'AUD',
    status: 'completed',
    promoter_email: null,
    notes: 'DJ set. HER BAR PTY LTD, ABN: 72 618 341 129.',
  },
  {
    title: 'Neurotiq Erotiq',
    venue: 'TBC',
    location: 'TBC',
    date: '2026-04-01',
    fee: 0,
    currency: 'GBP',
    status: 'completed',
    promoter_email: 'sarah@neurotiqerotiq.com',
    notes: 'Fee TBC — check PDF INV-1755C0-2.',
  },
]

// ── EXPENSES ──────────────────────────────────────────────────────────────────

const expenses = [
  {
    date: '2026-01-17',
    description: '160DL Studio Rent - January (INV-0136)',
    amount: 1214.40,
    currency: 'GBP',
    category: 'Studio',
  },
  {
    date: '2026-02-12',
    description: '160DL (INV-0150)',
    amount: 25.00,
    currency: 'GBP',
    category: 'Studio',
  },
  {
    date: '2026-02-17',
    description: '160DL Studio Rent - February (INV-0170)',
    amount: 1214.40,
    currency: 'GBP',
    category: 'Studio',
  },
  {
    date: '2026-03-17',
    description: '160DL Studio Rent - March (INV-0179)',
    amount: 1214.40,
    currency: 'GBP',
    category: 'Studio',
  },
  {
    date: '2026-02-03',
    description: 'Turbo MGMT management fee (TM-0002)',
    amount: 492.15,
    currency: 'GBP',
    category: 'Other',
  },
  {
    date: '2026-03-11',
    description: 'Turbo MGMT management fee (TM-0009)',
    amount: 2491.82,
    currency: 'AUD',
    category: 'Other',
  },
  {
    date: '2026-03-03',
    description: 'Hetzner server hosting',
    amount: 4.07,
    currency: 'USD',
    category: 'Other',
  },
]

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('Seeding 2026 financial data...\n')

  // 1. Check for existing data to avoid duplicates
  const { data: existingGigs } = await supabase.from('gigs').select('title, date')
  const existingGigKeys = new Set(
    (existingGigs || []).map(g => `${g.title}|${g.date}`)
  )

  // 2. Insert gigs (skip duplicates)
  const gigsToInsert = gigs.filter(g => !existingGigKeys.has(`${g.title}|${g.date}`))

  if (gigsToInsert.length === 0) {
    console.log('All gigs already exist — skipping.')
  } else {
    const { data: insertedGigs, error: gigsError } = await supabase
      .from('gigs')
      .insert(gigsToInsert)
      .select()
    if (gigsError) {
      console.error('Error inserting gigs:', gigsError.message)
      return
    }
    console.log(`Inserted ${insertedGigs.length} gigs`)
  }

  // 3. Fetch all gigs to get IDs for linking invoices
  const { data: allGigs } = await supabase.from('gigs').select('id, title, date, fee, currency')
  const gigByTitle = Object.fromEntries((allGigs || []).map(g => [g.title, g]))

  // 4. Check existing invoices
  const { data: existingInvoices } = await supabase.from('invoices').select('gig_title')
  const existingInvoiceTitles = new Set((existingInvoices || []).map(i => i.gig_title))

  // 5. Build invoices
  const invoices = []

  // Poof Doof tour settlement (standalone — not linked to a single gig)
  if (!existingInvoiceTitles.has('Poof Doof Australia Tour (Feb-Mar 2026)')) {
    const southwave = gigByTitle['Southwave (b2b Bimini)']
    invoices.push({
      gig_id: southwave?.id || null,
      gig_title: 'Poof Doof Australia Tour (Feb-Mar 2026)',
      amount: 13000,
      currency: 'AUD',
      type: 'full',
      status: 'pending',
      due_date: '2026-04-30',
      wht_rate: 0,
      notes: 'Total inc $2k flight contribution. Deposits $11k paid. HSTN accounting fee $776. Balance $1,224 owed.',
    })
  }

  // triple j Mix Up
  const tripleJ = gigByTitle['triple j Mix Up']
  if (tripleJ && !existingInvoiceTitles.has('triple j Mix Up')) {
    invoices.push({
      gig_id: tripleJ.id,
      gig_title: 'triple j Mix Up',
      amount: 100,
      currency: 'AUD',
      type: 'full',
      status: 'paid',
      paid_at: '2026-03-15',
      notes: 'Radio mix feature fee. Split with Bimini — $100 each. To ABC triple j.',
    })
  }

  // Planningtorock remix (no gig linked)
  if (!existingInvoiceTitles.has('Planningtorock Remix (PO-PLANS038)')) {
    invoices.push({
      gig_id: null,
      gig_title: 'Planningtorock Remix (PO-PLANS038)',
      amount: 375,
      currency: 'EUR',
      type: 'full',
      status: 'paid',
      paid_at: '2026-03-20',
      notes: 'Remix fee. To Human Level Ltd, 101 New Cavendish Street, 1st Floor South, London, W1W 6XH.',
    })
  }

  // Gonzos
  const gonzos = gigByTitle['Gonzos (b2b Bimini)']
  if (gonzos && !existingInvoiceTitles.has('Gonzos (b2b Bimini)')) {
    invoices.push({
      gig_id: gonzos.id,
      gig_title: 'Gonzos (b2b Bimini)',
      amount: 1250,
      currency: 'GBP',
      type: 'full',
      status: 'paid',
      paid_at: '2026-04-01',
      notes: "50% of £2,500 show. To Gonzo's Two Room LTD, VAT: 381068592.",
    })
  }

  // Her Bar
  const herBar = gigByTitle['Her Bar']
  if (herBar && !existingInvoiceTitles.has('Her Bar')) {
    invoices.push({
      gig_id: herBar.id,
      gig_title: 'Her Bar',
      amount: 200,
      currency: 'AUD',
      type: 'full',
      status: 'pending',
      due_date: '2026-04-30',
      notes: 'DJ set. To HER BAR PTY LTD, ABN: 72 618 341 129.',
    })
  }

  // Neurotiq Erotiq
  const ne = gigByTitle['Neurotiq Erotiq']
  if (ne && !existingInvoiceTitles.has('Neurotiq Erotiq')) {
    invoices.push({
      gig_id: ne.id,
      gig_title: 'Neurotiq Erotiq',
      amount: 0,
      currency: 'GBP',
      type: 'full',
      status: 'pending',
      notes: 'Amount TBC — check PDF INV-1755C0-2.',
    })
  }

  // Pitch Festival ($500 direct payment)
  const pitch = gigByTitle['Pitch Festival (Poof Doof float)']
  if (pitch && !existingInvoiceTitles.has('Pitch Festival (Poof Doof float)')) {
    invoices.push({
      gig_id: pitch.id,
      gig_title: 'Pitch Festival (Poof Doof float)',
      amount: 500,
      currency: 'AUD',
      type: 'full',
      status: 'paid',
      paid_at: '2026-03-07',
      notes: 'Show cancelled but Pitch paid $500 directly.',
    })
  }

  if (invoices.length === 0) {
    console.log('All invoices already exist — skipping.')
  } else {
    const { data: insertedInvoices, error: invoicesError } = await supabase
      .from('invoices')
      .insert(invoices)
      .select()
    if (invoicesError) {
      console.error('Error inserting invoices:', invoicesError.message)
    } else {
      console.log(`Inserted ${insertedInvoices.length} invoices`)
    }
  }

  // 6. Insert expenses (skip duplicates by description)
  const { data: existingExpenses } = await supabase.from('expenses').select('description')
  const existingExpenseDescs = new Set((existingExpenses || []).map(e => e.description))

  const expensesToInsert = expenses.filter(e => !existingExpenseDescs.has(e.description))

  if (expensesToInsert.length === 0) {
    console.log('All expenses already exist — skipping.')
  } else {
    const { data: insertedExpenses, error: expensesError } = await supabase
      .from('expenses')
      .insert(expensesToInsert)
      .select()
    if (expensesError) {
      console.error('Error inserting expenses:', expensesError.message)
    } else {
      console.log(`Inserted ${insertedExpenses.length} expenses`)
    }
  }

  // 7. Summary
  console.log('\n── Summary ──')
  const { count: gigCount } = await supabase.from('gigs').select('*', { count: 'exact', head: true })
  const { count: invCount } = await supabase.from('invoices').select('*', { count: 'exact', head: true })
  const { count: expCount } = await supabase.from('expenses').select('*', { count: 'exact', head: true })
  console.log(`Total gigs: ${gigCount}`)
  console.log(`Total invoices: ${invCount}`)
  console.log(`Total expenses: ${expCount}`)
  console.log('\nDone!')
}

seed().catch(console.error)
