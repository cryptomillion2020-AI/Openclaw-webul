/**
 * pass3.ts — WebUI Pass 3 type schemas
 * Filed: 2026-06-27 by Commander SEVIN
 * Authority: Architect Pass 3 SPEC §3 + 2026-06-27 16:12 PDT rank hierarchy reaffirmation
 *
 * CORRECTION applied (per 20260627-231500-CORRECTION-RANK-HIERARCHY-PASS3-P3.0):
 *   - 'General' added to RankLabel union
 *   - ARCHITECT_RANK + ARCHITECT_DISPLAY exports
 */

export type AgentId = 'sevin' | 'overseer' | 'elevin' | 'tika' | 'quant'
  | 'nexus' | 'comms' | 'axis' | 'cosmos' | 'navigator'
  | 'stan-local' | 'stan-hl' | 'vault';

// Canonical rank hierarchy (Architect 2026-06-27 16:12 PDT):
// General > Commander > Captain > Engineer > Scholar > Trader > Synthesizer
// > Operator > Aide > Artist > Pathfinder > Auditor > Inspector > Keeper
export type RankLabel = 'General' | 'Commander' | 'Captain' | 'Engineer' | 'Scholar'
  | 'Trader' | 'Synthesizer' | 'Operator' | 'Aide' | 'Artist'
  | 'Pathfinder' | 'Auditor' | 'Inspector' | 'Keeper';

// Architect rank (no XP, top of hierarchy)
export const ARCHITECT_RANK: RankLabel = 'General';
export const ARCHITECT_DISPLAY = 'General Architect';

// Per-agent rank mapping
export const AGENT_RANK: Record<AgentId, RankLabel> = {
  'sevin':      'Commander',
  'overseer':   'Captain',
  'elevin':     'Engineer',
  'tika':       'Scholar',
  'quant':      'Trader',
  'nexus':      'Synthesizer',
  'comms':      'Operator',
  'axis':       'Aide',
  'cosmos':     'Artist',
  'navigator':  'Pathfinder',
  'stan-local': 'Auditor',
  'stan-hl':    'Inspector',
  'vault':      'Keeper',
};

export const AGENT_COLOR: Record<AgentId, string> = {
  'sevin':      'var(--cat-orange)',
  'overseer':   'var(--cat-blue)',
  'elevin':     'var(--cat-lime)',
  'tika':       'var(--cat-purple)',
  'quant':      'var(--cat-pink)',
  'nexus':      'var(--cat-yellow)',
  'comms':      'var(--cat-cyan)',
  'axis':       'var(--cat-amber)',
  'cosmos':     'var(--cat-magenta)',
  'navigator':  'var(--cat-teal)',
  'stan-local': 'var(--cat-slate)',
  'stan-hl':    'var(--cat-slate-dark)',
  'vault':      'var(--cat-violet)',
};

export const AGENT_INSIGNIA: Record<AgentId, string> = {
  'sevin':      '◇',
  'overseer':   '▲',
  'elevin':     '⚙',
  'tika':       '🜉',
  'quant':      '◆',
  'nexus':      '✦',
  'comms':      '▶',
  'axis':       '★',
  'cosmos':     '❀',
  'navigator':  '➤',
  'stan-local': '✓',
  'stan-hl':    '✕',
  'vault':      '🔒',
};

export type AgentXP = {
  xp_total: number;
  level: number;
  streak_days: number;
  last_active_utc: string;
  achievements: string[];
  current_missions: string[];
};

export type AgentXPRegistry = {
  schema_version: '1.0';
  generated_at: string;
  agents: Record<AgentId, AgentXP>;
  global_leaderboard: AgentId[];
};

export type AchievementRarity = 'common' | 'uncommon' | 'rare' | 'legendary';
export type Achievement = {
  id: string;
  title: string;
  description: string;
  icon: string;
  rarity: AchievementRarity;
  awarded_to: AgentId;
  awarded_at_utc: string;
};

export type MissionStatus = 'pending' | 'in_progress' | 'blocked' | 'done';
export type Mission = {
  mission_id: string;
  title: string;
  assignee: AgentId;
  status: MissionStatus;
  progress_pct: number;
  xp_reward: number;
  deadline_iso?: string;
  achievement_eligible?: boolean;
};

/** XP curve per Pass 3 SPEC §3.3 */
export function levelFromXP(xp: number): number {
  if (xp < 100) return 1;
  if (xp < 250) return 2;
  if (xp < 500) return 3;
  if (xp < 1000) return 4;
  if (xp < 2000) return 5;
  if (xp < 4000) return 6;
  if (xp < 8000) return 7;
  if (xp < 16000) return 8;
  if (xp < 32000) return 9;
  return 10 + Math.floor(Math.log(xp / 32000) / Math.log(1.5));
}
