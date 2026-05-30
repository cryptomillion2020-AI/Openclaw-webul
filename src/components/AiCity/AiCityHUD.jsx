/**
 * AiCityHUD.jsx — Top-right agent status panel overlay
 * Phase 5 FE-01 — Track A (scaffold)
 *
 * Displays agent name, current task, and animation state.
 * Positioned as a fixed overlay on top of the PixiJS canvas.
 */

export function AiCityHUD({ agents = [] }) {
  return (
    <div className="ai-city-hud">
      {agents.map((agent) => (
        <div key={agent.name} className="hud-agent-row">
          <span
            className="hud-agent-dot"
            style={{ backgroundColor: agent.color || '#666' }}
          />
          <span className="hud-agent-name">{agent.name}</span>
          <span className={`hud-agent-state state-${agent.state || 'idle'}`}>
            {agent.state || 'idle'}
          </span>
        </div>
      ))}
    </div>
  );
}
