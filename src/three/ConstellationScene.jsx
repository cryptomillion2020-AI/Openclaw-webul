/**
 * ConstellationScene.jsx — Pass 3 P3.1 iter-5 — Reference-matching atom graphics
 * Per Architect 2026-06-29 12:27 PDT:
 *   - Atoms flow naturally across the entire screen (no home spring; viewport wrap)
 *   - Match reference image: large glowing nucleus, multiple bold orbit rings,
 *     lightning discharges radiating outward from each atom
 *   - Enhanced graphics
 */
import { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { MessageParticle } from './MessageParticle';

const AGENT_COLOR = {
  'sevin': '#ff6b35', 'overseer': '#3b82f6', 'elevin': '#84cc16',
  'tika': '#a855f7', 'quant': '#f43f5e', 'nexus': '#fbbf24',
  'comms': '#22d3ee', 'axis': '#fb923c', 'cosmos': '#ec4899',
  'navigator': '#14b8a6', 'stan-local': '#94a3b8', 'stan-hl': '#475569',
  'vault': '#7c3aed',
};

const HERO_AGENT_IDS = ['sevin', 'overseer', 'elevin', 'tika', 'quant'];

// World bounds for natural drift + wrap
const BOUND = { x: 20, y: 12, z: 14 };

function rand(min, max) { return min + Math.random() * (max - min); }
function wrapAxis(v, half) {
  if (v > half) return v - 2 * half;
  if (v < -half) return v + 2 * half;
  return v;
}

// Tier 2b polish: drift speed scaled -25% (0.04→0.03, 0.025→0.019, 0.03→0.022)
const HERO_ATOMS = HERO_AGENT_IDS.map((id, i) => ({
  id,
  color: AGENT_COLOR[id],
  startPos: new THREE.Vector3(rand(-BOUND.x * 0.7, BOUND.x * 0.7), rand(-BOUND.y * 0.6, BOUND.y * 0.6), rand(-BOUND.z * 0.5, BOUND.z * 0.5)),
  velocity: new THREE.Vector3(rand(-0.03, 0.03), rand(-0.019, 0.019), rand(-0.022, 0.022)),
  seed: i * 137.5,
  nucleusSize: 0.85,
  haloSize: 1.8,
  ringRadii: [1.6, 2.4, 3.2],
  ringWidths: [0.06, 0.05, 0.045],
  isHero: true,
}));

const BG_ATOMS = Array.from({ length: 18 }).map((_, i) => ({
  id: `bg-${i}`,
  color: AGENT_COLOR[Object.keys(AGENT_COLOR)[i % Object.keys(AGENT_COLOR).length]],
  startPos: new THREE.Vector3(rand(-BOUND.x, BOUND.x), rand(-BOUND.y, BOUND.y), rand(-BOUND.z, BOUND.z * 0.7)),
  velocity: new THREE.Vector3(rand(-0.019, 0.019), rand(-0.0135, 0.0135), rand(-0.0165, 0.0165)),
  seed: i * 53.3,
  nucleusSize: 0.3,
  haloSize: 0.6,
  ringRadii: [0.7, 1.0],
  ringWidths: [0.025, 0.02],
  isHero: false,
}));

const ALL_ATOMS = [...HERO_ATOMS, ...BG_ATOMS];

/** Pulsing nucleus + glow halo (sprite) */
function Nucleus({ atomPos, size, haloSize, color, isHero }) {
  const nucleusRef = useRef();
  const haloRef = useRef();

  useFrame((state) => {
    if (!atomPos.current) return;
    const t = state.clock.elapsedTime;
    const pulse = 1 + 0.18 * Math.sin(t * 2 + 0.4);
    if (nucleusRef.current) {
      nucleusRef.current.position.copy(atomPos.current);
      nucleusRef.current.scale.setScalar(pulse);
    }
    if (haloRef.current) {
      haloRef.current.position.copy(atomPos.current);
      const haloP = 1 + 0.25 * Math.sin(t * 1.4);
      haloRef.current.scale.setScalar(haloP);
    }
  });

  return (
    <group>
      {/* Halo — transparent sphere; Bloom postprocessing produces the soft-glow effect */}
      <mesh ref={haloRef}>
        <sphereGeometry args={[haloSize, 12, 12]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={isHero ? 0.18 : 0.10}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {/* Solid nucleus */}
      <mesh ref={nucleusRef}>
        <sphereGeometry args={[size, 20, 20]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Thick visible orbit ring (TorusGeometry) */
function OrbitRing({ atomPos, radius, tubeWidth, tilt, twist, color }) {
  const ref = useRef();
  useFrame(() => {
    if (!ref.current || !atomPos.current) return;
    ref.current.position.copy(atomPos.current);
  });
  return (
    <mesh ref={ref} rotation={[tilt, twist, twist * 0.4]}>
      <torusGeometry args={[radius, tubeWidth, 8, 64]} />
      <meshBasicMaterial color={color} transparent opacity={0.82} toneMapped={false} />
    </mesh>
  );
}

/** Electron — bright sphere orbiting */
function Electron({ atomPos, color, radius, tilt, twist, speed, phase, size = 0.12 }) {
  const ref = useRef();
  useFrame((state) => {
    if (!ref.current || !atomPos.current) return;
    const t = state.clock.elapsedTime * speed + phase;
    const ox = Math.cos(t) * radius;
    const oz = Math.sin(t) * radius;
    // Apply ring rotation (tilt about x, twist about y)
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const cy = Math.cos(twist), sy = Math.sin(twist);
    // First tilt: (x, y=0, z) → (x, -z*sin, z*cos)
    const tx = ox;
    const ty = -oz * st;
    const tz = oz * ct;
    // Then twist about y: (x, y, z) → (x*cos + z*sin, y, -x*sin + z*cos)
    const fx = tx * cy + tz * sy;
    const fz = -tx * sy + tz * cy;
    ref.current.position.set(
      atomPos.current.x + fx,
      atomPos.current.y + ty,
      atomPos.current.z + fz
    );
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[size, 10, 10]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  );
}

/** Radial discharge — short lightning arcs firing outward from atom */
function RadialDischarge({ atomPos, color, isHero }) {
  const groupRef = useRef();
  const [arcs, setArcs] = useState([]);
  const nextFire = useRef(performance.now() / 1000 + Math.random() * 2);

  useFrame((state) => {
    if (!groupRef.current || !atomPos.current) return;
    groupRef.current.position.copy(atomPos.current);
    const now = performance.now() / 1000;
    if (now >= nextFire.current) {
      // Spawn 2-4 short outward arcs at random angles
      const count = isHero ? 2 + Math.floor(Math.random() * 3) : 1;
      const newArcs = [];
      for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = (Math.random() - 0.5) * Math.PI * 0.7;
        const len = isHero ? rand(2.5, 4.5) : rand(1.0, 2.0);
        const endX = Math.sin(phi) * Math.cos(theta) * len;
        const endY = Math.cos(phi) * len * 0.6;
        const endZ = Math.sin(phi) * Math.sin(theta) * len;
        newArcs.push({
          id: now + i + Math.random(),
          end: new THREE.Vector3(endX, endY, endZ),
          startedAt: now,
          lifetime: 0.28,
        });
      }
      setArcs(prev => [...prev, ...newArcs]);
      nextFire.current = now + (isHero ? rand(0.7, 2.2) : rand(2.5, 5.5));
    }
    // Clean expired
    const visible = arcs.filter(a => now - a.startedAt < a.lifetime);
    if (visible.length !== arcs.length) setArcs(visible);
  });

  return (
    <group ref={groupRef}>
      {arcs.map(a => (
        <DischargeArc key={a.id} end={a.end} color={color} startedAt={a.startedAt} lifetime={a.lifetime} />
      ))}
    </group>
  );
}

function DischargeArc({ end, color, startedAt, lifetime }) {
  const ref = useRef();
  const geometry = useMemo(() => {
    const points = [];
    const segments = 5;
    const right = new THREE.Vector3().crossVectors(end, new THREE.Vector3(0, 1, 0.1)).normalize();
    const up = new THREE.Vector3().crossVectors(end, right).normalize();
    const len = end.length();
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const base = new THREE.Vector3().lerpVectors(new THREE.Vector3(0, 0, 0), end, t);
      const j1 = (i === 0 || i === segments) ? 0 : (Math.random() - 0.5) * len * 0.22;
      const j2 = (i === 0 || i === segments) ? 0 : (Math.random() - 0.5) * len * 0.16;
      base.addScaledVector(right, j1);
      base.addScaledVector(up, j2);
      points.push(base);
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [end]);

  useFrame(() => {
    if (!ref.current) return;
    const age = performance.now() / 1000 - startedAt;
    const t = age / lifetime;
    const opacity = Math.max(0, (1 - t) * 0.95);
    ref.current.material.opacity = opacity;
  });

  return (
    <line ref={ref}>
      <primitive object={geometry} attach="geometry" />
      <lineBasicMaterial color={color} transparent opacity={0.95} toneMapped={false} />
    </line>
  );
}

/** Single atom — drifts freely + nucleus + rings + electrons + radial discharge */
function Atom({ atom }) {
  const posRef = useRef(atom.startPos.clone());
  const velRef = useRef(atom.velocity.clone());

  useFrame(() => {
    velRef.current.x += (Math.random() - 0.5) * 0.0011;
    velRef.current.y += (Math.random() - 0.5) * 0.00075;
    velRef.current.z += (Math.random() - 0.5) * 0.0009;
    const speed = velRef.current.length();
    const maxSpeed = atom.isHero ? 0.045 : 0.03;
    if (speed > maxSpeed) velRef.current.multiplyScalar(maxSpeed / speed);
    posRef.current.add(velRef.current);
    posRef.current.x = wrapAxis(posRef.current.x, BOUND.x);
    posRef.current.y = wrapAxis(posRef.current.y, BOUND.y);
    posRef.current.z = wrapAxis(posRef.current.z, BOUND.z);
  });

  const ringTilts = useMemo(
    () => atom.ringRadii.map((_, i) => ({
      tilt: ((atom.seed + i * 37) % 180) * (Math.PI / 180),
      twist: ((atom.seed + i * 71) % 180) * (Math.PI / 180),
    })),
    [atom.ringRadii, atom.seed]
  );

  return (
    <group>
      <Nucleus
        atomPos={posRef}
        size={atom.nucleusSize}
        haloSize={atom.haloSize}
        color={atom.color}
        isHero={atom.isHero}
      />
      {atom.ringRadii.map((r, i) => {
        const { tilt, twist } = ringTilts[i];
        return (
          <group key={`ring-${i}`}>
            <OrbitRing
              atomPos={posRef}
              radius={r}
              tubeWidth={atom.ringWidths[i] || 0.03}
              tilt={tilt}
              twist={twist}
              color={atom.color}
            />
            <Electron
              atomPos={posRef}
              color={atom.color}
              radius={r}
              tilt={tilt}
              twist={twist}
              speed={2.4 - i * 0.45}
              phase={i * 2.1 + atom.seed}
              size={atom.isHero ? 0.14 : 0.07}
            />
          </group>
        );
      })}
      {atom.isHero && <RadialDischarge atomPos={posRef} color="#cce8ff" isHero={true} />}
    </group>
  );
}

/** Inter-atom lightning bolts (ambient + bus-event-triggered) */
function LightningBolt({ from, to, color, lifetime = 0.4, onExpire }) {
  const ref = useRef();
  const startRef = useRef(performance.now() / 1000);

  const geometry = useMemo(() => {
    const points = [];
    const segments = 10;
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0.1)).normalize();
    const up = new THREE.Vector3().crossVectors(dir, right).normalize();
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const base = new THREE.Vector3().lerpVectors(from, to, t);
      const j1 = (i === 0 || i === segments) ? 0 : (Math.random() - 0.5) * len * 0.15;
      const j2 = (i === 0 || i === segments) ? 0 : (Math.random() - 0.5) * len * 0.1;
      base.addScaledVector(right, j1);
      base.addScaledVector(up, j2);
      points.push(base);
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [from, to]);

  useFrame(() => {
    if (!ref.current) return;
    const age = performance.now() / 1000 - startRef.current;
    const opacity = Math.max(0, 1 - age / lifetime);
    ref.current.material.opacity = opacity * 0.9;
    if (age > lifetime && onExpire) onExpire();
  });

  return (
    <line ref={ref}>
      <primitive object={geometry} attach="geometry" />
      <lineBasicMaterial color={color} transparent opacity={0.9} toneMapped={false} />
    </line>
  );
}

function LightningManager({ busActivity, heroPositions }) {
  const [bolts, setBolts] = useState([]);
  const [particles, setParticles] = useState([]);
  const lastBusLen = useRef(busActivity?.length || 0);
  // Tier 2b: ambient lightning slowed (was 0.5-1.9s → 1.2-3.0s) so MessageParticles
  // (the actual bus-event payload visual) are the primary motion language.
  const nextAmbient = useRef(performance.now() / 1000 + 0.8);

  useFrame(() => {
    const now = performance.now() / 1000;
    if (now >= nextAmbient.current && heroPositions.length >= 2) {
      const i = Math.floor(Math.random() * heroPositions.length);
      let j = Math.floor(Math.random() * heroPositions.length);
      if (j === i) j = (j + 1) % heroPositions.length;
      const a = heroPositions[i].current?.clone();
      const b = heroPositions[j].current?.clone();
      if (a && b) {
        setBolts(prev => [...prev, {
          id: now + Math.random(),
          from: a, to: b,
          color: '#cce8ff',
        }]);
      }
      nextAmbient.current = now + 1.2 + Math.random() * 1.8;
    }
  });

  useEffect(() => {
    const len = busActivity?.length || 0;
    if (len > lastBusLen.current && heroPositions.length >= 2) {
      const newEvts = busActivity.slice(lastBusLen.current);
      for (const evt of newEvts.slice(-3)) {
        const fromIdx = Math.floor(Math.random() * heroPositions.length);
        let toIdx = Math.floor(Math.random() * heroPositions.length);
        if (toIdx === fromIdx) toIdx = (toIdx + 1) % heroPositions.length;
        const a = heroPositions[fromIdx].current?.clone();
        const b = heroPositions[toIdx].current?.clone();
        if (a && b) {
          const priority = evt?.priority || (Math.random() < 0.1 ? 'P0' : Math.random() < 0.4 ? 'P1' : 'P2');
          setParticles(prev => [...prev, {
            id: performance.now() / 1000 + Math.random(),
            from: a, to: b,
            priority,
          }]);
        }
      }
    }
    lastBusLen.current = len;
  }, [busActivity, heroPositions]);

  const removeBolt = (id) => setBolts(prev => prev.filter(b => b.id !== id));
  const removeParticle = (id) => setParticles(prev => prev.filter(p => p.id !== id));

  return (
    <>
      {bolts.map(b => (
        <LightningBolt
          key={b.id}
          from={b.from} to={b.to} color={b.color}
          onExpire={() => removeBolt(b.id)}
        />
      ))}
      {particles.map(p => (
        <MessageParticle
          key={p.id}
          from={p.from} to={p.to} priority={p.priority}
          onExpire={() => removeParticle(p.id)}
        />
      ))}
    </>
  );
}

/** Slow camera orbit */
function CameraOrbit() {
  useFrame((state) => {
    const t = state.clock.elapsedTime * 0.025;
    state.camera.position.x = Math.sin(t) * 28;
    state.camera.position.z = Math.cos(t) * 28;
    state.camera.position.y = 3 + Math.sin(t * 0.5) * 1.5;
    state.camera.lookAt(0, 0, 0);
  });
  return null;
}

/** Wrapper that tracks hero atom positions for LightningManager */
function HeroTracked({ atom, register }) {
  const posRef = useRef(atom.startPos.clone());
  const velRef = useRef(atom.velocity.clone());

  useEffect(() => {
    register(atom.id, posRef);
  }, [atom.id, register]);

  useFrame(() => {
    velRef.current.x += (Math.random() - 0.5) * 0.0015;
    velRef.current.y += (Math.random() - 0.5) * 0.001;
    velRef.current.z += (Math.random() - 0.5) * 0.0012;
    const speed = velRef.current.length();
    if (speed > 0.06) velRef.current.multiplyScalar(0.06 / speed);
    posRef.current.add(velRef.current);
    posRef.current.x = wrapAxis(posRef.current.x, BOUND.x);
    posRef.current.y = wrapAxis(posRef.current.y, BOUND.y);
    posRef.current.z = wrapAxis(posRef.current.z, BOUND.z);
  });

  const ringTilts = useMemo(
    () => atom.ringRadii.map((_, i) => ({
      tilt: ((atom.seed + i * 37) % 180) * (Math.PI / 180),
      twist: ((atom.seed + i * 71) % 180) * (Math.PI / 180),
    })),
    [atom.ringRadii, atom.seed]
  );

  return (
    <group>
      <Nucleus
        atomPos={posRef}
        size={atom.nucleusSize}
        haloSize={atom.haloSize}
        color={atom.color}
        isHero={true}
      />
      {atom.ringRadii.map((r, i) => {
        const { tilt, twist } = ringTilts[i];
        return (
          <group key={`ring-${i}`}>
            <OrbitRing atomPos={posRef} radius={r} tubeWidth={atom.ringWidths[i] || 0.03} tilt={tilt} twist={twist} color={atom.color} />
            <Electron atomPos={posRef} color={atom.color} radius={r} tilt={tilt} twist={twist} speed={2.4 - i * 0.45} phase={i * 2.1 + atom.seed} size={0.14} />
          </group>
        );
      })}
      <RadialDischarge atomPos={posRef} color="#cce8ff" isHero={true} />
    </group>
  );
}

function SceneContent({ busActivity }) {
  const heroPositionsRef = useRef([]);
  const register = (id, ref) => {
    const existing = heroPositionsRef.current.find(p => p.id === id);
    if (!existing) heroPositionsRef.current.push({ id, current: ref.current });
    else existing.current = ref.current;
  };
  const heroPositions = HERO_ATOMS.map(h => {
    const found = heroPositionsRef.current.find(p => p.id === h.id);
    return { current: found?.current || h.startPos };
  });

  return (
    <>
      {HERO_ATOMS.map(a => <HeroTracked key={a.id} atom={a} register={register} />)}
      {BG_ATOMS.map(a => <Atom key={a.id} atom={a} />)}
      <LightningManager busActivity={busActivity} heroPositions={heroPositions} />
      <CameraOrbit />
    </>
  );
}

export function ConstellationScene({ busActivity }) {
  return (
    <Canvas
      camera={{ position: [0, 3, 28], fov: 58 }}
      frameloop="always"
      gl={{ antialias: true, powerPreference: 'high-performance', alpha: true }}
      dpr={[1, 2]}
      style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', background: '#060814' }}
    >
      <color attach="background" args={['#060814']} />

      <SceneContent busActivity={busActivity} />

      <EffectComposer>
        <Bloom intensity={1.8} luminanceThreshold={0.25} mipmapBlur radius={0.85} />
      </EffectComposer>
    </Canvas>
  );
}
