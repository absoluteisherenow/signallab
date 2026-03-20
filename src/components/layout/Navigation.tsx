'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Music,
  Calendar,
  PlaylistIcon,
  CheckSquare,
  DollarSign,
  Settings,
  Radio,
  Disc3,
} from 'lucide-react'

export function Navigation() {
  const pathname = usePathname()

  const navSections = [
    {
      title: 'TOURING',
      items: [
        { label: 'Dashboard', href: '/', icon: Music },
        { label: 'Gigs', href: '/gigs', icon: Calendar },
      ],
    },
    {
      title: 'PREP',
      items: [
        { label: 'Playlists', href: '/prep/playlists', icon: PlaylistIcon },
        { label: 'Tasks', href: '/prep/tasks', icon: CheckSquare },
      ],
    },
    {
      title: 'BUSINESS',
      items: [
        { label: 'Finances', href: '/business/finances', icon: DollarSign },
        { label: 'Settings', href: '/business/settings', icon: Settings },
      ],
    },
  ]

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  return (
    <nav className="w-64 bg-night-gray border-r border-night-dark-gray flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-night-dark-gray">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-night-silver rounded-lg flex items-center justify-center">
            <Radio className="w-6 h-6 text-night-black" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-night-silver">NIGHT</h1>
            <p className="text-xs text-night-dark-gray">MANOEUVRES</p>
          </div>
        </div>
        <p className="text-xs text-night-dark-gray mt-3">Signal Lab Dashboard</p>
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 overflow-y-auto py-6">
        {navSections.map((section) => (
          <div key={section.title} className="mb-8 px-4">
            <h2 className="text-xs font-semibold text-night-silver uppercase tracking-wider mb-3 px-2">
              {section.title}
            </h2>
            <ul className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon
                const active = isActive(item.href)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                        active
                          ? 'bg-night-dark-gray text-night-silver'
                          : 'text-night-dark-gray hover:text-night-light hover:bg-night-dark-gray/50'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* Footer Links */}
      <div className="border-t border-night-dark-gray p-4 space-y-2">
        <a
          href="#broadcast-lab"
          className="flex items-center gap-2 px-3 py-2 text-xs text-night-dark-gray hover:text-night-silver transition-colors rounded hover:bg-night-dark-gray/50"
        >
          <Disc3 className="w-4 h-4" />
          Broadcast Lab
        </a>
        <a
          href="#sonix"
          className="flex items-center gap-2 px-3 py-2 text-xs text-night-dark-gray hover:text-night-silver transition-colors rounded hover:bg-night-dark-gray/50"
        >
          <Music className="w-4 h-4" />
          SONIX
        </a>
      </div>
    </nav>
  )
}
