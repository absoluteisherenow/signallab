'use client'

import Link from 'next/link'
import { Calendar, MapPin, Clock, ArrowRight } from 'lucide-react'
import { Header } from './Header'

// Mock data
const upcomingShows = [
  {
    id: 1,
    title: 'Electric Nights Festival',
    date: '2026-04-15',
    time: '22:00',
    location: 'Berlin, Germany',
    venue: 'Tresor Club',
    status: 'confirmed',
    audience: 2500,
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
  },
]

export function Dashboard() {
  return (
    <div className="min-h-screen bg-night-black">
      <Header title="FORTHCOMING SHOWS" subtitle="Your upcoming performances and events" />

      <div className="p-8">
        <div className="grid grid-cols-1 gap-4 max-w-6xl">
          {upcomingShows.map((show) => (
            <Link
              key={show.id}
              href={`/gigs/${show.id}`}
              className="group bg-night-gray hover:bg-night-dark-gray border border-night-dark-gray hover:border-night-silver transition-all duration-200 rounded-lg p-6 cursor-pointer"
            >
              <div className="flex items-start justify-between gap-6">
                {/* Left: Show Info */}
                <div className="flex-1">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-night-light mb-3 group-hover:text-night-silver transition-colors">
                        {show.title}
                      </h3>

                      <div className="space-y-2 text-sm text-night-dark-gray">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-night-silver" />
                          <span>{new Date(show.date).toLocaleDateString('en-GB', {
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-night-silver" />
                          <span>{show.time}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-night-silver" />
                          <span>{show.venue}, {show.location}</span>
                        </div>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div>
                      <span className={`inline-block px-3 py-1 rounded text-xs font-semibold uppercase tracking-wide ${
                        show.status === 'confirmed'
                          ? 'bg-green-900/30 text-green-400'
                          : 'bg-yellow-900/30 text-yellow-400'
                      }`}>
                        {show.status}
                      </span>
                    </div>
                  </div>

                  {/* Quick Stats */}
                  <div className="flex gap-6 text-xs text-night-dark-gray pt-3 border-t border-night-dark-gray">
                    <div>
                      <p className="text-night-dark-gray mb-1">Expected Audience</p>
                      <p className="text-night-silver font-semibold">{show.audience.toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                {/* Right: Action Arrow */}
                <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-night-dark-gray group-hover:bg-night-silver/10 transition-colors">
                  <ArrowRight className="w-5 h-5 text-night-silver group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
