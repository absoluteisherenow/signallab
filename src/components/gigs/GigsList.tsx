'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Calendar, MapPin, Clock, Plus } from 'lucide-react'
import { Header } from '@/components/dashboard/Header'

interface Gig {
  id: number
  title: string
  date: string
  time: string
  location: string
  venue: string
  status: 'confirmed' | 'pending'
  audience: number
  fee: number
}

const gigs: Gig[] = [
  {
    id: 1,
    title: 'Electric Nights Festival',
    date: '2026-04-15',
    time: '22:00',
    location: 'Berlin, Germany',
    venue: 'Tresor Club',
    status: 'confirmed',
    audience: 2500,
    fee: 5000,
  },
  {
    id: 2,
    title: 'Summer Series - Week 2',
    date: '2026-04-22',
    time: '20:00',
    location: 'Amsterdam, Netherlands',
    venue: 'Melkweg',
    status: 'confirmed',
    audience: 1800,
    fee: 3500,
  },
  {
    id: 3,
    title: 'Techno Sessions',
    date: '2026-05-01',
    time: '23:00',
    location: 'London, UK',
    venue: 'Ministry of Sound',
    status: 'pending',
    audience: 3000,
    fee: 6000,
  },
  {
    id: 4,
    title: 'Open Air Summer',
    date: '2026-05-15',
    time: '19:00',
    location: 'Basel, Switzerland',
    venue: 'Kaserne',
    status: 'confirmed',
    audience: 4000,
    fee: 7500,
  },
]

export function GigsList() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-night-black">
      <Header title="GIGS" subtitle="Manage all your bookings and performances" />

      <div className="p-8">
        <div className="max-w-6xl mx-auto">
          {/* Add Gig Button */}
          <button className="mb-8 flex items-center gap-2 px-6 py-3 bg-night-silver text-night-black rounded-lg font-semibold hover:bg-night-light transition-colors">
            <Plus className="w-5 h-5" />
            Add New Gig
          </button>

          {/* Gigs Table */}
          <div className="bg-night-gray border border-night-dark-gray rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-night-dark-gray bg-night-dark-gray">
                  <tr className="text-night-dark-gray">
                    <th className="text-left py-4 px-6 font-semibold">Event</th>
                    <th className="text-left py-4 px-6 font-semibold">Date & Time</th>
                    <th className="text-left py-4 px-6 font-semibold">Location</th>
                    <th className="text-center py-4 px-6 font-semibold">Status</th>
                    <th className="text-right py-4 px-6 font-semibold">Audience</th>
                    <th className="text-right py-4 px-6 font-semibold">Fee</th>
                    <th className="text-center py-4 px-6 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {gigs.map((gig) => (
                    <tr
                      key={gig.id}
                      className="border-b border-night-dark-gray hover:bg-night-dark-gray transition-colors cursor-pointer group"
                      onClick={() => {
                        router.push(`/gigs/${gig.id}`)
                      }}
                    >
                      <td className="py-4 px-6">
                        <div>
                          <p className="text-night-light font-semibold group-hover:text-night-silver transition-colors">{gig.title}</p>
                          <p className="text-night-dark-gray text-xs mt-1">{gig.venue}</p>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-night-dark-gray">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-night-silver" />
                          <span>{new Date(gig.date).toLocaleDateString('en-GB')}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Clock className="w-4 h-4 text-night-silver" />
                          <span>{gig.time}</span>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-night-dark-gray">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-4 h-4 text-night-silver" />
                          <span>{gig.location}</span>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-center">
                        <span
                          className={`inline-block px-3 py-1 rounded text-xs font-semibold uppercase ${
                            gig.status === 'confirmed'
                              ? 'bg-green-900/30 text-green-400'
                              : 'bg-yellow-900/30 text-yellow-400'
                          }`}
                        >
                          {gig.status}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right text-night-light">
                        {gig.audience.toLocaleString()}
                      </td>
                      <td className="py-4 px-6 text-right text-night-silver font-bold">
                        €{gig.fee.toLocaleString()}
                      </td>
                      <td className="py-4 px-6 text-center">
                       <Link
  href={`/broadcast?gig=${gig.id}&venue=${encodeURIComponent(gig.venue)}&location=${encodeURIComponent(gig.location)}&title=${encodeURIComponent(gig.title)}&date=${gig.date}`}
  className="text-[#b08d57] hover:text-[#c9a46e] transition-colors font-semibold mr-3 text-xs"
  onClick={(e) => e.stopPropagation()}
>
  Post
</Link> <button
  onClick={async (e) => {
    e.stopPropagation()
    const res = await fetch('/api/advance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gigId: gig.id,
        gigTitle: gig.title,
        venue: gig.venue,
        date: gig.date,
        promoterEmail: 'absoluteishere@gmail.com',
      }),
    })
    const data = await res.json()
    if (data.success) alert('Advance request sent!')
    else alert('Error: ' + data.error)
  }}
  className="text-[#3d6b4a] hover:text-[#4a8a5a] transition-colors font-semibold mr-3 text-xs"
>
  Advance
</button> <Link
                          href={`/gigs/${gig.id}`}
                          className="text-night-silver hover:text-night-light transition-colors font-semibold"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
