/**
 * AgentComms.jsx — the channel client, built in the approved Workshop room.
 *
 * Authority: Architect standing instruction 2026-08-05 — carry the Workshop
 * room across the whole site. Structure comes from the shared workshop-room.css
 * so this page is the same building as Command Central, Bus Network and Markets.
 *
 * Material is applied to the ROOM. Data sits on it, never inside it.
 *
 * NOT the Bus Network page. Network is the routing ledger — raw traffic by
 * agent pair, which message went where. This is the conversation: categorised
 * channels, a per-channel ring buffer owned by App.jsx, local echo, and a
 * composer. Neither should grow into the other.
 *
 * Data binding is UNCHANGED and was already honest — this page never faked
 * anything, so nothing was deleted here:
 *   READ:  commsByChannel[activeChannel] — per-channel ring owned by App.jsx
 *   SEND:  addLocalEcho() + onSend({ type, channel, body, clientMessageId })
 *          local echo enqueued before WS dispatch, reconciled in App on
 *          comms_delta; the input clears only when connected and is held when
 *          the socket is down, so a message is never silently lost to a dead
 *          transport.
 *
 * Channel list is CONFIGURATION, not data — the categories below describe which
 * channels exist, never how much traffic they carry. An empty channel renders
 * empty and says so.
 */

import { useEffect, useRef, useState } from 'react';
import './workshop-room.css';
import './agentcomms-room.css';

const CHANNEL_CATEGORIES = {
  System:     ['status', 'deployments'],
  Agents:     ['sevin', 'overseer', 'elevin', 'all-agents'],
  Alerts:     ['kill-switch', 'oauth-failures', 'watchdog'],
  Trading:    ['quant-signals', 'executions', 'proposals'],
  Directives: ['architect', 'sevin-directives'],
};

/* Local-echo correlation id, so a sent message can be reconciled against the
   server's copy instead of appearing twice. */
