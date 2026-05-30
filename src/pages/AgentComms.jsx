/**
 * AgentComms.jsx — Page 2: Agent Communications
 * Uses pages.css class names — MS Teams-style layout
 */

import { useState } from 'react';

const CHANNEL_CATEGORIES = {
  System:   ['status', 'deployments'],
  Agents:   ['sevin', 'overseer', 'elevin', 'all-agents'],
  Alerts:   ['kill-switch', 'oauth-failures', 'watchdog'],
  Trading:  ['quant-signals', 'executions', 'proposals'],
  Directives: ['architect', 'sevin-directives'],
};

export function AgentComms({ onSend }) {
  const [activeChannel, setActiveChannel] = useState('status');
  const [messages] = useState([]);

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
                type="text"
                placeholder={`Message #${activeChannel}...`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.target.value.trim()) {
                    onSend?.({
                      type: 'comms_message',
                      channel: activeChannel,
                      body: e.target.value.trim(),
                    });
                    e.target.value = '';
                  }
                }}
              />
              <button className="thread-send-btn">Send</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
