'use client'

import Link from 'next/link'
import { Music, Plus, ArrowRight, Clock, BarChart3 } from 'lucide-react'
import { Header } from '@/components/dashboard/Header'

interface Playlist {
  id: number
  title: string
  tracks: number
  duration: string
  genre: string
  intensity: number
  event?: string
}

const playlists: Playlist[] = [
  {
    id: 1,
    title: 'Electric Peak Hours',
    tracks: 127,
    duration: '8h 34m',
    genre: 'Techno',
    intensity: 9,
    event: 'Electric Nights Festival',
  },
  {
    id: 2,
    title: 'Summer Vibes',
    tracks: 95,
    duration: '6h 12m',
    genre: 'House / Tech House',
    intensity: 7,
    event: 'Summer Series - Week 2',
  },
  {
    id: 3,
    title: 'Deep Sessions',
    tracks: 156,
    duration: '10h 45m',
    genre: 'Deep House / Techno',
    intensity: 6,
  },
  {
    id: 4,
    title: 'Warm-up Grooves',
    tracks: 84,
    duration: '5h 28m',
    genre: 'Minimal / House',
    intensity: 4,
  },
]

export function PlaylistsPage() {
  return (
    <div className="min-h-screen bg-night-black">
      <Header title="PLAYLISTS" subtitle="Manage your music collections and Rekordbox integration" />

      <div className="p-8">
        <div className="max-w-6xl mx-auto">
          {/* Action Bar */}
          <div className="mb-8 flex gap-4 items-center">
            <button className="flex items-center gap-2 px-6 py-3 bg-night-silver text-night-black rounded-lg font-semibold hover:bg-night-light transition-colors">
              <Plus className="w-5 h-5" />
              New Playlist
            </button>
            <a
              href="#rekordbox"
              className="flex items-center gap-2 px-6 py-3 bg-night-dark-gray text-night-silver rounded-lg font-semibold hover:bg-night-dark-gray/70 transition-colors"
            >
              <Music className="w-5 h-5" />
              Rekordbox Sync
            </a>
          </div>

          {/* Playlists Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {playlists.map((playlist) => (
              <div
                key={playlist.id}
                className="group bg-night-gray border border-night-dark-gray hover:border-night-silver transition-all rounded-lg p-6 cursor-pointer hover:bg-night-dark-gray"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-night-silver group-hover:text-night-light transition-colors">
                      {playlist.title}
                    </h3>
                    <p className="text-night-dark-gray text-sm mt-1">{playlist.genre}</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-night-silver opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-night-dark-gray">
                    <Music className="w-4 h-4 text-night-silver" />
                    <span>{playlist.tracks} tracks</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-night-dark-gray">
                    <Clock className="w-4 h-4 text-night-silver" />
                    <span>{playlist.duration}</span>
                  </div>

                  {playlist.event && (
                    <div className="pt-2 border-t border-night-dark-gray">
                      <p className="text-xs text-night-dark-gray mb-1">Associated Event</p>
                      <p className="text-xs text-night-silver">{playlist.event}</p>
                    </div>
                  )}

                  {/* Intensity Bar */}
                  <div className="pt-2 border-t border-night-dark-gray">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-night-dark-gray">Intensity</span>
                      <span className="text-xs text-night-silver">{playlist.intensity}/10</span>
                    </div>
                    <div className="w-full h-1 bg-night-dark-gray rounded-full overflow-hidden">
                      <div
                        className="h-full bg-night-silver transition-all"
                        style={{ width: `${(playlist.intensity / 10) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Rekordbox Integration Info */}
          <div className="bg-night-gray border border-night-dark-gray rounded-lg p-6">
            <h3 className="text-lg font-semibold text-night-silver mb-4 flex items-center gap-2">
              <Music className="w-5 h-5" />
              Rekordbox Integration
            </h3>
            <p className="text-night-dark-gray mb-4">
              Keep your playlists synchronized with Rekordbox for seamless performance preparation.
            </p>
            <div className="bg-night-dark-gray rounded p-4 mb-4">
              <p className="text-night-silver text-sm font-mono">Last sync: 2026-03-20 18:45 UTC</p>
              <p className="text-night-dark-gray text-sm">127 playlists • 8,432 tracks</p>
            </div>
            <button className="px-4 py-2 bg-night-silver text-night-black rounded font-semibold hover:bg-night-light transition-colors text-sm">
              Sync Now
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
