export function NyimuLoader({ message = "" }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'var(--space-10)',
      gap: 'var(--space-4)'
    }}>
      <img
        src="/icons/nyimu-logo.png"
        alt="Loading..."
        style={{
          width: 120,
          height: 120,
          borderRadius: '50%',
          animation: 'nyimuBounce 2s ease-in-out infinite',
        }}
      />
      {message && (
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-sm)',
          color: 'var(--accent)',
          letterSpacing: '0.05em'
        }}>
          {message}
        </div>
      )}
      <style>{`
        @keyframes nyimuBounce {
          0%, 100% { transform: translateY(0) scale(1); opacity: 1; }
          50% { transform: translateY(-16px) scale(1.05); opacity: 0.85; }
        }
      `}</style>
    </div>
  )
}