export default function GlobalLoading() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg, #050505)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        width: 20,
        height: 20,
        border: '2px solid #1d1d1d',
        borderTopColor: '#ff2a1a',
        borderRadius: '50%',
        animation: 'loading-spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes loading-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
