/**
 * soundManager.js — Tier 3 UI sound cues (P3 sounds, Architect R6 authorization)
 *
 * Five synthesized cues, played on live fleet events:
 *   bus-message   — soft blip        (bus/comms activity)
 *   agent-online  — rising chime     (WS link established)
 *   task-complete — major arpeggio   (task reaches completed state)
 *   p0-alert      — urgent pulse     (kill switch activated)
 *   error         — descending buzz  (protocol/confirm errors)
 *
 * Muted by default (persisted in localStorage) — sound is opt-in.
 * Playback is unlocked on first user gesture per browser autoplay policy.
 */

const SOUND_BASE = '/sounds';
const CUES = ['bus-message', 'agent-online', 'task-complete', 'p0-alert', 'error'];

const STORAGE_KEY = 'sevin.sounds.muted';
const DEFAULT_VOLUME = 0.5;

// Minimum gap between repeats of the same cue, so bus bursts don't machine-gun.
const THROTTLE_MS = { 'bus-message': 2000, 'p0-alert': 4000 };
const THROTTLE_DEFAULT_MS = 1500;

const audio = new Map();
const lastPlayed = new Map();
let unlocked = false;

let muted = (() => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
})();

const listeners = new Set();

function ensureLoaded() {
  if (audio.size > 0) return;
  CUES.forEach(cue => {
    const a = new Audio(`${SOUND_BASE}/${cue}.wav`);
    a.preload = 'auto';
    a.volume = DEFAULT_VOLUME;
    audio.set(cue, a);
  });
}

// Browsers block audio until a user gesture; a one-time listener flips the latch.
function unlockOnGesture() {
  if (unlocked) return;
  const unlock = () => {
    unlocked = true;
    ensureLoaded();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}
unlockOnGesture();

export const soundManager = {
  play(cue) {
    if (muted || !unlocked || !CUES.includes(cue)) return;
    const now = Date.now();
    const gap = THROTTLE_MS[cue] ?? THROTTLE_DEFAULT_MS;
    if (now - (lastPlayed.get(cue) || 0) < gap) return;
    lastPlayed.set(cue, now);

    ensureLoaded();
    const a = audio.get(cue);
    if (!a) return;
    a.currentTime = 0;
    a.play().catch(() => {});
  },

  isMuted() {
    return muted;
  },

  setMuted(value) {
    muted = Boolean(value);
    try {
      localStorage.setItem(STORAGE_KEY, String(muted));
    } catch { /* private mode — session-only mute state */ }
    listeners.forEach(fn => fn(muted));
  },

  toggle() {
    this.setMuted(!muted);
    return muted;
  },

  onMuteChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
