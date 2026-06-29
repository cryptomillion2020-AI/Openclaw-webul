/**
 * WorkloadTreemap.jsx — Pass 3 P3.1 — d3-hierarchy treemap
 * Per-agent active task count, sized by value, colored by agent
 */
import { hierarchy, treemap, treemapSquarify } from 'd3-hierarchy';

const AGENT_COLOR = {
  'sevin': '#ff6b35', 'overseer': '#3b82f6', 'elevin': '#84cc16',
  'tika': '#a855f7', 'quant': '#f43f5e', 'nexus': '#fbbf24',
  'comms': '#22d3ee', 'axis': '#fb923c', 'cosmos': '#ec4899',
  'navigator': '#14b8a6', 'stan-local': '#94a3b8', 'stan-hl': '#475569',
  'vault': '#7c3aed',
};

const MOCK_TASKS = {
  'sevin': 5,
  'overseer': 3,
  'elevin': 2,
  'tika': 1,
  'quant': 0.3,
  'nexus': 0.5,
  'comms': 0.3,
  'axis': 0.3,
  'cosmos': 1,
  'navigator': 0.5,
  'stan-local': 0.5,
  'stan-hl': 0.1,
  'vault': 0.2,
};

export function WorkloadTreemap({ width = 280, height = 220, agentTaskCounts }) {
  const data = agentTaskCounts || MOCK_TASKS;

  const root = hierarchy({
    name: 'root',
    children: Object.entries(data).map(([agentId, value]) => ({
      name: agentId,
      value: value + 0.1,  // floor so zero gets a sliver
    })),
  }).sum(d => d.value).sort((a, b) => b.value - a.value);

  treemap()
    .tile(treemapSquarify)
    .size([width, height])
    .padding(2)
    .round(true)(root);

  return (
    <svg width={width} height={height}>
      {root.leaves().map(leaf => {
        const w = leaf.x1 - leaf.x0;
        const h = leaf.y1 - leaf.y0;
        const showLabel = w > 38 && h > 22;
        return (
          <g key={leaf.data.name} transform={`translate(${leaf.x0},${leaf.y0})`}>
            <rect
              width={w}
              height={h}
              fill={AGENT_COLOR[leaf.data.name] || '#888'}
              fillOpacity={0.86}
              stroke="rgba(13,15,27,0.6)"
              strokeWidth={1}
            />
            {showLabel && (
              <>
                <text
                  x={6}
                  y={14}
                  fontSize={10}
                  fontFamily="var(--font-game)"
                  fontWeight={600}
                  fill="rgba(255,255,255,0.95)"
                >
                  {leaf.data.name.toUpperCase()}
                </text>
                <text
                  x={6}
                  y={26}
                  fontSize={9}
                  fontFamily="var(--font-mono)"
                  fill="rgba(255,255,255,0.8)"
                >
                  {Math.floor(leaf.data.value)}t
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
