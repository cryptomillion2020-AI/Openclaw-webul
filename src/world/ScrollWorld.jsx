/**
 * ScrollWorld.jsx — scroll-position-bound clip playback. Clean-room.
 *
 * Authority: Architect direction 2026-07-21 — rip the mechanics, build our own.
 * No code from `cth9191/scroll-world` is copied here; this is written from the
 * described behaviour (frames bound to scroll position, sticky stack, frame
 * handoff at the seams) and owes it nothing but the idea.
 *
 * WHAT IT DOES
 *   The page reserves N viewport-heights of scroll. A sticky stack of clips sits
 *   in the viewport. Scroll position maps to a scene and a time within it, and
 *   the clip is SEEKED — never played. Scrolling is the transport.
 *
 * WHY SEEK AND NOT PLAY
 *   Playback would run on its own clock and drift from the scroll. Seeking makes
 *   the scroll authoritative, which is the whole effect: the user is the camera
 *   operator. It also means the clip is silent, deterministic, and identical on
 *   every pass — a property the acceptance capture depends on.
 *
 * HONEST DEGRADATION — the same rule the data feeds live under
 *   Motion is a progressive enhancement and it announces its own failure:
 *     · `prefers-reduced-motion` → posters, crossfaded. Never overridden.
 *     · Save-Data or 2g/3g → posters. Downgrade-only; we never upgrade on a guess.
 *     · A clip that will not decode or seek → that scene falls back to its poster
 *       ALONE. One dead clip does not blank the world, mirroring the per-feed
 *       degradation rule the ledger surfaces live under.
 *   Posters are the clips' own first frames, so a fallback is the same image the
 *   motion path would have shown — no jump, no substitution.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import './scroll-world.css';

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/* Downgrade-only network signals. iOS exposes none of these, so absence must
   never be read as "fast" — it just leaves the default alone. */
function constrainedConnection() {
  const c = typeof navigator !== 'undefined' ? navigator.connection : null;
  if (!c) return false;
  if (c.saveData) return true;
  return ['slow-2g', '2g', '3g'].includes(c.effectiveType);
}

export function ScrollWorld({ manifest, stillsOnly = false, children }) {
  const scenes = manifest?.scenes || [];
  const wrapRef = useRef(null);
  const videoRefs = useRef([]);
  const [progress, setProgress] = useState(0);
  /* Scenes that proved they cannot be scrubbed. Per-scene, never global. */
  const [failed, setFailed] = useState(() => new Set());
  const [stills, setStills] = useState(stillsOnly);

  useEffect(() => {
    if (stillsOnly) return;
    if (prefersReducedMotion() || constrainedConnection()) setStills(true);
  }, [stillsOnly]);

  /* Scroll budget: each scene claims `scroll` viewport-heights. Longer dwell on
     a scene that carries more of the story, which is also how a short world
     still reads complete. */
  const weights = useMemo(() => scenes.map(s => s.scroll || 1), [scenes]);
  const total = useMemo(() => weights.reduce((a, b) => a + b, 0), [weights]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;                       // one update per animation frame
      frame = requestAnimationFrame(() => {
        frame = 0;
        const rect = el.getBoundingClientRect();
        const span = el.offsetHeight - window.innerHeight;
        const p = span <= 0 ? 0 : Math.min(1, Math.max(0, -rect.top / span));
        setProgress(p);
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  /* Which scene owns this scroll position, and how far into it. */
  const { index, local } = useMemo(() => {
    const target = progress * total;
    let acc = 0;
    for (let i = 0; i < weights.length; i++) {
      if (target <= acc + weights[i] || i === weights.length - 1) {
        return { index: i, local: Math.min(1, Math.max(0, (target - acc) / weights[i])) };
      }
      acc += weights[i];
    }
    return { index: 0, local: 0 };
  }, [progress, weights, total]);

  /* Drive the active clip. Seeking a paused element is the transport; we never
     call play(), so there is no autoplay policy to fight and no audio to mute. */
  useEffect(() => {
    if (stills) return;
    const v = videoRefs.current[index];
    if (!v || failed.has(index)) return;
    const d = v.duration;
    if (!d || !isFinite(d)) return;
    /* Clamp inside the media. Seeking to exactly `duration` is out of range in
       some decoders and leaves the last frame blank at the very end of a scene. */
    const t = Math.min(d - 0.001, Math.max(0, local * d));
    try {
      v.currentTime = t;
    } catch {
      setFailed(prev => new Set(prev).add(index));
    }
  }, [index, local, stills, failed]);

  if (!scenes.length) {
    return (
      <div className="sw-empty">
        <strong>No world manifest</strong>
        Nothing is being substituted here — render the scenes first.
      </div>
    );
  }

  return (
    <div className="sw" ref={wrapRef} style={{ height: `calc(${total * 100}vh + 100vh)` }}>
      <div className="sw-stage">
        {scenes.map((s, i) => {
          const active = i === index;
          const useStill = stills || failed.has(i);
          return (
            <div className="sw-scene" data-active={active || undefined} key={s.id}>
              {useStill ? (
                <img className="sw-media" src={s.poster} alt="" />
              ) : (
                <video
                  className="sw-media"
                  ref={el => { videoRefs.current[i] = el; }}
                  src={s.src}
                  poster={s.poster}
                  muted
                  playsInline
                  preload="auto"
                  onError={() => setFailed(prev => new Set(prev).add(i))}
                />
              )}
            </div>
          );
        })}
        <div className="sw-vignette" aria-hidden="true" />
        <div className="sw-overlay">{children}</div>
        <div className="sw-marks" aria-hidden="true">
          {scenes.map((s, i) => (
            <span className="sw-mark" data-active={i === index || undefined} key={s.id}>
              {s.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
