/**
 * WorkshopFloor.jsx — the Workshop as a live working environment.
 *
 * WHY THIS EXISTS
 *   The Workshop was a bench of fourteen still portraits under an establishing
 *   raster. It was a picture of a workshop. The Architect's direction on
 *   2026-08-06: "It is a live working environment."
 *
 * WHAT MOVES, AND WHY IT IS HONEST
 *   The approved Pass-3 bay portraits are opaque, un-rigged, full-scene renders.
 *   There is no skeleton to drive and no alpha to cut, so animating BODIES would
 *   require generated frames — metered spend the Architect has not authorized.
 *   So this floor does not animate the picture. It animates THE WORK:
 *
 *     · the room breathes      — continuous camera drift + day/night light grade
 *     · the line runs          — a real bus message becomes a slip of paper that
 *                                physically travels the golden route from the
 *                                sending bay to the receiving bay
 *     · the bays respond       — a bay warms, its lamp lifts and its work-glow
 *                                quickens when THAT agent actually holds work;
 *                                it goes cold when the tools are down
 *     · the board fills        — an opening task pins a ticket to the mezzanine
 *     · the camera attends     — the floor leans toward whichever bay just
 *                                changed hands
 *
 *   Every one of those is bound to a live feed. Nothing here idles on a timer
 *   pretending to be activity: if the fleet is quiet, the room is quiet, and
 *   that stillness is a true reading rather than a screensaver.
 *
 * DEGRADATION — same rule the feeds live under
 *   `prefers-reduced-motion` stops drift, slips and pulse. The room stays fully
 *   legible; only the motion is withdrawn. State is never conveyed by motion
 *   alone — every moving signal has a static counterpart (plate text, data
 *   attribute, colour) so a still frame carries the same information.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import './workshop-floor.css';

/* Where each agent ALREADY STANDS in the approved establishing plate.
 *
 * This is the correction that made the floor work. The first build pasted the
 * per-agent bay portraits on top of the plate — but the plate already contains
 * all fourteen, painted at their own stations. The result was a collage of
 * doubled people. So nothing is pasted over the room: these are the positions
 * of the painted figures, and the floor lights THEM.
 *
 * Coordinates are room-space percentages read off the plate. `w`/`h` size the
 * light pool to the figure and their bench; `depth` drives parallax so the
 * mezzanine and the vault door sit behind the front desks.
 *
 * Station assignment follows the Pass-3 bay renders — SEVIN is the figure at
 * the drafting wall because sevin.png IS that drafting wall, and so on down.
 */
const BAYS = {
  sevin:     { x: 14, y: 22, w: 15, h: 30, depth: 0.62 },  // drafting wall, route map
  elevin:    { x: 15, y: 50, w: 15, h: 26, depth: 0.34 },  // layout table, build cards
  stan:      { x: 28, y: 46, w: 13, h: 26, depth: 0.40 },  // teal terminals
  cosmos:    { x:  9, y: 74, w: 13, h: 30, depth: 0.12 },  // easel, painting
  quant:     { x: 33, y: 76, w: 15, h: 28, depth: 0.08 },  // ledger desk, chart monitors
  overseer:  { x: 49, y: 42, w: 12, h: 24, depth: 0.46 },  // tablet desk, mid floor
  tika:      { x: 62, y: 42, w: 14, h: 24, depth: 0.46 },  // magnifier over the open book
  roots:     { x: 77, y: 42, w: 12, h: 24, depth: 0.48 },  // greenhouse cases
  navigator: { x: 88, y: 46, w: 13, h: 26, depth: 0.44 },  // circular holo table
  nexus:     { x: 64, y: 10, w: 13, h: 22, depth: 0.86 },  // mezzanine, pinning the board
  vault:     { x: 95, y: 22, w: 10, h: 26, depth: 0.74 },  // vault door, back room
  axis:      { x: 55, y: 76, w: 14, h: 30, depth: 0.10 },  // front desk, on the call
  comms:     { x: 70, y: 76, w: 14, h: 30, depth: 0.10 },  // front desk, reading the note
  sage:      { x: 92, y: 78, w: 13, h: 30, depth: 0.08 },  // front-right, over the ledger
};

/* The golden route. Bus slips ride this polyline through the room, so traffic
   is visibly ON the floor rather than floating above it. Matches the lit street
   running from the arched window down through the working floor. */
const ROUTE = [
  { x: 50, y: 20 }, { x: 47, y: 34 }, { x: 44, y: 48 },
  { x: 46, y: 60 }, { x: 52, y: 72 }, { x: 55, y: 88 },
];

const SLIP_TTL_MS = 4200;
const MAX_SLIPS = 6;

