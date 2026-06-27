/**
 * XpGainEffect.jsx — Pass 3 gamification primitive (skeleton)
 * Empty wrapper for now; particle burst animation lands in P3.6
 */
export function XpGainEffect({ amount = 0, agentId = 'sevin', originRef }) {
  if (!amount) return null;
  return (
    <span style={{
      position: 'absolute',
      pointerEvents: 'none',
      color: 'var(--xp-glow)',
      fontFamily: 'var(--font-game)',
      fontSize: 14,
      fontWeight: 700,
      animation: 'xp-rise var(--dur-slow) var(--ease-out) forwards',
    }}>+{amount} XP</span>
  );
}
