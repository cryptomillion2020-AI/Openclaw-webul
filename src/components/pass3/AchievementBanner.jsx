/**
 * AchievementBanner.jsx — Pass 3 gamification primitive (skeleton)
 * Top slide-down 4s banner; animation lands in P3.6
 */
const RARITY_COLOR = {
  common: 'var(--text-secondary)',
  uncommon: 'var(--cat-cyan)',
  rare: 'var(--cat-purple)',
  legendary: 'var(--achievement)',
};

export function AchievementBanner({ achievement, visible = false }) {
  if (!visible || !achievement) return null;
  const { title, description, rarity = 'common' } = achievement;
  return (
    <div style={{
      position: 'fixed',
      top: 16,
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'var(--bg-card-elev)',
      border: `1px solid ${RARITY_COLOR[rarity]}`,
      borderRadius: 'var(--radius-card)',
      padding: '12px 24px',
      zIndex: 9998,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
      boxShadow: 'var(--shadow-card-elev)',
    }}>
      <span style={{
        fontFamily: 'var(--font-game)',
        fontSize: 11,
        color: RARITY_COLOR[rarity],
        letterSpacing: 1,
      }}>ACHIEVEMENT — {rarity.toUpperCase()}</span>
      <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</span>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{description}</span>
    </div>
  );
}