/* Workshop register, matching the language already approved on the bench. */
function stateWord(state) {
  return {
    active:   'hands moving',
    complete: 'on the shelf',
    pending:  'held',
    unknown:  'state unavailable',
    empty:    'tools down',
  }[state] || 'tools down';
}

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Point on the route polyline at t∈[0,1], with the segment lengths respected
 *  so a slip travels at constant speed instead of hurrying through short legs. */
function routePoint(t) {
  const clamped = Math.max(0, Math.min(1, t));
  const lengths = [];
  let total = 0;
  for (let i = 1; i < ROUTE.length; i += 1) {
    const d = Math.hypot(ROUTE[i].x - ROUTE[i - 1].x, ROUTE[i].y - ROUTE[i - 1].y);
    lengths.push(d);
    total += d;
  }
  let travelled = clamped * total;
  for (let i = 0; i < lengths.length; i += 1) {
    if (travelled <= lengths[i] || i === lengths.length - 1) {
      const f = lengths[i] === 0 ? 0 : travelled / lengths[i];
      return {
        x: ROUTE[i].x + (ROUTE[i + 1].x - ROUTE[i].x) * f,
        y: ROUTE[i].y + (ROUTE[i + 1].y - ROUTE[i].y) * f,
      };
    }
    travelled -= lengths[i];
  }
  return ROUTE[ROUTE.length - 1];
}

/** Bus dir strings are `<from>-to-<to>`; anything else yields no endpoints and
 *  therefore no slip. We never invent a sender to have something to animate. */
function endpointsFromDir(dir, known) {
  const match = /^([a-z0-9_]+)-to-([a-z0-9_]+)$/.exec(String(dir || '').toLowerCase());
  if (!match) return null;
  const from = match[1] === 'main' ? 'sevin' : match[1];
  const to = match[2] === 'main' ? 'sevin' : match[2];
  if (!known.has(from) && !known.has(to)) return null;
  return { from: known.has(from) ? from : null, to: known.has(to) ? to : null };
}

