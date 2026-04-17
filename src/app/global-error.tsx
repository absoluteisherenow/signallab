'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg, #050505)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 40,
      fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>

        <div style={{
          fontSize: 9,
          letterSpacing: '0.22em',
          color: '#ff2a1a',
          textTransform: 'uppercase',
          fontWeight: 700,
          marginBottom: 24,
        }}>
          Something went wrong
        </div>

        <div style={{
          fontSize: 13,
          color: '#909090',
          lineHeight: 1.6,
          letterSpacing: '0.02em',
          marginBottom: 32,
        }}>
          {error.digest
            ? 'An unexpected error occurred. Please try again.'
            : error.message || 'An unexpected error occurred.'}
        </div>

        <button
          onClick={reset}
          style={{
            background: 'transparent',
            border: '1px solid #ff2a1a',
            color: '#ff2a1a',
            fontSize: 9,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            fontWeight: 700,
            borderRadius: 0,
            padding: '14px 24px',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#ff2a1a'; e.currentTarget.style.color = '#050505' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#ff2a1a' }}
        >
          Try again
        </button>

      </div>
    </div>
  )
}
