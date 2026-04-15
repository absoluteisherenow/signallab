import Link from 'next/link'

export default function NotFound() {
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
          Page not found
        </div>

        <div style={{
          fontSize: 13,
          color: '#8a8780',
          lineHeight: 1.6,
          letterSpacing: '0.02em',
          marginBottom: 32,
        }}>
          This page doesn't exist or has been moved.
        </div>

        <Link
          href="/today"
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
            textDecoration: 'none',
            display: 'inline-block',
            transition: 'all 0.2s',
          }}
        >
          Back to dashboard
        </Link>

      </div>
    </div>
  )
}
