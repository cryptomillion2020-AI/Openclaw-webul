/**
 * LeaderboardRow.jsx — Pass 3 gamification primitive (skeleton)
 * Per Pass 3 SPEC §3.7 — leaderboard sorted by XP, top-3 rim glow
 */
import { AGENT_RANK, AGENT_COLOR } from '../../types/pass3';

const RIM_GLOW = {
  1: '0 0 8px rgba(255, 215, 0, 0.6)',  // gold
  2: '0 0 8px rgba(192, 192, 192, 0.5)', // silver
  3: '0 0 8px rgba(205, 127, 50, 0.5)',  // bronze
};

export function LeaderboardRow({ rank, agentId, level = 1, xp = 0, trend = 'flat' }) {
  const rankLabel = AGENT_RANK[agentId] || '—';
  const color = AGENT_COLOR[agentId] || 'var(--text-muted)';
  const trendIcon = trend === 'up' ? '▲' : trend === 'down' ? '▼' : '—';
  const trendColor = trend === 'up' ? 'var(--status-active)' : trend === 'down' ? 'var(--status-blocked)' : 'var(--text-muted)';
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '24px 1fr auto auto',
      gap: 8,
      alignItems: 'center',
      padding: '8px 10px',
      background: 'var(--bg-card)',
      borderRadius: 8,
      boxShadow: RIM_GLOW[rank] || 'none',
    }}>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 13,
        color: 'var(--text-secondary)',
        textAlign: 'right',
      }}>{rank}</span>
      <span style={{
        color,
        fontWeight: 500,
        fontSize: 13,
      }}>{rankLabel} {agentId.toUpperCase()}</span>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--text-secondary)',
      }}>Lv {level}</span>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 13,
        color: 'var(--text-primary)',
      }}>{xp.toLocaleString()}</span>
      <span style={{
        gridColumn: '1 / -1',
        textAlign: 'right',
        fontSize: 10,
        color: trendColor,
      }}>{trendIcon}</span>
    </div>
  );
}
