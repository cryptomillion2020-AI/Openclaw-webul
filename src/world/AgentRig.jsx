/**
 * AgentRig.jsx — Path 1-Reference proof: one locked reference per agent, rigged
 * and driven procedurally. No baked animation frames, so identity cannot drift.
 *
 * WHY THIS SHAPE
 *   A generated sprite sheet re-samples the character on every frame, so the
 *   face, build and clothing wander across a walk cycle. Here the character is
 *   sampled exactly ONCE — the approved reference — and cut into parts. Motion
 *   is joint rotation over that single sample, so the likeness on frame 200 is
 *   bit-identical to frame 1. That is the whole argument for this path.
 *
 * THE SKELETON
 *   torso ── head
 *         ├─ thighL ── shinL
 *         └─ thighR ── shinR
 *   Each part is a PNG positioned at its offset inside the reference box and
 *   rotated about a declared pivot. Parent transforms compose down the chain
 *   through nested elements, which is what makes a knee follow a hip.
 *
 * GAITS
 *   Pure functions of a phase clock, so any gait can be evaluated at any time
 *   without stepping through frames — scrub, pause and resume are free, and the
 *   rig can be driven from live state rather than from a timeline.
 */
import { useEffect, useRef, useState } from 'react';
import './agent-rig.css';

/* Part geometry, in reference-box pixels. Cut from the approved SEVIN plate;
   `pivot` is the joint, expressed as a fraction of the part box. */
const RIG = {
  box: { w: 230, h: 815 },
  parts: {
    torso:  { src: 'torso.png',  x: 0,   y: 92,  w: 230, h: 313, pivot: [0.52, 0.96] },
    head:   { src: 'head.png',   x: 95,  y: 0,   w: 115, h: 135, pivot: [0.50, 0.92] },
    thighL: { src: 'thighL.png', x: 66,  y: 372, w: 86,  h: 243, pivot: [0.50, 0.06] },
    shinL:  { src: 'shinL.png',  x: 56,  y: 592, w: 102, h: 223, pivot: [0.50, 0.06] },
    thighR: { src: 'thighR.png', x: 133, y: 372, w: 85,  h: 243, pivot: [0.50, 0.06] },
    shinR:  { src: 'shinR.png',  x: 128, y: 592, w: 98,  h: 223, pivot: [0.50, 0.06] },
  },
};

const TAU = Math.PI * 2;

/**
 * Gait solvers. Each returns joint angles in degrees plus a root offset.
 * Legs run in antiphase; the knee only ever flexes one way, because a knee that
 * bends backwards is the single fastest way to make a rig read as broken.
 */
const GAITS = {
  /* Weight-shifting stand. Small, slow, never fully still. */
  idle(p) {
    const b = Math.sin(p * TAU);
    return {
      rootY: b * 1.4, rootX: 0, torso: b * 0.7, head: -b * 0.9,
      thighL: b * 1.2, shinL: Math.max(0, -b) * 2, thighR: -b * 1.2, shinR: Math.max(0, b) * 2,
      lean: 0,
    };
  },

  /* Walk. Hip swing drives the stride; the knee flexes on the swing leg only,
     and the body rises twice per cycle at the weight transfers. */
  walk(p) {
    const a = p * TAU;
    const hipL = Math.sin(a) * 22;
    const hipR = Math.sin(a + Math.PI) * 22;
    return {
      rootY: -Math.abs(Math.sin(a * 2)) * 5,
      rootX: 0,
      torso: Math.sin(a * 2) * 1.6,
      head: -Math.sin(a * 2) * 1.2,
      thighL: hipL, thighR: hipR,
      shinL: Math.max(0, -Math.sin(a - 0.6)) * 38,
      shinR: Math.max(0, -Math.sin(a + Math.PI - 0.6)) * 38,
      lean: 3,
    };
  },

  /* At the bench: planted feet, working torso, head tracking the hands. */
  work(p) {
    const a = p * TAU;
    return {
      rootY: Math.sin(a * 2) * 1.1, rootX: 0,
      torso: 4 + Math.sin(a) * 2.6,
      head: 6 + Math.sin(a + 0.8) * 3.2,
      thighL: 2, shinL: 0, thighR: -2, shinR: 0,
      lean: 2,
    };
  },

  /* Turning to speak to the next bench. */
  confer(p) {
    const a = p * TAU;
    return {
      rootY: Math.sin(a) * 1.2, rootX: Math.sin(a) * 2,
      torso: -3 + Math.sin(a) * 3.4,
      head: -8 + Math.sin(a * 1.5) * 5,
      thighL: -1.5, shinL: 0, thighR: 1.5, shinR: 0,
      lean: -2,
    };
  },
};

