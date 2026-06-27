/**
 * RankBadge.jsx — Pass 3 gamification primitive (skeleton)
 * Authority: Pass 3 SPEC §3 — ranks + levels per Architect ratification 2026-06-27
 */
import { AGENT_RANK, AGENT_COLOR, AGENT_INSIGNIA } from '../../types/pass3';

export function RankBadge({ agentId, level = 1, xp = 0, compact = false }) {
  const rank = AGENT_RANK[agentId] || '—';
  const color = AGENT_COLOR[agentId] || 'var(--text-muted)';
  const insignia = AGENT_INSIGNIA[agentId] || '·';
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      fontFamily: 'var(--font-game)',
      fontSize: compact ? 11 : 13,
      color,
    }}>
      <span style={{ fontSize: compact ? 14 : 16 }}>{insignia}</span>
      <span style={{ fontWeight: 600 }}>{rank}</span>
      {!compact && <span style={{ color: 'var(--text-secondary)' }}>· Lv {level}</span>}
      {!compact && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{xp.toLocaleString()} XP</span>}
    </span>
  );
}
