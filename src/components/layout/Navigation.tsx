'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Calendar, ListIcon, CheckSquare, DollarSign, Settings, Disc3, Music } from 'lucide-react'

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
        { label: 'Playlists', href: '/prep/playlists', icon: ListIcon },
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
    <nav className="w-52 bg-[#070706] border-r border-white/7 flex flex-col" style={{fontFamily:'DM Mono, monospace'}}>
      <div className="p-6 border-b border-white/7">
        <div className="mb-1">
          <div style={{fontFamily:'Unbounded, sans-serif'}} className="text-sm font-light tracking-widest text-[#f0ebe2]">NIGHT</div>
          <div style={{fontFamily:'Unbounded, sans-serif'}} className="text-sm font-light tracking-widest text-[#b08d57]">MANOEUVRES</div>
        </div>
        <div className="text-[9px] tracking-[.18em] uppercase text-[#8a8780] mt-3">Signal Lab</div>
      </div>

      <div className="flex-1 overflow-y-auto py-6">
        {navSections.map((section) => (
          <div key={section.title} className="mb-7 px-4">
            <div className="text-[8px] font-light tracking-[.22em] text-[#8a8780] uppercase mb-2 px-2">{section.title}</div>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon
                const active = isActive(item.href)
                return (
                  <li key={item.href}>
                    <Link href={item.href}
                      className={`flex items-center gap-3 px-3 py-2 text-[10.5px] tracking-[.08em] transition-colors ${
                        active ? 'bg-white/7 text-[#f0ebe2]' : 'text-[#8a8780] hover:text-[#f0ebe2] hover:bg-white/4'
                      }`}>
                      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-white/7 p-4 space-y-0.5">
        <Link href="/broadcast"
          className={`flex items-center gap-3 px-3 py-2 text-[10.5px] tracking-[.08em] transition-colors ${
            pathname.startsWith('/broadcast') ? 'bg-white/7 text-[#b08d57]' : 'text-[#8a8780] hover:text-[#b08d57] hover:bg-white/4'
          }`}>
          <Disc3 className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Broadcast Lab</span>
        </Link>
        <a href="/sonix"
          className="flex items-center gap-3 px-3 py-2 text-[10.5px] tracking-[.08em] text-[#8a8780] hover:text-[#8a8780] transition-colors">
          <Music className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Sonix Lab</span>
        </a>
      </div>
    </nav>
  )
}
