/**
 * SideQuestPill.jsx — Pass 3 gamification primitive (skeleton)
 * Side quest pill per Pass 3 SPEC §3.6
 */
export function SideQuestPill({ quest, progress = 0 }) {
  if (!quest) return null;
  const { title, cadence = 'DAILY', xp_reward = 0 } = quest;
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '8px 12px',
      background: 'var(--bg-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-pill)',
      fontSize: 12,
    }}>
      <span style={{ color: 'var(--mission-active)' }}>◆</span>
      <span style={{ color: 'var(--text-primary)', flex: 1 }}>{title}</span>
      <span style={{
        fontFamily: 'var(--font-game)',
        fontSize: 10,
        color: 'var(--text-muted)',
        letterSpacing: 0.5,
      }}>{cadence}</span>
      <span style={{ color: 'var(--xp-glow)', fontSize: 11 }}>+{xp_reward} XP</span>
      <div style={{
        width: 40,
        height: 3,
        background: 'rgba(255,255,255,0.06)',
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${Math.min(100, Math.max(0, progress))}%`,
          height: '100%',
          background: 'var(--mission-active)',
        }} />
      </div>
    </div>
  );
}
