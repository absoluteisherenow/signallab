'use client'

import { useEffect, useState } from 'react'

interface Particle {
  id: number
  x: number
  dx: number
  size: number
  delay: number
  color: string
  shape: 'circle' | 'square'
}

interface CelebrationProps {
  trigger: boolean
}

function generateParticles(): Particle[] {
  const colors = ['var(--gold)', 'var(--gold-bright)', '#f0d080', '#c9a46e', '#e8c870']
  const particles: Particle[] = []
  for (let i = 0; i < 18; i++) {
    particles.push({
      id: i,
      x: 40 + Math.random() * 20,           // % from left — cluster around center
      dx: (Math.random() - 0.5) * 120,      // px horizontal drift
      size: 4 + Math.random() * 5,
      delay: Math.random() * 0.4,
      color: colors[Math.floor(Math.random() * colors.length)],
      shape: Math.random() > 0.4 ? 'circle' : 'square',
    })
  }
  return particles
}

export function Celebration({ trigger }: CelebrationProps) {
  const [playing, setPlaying] = useState(false)
  const [particles, setParticles] = useState<Particle[]>([])

  useEffect(() => {
    if (!trigger) return
    setParticles(generateParticles())
    setPlaying(true)
    const t = setTimeout(() => setPlaying(false), 2200)
    return () => clearTimeout(t)
  }, [trigger])

  if (!playing) return null

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 9999,
        overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes particle-rise {
          0%   { transform: translateY(0) translateX(0) scale(1); opacity: 1; }
          80%  { opacity: 0.8; }
          100% { transform: translateY(-280px) translateX(var(--dx)) scale(0.3); opacity: 0; }
        }
      `}</style>

      {particles.map(p => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            bottom: '30%',
            left: `${p.x}%`,
            width: p.size,
            height: p.size,
            background: p.color,
            borderRadius: p.shape === 'circle' ? '50%' : '1px',
            '--dx': `${p.dx}px`,
            animation: `particle-rise 1.5s ease-out ${p.delay}s both`,
            boxShadow: `0 0 ${p.size * 1.5}px ${p.color}`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  )
}
