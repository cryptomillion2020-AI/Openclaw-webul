// Shared unchanged trading-message admission policy; no data or credential dependencies.
export function websocketDisposition(message) {
  // Legacy journal has incomplete policy/approval gates. Never forward it through this release.
  if (message?.type === 'journal_transition') return { type: 'journal_transition_result', ok: false, duplicate: false, state: null, reject_reason: 'paper_authorization_unavailable', admitted: false };
  if (!['subscribe', 'request_full_state', 'comms_message', 'research_query', 'kill_switch_activate', 'kill_switch_deactivate'].includes(message?.type)) return { type: 'request_rejected', ok: false, error: 'unsupported_or_live_route_disabled' };
  return null;
}
