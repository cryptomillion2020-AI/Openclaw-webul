import runtimeSource from 'virtual:openclaw-agent-runtime';

const PROVIDERS = {
  anthropic: { label: 'Anthropic cloud', local: false },
  openai: { label: 'OpenAI cloud', local: false },
  ollama: { label: 'Ollama local', local: true },
  'vllm-local': { label: 'vLLM local', local: true },
};

function describeModel(model) {
  if (!model) return { model: null, shortModel: null, runtime: null, local: null };
  const separator = model.indexOf('/');
  const provider = separator === -1 ? model : model.slice(0, separator);
  const shortModel = separator === -1 ? model : model.slice(separator + 1);
  const details = PROVIDERS[provider] || { label: provider, local: null };
  return { model, shortModel, runtime: details.label, local: details.local };
}

export const AGENT_RUNTIME_SOURCE = Object.freeze({
  path: runtimeSource.source,
  sha256: runtimeSource.sourceSha256,
});

export const AGENT_RUNTIME = Object.freeze(Object.fromEntries(
  runtimeSource.profiles.map(profile => {
    const primary = describeModel(profile.primary);
    return [profile.id, Object.freeze({
      ...profile,
      ...primary,
      fallbacks: Object.freeze(profile.fallbacks || []),
    })];
  }),
));

export function getAgentRuntime(agentId) {
  return AGENT_RUNTIME[String(agentId || '').toLowerCase()] || null;
}
