// 24×24, 1.5px stroke, currentColor. BRT: sharp corners, geometric, no flourish.

type IconProps = { size?: number }

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'square' as const,
  strokeLinejoin: 'miter' as const,
})

export function HomeIcon({ size = 22 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="4" y="4" width="16" height="16" />
      <line x1="4" y1="12" x2="20" y2="12" />
    </svg>
  )
}

export function ScanIcon({ size = 22 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="9" y="3" width="6" height="12" rx="3" ry="3" />
      <path d="M5 11 v1 a7 7 0 0 0 14 0 v-1" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  )
}

export function PostIcon({ size = 22 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="4" y="4" width="16" height="16" />
      <path d="M9 15 L15 9" />
      <path d="M10 9 L15 9 L15 14" />
    </svg>
  )
}

export function TourIcon({ size = 22 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M12 3 C8.5 3 6 5.5 6 9 c0 4 6 11 6 11 s6-7 6-11 c0-3.5-2.5-6-6-6 z" />
      <circle cx="12" cy="9" r="2" />
    </svg>
  )
}

export function MindIcon({ size = 22 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function PassIcon({ size = 22 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M3 8 h18 v3 a1.5 1.5 0 0 0 0 3 v3 H3 v-3 a1.5 1.5 0 0 0 0-3 Z" />
      <line x1="14" y1="8" x2="14" y2="10" />
      <line x1="14" y1="12" x2="14" y2="14" />
      <line x1="14" y1="16" x2="14" y2="17" />
    </svg>
  )
}
