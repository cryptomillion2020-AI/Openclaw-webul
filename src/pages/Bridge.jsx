/**
 * Bridge.jsx — Pass 3 P3.1 — Command Bridge (formerly Dashboard)
 * Bento-Box layout overlaid on Three.js Constellation scene
 */
import { ConstellationScene } from '../three/ConstellationScene';
import { RankBadge } from '../components/pass3/RankBadge';
import { MissionCard } from '../components/pass3/MissionCard';
import { LeaderboardRow } from '../components/pass3/LeaderboardRow';
import { SideQuestPill } from '../components/pass3/SideQuestPill';
import { NewDirectiveCTA } from '../components/pass3/NewDirectiveCTA';
import { FleetActivityChart } from '../charts/FleetActivityChart';
import { WorkloadTreemap } from '../charts/WorkloadTreemap';

const MOCK_LEADERBOARD = [
  { agentId: 'sevin',      level: 4, xp: 1240, trend: 'up' },
  { agentId: 'overseer',   level: 3, xp: 890,  trend: 'up' },
  { agentId: 'elevin',     level: 3, xp: 720,  trend: 'up' },
  { agentId: 'tika',       level: 2, xp: 340,  trend: 'flat' },
  { agentId: 'nexus',      level: 2, xp: 280,  trend: 'flat' },
  { agentId: 'navigator',  level: 2, xp: 220,  trend: 'flat' },
  { agentId: 'cosmos',     level: 2, xp: 200,  trend: 'flat' },
  { agentId: 'comms',      level: 1, xp: 90,   trend: 'flat' },
  { agentId: 'axis',       level: 1, xp: 70,   trend: 'flat' },
  { agentId: 'stan-local', level: 1, xp: 60,   trend: 'flat' },
  { agentId: 'quant',      level: 1, xp: 50,   trend: 'flat' },
  { agentId: 'vault',      level: 1, xp: 30,   trend: 'flat' },
  { agentId: 'stan-hl',    level: 1, xp: 0,    trend: 'down' },
];

const MOCK_MISSIONS = [
  { mission_id: 'p31', title: 'Pass 3.1 Bridge Implementation', assignee: 'sevin', status: 'in_progress', progress_pct: 30, xp_reward: 500, deadline_iso: '2026-06-30T23:51:00Z' },
  { mission_id: 'sit024', title: 'SIT-024 Triple-Misfire Investigation', assignee: 'sevin', status: 'in_progress', progress_pct: 35, xp_reward: 150, deadline_iso: '2026-06-30T00:00:00Z' },
  { mission_id: 'oversight', title: 'PM/SM Cadence Operations', assignee: 'overseer', status: 'in_progress', progress_pct: 85, xp_reward: 50, deadline_iso: '2026-06-30T00:00:00Z' },
];

const MOCK_QUESTS = [
  { id: 'q1', title: 'Reply to all P0 within 5 min', cadence: 'DAILY', xp_reward: 20, progress: 80 },
  { id: 'q2', title: 'Zero HALT triggers across fleet', cadence: 'DAILY', xp_reward: 30, progress: 100 },
  { id: 'q3', title: 'All 13 agents log activity in 24h', cadence: 'WEEKLY', xp_reward: 100, progress: 60 },
];

const MOCK_COMMS = [
  { from: 'OVERSEER', to: 'SEVIN', unread: 2 },
  { from: 'ELEVIN',   to: 'SEVIN', unread: 1 },
  { from: 'TIKA',     to: 'SEVIN', unread: 0 },
];

export function Bridge({ killActive, busActivity, connected }) {
  return (
    <div className="bridge-page">
      <ConstellationScene />

      <div className="bridge-grid">
        {/* Hero: Awaiting Architect (Decisions queued) */}
        <div className="bento-card bento-decisions">
          <div className="bento-card-label">Awaiting You</div>
          <div className="bento-card-hero">0</div>
          <div className="bento-card-sub">Architect decisions queued</div>
        </div>

        {/* Active Missions */}
        <div className="bento-card bento-missions">
          <div className="bento-card-label">Active Missions</div>
          <div className="bento-missions-grid">
            {MOCK_MISSIONS.map(m => <MissionCard key={m.mission_id} mission={m} />)}
          </div>
        </div>

        {/* Leaderboard */}
        <div className="bento-card bento-leaderboard">
          <div className="bento-card-label">Leaderboard</div>
          <div className="bento-leaderboard-list">
            {MOCK_LEADERBOARD.map((r, i) => (
              <LeaderboardRow key={r.agentId} rank={i + 1} agentId={r.agentId} level={r.level} xp={r.xp} trend={r.trend} />
            ))}
          </div>
        </div>

        {/* Trading status */}
        <div className="bento-card bento-trading">
          <div className="bento-card-label">Trading</div>
          <div className="bento-card-hero" style={{ color: 'var(--status-hold)', fontSize: 36 }}>OFF</div>
          <div className="bento-card-sub">paper hold · Phase 6 HOLD</div>
        </div>

        {/* Bus events */}
        <div className="bento-card bento-bus">
          <div className="bento-card-label">Network Traffic</div>
          <div className="bento-card-hero" style={{ color: 'var(--cat-cyan)' }}>{busActivity?.length || 0}</div>
          <div className="bento-card-sub">events visible · ~12/hr</div>
        </div>

        {/* Comms preview */}
        <div className="bento-card bento-comms">
          <div className="bento-card-label">Latest Comms</div>
          <div className="bento-comms-list">
            {MOCK_COMMS.map(c => (
              <div key={c.from} className="bento-comms-row">
                <span style={{ flex: 1 }}>{c.from} → {c.to}</span>
                {c.unread > 0 && <span className="bento-comms-badge">{c.unread}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Workload Treemap (d3-hierarchy) */}
        <div className="bento-card bento-workload">
          <div className="bento-card-label">Workload Treemap</div>
          <div style={{ flex: 1, minHeight: 220 }}>
            <WorkloadTreemap width={300} height={220} />
          </div>
        </div>

        {/* Fleet Activity Chart (visx stacked bar) */}
        <div className="bento-card bento-activity">
          <div className="bento-card-label">Fleet Activity 24h</div>
          <div style={{ flex: 1, minHeight: 180 }}>
            <FleetActivityChart width={560} height={180} />
          </div>
        </div>

        {/* Agent health placeholder */}
        <div className="bento-card bento-health">
          <div className="bento-card-label">Agent Health</div>
          <div className="bento-health-grid">
            {['sevin','overseer','elevin','tika','quant','nexus','comms','axis','cosmos','navigator','stan-local','stan-hl','vault'].map(agentId => (
              <div key={agentId} className="bento-health-tile" data-agent={agentId} />
            ))}
          </div>
        </div>

        {/* Side quests */}
        <div className="bento-card bento-quests">
          <div className="bento-card-label">Side Quests</div>
          <div className="bento-quests-list">
            {MOCK_QUESTS.map(q => <SideQuestPill key={q.id} quest={q} progress={q.progress} />)}
          </div>
        </div>

        {/* CTA */}
        <div className="bento-card bento-cta">
          <NewDirectiveCTA onClick={() => alert('Dispatch flow — P3.1.x follow-up')} />
        </div>
      </div>
    </div>
  );
}
