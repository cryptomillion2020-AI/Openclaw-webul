/**
 * NewDirectiveCTA.jsx — Pass 3 quick-dispatch CTA (skeleton)
 * Compose-new-directive button; opens compose modal in P3.1+
 */
export function NewDirectiveCTA({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: '100%',
        padding: '24px 16px',
        background: 'var(--bg-card)',
        border: '1px dashed var(--cat-cyan)',
        borderRadius: 'var(--radius-card)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-game)',
        fontSize: 13,
        letterSpacing: 1,
        cursor: 'pointer',
        transition: 'all var(--dur-base) var(--ease-out)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-card-elev)';
        e.currentTarget.style.boxShadow = '0 0 16px rgba(34, 211, 238, 0.2)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--bg-card)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <span style={{ fontSize: 24, color: 'var(--cat-cyan)' }}>+</span>
      <span>New Directive</span>
    </button>
  );
}