function makeClientMessageId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `cmid-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function AgentComms({ onSend, connected, commsByChannel = {}, addLocalEcho }) {
  const [activeChannel, setActiveChannel] = useState('status');
  const [query, setQuery] = useState('');
  const [inputText, setInputText] = useState('');
  const endRef = useRef(null);
  const inputRef = useRef(null);

  /* Per-channel read — no filter loop; App owns the ring buffer. */
  const channelEvents = commsByChannel[activeChannel] || [];
  const messages = channelEvents.map(e => ({
    file:    e.file,
    dir:     e.dir,
    from:    e.from || 'System',
    ts:      e.ts ? new Date(e.ts).toLocaleTimeString() : '',
    body:    e.preview || '(no content)',
    mtime:   e.mtime || 0,
    pending: !!e.pending,
  }));

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, activeChannel]);

  const handleSend = (text) => {
    const trimmed = (text || '').trim();
    if (!trimmed) return;
    /* Connected-aware: hold the input and skip the echo when the socket is
       down. Clearing the box would tell the Architect a message was sent when
       nothing left the machine. */
    if (!connected) return;
    const clientMessageId = makeClientMessageId();
    addLocalEcho?.(activeChannel, trimmed, clientMessageId);
    onSend?.({ type: 'comms_message', channel: activeChannel, body: trimmed, clientMessageId });
    setInputText('');
  };

  const q = query.trim().toLowerCase();
  const categories = Object.entries(CHANNEL_CATEGORIES)
    .map(([cat, chans]) => [cat, q ? chans.filter(c => c.includes(q)) : chans])
    .filter(([, chans]) => chans.length > 0);

  const totalHere = messages.length;

  return (
    <div className="wsroom">
      {/* The room. Environment only — it carries no data. */}
      <div className="wsroom-env" aria-hidden="true">
        <div className="wsroom-wall" />
        <div className="wsroom-window">
          <img src="/ai-city/workshop-establishing.png" alt="" />
        </div>
        <div className="wsroom-keystone" />
        <div className="wsroom-floor" />
        <div className="wsroom-lamp" />
        <div className="wsroom-vignette" />
      </div>

      <header className="wsroom-masthead">
        <div>
          <div className="wsroom-eyebrow">Master Workflow · Agent Comms</div>
          <h1 className="wsroom-title">Say it to<br />the room.</h1>
        </div>
        <div className="wsroom-standing">
          <div className="wsroom-standing-value">{totalHere}</div>
          <div className="wsroom-standing-label">in this channel</div>
        </div>
      </header>

      <div className="wsroom-rail">
        <div className="wsroom-rail-item" data-state={connected ? 'LIVE' : 'DEAD'}>
          <span className="wsroom-rail-dot" />
          <span className="wsroom-rail-name">transport</span>
          <span className="wsroom-rail-state">{connected ? 'LIVE' : 'DEAD'}</span>
        </div>
        <div className="wsroom-rail-item" data-state={connected ? 'LIVE' : 'DEAD'}>
          <span className="wsroom-rail-dot" />
          <span className="wsroom-rail-name">sending</span>
          <span className="wsroom-rail-state">{connected ? 'enabled' : 'held'}</span>
        </div>
        <div className="wsroom-rail-item" data-state="LIVE">
          <span className="wsroom-rail-dot" />
          <span className="wsroom-rail-name">channel</span>
          <span className="wsroom-rail-state">{activeChannel}</span>
        </div>
      </div>

      <div className="ac-floor">
        <section className="wsroom-station">
          <div className="wsroom-station-head">
            <span className="wsroom-station-title">Channels</span>
            <span className="wsroom-station-count">
              {categories.reduce((n, [, c]) => n + c.length, 0)}
            </span>
          </div>
          <input
            className="ac-search"
            type="text"
            placeholder="Find a channel…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Find a channel"
          />
          <div className="ac-rack">
            {categories.length === 0 ? (
              <div className="wsroom-empty">
                <strong>No channel matches</strong>
                Nothing in the configured channel list matches “{query}”.
              </div>
            ) : categories.map(([category, chans]) => (
              <div key={category}>
                <div className="ac-cat">{category}</div>
                {chans.map(ch => (
                  <button
                    key={ch}
                    className="ac-channel"
                    aria-selected={activeChannel === ch}
                    onClick={() => setActiveChannel(ch)}
                  >
                    <span className="ac-hash">#</span>
                    <span className="ac-channel-name">{ch}</span>
                    {(commsByChannel[ch]?.length > 0) && (
                      <span className="ac-channel-count">{commsByChannel[ch].length}</span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className="wsroom-station ac-thread-station">
          <div className="wsroom-station-head">
            <span className="wsroom-station-title">#{activeChannel}</span>
            <span className="wsroom-station-count">{totalHere}</span>
          </div>

          <div className="ac-thread">
            {messages.length === 0 ? (
              <div className="wsroom-empty">
                <strong>No messages on this channel</strong>
                {connected
                  ? 'The channel is connected and carries nothing yet. Nothing is being substituted here.'
                  : 'The transport is down — this is not a claim that the channel is quiet.'}
              </div>
            ) : messages.map((m, i) => (
              <article className="ac-msg" data-pending={m.pending || undefined} key={m.file || i}>
                <div className="ac-msg-meta">
                  <span className="ac-msg-from">{m.from}</span>
                  {m.ts && <span className="ac-msg-time">{m.ts}</span>}
                  {/* A pending message has not been acknowledged by the server.
                      Saying so is the whole point of the local echo. */}
                  {m.pending && <span className="ac-msg-pending">unconfirmed</span>}
                </div>
                <div className="ac-msg-body">{m.body}</div>
              </article>
            ))}
            <div ref={endRef} />
          </div>

          <div className="ac-composer">
            <input
              ref={inputRef}
              className="ac-input"
              type="text"
              placeholder={connected ? `Message #${activeChannel}…` : 'Transport is down — sending is held.'}
              value={inputText}
              disabled={!connected}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSend(e.target.value); }}
              aria-label={`Message ${activeChannel}`}
            />
            <button
              type="button"
              className="ac-send"
              disabled={!connected || !inputText.trim()}
              onClick={() => handleSend(inputRef.current?.value ?? inputText)}
            >
              Send
            </button>
          </div>
        </section>
      </div>

      <div className="wsroom-colophon">
        <span>Workshop room · Pass 3 palette</span>
        <span>Empty means empty</span>
      </div>
    </div>
  );
}
