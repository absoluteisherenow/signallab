'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Mail, Phone, MapPin, Building, User, FileText, DollarSign, FileCheck, Clock, Car, Utensils, Music } from 'lucide-react'
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

  // Complete logistics data with all 40+ fields
  const logistics = {
    // VENUE INFORMATION (8 fields)
    venue: {
      name: 'Tresor Club',
      address: 'Köpenicker Straße 70, 10179 Berlin',
      city: 'Berlin',
      country: 'Germany',
      phone: '+49 30 2625 0721',
      email: 'info@tresor.de',
      capacity: 2500,
      notes: 'Main stage venue',
    },

    // VENUE CONTACT (6 fields)
    venueManager: {
      name: 'Klaus Mueller',
      email: 'klaus@tresor.de',
      phone: '+49 30 2625 0721',
      mobile: '+49 160 1234567',
      office: '+49 30 2625 0720',
      fax: '+49 30 2625 0722',
      role: 'Venue Manager',
    },

    // ACCOMMODATION (5 fields)
    hotel: {
      name: 'Hotel Berlin Mitte',
      address: 'Spandauer Straße 3, 10178 Berlin',
      phone: '+49 30 5555 5555',
      checkInTime: '15:00',
      checkOutTime: '11:00',
      reservationName: 'NIGHT MANOEUVRES',
      confirmationNumber: 'HBM-202604-12345',
    },

    // TRAVEL & TRANSPORT (7 fields)
    travel: {
      method: 'Flight + Car Service',
      flightNumber: 'LH2451',
      departureCity: 'London',
      arrivalAirport: 'BER',
      travelDate: '2026-04-14',
      travelTime: '14:00',
      notes: 'Direct flight, car pickup at airport',
    },

    // DRIVER INFORMATION (4 fields)
    driver: {
      name: 'Hans Mueller',
      phone: '+49 170 7777777',
      mobile: '+49 151 8888888',
      company: 'Berlin Luxury Transport',
      carType: 'Mercedes S-Class',
    },

    // LOAD-IN & PERFORMANCE TIMING (5 fields)
    schedule: {
      loadInTime: '2026-04-15 17:00',
      soundCheckTime: '2026-04-15 19:00',
      stageTime: '2026-04-15 22:00',
      performanceDuration: '90 minutes',
      loadOutTime: '2026-04-15 23:45',
    },

    // CATERING & HOSPITALITY (5 fields)
    catering: {
      provider: 'Berlin Catering Services',
      contact: 'Julia Hoffmann',
      phone: '+49 30 4444 4444',
      mealTypes: 'Breakfast, Lunch, Dinner, Snacks',
      specialRequirements: 'Vegetarian/Vegan options, No shellfish',
    },

    // TECHNICAL TEAM (3 fields)
    soundEngineer: {
      name: 'Marcus Weber',
      email: 'marcus@tresor.de',
      phone: '+49 30 3333 4444',
      mobile: '+49 173 5555666',
      office: '+49 30 3333 4440',
      fax: '+49 30 3333 4445',
      role: 'Sound Engineer',
      credentials: 'Pro Audio Certification, 15+ years',
    },

    lightingEngineer: {
      name: 'Anna Volkova',
      email: 'anna.v@tresor.de',
      phone: '+49 30 3333 4446',
      mobile: '+49 173 5555667',
      role: 'Lighting Engineer',
      credentials: 'Lighting Design Specialist',
    },

    // LOGISTICS COORDINATION (5 fields)
    logisticsCoord: {
      name: 'Thomas Keller',
      email: 'thomas@tresor.de',
      phone: '+49 30 5555 6666',
      mobile: '+49 151 7777888',
      office: '+49 30 5555 6660',
      fax: '+49 30 5555 6667',
      role: 'Logistics Coordinator',
      warehouse: 'Warehouse address for equipment storage',
    },

    // PROMOTER INFORMATION (6 fields)
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

    // HOST/EMCEE (3 fields)
    hostEmcee: {
      name: 'DJ Berlin',
      email: 'dj@berlin-nights.de',
      phone: '+49 30 7777 8888',
      mobile: '+49 178 9999000',
      role: 'Host / Emcee',
      socialMedia: '@djberlin',
    },

    // SECURITY (4 fields)
    securityLead: {
      name: 'Stefan Hoffmann',
      email: 'stefan@tresor-security.de',
      phone: '+49 30 9999 0000',
      mobile: '+49 175 1111222',
      role: 'Security Lead',
      company: 'Tresor Security',
      teamSize: '15 personnel',
    },

    // PERMITS & REGULATIONS (3 fields)
    regulations: {
      name: 'Petra Braun',
      email: 'petra@berlin-events.de',
      phone: '+49 30 2222 3333',
      role: 'Permits & Regulations',
      agency: 'Berlin Event Licensing',
      permitNumber: 'BEL-2026-04-0415',
    },

    // INSURANCE & LEGAL (3 fields)
    insurance: {
      provider: 'EventSure Insurance',
      policyNumber: 'POL-2026-ENG-004',
      contact: 'Michael Berg',
      phone: '+49 30 6666 6666',
    },

    // SOUND SYSTEM SPECS (4 fields)
    soundSystem: {
      systemType: 'Full PA + Subwoofer Array',
      power: '25kW+ capacity',
      technician: 'Marcus Weber',
      backupAvailable: 'Yes - full redundancy',
    },

    // LIGHTING RIG (4 fields)
    lightingRig: {
      systemType: '400+ intelligent fixtures',
      riggingPoints: '48 points',
      designFile: 'Electric_Nights_2026_V3.mad',
      supportEngineer: 'Anna Volkova',
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
          <Link href="/gigs" className="inline-flex items-center gap-2 text-night-light hover:text-night-silver transition-colors mb-4">
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Gigs</span>
          </Link>
          <h1 className="text-5xl font-bold text-night-silver tracking-tight">{gig.title}</h1>
          <p className="text-night-light mt-3 text-lg">{gig.venue}, {gig.location}</p>
        </div>
      </div>

      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          {/* Gig Overview */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6">
              <p className="text-night-silver text-xs font-semibold uppercase tracking-wide mb-2">Date & Time</p>
              <p className="text-night-light font-semibold">{new Date(gig.date).toLocaleDateString('en-GB')} at {gig.time}</p>
            </div>
            <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6">
              <p className="text-night-silver text-xs font-semibold uppercase tracking-wide mb-2">Expected Audience</p>
              <p className="text-night-light font-semibold">{gig.audience.toLocaleString()}</p>
            </div>
            <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6">
              <p className="text-night-silver text-xs font-semibold uppercase tracking-wide mb-2">Performance Fee</p>
              <p className="text-night-light font-semibold">€{gig.fee.toLocaleString()}</p>
            </div>
            <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6">
              <p className="text-night-silver text-xs font-semibold uppercase tracking-wide mb-2">Status</p>
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
                  : 'border-transparent text-night-light hover:text-night-silver'
              }`}
            >
              LOGISTICS
            </button>
            <button
              onClick={() => setActiveTab('invoicing')}
              className={`px-6 py-3 font-semibold text-sm border-b-2 transition-colors ${
                activeTab === 'invoicing'
                  ? 'border-night-silver text-night-silver'
                  : 'border-transparent text-night-light hover:text-night-silver'
              }`}
            >
              INVOICING
            </button>
          </div>

          {/* LOGISTICS Tab */}
          {activeTab === 'logistics' && (
            <div className="space-y-8">
              {/* VENUE SECTION */}
              <div>
                <h2 className="text-2xl font-bold text-night-silver mb-4 flex items-center gap-2">
                  <Building className="w-6 h-6 text-night-silver" />
                  Venue Information
                </h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6 space-y-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Venue Name</p>
                      <p className="text-night-light text-lg">{logistics.venue.name}</p>
                    </div>
                    <div className="border-t border-night-dark-gray pt-3">
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Address</p>
                      <p className="text-night-light text-sm">{logistics.venue.address}</p>
                    </div>
                    <div className="border-t border-night-dark-gray pt-3">
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Phone</p>
                      <a href={`tel:${logistics.venue.phone}`} className="text-night-light hover:text-night-silver transition-colors">{logistics.venue.phone}</a>
                    </div>
                    <div className="border-t border-night-dark-gray pt-3">
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Email</p>
                      <a href={`mailto:${logistics.venue.email}`} className="text-night-light hover:text-night-silver transition-colors">{logistics.venue.email}</a>
                    </div>
                    <div className="border-t border-night-dark-gray pt-3">
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Capacity</p>
                      <p className="text-night-light">{logistics.venue.capacity} persons</p>
                    </div>
                  </div>
                  
                  <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-night-silver mb-4">Venue Manager</h3>
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Name</p>
                        <p className="text-night-light">{logistics.venueManager.name}</p>
                      </div>
                      <div className="border-t border-night-dark-gray pt-3">
                        <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Email</p>
                        <a href={`mailto:${logistics.venueManager.email}`} className="text-night-light hover:text-night-silver transition-colors flex items-center gap-2">
                          <Mail className="w-4 h-4" />
                          {logistics.venueManager.email}
                        </a>
                      </div>
                      <div className="border-t border-night-dark-gray pt-3">
                        <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Mobile</p>
                        <a href={`tel:${logistics.venueManager.mobile}`} className="text-night-light hover:text-night-silver transition-colors flex items-center gap-2">
                          <Phone className="w-4 h-4" />
                          {logistics.venueManager.mobile}
                        </a>
                      </div>
                      <div className="border-t border-night-dark-gray pt-3">
                        <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Office</p>
                        <p className="text-night-light">{logistics.venueManager.office}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ACCOMMODATION SECTION */}
              <div>
                <h2 className="text-2xl font-bold text-night-silver mb-4 flex items-center gap-2">
                  <MapPin className="w-6 h-6 text-night-silver" />
                  Hotel & Accommodation
                </h2>
                <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6 space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Hotel Name</p>
                      <p className="text-night-light text-lg">{logistics.hotel.name}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Confirmation #</p>
                      <p className="text-night-light">{logistics.hotel.confirmationNumber}</p>
                    </div>
                  </div>
                  <div className="border-t border-night-dark-gray pt-3">
                    <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Address</p>
                    <p className="text-night-light">{logistics.hotel.address}</p>
                  </div>
                  <div className="border-t border-night-dark-gray pt-3 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Check-in</p>
                      <p className="text-night-light">{logistics.hotel.checkInTime}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Check-out</p>
                      <p className="text-night-light">{logistics.hotel.checkOutTime}</p>
                    </div>
                  </div>
                  <div className="border-t border-night-dark-gray pt-3">
                    <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Phone</p>
                    <a href={`tel:${logistics.hotel.phone}`} className="text-night-light hover:text-night-silver transition-colors">{logistics.hotel.phone}</a>
                  </div>
                </div>
              </div>

              {/* TRAVEL & TRANSPORT SECTION */}
              <div>
                <h2 className="text-2xl font-bold text-night-silver mb-4 flex items-center gap-2">
                  <Car className="w-6 h-6 text-night-silver" />
                  Travel & Transport
                </h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6 space-y-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Travel Method</p>
                      <p className="text-night-light">{logistics.travel.method}</p>
                    </div>
                    <div className="border-t border-night-dark-gray pt-3">
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Flight Number</p>
                      <p className="text-night-light">{logistics.travel.flightNumber}</p>
                    </div>
                    <div className="border-t border-night-dark-gray pt-3">
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Route</p>
                      <p className="text-night-light">{logistics.travel.departureCity} → {logistics.travel.arrivalAirport}</p>
                    </div>
                    <div className="border-t border-night-dark-gray pt-3">
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Travel Date & Time</p>
                      <p className="text-night-light">{logistics.travel.travelDate} at {logistics.travel.travelTime}</p>
                    </div>
                  </div>

                  <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6 space-y-3">
                    <h3 className="text-lg font-semibold text-night-silver mb-4">Driver Information</h3>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Driver Name</p>
                      <p className="text-night-light">{logistics.driver.name}</p>
                    </div>
                    <div className="border-t border-night-dark-gray pt-3">
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Phone</p>
                      <a href={`tel:${logistics.driver.phone}`} className="text-night-light hover:text-night-silver transition-colors flex items-center gap-2">
                        <Phone className="w-4 h-4" />
                        {logistics.driver.phone}
                      </a>
                    </div>
                    <div className="border-t border-night-dark-gray pt-3">
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Mobile</p>
                      <a href={`tel:${logistics.driver.mobile}`} className="text-night-light hover:text-night-silver transition-colors flex items-center gap-2">
                        <Phone className="w-4 h-4" />
                        {logistics.driver.mobile}
                      </a>
                    </div>
                    <div className="border-t border-night-dark-gray pt-3">
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Vehicle</p>
                      <p className="text-night-light">{logistics.driver.carType}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* SCHEDULE SECTION */}
              <div>
                <h2 className="text-2xl font-bold text-night-silver mb-4 flex items-center gap-2">
                  <Clock className="w-6 h-6 text-night-silver" />
                  Performance Schedule
                </h2>
                <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6 space-y-3">
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Load-in Time</p>
                      <p className="text-night-light">{logistics.schedule.loadInTime}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Sound Check</p>
                      <p className="text-night-light">{logistics.schedule.soundCheckTime}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Stage Time</p>
                      <p className="text-night-light text-lg font-bold">{logistics.schedule.stageTime}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Duration</p>
                      <p className="text-night-light">{logistics.schedule.performanceDuration}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Load-out Time</p>
                      <p className="text-night-light">{logistics.schedule.loadOutTime}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* CATERING SECTION */}
              <div>
                <h2 className="text-2xl font-bold text-night-silver mb-4 flex items-center gap-2">
                  <Utensils className="w-6 h-6 text-night-silver" />
                  Catering & Hospitality
                </h2>
                <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6 space-y-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Catering Provider</p>
                    <p className="text-night-light">{logistics.catering.provider}</p>
                  </div>
                  <div className="border-t border-night-dark-gray pt-3">
                    <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Contact Person</p>
                    <p className="text-night-light">{logistics.catering.contact}</p>
                  </div>
                  <div className="border-t border-night-dark-gray pt-3">
                    <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Phone</p>
                    <a href={`tel:${logistics.catering.phone}`} className="text-night-light hover:text-night-silver transition-colors">{logistics.catering.phone}</a>
                  </div>
                  <div className="border-t border-night-dark-gray pt-3">
                    <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Meal Types</p>
                    <p className="text-night-light">{logistics.catering.mealTypes}</p>
                  </div>
                  <div className="border-t border-night-dark-gray pt-3">
                    <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Special Requirements</p>
                    <p className="text-night-light">{logistics.catering.specialRequirements}</p>
                  </div>
                </div>
              </div>

              {/* TECHNICAL TEAM SECTION */}
              <div>
                <h2 className="text-2xl font-bold text-night-silver mb-4 flex items-center gap-2">
                  <Music className="w-6 h-6 text-night-silver" />
                  Technical Team
                </h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Sound Engineer */}
                  <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6 space-y-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Sound Engineer</p>
                      <p className="text-night-light text-lg">{logistics.soundEngineer.name}</p>
                      <p className="text-night-silver text-xs mt-1">{logistics.soundEngineer.credentials}</p>
                    </div>
                    <div className="border-t border-night-dark-gray pt-3">
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Email</p>
                      <a href={`mailto:${logistics.soundEngineer.email}`} className="text-night-light hover:text-night-silver transition-colors flex items-center gap-2">
                        <Mail className="w-4 h-4" />
                        {logistics.soundEngineer.email}
                      </a>
                    </div>
                    <div className="border-t border-night-dark-gray pt-3">
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Mobile</p>
                      <a href={`tel:${logistics.soundEngineer.mobile}`} className="text-night-light hover:text-night-silver transition-colors">{logistics.soundEngineer.mobile}</a>
                    </div>
                    <div className="border-t border-night-dark-gray pt-3">
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Office</p>
                      <p className="text-night-light">{logistics.soundEngineer.office}</p>
                    </div>
                  </div>

                  {/* Lighting Engineer */}
                  <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6 space-y-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Lighting Engineer</p>
                      <p className="text-night-light text-lg">{logistics.lightingEngineer.name}</p>
                      <p className="text-night-silver text-xs mt-1">{logistics.lightingEngineer.credentials}</p>
                    </div>
                    <div className="border-t border-night-dark-gray pt-3">
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Email</p>
                      <a href={`mailto:${logistics.lightingEngineer.email}`} className="text-night-light hover:text-night-silver transition-colors flex items-center gap-2">
                        <Mail className="w-4 h-4" />
                        {logistics.lightingEngineer.email}
                      </a>
                    </div>
                    <div className="border-t border-night-dark-gray pt-3">
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Mobile</p>
                      <a href={`tel:${logistics.lightingEngineer.mobile}`} className="text-night-light hover:text-night-silver transition-colors">{logistics.lightingEngineer.mobile}</a>
                    </div>
                    <div className="border-t border-night-dark-gray pt-3">
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Role</p>
                      <p className="text-night-light">{logistics.lightingEngineer.role}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* LOGISTICS & SUPPORT */}
              <div>
                <h2 className="text-2xl font-bold text-night-silver mb-4 flex items-center gap-2">
                  <Building className="w-6 h-6 text-night-silver" />
                  Logistics & Support
                </h2>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Logistics Coordinator */}
                  <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6 space-y-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Logistics Coordinator</p>
                      <p className="text-night-light">{logistics.logisticsCoord.name}</p>
                    </div>
                    <div className="border-t border-night-dark-gray pt-3">
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Mobile</p>
                      <a href={`tel:${logistics.logisticsCoord.mobile}`} className="text-night-light hover:text-night-silver transition-colors">{logistics.logisticsCoord.mobile}</a>
                    </div>
                    <div className="border-t border-night-dark-gray pt-3">
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Email</p>
                      <a href={`mailto:${logistics.logisticsCoord.email}`} className="text-night-light hover:text-night-silver transition-colors text-sm">{logistics.logisticsCoord.email}</a>
                    </div>
                  </div>

                  {/* Promoter */}
                  <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6 space-y-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Festival Promoter</p>
                      <p className="text-night-light">{logistics.promoter.name}</p>
                      <p className="text-night-silver text-xs mt-1">{logistics.promoter.company}</p>
                    </div>
                    <div className="border-t border-night-dark-gray pt-3">
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Email</p>
                      <a href={`mailto:${logistics.promoter.email}`} className="text-night-light hover:text-night-silver transition-colors flex items-center gap-2">
                        <Mail className="w-4 h-4" />
                        {logistics.promoter.email}
                      </a>
                    </div>
                    <div className="border-t border-night-dark-gray pt-3">
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Phone</p>
                      <a href={`tel:${logistics.promoter.phone}`} className="text-night-light hover:text-night-silver transition-colors">{logistics.promoter.phone}</a>
                    </div>
                  </div>

                  {/* Security Lead */}
                  <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6 space-y-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Security Lead</p>
                      <p className="text-night-light">{logistics.securityLead.name}</p>
                      <p className="text-night-silver text-xs mt-1">{logistics.securityLead.teamSize}</p>
                    </div>
                    <div className="border-t border-night-dark-gray pt-3">
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Email</p>
                      <a href={`mailto:${logistics.securityLead.email}`} className="text-night-light hover:text-night-silver transition-colors flex items-center gap-2">
                        <Mail className="w-4 h-4" />
                        {logistics.securityLead.email}
                      </a>
                    </div>
                    <div className="border-t border-night-dark-gray pt-3">
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Phone</p>
                      <a href={`tel:${logistics.securityLead.phone}`} className="text-night-light hover:text-night-silver transition-colors">{logistics.securityLead.phone}</a>
                    </div>
                  </div>
                </div>
              </div>

              {/* PERMITS & REGULATIONS */}
              <div>
                <h2 className="text-2xl font-bold text-night-silver mb-4 flex items-center gap-2">
                  <FileText className="w-6 h-6 text-night-silver" />
                  Permits, Regulations & Legal
                </h2>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6 space-y-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Permit Authority</p>
                      <p className="text-night-light">{logistics.regulations.agency}</p>
                    </div>
                    <div className="border-t border-night-dark-gray pt-3">
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Permit Number</p>
                      <p className="text-night-light">{logistics.regulations.permitNumber}</p>
                    </div>
                    <div className="border-t border-night-dark-gray pt-3">
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Contact</p>
                      <p className="text-night-light">{logistics.regulations.name}</p>
                    </div>
                    <div className="border-t border-night-dark-gray pt-3">
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Phone</p>
                      <a href={`tel:${logistics.regulations.phone}`} className="text-night-light hover:text-night-silver transition-colors">{logistics.regulations.phone}</a>
                    </div>
                  </div>

                  <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6 space-y-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Insurance Provider</p>
                      <p className="text-night-light">{logistics.insurance.provider}</p>
                    </div>
                    <div className="border-t border-night-dark-gray pt-3">
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Policy Number</p>
                      <p className="text-night-light">{logistics.insurance.policyNumber}</p>
                    </div>
                    <div className="border-t border-night-dark-gray pt-3">
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Contact</p>
                      <p className="text-night-light">{logistics.insurance.contact}</p>
                    </div>
                    <div className="border-t border-night-dark-gray pt-3">
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Phone</p>
                      <a href={`tel:${logistics.insurance.phone}`} className="text-night-light hover:text-night-silver transition-colors">{logistics.insurance.phone}</a>
                    </div>
                  </div>

                  <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6 space-y-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Sound System</p>
                      <p className="text-night-light">{logistics.soundSystem.systemType}</p>
                    </div>
                    <div className="border-t border-night-dark-gray pt-3">
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Power</p>
                      <p className="text-night-light">{logistics.soundSystem.power}</p>
                    </div>
                    <div className="border-t border-night-dark-gray pt-3">
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Technician</p>
                      <p className="text-night-light">{logistics.soundSystem.technician}</p>
                    </div>
                    <div className="border-t border-night-dark-gray pt-3">
                      <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Backup</p>
                      <p className="text-night-light">{logistics.soundSystem.backupAvailable}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* LIGHTING RIG SPECS */}
              <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6 space-y-3">
                <h3 className="text-lg font-semibold text-night-silver mb-4">Lighting Rig Specifications</h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">System Type</p>
                    <p className="text-night-light">{logistics.lightingRig.systemType}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Rigging Points</p>
                    <p className="text-night-light">{logistics.lightingRig.riggingPoints}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Design File</p>
                    <p className="text-night-light text-sm">{logistics.lightingRig.designFile}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-night-silver font-semibold mb-1">Support Engineer</p>
                    <p className="text-night-light">{logistics.lightingRig.supportEngineer}</p>
                  </div>
                </div>
              </div>

              {/* Cross-links */}
              <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6 mt-8">
                <h3 className="text-lg font-semibold text-night-silver mb-4">Related Services</h3>
                <div className="flex gap-4 flex-wrap">
                  <a
                    href="#broadcast-lab"
                    className="px-4 py-2 bg-night-dark-gray hover:bg-night-dark-gray/70 text-night-light rounded transition-colors text-sm"
                  >
                    → Broadcast Lab Integration
                  </a>
                  <a
                    href="#sonix"
                    className="px-4 py-2 bg-night-dark-gray hover:bg-night-dark-gray/70 text-night-light rounded transition-colors text-sm"
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
                    <div key={contract.id} className="flex items-center justify-between p-4 bg-night-dark-gray rounded border border-night-dark-gray/50">
                      <div>
                        <p className="text-night-light font-semibold">{contract.name}</p>
                        <p className="text-night-light text-sm">Signed {new Date(contract.date).toLocaleDateString('en-GB')}</p>
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
                    <div key={invoice.id} className="flex items-center justify-between p-4 bg-night-dark-gray rounded border border-night-dark-gray/50">
                      <div>
                        <p className="text-night-light font-semibold">{invoice.number}</p>
                        <p className="text-night-light text-sm">Issued {new Date(invoice.date).toLocaleDateString('en-GB')} • Due {new Date(invoice.dueDate).toLocaleDateString('en-GB')}</p>
                      </div>
                      <span className="text-right">
                        <p className="text-night-light font-bold">€{invoice.amount.toLocaleString()}</p>
                        <span className="text-xs text-night-light">{invoice.status}</span>
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
                    <div key={payment.id} className="flex items-center justify-between p-4 bg-night-dark-gray rounded border border-night-dark-gray/50">
                      <div>
                        <p className="text-night-light font-semibold">{payment.method}</p>
                        <p className="text-night-light text-sm">{new Date(payment.date).toLocaleDateString('en-GB')}</p>
                      </div>
                      <span className="text-right">
                        <p className="text-night-light font-bold">€{payment.amount.toLocaleString()}</p>
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
                    <div key={expense.id} className="flex items-center justify-between p-4 bg-night-dark-gray rounded border border-night-dark-gray/50">
                      <div>
                        <p className="text-night-light font-semibold">{expense.description}</p>
                        <p className="text-night-light text-sm">{new Date(expense.date).toLocaleDateString('en-GB')} • {expense.category}</p>
                      </div>
                      <span className="text-night-light font-bold">-€{expense.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>

                {/* Profit Summary */}
                <div className="border-t border-night-dark-gray pt-6 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-night-light">Gross Income</span>
                    <span className="text-night-light font-semibold">€{gig.fee.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-night-light">Total Expenses</span>
                    <span className="text-night-light font-semibold">-€{totalExpenses.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold pt-2 border-t border-night-dark-gray">
                    <span className="text-night-light">Net Profit</span>
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
