/**
 * ConstellationScene.jsx — Pass 3 P3.1 iter-6 — Single atom, 13 electron-agents
 * Per Architect 2026-06-29 14:29 PDT reference:
 *   - ONE central nucleus (multi-color sphere cluster, like reference)
 *   - 13 visible glowing orbital rings (one per agent)
 *   - 13 electrons (one per agent), each colored per AGENT_COLOR
 *   - Bright bloom + glow on rings, soft dark background
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

const AGENT_IDS = Object.keys(AGENT_COLOR);

/** Nucleus — packed cluster of colored spheres (matches reference) */
function Nucleus() {
  const groupRef = useRef();
  const blobs = useMemo(() => [
    // Center 'core' — large slightly transparent base
    { pos: [0, 0, 0], size: 0.55, color: '#f43f5e' },
    // Surrounding colored blobs, packed at varying offsets
    { pos: [0.35, 0.15, 0.2], size: 0.32, color: '#a855f7' },
    { pos: [-0.32, 0.18, 0.18], size: 0.28, color: '#3b82f6' },
    { pos: [0.18, -0.32, 0.22], size: 0.30, color: '#ec4899' },
    { pos: [-0.22, -0.28, 0.18], size: 0.26, color: '#fbbf24' },
    { pos: [0.05, 0.30, -0.25], size: 0.28, color: '#22d3ee' },
    { pos: [-0.18, -0.15, -0.32], size: 0.30, color: '#ff6b35' },
    { pos: [0.32, -0.08, -0.20], size: 0.24, color: '#84cc16' },
  ], []);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.rotation.y = t * 0.2;
    groupRef.current.rotation.x = Math.sin(t * 0.4) * 0.15;
    const pulse = 1 + 0.08 * Math.sin(t * 1.6);
    groupRef.current.scale.setScalar(pulse);
  });

  return (
    <group ref={groupRef}>
      {blobs.map((b, i) => (
        <mesh key={i} position={b.pos}>
          <sphereGeometry args={[b.size, 16, 16]} />
          <meshBasicMaterial color={b.color} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Visible glowing orbital ring (TorusGeometry, bright) */
function OrbitRing({ radius, tubeWidth, tilt, twist, color }) {
  return (
    <mesh rotation={[tilt, twist, twist * 0.5]}>
      <torusGeometry args={[radius, tubeWidth, 10, 96]} />
      <meshBasicMaterial color={color} transparent opacity={0.85} toneMapped={false} />
    </mesh>
  );
}

/** Electron — colored sphere orbiting on its ring */
function Electron({ radius, tilt, twist, speed, phase, color, size = 0.18 }) {
  const ref = useRef();
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime * speed + phase;
    const ox = Math.cos(t) * radius;
    const oz = Math.sin(t) * radius;
    // Apply tilt about x, then twist about y
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const cy = Math.cos(twist), sy = Math.sin(twist);
    const tx = ox;
    const ty = -oz * st;
    const tz = oz * ct;
    const fx = tx * cy + tz * sy;
    const fz = -tx * sy + tz * cy;
    ref.current.position.set(fx, ty, fz);
  });
  return (
    <group>
      {/* glow halo */}
      <mesh ref={ref}>
        <sphereGeometry args={[size * 1.8, 12, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.25} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* solid electron */}
      <mesh ref={ref}>
        <sphereGeometry args={[size, 12, 12]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** 13 agent-electrons orbiting the central nucleus */
function AgentOrbits() {
  // Each agent gets a unique ring: radius, tilt, twist
  const orbits = useMemo(() => AGENT_IDS.map((id, i) => {
    const t = i / AGENT_IDS.length;
    return {
      id,
      color: AGENT_COLOR[id],
      radius: 2.4 + (i % 5) * 0.45,           // varied radii so rings don't overlap heavily
      tilt: (i * 0.6 + 0.3) * (Math.PI / 1.5),
      twist: (i * 0.45) * Math.PI,
      speed: 0.7 + (i % 4) * 0.18,             // varied speed so electrons don't all sync
      phase: t * Math.PI * 2,
      size: 0.18,
      tubeWidth: 0.025,
    };
  }), []);

  return (
    <group>
      {orbits.map(o => (
        <group key={o.id}>
          <OrbitRing
            radius={o.radius}
            tubeWidth={o.tubeWidth}
            tilt={o.tilt}
            twist={o.twist}
            color={o.color}
          />
          <Electron
            radius={o.radius}
            tilt={o.tilt}
            twist={o.twist}
            speed={o.speed}
            phase={o.phase}
            color={o.color}
            size={o.size}
          />
        </group>
      ))}
    </group>
  );
}

/** Inter-electron lightning on bus events */
function LightningBolt({ from, to, color = '#cce8ff', lifetime = 0.5, onExpire }) {
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
      const j1 = (i === 0 || i === segments) ? 0 : (Math.random() - 0.5) * len * 0.18;
      const j2 = (i === 0 || i === segments) ? 0 : (Math.random() - 0.5) * len * 0.12;
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
    ref.current.material.opacity = opacity * 0.95;
    if (age > lifetime && onExpire) onExpire();
  });

  return (
    <line ref={ref}>
      <primitive object={geometry} attach="geometry" />
      <lineBasicMaterial color={color} transparent opacity={0.95} toneMapped={false} />
    </line>
  );
}

function LightningManager({ busActivity }) {
  const [bolts, setBolts] = useState([]);
  const lastBusLen = useRef(busActivity?.length || 0);
  const nextAmbient = useRef(performance.now() / 1000 + 0.6);

  // Ambient bolts: between nucleus center and a random electron position
  useFrame(() => {
    const now = performance.now() / 1000;
    if (now >= nextAmbient.current) {
      // Approximate random surface point ~3 units from center
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.5) * Math.PI;
      const r = 2.6 + Math.random() * 2;
      const endPoint = new THREE.Vector3(
        Math.sin(theta) * Math.cos(phi) * r,
        Math.sin(phi) * r,
        Math.cos(theta) * Math.cos(phi) * r
      );
      setBolts(prev => [...prev, {
        id: now + Math.random(),
        from: new THREE.Vector3(0, 0, 0),
        to: endPoint,
        color: '#cce8ff',
      }]);
      nextAmbient.current = now + 0.4 + Math.random() * 1.0;
    }
  });

  // Bus-event bolts: agent-colored, from nucleus to that agent's electron approximate orbit
  useEffect(() => {
    const len = busActivity?.length || 0;
    if (len > lastBusLen.current) {
      const newEvts = busActivity.slice(lastBusLen.current);
      for (const evt of newEvts.slice(-2)) {
        const fromAgent = evt.from?.toLowerCase();
        const idx = AGENT_IDS.indexOf(fromAgent);
        const useIdx = idx >= 0 ? idx : Math.floor(Math.random() * AGENT_IDS.length);
        const color = AGENT_COLOR[AGENT_IDS[useIdx]];
        // Approximate electron position on its orbit
        const r = 2.4 + (useIdx % 5) * 0.45;
        const angle = (useIdx / AGENT_IDS.length) * Math.PI * 2;
        const tilt = (useIdx * 0.6 + 0.3) * (Math.PI / 1.5);
        const ox = Math.cos(angle) * r;
        const oz = Math.sin(angle) * r;
        const endPoint = new THREE.Vector3(ox, -oz * Math.sin(tilt), oz * Math.cos(tilt));
        setBolts(prev => [...prev, {
          id: performance.now() / 1000 + Math.random(),
          from: new THREE.Vector3(0, 0, 0),
          to: endPoint,
          color,
        }]);
      }
    }
    lastBusLen.current = len;
  }, [busActivity]);

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

/** Slow camera orbit for depth */
function CameraOrbit() {
  useFrame((state) => {
    const t = state.clock.elapsedTime * 0.04;
    state.camera.position.x = Math.sin(t) * 11;
    state.camera.position.z = Math.cos(t) * 11;
    state.camera.position.y = 1.5 + Math.sin(t * 0.6) * 1.2;
    state.camera.lookAt(0, 0, 0);
  });
  return null;
}

export function ConstellationScene({ busActivity }) {
  return (
    <Canvas
      camera={{ position: [0, 2, 11], fov: 55 }}
      frameloop="always"
      gl={{ antialias: true, powerPreference: 'high-performance', alpha: true }}
      dpr={[1, 2]}
      style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', background: '#060814' }}
    >
      <color attach="background" args={['#060814']} />

      {/* The single atom: central nucleus + 13 agent-electron orbits */}
      <Nucleus />
      <AgentOrbits />

      {/* Lightning effects */}
      <LightningManager busActivity={busActivity} />

      <CameraOrbit />

      <EffectComposer>
        <Bloom intensity={2.2} luminanceThreshold={0.2} mipmapBlur radius={0.95} />
      </EffectComposer>
    </Canvas>
  );
}
