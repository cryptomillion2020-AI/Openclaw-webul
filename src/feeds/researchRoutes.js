// Real research route registry (Item C, directive 20260912-155614).
// These ids are dispatched to the real backend via a `research_query` bus message
// (selected_agents). They are NOT decorative. Existing agents are preserved and
// NOT relabeled; QUANT + ROOTS are added with Architect-specified roles.
//
// QUANT — quant/strategy research; consumes the already-configured trading-policy model.
//         This registry adds NO model/provider config; it only names the route.
// ROOTS — health/informational research ONLY. Not a trading strategist. No execution authority.
export const RESEARCH_ROUTES = [
  { id: 'tika',      label: 'TIKA',      role: 'Research Authority' },
  { id: 'nexus',     label: 'NEXUS',     role: 'Synthesizer' },
  { id: 'navigator', label: 'NAVIGATOR', role: 'Pathfinder' },
  { id: 'cosmos',    label: 'COSMOS',    role: 'Artist' },
  { id: 'axis',      label: 'AXIS',      role: 'Aide' },
  {
    id: 'quant', label: 'QUANT', role: 'Quant / strategy research', kind: 'trading-policy',
    note: 'Uses the configured trading-policy model. Research and authoring only — no auto-execution.',
  },
  {
    id: 'roots', label: 'ROOTS', role: 'Health & informational research', kind: 'health-info',
    note: 'Health / informational research only. Not a trading strategist; no trading-execution authority.',
  },
];

// Bounded fan-out: a single Dispatch may target at most this many routes.
export const MAX_DISPATCH_ROUTES = 4;

export const ROUTE_LABEL = Object.fromEntries(RESEARCH_ROUTES.map(r => [r.id, r.label]));
