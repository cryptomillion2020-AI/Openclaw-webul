/**
 * ConstellationScene.jsx — Pass 3 P3.1 iter-4 — "Atoms in Space" w/ lightning
 * Per Architect 2026-06-29 11:56 PDT:
 *   Q1=C: 3-5 medium hero atoms + ~20 small background atoms
 *   Q3=C+D: ambient + bus-event-triggered lightning; electric blue/white color
 *   Q4=B: atoms drift through space (Brownian motion) + camera slow orbit
 *   Q5=A: visible glowing orbit rings
 */
import { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';

const AGENT_COLOR = {
  'sevin': '#ff6b35', 'overseer': '#3b82f6', 'elevin': '#84cc16',
  'tika': '#a855f7', 'quant': '#f43f5e', 'nexus': '#fbbf24',
  'comms': '#22d3ee', 'axis': '#fb923c', 'cosmos': '#ec4899',
  'navigator': '#14b8a6', 'stan-local': '#94a3b8', 'stan-hl': '#475569',
  'vault': '#7c3aed',
};

const HERO_AGENT_IDS = ['sevin', 'overseer', 'elevin', 'tika', 'quant'];

const HERO_ATOMS = HERO_AGENT_IDS.map((id, i) => {
  const angle = (i / HERO_AGENT_IDS.length) * Math.PI * 2;
  const r = 9;
  return {
    id,
    color: AGENT_COLOR[id],
    homePos: new THREE.Vector3(Math.cos(angle) * r, Math.sin(angle) * r * 0.5, Math.sin(angle * 0.7) * 2),
    seed: i * 137.5,
    nucleusSize: 0.55,
    electronCount: 2 + (i % 2),
    isHero: true,
  };
});

const BG_ATOMS = Array.from({ length: 22 }).map((_, i) => {
  const phi = Math.acos(-1 + (2 * i) / 22);
  const theta = Math.sqrt(22 * Math.PI) * phi;
  const r = 16 + (i % 4) * 4;
  const colorKeys = Object.keys(AGENT_COLOR);
  const colorKey = colorKeys[i % colorKeys.length];
  return {
    id: `bg-${i}`,
    color: AGENT_COLOR[colorKey],
    homePos: new THREE.Vector3(
      r * Math.cos(theta) * Math.sin(phi),
      r * Math.sin(theta) * Math.sin(phi) * 0.8,
      r * Math.cos(phi)
    ),
    seed: i * 53.3,
    nucleusSize: 0.22,
    electronCount: 1 + (i % 2),
    isHero: false,
  };
});

const ALL_ATOMS = [...HERO_ATOMS, ...BG_ATOMS];

/** Nucleus — pulsing sphere */
function Nucleus({ size, color, atomPos }) {
  const ref = useRef();
  useFrame((state) => {
    if (!ref.current || !atomPos.current) return;
    const t = state.clock.elapsedTime;
    const pulse = 1 + 0.15 * Math.sin(t * 1.8);
    ref.current.scale.setScalar(pulse);
    ref.current.position.copy(atomPos.current);
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[size, 16, 16]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  );
}

/** Orbit ring — visible elliptical path */
function OrbitRing({ atomPos, radius, tilt, color }) {
  const ref = useRef();
  const geom = useMemo(() => {
    const segments = 48;
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(t) * radius, 0, Math.sin(t) * radius));
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [radius]);

  useFrame(() => {
    if (!ref.current || !atomPos.current) return;
    ref.current.position.copy(atomPos.current);
  });

  return (
    <line ref={ref} rotation={[tilt, 0, tilt * 0.6]}>
      <primitive object={geom} attach="geometry" />
      <lineBasicMaterial color={color} transparent opacity={0.45} toneMapped={false} />
    </line>
  );
}

/** Electron — small sphere orbiting nucleus on a tilted ring */
function Electron({ atomPos, color, radius, tilt, speed, phase }) {
  const ref = useRef();
  useFrame((state) => {
    if (!ref.current || !atomPos.current) return;
    const t = state.clock.elapsedTime * speed + phase;
    const ex = Math.cos(t) * radius;
    const ez = Math.sin(t) * radius;
    // Apply tilt rotation
    const cos_t = Math.cos(tilt), sin_t = Math.sin(tilt);
    const ey = ez * sin_t;
    const ezFinal = ez * cos_t;
    ref.current.position.set(
      atomPos.current.x + ex,
      atomPos.current.y + ey,
      atomPos.current.z + ezFinal
    );
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.07, 8, 8]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  );
}

/** Single atom — drifts via Brownian motion, has nucleus + orbital rings + electrons */
function Atom({ atom }) {
  const posRef = useRef(atom.homePos.clone());
  const velRef = useRef(new THREE.Vector3());

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // Brownian-ish drift around home position
    const drift = 0.0015;
    velRef.current.x += (Math.random() - 0.5) * drift;
    velRef.current.y += (Math.random() - 0.5) * drift;
    velRef.current.z += (Math.random() - 0.5) * drift;
    // Spring back toward home
    const k = 0.0008;
    velRef.current.x -= (posRef.current.x - atom.homePos.x) * k;
    velRef.current.y -= (posRef.current.y - atom.homePos.y) * k;
    velRef.current.z -= (posRef.current.z - atom.homePos.z) * k;
    // Damping
    velRef.current.multiplyScalar(0.985);
    posRef.current.add(velRef.current);
  });

  const electronRadii = atom.isHero
    ? [1.4, 2.0, 2.6].slice(0, atom.electronCount)
    : [0.65, 0.95].slice(0, atom.electronCount);

  return (
    <group>
      <Nucleus size={atom.nucleusSize} color={atom.color} atomPos={posRef} />
      {electronRadii.map((r, i) => {
        const tilt = ((atom.seed + i * 47) % 180) * (Math.PI / 180);
        return (
          <group key={`ring-${i}`}>
            <OrbitRing atomPos={posRef} radius={r} tilt={tilt} color={atom.color} />
            <Electron
              atomPos={posRef}
              color={atom.color}
              radius={r}
              tilt={tilt}
              speed={2.2 - i * 0.4}
              phase={i * 2.1 + atom.seed}
            />
          </group>
        );
      })}
    </group>
  );
}