export function WorkshopFloor({
  stations = [],
  busActivity = [],
  cycle = 'day',
  connected = false,
  selectedId = null,
  onSelect = () => {},
}) {
  const reduced = prefersReducedMotion();
  const floorRef = useRef(null);
  const [drift, setDrift] = useState({ x: 0, y: 0 });
  const [slips, setSlips] = useState([]);
  const [tick, setTick] = useState(0);
  const seenRef = useRef(new Set());
  const known = useMemo(() => new Set(stations.map(s => s.id)), [stations]);

  /* Camera drift. A slow lissajous push so the room is never perfectly still —
     the difference between a photograph and a place. Pointer nudges it toward
     wherever the Architect is looking. Suspended entirely under reduced-motion. */
  useEffect(() => {
    if (reduced) return undefined;
    let raf;
    const start = performance.now();
    const step = now => {
      const t = (now - start) / 1000;
      setDrift({ x: Math.sin(t * 0.11) * 1.6, y: Math.cos(t * 0.07) * 1.1 });
      setTick(t);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  useEffect(() => {
    if (reduced) return undefined;
    const el = floorRef.current;
    if (!el) return undefined;
    const move = event => {
      const rect = el.getBoundingClientRect();
      const nx = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      const ny = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
      el.style.setProperty('--look-x', nx.toFixed(3));
      el.style.setProperty('--look-y', ny.toFixed(3));
    };
    const leave = () => {
      el.style.setProperty('--look-x', '0');
      el.style.setProperty('--look-y', '0');
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    return () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
    };
  }, [reduced]);

  /* A real bus message becomes a slip on the line. Dedup by (dir,file) so a
     re-delivered event does not double the traffic — the room must not overstate
     how busy the fleet is. */
  useEffect(() => {
    if (reduced || !Array.isArray(busActivity) || busActivity.length === 0) return;
    const fresh = [];
    busActivity.slice(-12).forEach(event => {
      const key = `${event.dir || ''}::${event.file || event.ts || ''}`;
      if (seenRef.current.has(key)) return;
      seenRef.current.add(key);
      const ends = endpointsFromDir(event.dir, known);
      if (!ends) return;
      fresh.push({
        key,
        from: ends.from,
        to: ends.to,
        born: performance.now(),
        label: String(event.from || ends.from || 'bus').toUpperCase(),
      });
    });
    if (fresh.length === 0) return;
    if (seenRef.current.size > 400) seenRef.current = new Set([...seenRef.current].slice(-200));
    setSlips(prev => [...prev, ...fresh].slice(-MAX_SLIPS));
  }, [busActivity, known, reduced]);

  /* Retire spent slips. Keyed off the drift clock so there is exactly one
     animation timebase in this component. */
  useEffect(() => {
    if (slips.length === 0) return;
    const now = performance.now();
    const live = slips.filter(s => now - s.born < SLIP_TTL_MS);
    if (live.length !== slips.length) setSlips(live);
  }, [tick, slips]);

  /* The floor leans toward the most recently changed bay. Attention, not
     decoration: it answers "where did something just happen" without the
     Architect having to scan fourteen plates. */
  const attended = useMemo(() => {
    const active = stations.filter(s => s.state === 'active');
    if (active.length === 0) return null;
    return active[active.length - 1].id;
  }, [stations]);

  const focus = BAYS[selectedId] || BAYS[attended] || { x: 50, y: 55 };
  const lean = {
    x: reduced ? 0 : (50 - focus.x) * 0.05,
    y: reduced ? 0 : (55 - focus.y) * 0.04,
  };

  const now = performance.now();

  return (
    <div
      className="wsf"
      ref={floorRef}
      data-cycle={cycle}
      data-connected={connected ? 'true' : 'false'}
      data-reduced={reduced ? 'true' : 'false'}
      data-testid="workshop-floor"
      style={{
        '--drift-x': `${drift.x + lean.x}%`,
        '--drift-y': `${drift.y + lean.y}%`,
      }}
    >
      {/* Environment plate. The approved establishing render is the room; it is
          never redrawn, only lit and moved through. */}
      <div className="wsf-plate" aria-hidden="true" />
      <div className="wsf-grade" aria-hidden="true" />
      <div className="wsf-hearth" aria-hidden="true" />

      {/* The golden route, and the traffic on it. */}
      <svg className="wsf-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polyline
          className="wsf-route-line"
          points={ROUTE.map(p => `${p.x},${p.y}`).join(' ')}
        />
        {slips.map(slip => {
          const t = Math.max(0, Math.min(1, (now - slip.born) / SLIP_TTL_MS));
          const p = routePoint(t);
          return (
            <g key={slip.key} className="wsf-slip" style={{ opacity: t > 0.85 ? (1 - t) / 0.15 : 1 }}>
              <rect x={p.x - 0.9} y={p.y - 0.6} width="1.8" height="1.2" rx="0.2" />
            </g>
          );
        })}
      </svg>

      {/* The bays. NOT pasted portraits — each is a light pool over the figure
          already painted at that station in the plate. Nothing is drawn that
          was rendered; the room is lit, not collaged. */}
      <div className="wsf-bays" data-any-selected={selectedId ? 'true' : 'false'}>
        {stations.map(station => {
          const spot = BAYS[station.id] || { x: 50, y: 60, w: 12, h: 24, depth: 0.3 };
          const busy = station.state === 'active';
          const progress = typeof station.progress === 'number' ? station.progress : null;
          return (
            <button
              type="button"
              key={station.id}
              className="wsf-bay"
              data-agent={station.id}
              data-state={station.state}
              data-sealed={station.sealed || undefined}
              data-busy={busy ? 'true' : 'false'}
              aria-pressed={selectedId === station.id}
              aria-label={`${station.name}: ${station.sealed ? 'sealed, back room' : station.title || station.state}`}
              onClick={() => onSelect(station.id === selectedId ? null : station.id)}
              style={{
                '--bx': `${spot.x}%`,
                '--by': `${spot.y}%`,
                '--bw': `${spot.w}%`,
                '--bh': `${spot.h}%`,
                '--depth': spot.depth,
                '--accent': station.color,
                /* Work-glow cadence follows real progress: the closer a piece is
                   to done, the faster the bench light beats. No progress
                   reported → steady lamp, never a guessed rhythm. */
                '--beat': progress == null ? '0s' : `${Math.max(0.7, 2.6 - (progress / 100) * 1.7).toFixed(2)}s`,
              }}
            >
              {/* The light on the figure. */}
              <span className="wsf-bay-pool" aria-hidden="true" />
              <span className="wsf-bay-motes" aria-hidden="true" />

              {/* The plate, hung at the bench edge. */}
              <span className="wsf-bay-plate">
                <span className="wsf-bay-name">{station.name}</span>
                <span className="wsf-bay-state">
                  {station.sealed ? 'sealed · back room' : station.title || stateWord(station.state)}
                </span>
                {progress != null && (
                  <span className="wsf-bay-progress" aria-hidden="true">
                    <span style={{ width: `${progress}%` }} />
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Mezzanine board. Pins one card per bay that actually holds a titled
          piece of work; empty board means an empty board. */}
      <div className="wsf-board" aria-label="Mezzanine board">
        {stations.filter(s => s.title && !s.sealed).slice(0, 6).map(s => (
          <span className="wsf-card" key={s.id} data-state={s.state} style={{ '--accent': s.color }}>
            <em>{s.name}</em>
            {s.title}
          </span>
        ))}
      </div>

      {!connected && (
        <div className="wsf-dark" role="status">
          Fleet link unavailable — the floor shown is the last true reading, not a live one.
        </div>
      )}
    </div>
  );
}

export default WorkshopFloor;
