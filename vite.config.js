import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const OPENCLAW_CONFIG = '/home/k/.openclaw/openclaw.json';
const AGENT_RUNTIME_ID = 'virtual:openclaw-agent-runtime';
const RESOLVED_AGENT_RUNTIME_ID = `\0${AGENT_RUNTIME_ID}`;

function readAgentRuntime() {
  const raw = readFileSync(OPENCLAW_CONFIG, 'utf8');
  const config = JSON.parse(raw);
  const profiles = (config?.agents?.list || []).map(agent => ({
    id: agent.id === 'main' ? 'sevin' : agent.id,
    name: agent.name || (agent.id === 'main' ? 'SEVIN' : String(agent.id).toUpperCase()),
    primary: agent?.model?.primary || null,
    fallbacks: Array.isArray(agent?.model?.fallbacks) ? agent.model.fallbacks : [],
  }));
  return {
    profiles,
    source: OPENCLAW_CONFIG,
    sourceSha256: createHash('sha256').update(raw).digest('hex'),
  };
}

function agentRuntimePlugin() {
  return {
    name: 'openclaw-agent-runtime',
    resolveId(id) {
      return id === AGENT_RUNTIME_ID ? RESOLVED_AGENT_RUNTIME_ID : null;
    },
    load(id) {
      if (id !== RESOLVED_AGENT_RUNTIME_ID) return null;
      this.addWatchFile(OPENCLAW_CONFIG);
      return `export default ${JSON.stringify(readAgentRuntime())};`;
    },
  };
}

export default defineConfig({
  plugins: [react(), agentRuntimePlugin()],
  server: {
    host: '0.0.0.0',  // bind to Tailscale IP
    port: 5173,
    // Allow serving COSMOS atlas assets from outside project root
    fs: {
      allow: [
        '.',  // project root (workspace-webui)
        '/home/k/.openclaw/shared/state/ai-city-assets',  // COSMOS atlases
      ],
    },
  },
  // Make COSMOS assets available at /ai-city-assets/ during dev
  // In production, copy shared/state/ai-city-assets/ to public/ai-city-assets/
});
