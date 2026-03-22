export default function AdvanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#070706' }}>
      {children}
    </div>
  )
}