export function AgentRig({
  agent = 'sevin',
  gait = 'walk',
  speed = 1,
  scale = 0.34,
  facing = 1,
  paused = false,
  phase = null,
}) {
  const [pose, setPose] = useState(() => GAITS[gait](0));
  const clock = useRef(0);
  const last = useRef(0);

  useEffect(() => {
    /* Deterministic override: a caller can drive the phase directly, which is
       what the capture harness uses to sample exact frames of the cycle. */
    if (phase != null) { setPose(GAITS[gait](phase)); return undefined; }
    if (paused) return undefined;
    let raf;
    const rate = { idle: 0.28, walk: 0.85, work: 0.4, confer: 0.3 }[gait] ?? 0.5;
    const step = now => {
      if (last.current) clock.current += ((now - last.current) / 1000) * rate * speed;
      last.current = now;
      setPose(GAITS[gait](clock.current % 1));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); last.current = 0; };
  }, [gait, speed, paused, phase]);

  const base = `/ai-city/rig/${agent}/`;

  /* A child part is nested inside its parent so the parent's rotation composes
     into it — that is what makes the knee travel with the hip. Nesting also
     re-bases the coordinate system, so a child's position must be expressed
     RELATIVE to its parent's box, not to the reference box. */
  const part = (key, angle, parentKey = null, children = null) => {
    const p = RIG.parts[key];
    const origin = parentKey ? RIG.parts[parentKey] : { x: 0, y: 0 };
    return (
      <div
        className="rig-part"
        data-part={key}
        style={{
          left: p.x - origin.x, top: p.y - origin.y, width: p.w, height: p.h,
          transformOrigin: `${p.pivot[0] * 100}% ${p.pivot[1] * 100}%`,
          transform: `rotate(${angle}deg)`,
        }}
      >
        <img src={base + p.src} alt="" draggable="false" />
        {children}
      </div>
    );
  };

  return (
    <div
      className="rig"
      data-agent={agent}
      data-gait={gait}
      style={{
        width: RIG.box.w * scale,
        height: RIG.box.h * scale,
        '--scale': scale,
        '--facing': facing,
      }}
    >
      {/* Scale from the top-left so the scaled figure occupies exactly the box
          the layout reserved. Scaling from the baseline instead makes the rig
          overflow upward out of its own footprint. Mirroring is done as a
          reflection inside the un-scaled box, which keeps the figure in frame. */}
      <div
        className="rig-root"
        style={{
          width: RIG.box.w, height: RIG.box.h,
          transform: [
            `scale(${scale})`,
            facing < 0 ? `translateX(${RIG.box.w}px) scaleX(-1)` : '',
            `translate(${pose.rootX}px, ${pose.rootY}px)`,
            `rotate(${pose.lean * 0.2}deg)`,
          ].filter(Boolean).join(' '),
        }}
      >
        {/* Far leg first: painter's order is the depth buffer here. */}
        {part('thighR', pose.thighR, null, part('shinR', pose.shinR, 'thighR'))}
        {part('thighL', pose.thighL, null, part('shinL', pose.shinL, 'thighL'))}
        {part('torso', pose.torso, null, part('head', pose.head, 'torso'))}
      </div>
      <div className="rig-shadow" aria-hidden="true" />
    </div>
  );
}

export default AgentRig;
