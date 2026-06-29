/**
 * FleetActivityChart.jsx — Pass 3 P3.1 — visx stacked bar
 * 24h × 13 agents, multi-color from AGENT_COLOR
 */
import { BarStack } from '@visx/shape';
import { Group } from '@visx/group';
import { scaleBand, scaleLinear } from '@visx/scale';

const AGENT_COLOR = {
  'sevin': '#ff6b35', 'overseer': '#3b82f6', 'elevin': '#84cc16',
  'tika': '#a855f7', 'quant': '#f43f5e', 'nexus': '#fbbf24',
  'comms': '#22d3ee', 'axis': '#fb923c', 'cosmos': '#ec4899',
  'navigator': '#14b8a6', 'stan-local': '#94a3b8', 'stan-hl': '#475569',
  'vault': '#7c3aed',
};

const AGENT_IDS = Object.keys(AGENT_COLOR);

function synthesizeData() {
  const out = [];
  for (let h = 0; h < 24; h++) {
    const row = { hour: h };
    AGENT_IDS.forEach((id, i) => {
      const base = (id === 'sevin' || id === 'overseer') ? 4 : (id === 'elevin' ? 3 : 1);
      const peakHour = (i * 2) % 24;
      const distance = Math.abs(h - peakHour);
      row[id] = Math.max(0, base + Math.round(Math.cos(distance / 4) * 2 + Math.random() * 1.5));
    });
    out.push(row);
  }
  return out;
}

export function FleetActivityChart({ width = 540, height = 180, data }) {
  const chartData = data || synthesizeData();
  const margin = { top: 8, right: 12, bottom: 22, left: 24 };
  const innerW = Math.max(50, width - margin.left - margin.right);
  const innerH = Math.max(50, height - margin.top - margin.bottom);

  const xScale = scaleBand({
    domain: chartData.map(d => d.hour),
    padding: 0.12,
    range: [0, innerW],
  });

  const totals = chartData.map(d => AGENT_IDS.reduce((s, id) => s + (d[id] || 0), 0));
  const maxTotal = Math.max(8, ...totals);
  const yScale = scaleLinear({
    domain: [0, maxTotal],
    range: [innerH, 0],
    nice: true,
  });

  const colorScale = (id) => AGENT_COLOR[id] || '#888';

  return (
    <svg width={width} height={height}>
      <Group left={margin.left} top={margin.top}>
        <BarStack
          data={chartData}
          keys={AGENT_IDS}
          x={d => d.hour}
          xScale={xScale}
          yScale={yScale}
          color={colorScale}
        >
          {(barStacks) => barStacks.map((bs) =>
            bs.bars.map((b) => (
              <rect
                key={`${bs.index}-${b.index}-${bs.key}`}
                x={b.x}
                y={b.y}
                width={b.width}
                height={b.height}
                fill={b.color}
                opacity={0.92}
              />
            ))
          )}
        </BarStack>
        {/* x-axis labels */}
        {[0, 6, 12, 18, 23].map(h => (
          <text
            key={h}
            x={xScale(h) + xScale.bandwidth() / 2}
            y={innerH + 14}
            fontSize={9}
            fontFamily="var(--font-mono)"
            fill="rgba(255,255,255,0.5)"
            textAnchor="middle"
          >
            {h}h
          </text>
        ))}
        {/* y-axis ticks */}
        {[0, maxTotal / 2, maxTotal].map(v => (
          <text
            key={v}
            x={-6}
            y={yScale(v) + 3}
            fontSize={9}
            fontFamily="var(--font-mono)"
            fill="rgba(255,255,255,0.4)"
            textAnchor="end"
          >
            {Math.round(v)}
          </text>
        ))}
      </Group>
    </svg>
  );
}
