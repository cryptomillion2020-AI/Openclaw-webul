/**
 * MissionCard.jsx — Pass 3 gamification primitive (skeleton)
 * Renders one active mission per Pass 3 SPEC §3.5
 */
import { RankBadge } from './RankBadge';

const STATUS_COLOR = {
  pending: 'var(--status-pending)',
  in_progress: 'var(--mission-active)',
  blocked: 'var(--status-blocked)',
  done: 'var(--mission-done)',
};

export function MissionCard({ mission }) {
  if (!mission) return null;
  const { title, assignee, status = 'pending', progress_pct = 0, xp_reward = 0, deadline_iso } = mission;
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-card)',
      padding: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <span style={{
          fontFamily: 'var(--font-game)',
          fontSize: 11,
          color: 'var(--text-muted)',
          letterSpacing: 0.5,
        }}>[MISSION]</span>
        <span style={{ fontSize: 11, color: STATUS_COLOR[status] }}>{status.toUpperCase()}</span>
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>{title}</div>
      <RankBadge agentId={assignee} compact />
      <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          width: `${Math.min(100, Math.max(0, progress_pct))}%`,
          height: '100%',
          background: STATUS_COLOR[status],
          transition: 'width var(--dur-base) var(--ease-out)',
        }} />
      </div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 11,
        color: 'var(--text-secondary)',
      }}>
        <span style={{ color: 'var(--xp-glow)' }}>+{xp_reward} XP</span>
        {deadline_iso && <span>by {new Date(deadline_iso).toLocaleTimeString()}</span>}
      </div>
    </div>
  );
}