/** Lightning bolt — jagged line between two world points; fades over lifetime */
function LightningBolt({ from, to, color = '#bbeaff', lifetime = 0.4, onExpire }) {
  const ref = useRef();
  const startRef = useRef(performance.now() / 1000);

  const geometry = useMemo(() => {
    const points = [];
    const segments = 8;
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0.1)).normalize();
    const up = new THREE.Vector3().crossVectors(dir, right).normalize();
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const base = new THREE.Vector3().lerpVectors(from, to, t);
      const jitter = (i === 0 || i === segments) ? 0 : (Math.random() - 0.5) * len * 0.18;
      const jitter2 = (i === 0 || i === segments) ? 0 : (Math.random() - 0.5) * len * 0.12;
      base.addScaledVector(right, jitter);
      base.addScaledVector(up, jitter2);
      points.push(base);
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [from, to]);

  useFrame(() => {
    if (!ref.current) return;
    const age = performance.now() / 1000 - startRef.current;
    const opacity = Math.max(0, 1 - age / lifetime);
    ref.current.material.opacity = opacity * 0.95;
    if (age > lifetime && onExpire) onExpire();
  });

  return (
    <line ref={ref}>
      <primitive object={geometry} attach="geometry" />
      <lineBasicMaterial color={color} transparent opacity={0.95} linewidth={2} toneMapped={false} />
    </line>
  );
}

/** Manages active lightning bolts (ambient + event-triggered) */
function LightningManager({ heroAtoms, busActivity }) {
  const [bolts, setBolts] = useState([]);
  const lastBusLen = useRef(busActivity?.length || 0);
  const nextAmbient = useRef(performance.now() / 1000 + 0.5);

  // Ambient bolts at random intervals
  useFrame(() => {
    const now = performance.now() / 1000;
    if (now >= nextAmbient.current && heroAtoms.length >= 2) {
      const i = Math.floor(Math.random() * heroAtoms.length);
      let j = Math.floor(Math.random() * heroAtoms.length);
      if (j === i) j = (j + 1) % heroAtoms.length;
      const a = heroAtoms[i].homePos;
      const b = heroAtoms[j].homePos;
      setBolts(prev => [...prev, {
        id: now + Math.random(),
        from: a.clone(),
        to: b.clone(),
        color: '#cce8ff',
      }]);
      nextAmbient.current = now + 0.6 + Math.random() * 1.6;
    }
  });

  // Bus-event-triggered bolts (color matches source-agent)
  useEffect(() => {
    const len = busActivity?.length || 0;
    if (len > lastBusLen.current && heroAtoms.length >= 2) {
      // New bus events — fire 1-2 bolts
      const newEvts = busActivity.slice(lastBusLen.current);
      for (const evt of newEvts.slice(-2)) {
        const fromAgent = evt.from?.toLowerCase();
        const idx = heroAtoms.findIndex(a => a.id === fromAgent);
        const fromIdx = idx >= 0 ? idx : Math.floor(Math.random() * heroAtoms.length);
        let toIdx = Math.floor(Math.random() * heroAtoms.length);
        if (toIdx === fromIdx) toIdx = (toIdx + 1) % heroAtoms.length;
        const fromAtom = heroAtoms[fromIdx];
        setBolts(prev => [...prev, {
          id: performance.now() / 1000 + Math.random(),
          from: fromAtom.homePos.clone(),
          to: heroAtoms[toIdx].homePos.clone(),
          color: fromAtom.color,
        }]);
      }
    }
    lastBusLen.current = len;
  }, [busActivity, heroAtoms]);

  const removeBolt = (id) => setBolts(prev => prev.filter(b => b.id !== id));

  return (
    <>
      {bolts.map(b => (
        <LightningBolt
          key={b.id}
          from={b.from}
          to={b.to}
          color={b.color}
          onExpire={() => removeBolt(b.id)}
        />
      ))}
    </>
  );
}

/** Slow camera orbit */
function CameraOrbit() {
  useFrame((state) => {
    const t = state.clock.elapsedTime * 0.035;
    state.camera.position.x = Math.sin(t) * 26;
    state.camera.position.z = Math.cos(t) * 26;
    state.camera.position.y = 4 + Math.sin(t * 0.6) * 2;
    state.camera.lookAt(0, 0, 0);
  });
  return null;
}

export function ConstellationScene({ busActivity }) {
  return (
    <Canvas
      camera={{ position: [0, 4, 26], fov: 55 }}
      frameloop="always"
      gl={{ antialias: true, powerPreference: 'high-performance', alpha: true }}
      dpr={[1, 2]}
      style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', background: '#080a14' }}
    >
      <color attach="background" args={['#080a14']} />

      {ALL_ATOMS.map(a => <Atom key={a.id} atom={a} />)}

      <LightningManager heroAtoms={HERO_ATOMS} busActivity={busActivity} />

      <CameraOrbit />

      <EffectComposer>
        <Bloom intensity={1.4} luminanceThreshold={0.3} mipmapBlur />
      </EffectComposer>
    </Canvas>
  );
}
