/**
 * AgentComms.jsx — Page 2: Agent Communications
 * Uses pages.css class names — MS Teams-style layout
 *
 * Data binding (Stage 2, Track 1):
 *   READ:  filters busActivity events by active channel → renders as messages
 *   SEND:  onSend({ type: 'comms_message', channel, body }) → backend writes bus file → comms_delta broadcast
 */

import { useState, useEffect, useRef } from 'react';

const CHANNEL_CATEGORIES = {
  System:   ['status', 'deployments'],
  Agents:   ['sevin', 'overseer', 'elevin', 'all-agents'],
  Alerts:   ['kill-switch', 'oauth-failures', 'watchdog'],
  Trading:  ['quant-signals', 'executions', 'proposals'],
  Directives: ['architect', 'sevin-directives'],
};

// Map bus directory names to Comms channel names
function dirToChannel(dir) {
  const map = {
    'webui-to-sevin':       'sevin',
    'webui-to-overseer':    'overseer',
    'webui-to-elevin':      'elevin',
    'webui-to-all-agents':  'all-agents',
    'webui-to-architect':   'architect',
    'webui-to-system':      'system',
    'webui-to-monitoring':  'oauth-failures',
    'webui-to-quant':       'quant-signals',
    'elevin-to-overseer':   'overseer',
    'overseer-to-sevin':    'sevin',
    'sevin-to-overseer':    'overseer',
    'quant-to-overseer':    'quant-signals',
    'stan-to-overseer':     'overseer',
    'discord-outbound':     'deployments',
  };
  return map[dir] || null;
}

export function AgentComms({ onSend, busActivity, connected }) {
  const [activeChannel, setActiveChannel] = useState('status');
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Build messages from busActivity filtered by active channel
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    if (!busActivity || !Array.isArray(busActivity)) return;
    const filtered = busActivity
      .filter(e => {
        const ch = e.channel || dirToChannel(e.dir);
        return ch === activeChannel;
      })
      .map(e => ({
        file: e.file,
        dir:  e.dir,
        from: e.from || 'System',
        ts:   e.ts ? new Date(e.ts).toLocaleTimeString() : '',
        body: e.preview || e.body || '(no content)',
        mtime: e.mtime || 0,
      }))
      .sort((a, b) => a.mtime - b.mtime);
    setMessages(filtered);
  }, [busActivity, activeChannel]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send handler (used by both Enter key and Send button)
  const handleSend = (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend?.({
      type: 'comms_message',
      channel: activeChannel,
      body: trimmed,
    });
    setInputText('');
  };

  return (
    <div className="comms-page">
      <div className="comms-layout">
        {/* Channel sidebar */}
        <div className="channel-sidebar">
          <div className="channel-sidebar-header">
            <span>Channels</span>
          </div>
          <div className="channel-search">
            <input type="text" placeholder="Find a channel…" />
          </div>
          <div className="channel-list">
            {Object.entries(CHANNEL_CATEGORIES).map(([category, channels]) => (
              <div key={category}>
                <div className="channel-category-label">{category}</div>
                {channels.map((ch) => (
                  <button
                    key={ch}
                    className={`channel-item${activeChannel === ch ? ' active' : ''}`}
                    onClick={() => setActiveChannel(ch)}
                  >
                    <span className="channel-hash">#</span>
                    {ch}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Message thread */}
        <div className="message-thread">
          <div className="thread-header">
            <div>
              <div className="thread-channel-name"># {activeChannel}</div>
              <div className="thread-channel-desc">Agent communications channel</div>
            </div>
          </div>

          <div className="thread-messages">
            {messages.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">💬</div>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>No messages yet. Select a channel to begin.</p>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className="thread-message">
                  <div className="thread-avatar avatar-default">
                    {msg.from?.charAt(0) || '?'}
                  </div>
                  <div className="thread-msg-body">
                    <div className="thread-msg-meta">
                      <span className="thread-msg-author">{msg.from}</span>
                      <span className="thread-msg-time">{msg.ts}</span>
                    </div>
                    <div className="thread-msg-text">{msg.body}</div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="thread-input-area">
            <div className="thread-input-row">
              <input
                ref={inputRef}
                type="text"
                placeholder={`Message #${activeChannel}...`}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSend(e.target.value);
                  }
                }}
              />
              <button
                type="button"
                className="thread-send-btn"
                onClick={() => handleSend(inputRef.current?.value ?? inputText)}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
