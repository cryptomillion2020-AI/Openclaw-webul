/**
 * LevelUpOverlay.jsx — Pass 3 gamification primitive (skeleton)
 * Full-screen 1.2s overlay; animation lands in P3.6
 */
import { AGENT_RANK } from '../../types/pass3';

export function LevelUpOverlay({ agentId, newLevel, visible = false }) {
  if (!visible) return null;
  const rank = AGENT_RANK[agentId] || '—';
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      pointerEvents: 'none',
    }}>
      <div style={{
        fontFamily: 'var(--font-game)',
        fontSize: 48,
        color: 'var(--level-up)',
        textTransform: 'uppercase',
        letterSpacing: 4,
      }}>
        Level Up — {rank} {agentId.toUpperCase()} — Lv {newLevel}
      </div>
    </div>
  );
}
