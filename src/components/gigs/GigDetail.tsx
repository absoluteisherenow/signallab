'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Mail, Phone, MapPin, Building, User, FileText, DollarSign, FileCheck } from 'lucide-react'
import { Header } from '@/components/dashboard/Header'

interface GigDetailProps {
  gigId: string
}

export function GigDetail({ gigId }: GigDetailProps) {
  const [activeTab, setActiveTab] = useState<'logistics' | 'invoicing'>('logistics')

  // Mock gig data
  const gig = {
    id: gigId,
    title: 'Electric Nights Festival',
    date: '2026-04-15',
    time: '22:00',
    location: 'Berlin, Germany',
    venue: 'Tresor Club',
    status: 'confirmed',
    audience: 2500,
    fee: 5000,
  }

  // Logistics contact fields (33+ fields)
  const logistics = {
    venueManager: {
      name: 'Klaus Mueller',
      email: 'klaus@tresor.de',
      phone: '+49 30 2625 0721',
      mobile: '+49 160 1234567',
      office: '+49 30 2625 0720',
      fax: '+49 30 2625 0722',
      role: 'Venue Manager',
    },
    promoter: {
      name: 'Anna Schmidt',
      email: 'anna@electricnights.de',
      phone: '+49 30 1111 2222',
      mobile: '+49 170 9876543',
      office: '+49 30 1111 2220',
      fax: '+49 30 1111 2223',
      role: 'Festival Promoter',
      company: 'Electric Nights GmbH',
    },
    soundEngineer: {
      name: 'Marcus Weber',
      email: 'marcus@tresor.de',
      phone: '+49 30 3333 4444',
      mobile: '+49 173 5555666',
      office: '+49 30 3333 4440',
      fax: '+49 30 3333 4445',
      role: 'Sound Engineer',
    },
    logistics: {
      name: 'Thomas Keller',
      email: 'thomas@tresor.de',
      phone: '+49 30 5555 6666',
      mobile: '+49 151 7777888',
      office: '+49 30 5555 6660',
      fax: '+49 30 5555 6667',
      role: 'Logistics Coordinator',
    },
    hostEmcee: {
      name: 'DJ Berlin',
      email: 'dj@berlin-nights.de',
      phone: '+49 30 7777 8888',
      mobile: '+49 178 9999000',
      role: 'Host / Emcee',
    },
    securityLead: {
      name: 'Stefan Hoffmann',
      email: 'stefan@tresor-security.de',
      phone: '+49 30 9999 0000',
      mobile: '+49 175 1111222',
      role: 'Security Lead',
      company: 'Tresor Security',
    },
    regulations: {
      name: 'Petra Braun',
      email: 'petra@berlin-events.de',
      phone: '+49 30 2222 3333',
      role: 'Permits & Regulations',
      agency: 'Berlin Event Licensing',
    },
  }

  // Invoicing data
  const invoicing = {
    contracts: [
      {
        id: 1,
        name: 'Performance Agreement',
        status: 'signed',
        date: '2026-03-10',
        value: 5000,
      },
      {
        id: 2,
        name: 'Technical Rider',
        status: 'signed',
        date: '2026-03-10',
      },
    ],
    invoices: [
      {
        id: 1,
        number: 'INV-2026-0415-001',
        status: 'issued',
        date: '2026-03-15',
        amount: 5000,
        dueDate: '2026-04-15',
      },
    ],
    payments: [
      {
        id: 1,
        date: '2026-04-15',
        amount: 5000,
        status: 'pending',
        method: 'bank transfer',
      },
    ],
    expenses: [
      {
        id: 1,
        description: 'Travel: Flight Berlin',
        amount: 250,
        date: '2026-04-14',
        category: 'travel',
      },
      {
        id: 2,
        description: 'Accommodation: Hotel (2 nights)',
        amount: 400,
        date: '2026-04-14',
        category: 'accommodation',
      },
      {
        id: 3,
        description: 'Equipment Transport',
        amount: 150,
        date: '2026-04-14',
        category: 'equipment',
      },
    ],
  }

  const totalExpenses = invoicing.expenses.reduce((sum, exp) => sum + exp.amount, 0)
  const profitMargin = gig.fee - totalExpenses

  return (
    <div className="min-h-screen bg-night-black">
      {/* Header with back link */}
      <div className="border-b border-night-dark-gray bg-night-gray">
        <div className="p-8">
          <Link href="/" className="inline-flex items-center gap-2 text-night-dark-gray hover:text-night-silver transition-colors mb-4">
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Shows</span>
          </Link>
          <h1 className="text-4xl font-bold text-night-silver">{gig.title}</h1>
          <p className="text-night-dark-gray mt-2">{gig.venue}, {gig.location}</p>
        </div>
      </div>

      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          {/* Gig Overview */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6">
              <p className="text-night-dark-gray text-sm mb-2">Date & Time</p>
              <p className="text-night-silver font-semibold">{new Date(gig.date).toLocaleDateString('en-GB')} at {gig.time}</p>
            </div>
            <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6">
              <p className="text-night-dark-gray text-sm mb-2">Expected Audience</p>
              <p className="text-night-silver font-semibold">{gig.audience.toLocaleString()}</p>
            </div>
            <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6">
              <p className="text-night-dark-gray text-sm mb-2">Performance Fee</p>
              <p className="text-night-silver font-semibold">€{gig.fee.toLocaleString()}</p>
            </div>
            <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6">
              <p className="text-night-dark-gray text-sm mb-2">Status</p>
              <span className="inline-block px-3 py-1 rounded text-xs font-semibold uppercase bg-green-900/30 text-green-400">
                {gig.status}
              </span>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-4 mb-8 border-b border-night-dark-gray">
            <button
              onClick={() => setActiveTab('logistics')}
              className={`px-6 py-3 font-semibold text-sm border-b-2 transition-colors ${
                activeTab === 'logistics'
                  ? 'border-night-silver text-night-silver'
                  : 'border-transparent text-night-dark-gray hover:text-night-light'
              }`}
            >
              LOGISTICS
            </button>
            <button
              onClick={() => setActiveTab('invoicing')}
              className={`px-6 py-3 font-semibold text-sm border-b-2 transition-colors ${
                activeTab === 'invoicing'
                  ? 'border-night-silver text-night-silver'
                  : 'border-transparent text-night-dark-gray hover:text-night-light'
              }`}
            >
              INVOICING
            </button>
          </div>

          {/* LOGISTICS Tab */}
          {activeTab === 'logistics' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {Object.entries(logistics).map(([key, contact]) => (
                  <div key={key} className="bg-night-gray border border-night-dark-gray rounded-lg p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-night-silver">{contact.role}</h3>
                        <p className="text-night-dark-gray text-sm">{contact.name}</p>
                        {'company' in contact && contact.company && <p className="text-night-dark-gray text-xs mt-1">{contact.company}</p>}
                      </div>
                    </div>

                    <div className="space-y-2 text-sm">
                      {contact.email && (
                        <div className="flex items-center gap-2 text-night-dark-gray hover:text-night-silver transition-colors cursor-pointer">
                          <Mail className="w-4 h-4 text-night-silver" />
                          <a href={`mailto:${contact.email}`} className="hover:underline">{contact.email}</a>
                        </div>
                      )}
                      {contact.mobile && (
                        <div className="flex items-center gap-2 text-night-dark-gray hover:text-night-silver transition-colors">
                          <Phone className="w-4 h-4 text-night-silver" />
                          <a href={`tel:${contact.mobile}`} className="hover:underline">{contact.mobile}</a>
                        </div>
                      )}
                      {contact.phone && (
                        <div className="flex items-center gap-2 text-night-dark-gray hover:text-night-silver transition-colors">
                          <Building className="w-4 h-4 text-night-silver" />
                          <a href={`tel:${contact.phone}`} className="hover:underline">{contact.phone}</a>
                        </div>
                      )}
                      {contact.office && (
                        <div className="flex items-center gap-2 text-night-dark-gray">
                          <Building className="w-4 h-4 text-night-silver" />
                          <span>{contact.office}</span>
                        </div>
                      )}
                      {contact.fax && (
                        <div className="flex items-center gap-2 text-night-dark-gray text-xs">
                          <FileText className="w-4 h-4 text-night-silver" />
                          <span>Fax: {contact.fax}</span>
                        </div>
                      )}
                      {contact.agency && (
                        <div className="flex items-center gap-2 text-night-dark-gray text-xs mt-2 pt-2 border-t border-night-dark-gray">
                          <Building className="w-4 h-4 text-night-silver" />
                          <span>{contact.agency}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Cross-links */}
              <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6 mt-8">
                <h3 className="text-lg font-semibold text-night-silver mb-4">Related Services</h3>
                <div className="flex gap-4">
                  <a
                    href="#broadcast-lab"
                    className="px-4 py-2 bg-night-dark-gray hover:bg-night-dark-gray/70 text-night-silver rounded transition-colors text-sm"
                  >
                    → Broadcast Lab Integration
                  </a>
                  <a
                    href="#sonix"
                    className="px-4 py-2 bg-night-dark-gray hover:bg-night-dark-gray/70 text-night-silver rounded transition-colors text-sm"
                  >
                    → SONIX Automation
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* INVOICING Tab */}
          {activeTab === 'invoicing' && (
            <div className="space-y-6">
              {/* Contracts */}
              <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6">
                <h3 className="text-lg font-semibold text-night-silver mb-4 flex items-center gap-2">
                  <FileCheck className="w-5 h-5" />
                  Contracts
                </h3>
                <div className="space-y-3">
                  {invoicing.contracts.map((contract) => (
                    <div key={contract.id} className="flex items-center justify-between p-3 bg-night-dark-gray rounded">
                      <div>
                        <p className="text-night-silver font-semibold">{contract.name}</p>
                        <p className="text-night-dark-gray text-sm">Signed {new Date(contract.date).toLocaleDateString('en-GB')}</p>
                      </div>
                      <span className="px-3 py-1 bg-green-900/30 text-green-400 text-xs rounded font-semibold uppercase">
                        {contract.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Invoices */}
              <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6">
                <h3 className="text-lg font-semibold text-night-silver mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Invoices
                </h3>
                <div className="space-y-3">
                  {invoicing.invoices.map((invoice) => (
                    <div key={invoice.id} className="flex items-center justify-between p-3 bg-night-dark-gray rounded">
                      <div>
                        <p className="text-night-silver font-semibold">{invoice.number}</p>
                        <p className="text-night-dark-gray text-sm">Issued {new Date(invoice.date).toLocaleDateString('en-GB')} • Due {new Date(invoice.dueDate).toLocaleDateString('en-GB')}</p>
                      </div>
                      <span className="text-right">
                        <p className="text-night-silver font-bold">€{invoice.amount.toLocaleString()}</p>
                        <span className="text-xs text-night-dark-gray">{invoice.status}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payments */}
              <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6">
                <h3 className="text-lg font-semibold text-night-silver mb-4 flex items-center gap-2">
                  <DollarSign className="w-5 h-5" />
                  Payments
                </h3>
                <div className="space-y-3">
                  {invoicing.payments.map((payment) => (
                    <div key={payment.id} className="flex items-center justify-between p-3 bg-night-dark-gray rounded">
                      <div>
                        <p className="text-night-silver font-semibold">{payment.method}</p>
                        <p className="text-night-dark-gray text-sm">{new Date(payment.date).toLocaleDateString('en-GB')}</p>
                      </div>
                      <span className="text-right">
                        <p className="text-night-silver font-bold">€{payment.amount.toLocaleString()}</p>
                        <span className="text-xs text-yellow-400">{payment.status}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Expenses */}
              <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6">
                <h3 className="text-lg font-semibold text-night-silver mb-4 flex items-center gap-2">
                  <DollarSign className="w-5 h-5" />
                  Expenses
                </h3>
                <div className="space-y-3 mb-6">
                  {invoicing.expenses.map((expense) => (
                    <div key={expense.id} className="flex items-center justify-between p-3 bg-night-dark-gray rounded">
                      <div>
                        <p className="text-night-silver font-semibold">{expense.description}</p>
                        <p className="text-night-dark-gray text-sm">{new Date(expense.date).toLocaleDateString('en-GB')} • {expense.category}</p>
                      </div>
                      <span className="text-night-silver font-bold">-€{expense.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>

                {/* Profit Summary */}
                <div className="border-t border-night-dark-gray pt-6 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-night-dark-gray">Gross Income</span>
                    <span className="text-night-silver font-semibold">€{gig.fee.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-night-dark-gray">Total Expenses</span>
                    <span className="text-night-silver font-semibold">-€{totalExpenses.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold pt-2 border-t border-night-dark-gray">
                    <span className="text-night-silver">Net Profit</span>
                    <span className={profitMargin > 0 ? 'text-green-400' : 'text-red-400'}>€{profitMargin.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
