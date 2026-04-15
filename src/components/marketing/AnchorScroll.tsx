'use client'

// ── AnchorScroll ────────────────────────────────────────────────────────────
// The root layout wraps children in a scrolling `<main class="app-main">` —
// that is the real scroll container, not the window. Native anchor navigation
// (`<a href="#moments">`) tries to scroll the window, which isn't scrollable,
// so buttons like "See what's inside" do nothing.
//
// This component intercepts every in-page anchor click on the marketing page
// and programmatically scrolls the correct container, offsetting by the sticky
// header height. Also handles initial hash on load (e.g. /#pricing).

import { useEffect } from 'react'

const HEADER_OFFSET = 72

function findScroller(): HTMLElement | null {
  // Prefer the root layout's app-main scroller. Fallback to documentElement.
  const main = document.querySelector('main.app-main') as HTMLElement | null
  if (main && main.scrollHeight > main.clientHeight) return main
  return null
}

function scrollToId(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const scroller = findScroller()
  if (scroller) {
    const top = el.getBoundingClientRect().top + scroller.scrollTop - HEADER_OFFSET
    scroller.scrollTo({ top, behavior: 'smooth' })
    // Safety fallback: if smooth scroll was throttled (hidden tab, reduced
    // motion, etc.), jump to position after a short window. No-op when smooth
    // scroll already landed on target.
    setTimeout(() => {
      if (Math.abs(scroller.scrollTop - top) > 2) {
        scroller.scrollTop = top
      }
    }, 400)
  } else {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

export default function AnchorScroll() {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      // Ignore modifier clicks — let default behaviour handle new-tab etc.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
      const path = e.composedPath() as HTMLElement[]
      const anchor = path.find(
        node => node && (node as HTMLElement).tagName === 'A',
      ) as HTMLAnchorElement | undefined
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href || !href.startsWith('#')) return
      const id = href.slice(1)
      if (!id) return
      const target = document.getElementById(id)
      if (!target) return
      e.preventDefault()
      scrollToId(id)
      // Update hash without jumping (history only)
      if (window.location.hash !== `#${id}`) {
        history.pushState(null, '', `#${id}`)
      }
    }
    document.addEventListener('click', handler)

    // Honour initial hash on first load (e.g. /#pricing from a redirect)
    if (window.location.hash.length > 1) {
      // small delay to allow layout to settle after hydration
      const id = window.location.hash.slice(1)
      setTimeout(() => scrollToId(id), 50)
    }

    return () => document.removeEventListener('click', handler)
  }, [])

  return null
}
