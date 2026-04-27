'use client'

interface LogoIconProps {
  size?: number
  color?: string
  className?: string
}

export function LogoIcon({ size = 32, color = '#ff2a1a', className }: LogoIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect x="6" y="6" width="52" height="52" rx="10" fill="none" stroke={color} strokeWidth="1.5" opacity="0.85" />
      <polyline
        points="12,32 22,32 26,18 32,46 36,26 40,34 44,30 50,32"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'hero'
  className?: string
}

const sizes = {
  sm: { icon: 24, title: 'text-[11px]', os: 'text-[8px]' },
  md: { icon: 28, title: 'text-[13px]', os: 'text-[9px]' },
  lg: { icon: 36, title: 'text-[16px]', os: 'text-[11px]' },
  hero: { icon: 64, title: 'text-[36px]', os: 'text-[18px]' },
}

export function Logo({ size = 'md', className }: LogoProps) {
  const s = sizes[size]
  const isHero = size === 'hero'

  return (
    <div className={`flex ${isHero ? 'flex-col items-center gap-4' : 'items-center gap-2.5'} ${className ?? ''}`}>
      <LogoIcon size={s.icon} />
      <div className={isHero ? 'text-center' : ''}>
        <div className={`font-unbounded font-extralight tracking-wider ${s.title}`} style={{ color: '#f2f2f2' }}>
          Signal Lab{' '}
          {isHero ? (
            <span className="font-light" style={{ color: '#ff2a1a' }}>OS</span>
          ) : null}
        </div>
        {!isHero && (
          <div className={`font-mono font-light tracking-widest ${s.os}`} style={{ color: '#909090' }}>
            OS
          </div>
        )}
        {isHero && (
          <div className="font-mono font-light text-[15px] tracking-wide mt-2" style={{ color: '#909090' }}>
            Tailored Artist OS
          </div>
        )}
      </div>
    </div>
  )
}
