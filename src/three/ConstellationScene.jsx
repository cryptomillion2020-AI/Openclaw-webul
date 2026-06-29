/**
 * ConstellationScene.jsx — Pass 3 P3.1 iter-3 — "Atomic Activity" background
 * Particle-physics aesthetic: neutron-like cores + electron orbits + firing particles
 * Per Architect 2026-06-29 05:52 PDT: "background should resemble neutrons and electrons firing"
 */
import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';

const AGENT_COLOR = {
  'sevin':      '#ff6b35', 'overseer':   '#3b82f6', 'elevin':     '#84cc16',
  'tika':       '#a855f7', 'quant':      '#f43f5e', 'nexus':      '#fbbf24',
  'comms':      '#22d3ee', 'axis':       '#fb923c', 'cosmos':     '#ec4899',
  'navigator':  '#14b8a6', 'stan-local': '#94a3b8', 'stan-hl':    '#475569',
  'vault':      '#7c3aed',
};

// 13 nucleus positions on a loose sphere — these become the "atoms"
const NUCLEI = Object.entries(AGENT_COLOR).map(([id, color], i) => {
  const phi = Math.acos(-1 + (2 * i) / 13);
  const theta = Math.sqrt(13 * Math.PI) * phi;
  const r = 7;
  return {
    id,
    color,
    position: [
      r * Math.cos(theta) * Math.sin(phi),
      r * Math.sin(theta) * Math.sin(phi) * 0.7,
      r * Math.cos(phi),
    ],
    electronCount: 1 + (i % 3),
    seed: i * 137.5,
  };
});

function Nucleus({ position, color }) {
  const ref = useRef();
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    ref.current.scale.setScalar(1 + 0.18 * Math.sin(t * 1.8));
  });
  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[0.42, 16, 16]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  );
}

function Electron({ nucleusPosition, color, orbitRadius, orbitTilt, speed, phase }) {
  const ref = useRef();
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime * speed + phase;
    const x = Math.cos(t) * orbitRadius;
    const y = Math.sin(t) * orbitRadius * Math.cos(orbitTilt);
    const z = Math.sin(t) * orbitRadius * Math.sin(orbitTilt);
    ref.current.position.set(
      nucleusPosition[0] + x,
      nucleusPosition[1] + y,
      nucleusPosition[2] + z
    );
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.08, 8, 8]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  );
}

function Atom({ nucleus }) {
  const { id, color, position, electronCount, seed } = nucleus;
  return (
    <group>
      <Nucleus position={position} color={color} />
      {Array.from({ length: electronCount }).map((_, i) => (
        <Electron
          key={`${id}-e${i}`}
          nucleusPosition={position}
          color={color}
          orbitRadius={1.1 + i * 0.55}
          orbitTilt={(seed + i * 47) % Math.PI}
          speed={2.5 - i * 0.4}
          phase={i * 2.1 + seed}
        />
      ))}
    </group>
  );
}

/** Field of stream particles "firing" through space */
function ParticleField({ count = 700 }) {
  const ref = useRef();
  const data = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const colorsArr = new Float32Array(count * 3);
    const palette = Object.values(AGENT_COLOR).map(hex => new THREE.Color(hex));
    for (let i = 0; i < count; i++) {
      // Distribute around a large bounding sphere
      const r = 14 + Math.random() * 18;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      // Velocity heading roughly toward center (firing inward)
      const speed = 0.08 + Math.random() * 0.12;
      velocities[i * 3 + 0] = -positions[i * 3 + 0] * speed * 0.05;
      velocities[i * 3 + 1] = -positions[i * 3 + 1] * speed * 0.05;
      velocities[i * 3 + 2] = -positions[i * 3 + 2] * speed * 0.05;
      const col = palette[i % palette.length];
      colorsArr[i * 3 + 0] = col.r;
      colorsArr[i * 3 + 1] = col.g;
      colorsArr[i * 3 + 2] = col.b;
    }
    return { positions, velocities, colorsArr };
  }, [count]);

  useFrame(() => {
    if (!ref.current) return;
    const pos = ref.current.geometry.attributes.position;
    const arr = pos.array;
    for (let i = 0; i < count; i++) {
      arr[i * 3 + 0] += data.velocities[i * 3 + 0];
      arr[i * 3 + 1] += data.velocities[i * 3 + 1];
      arr[i * 3 + 2] += data.velocities[i * 3 + 2];
      // Distance from center
      const dx = arr[i * 3 + 0], dy = arr[i * 3 + 1], dz = arr[i * 3 + 2];
      const distSq = dx * dx + dy * dy + dz * dz;
      // If too close to center OR too far, respawn at far shell
      if (distSq < 9 || distSq > 1100) {
        const r = 22 + Math.random() * 12;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 2 - 1);
        arr[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
        arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        arr[i * 3 + 2] = r * Math.cos(phi);
        const speed = 0.08 + Math.random() * 0.12;
        data.velocities[i * 3 + 0] = -arr[i * 3 + 0] * speed * 0.05;
        data.velocities[i * 3 + 1] = -arr[i * 3 + 1] * speed * 0.05;
        data.velocities[i * 3 + 2] = -arr[i * 3 + 2] * speed * 0.05;
      }
    }
    pos.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={data.positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={count} array={data.colorsArr} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.08} vertexColors transparent opacity={0.85} sizeAttenuation toneMapped={false} />
    </points>
  );
}

/** Slow camera orbit for ambient depth */
function CameraOrbit() {
  useFrame((state) => {
    const t = state.clock.elapsedTime * 0.04;
    state.camera.position.x = Math.sin(t) * 24;
    state.camera.position.z = Math.cos(t) * 24;
    state.camera.position.y = 4 + Math.sin(t * 0.6) * 2;
    state.camera.lookAt(0, 0, 0);
  });
  return null;
}

export function ConstellationScene() {
  return (
    <Canvas
      camera={{ position: [0, 4, 24], fov: 55 }}
      frameloop="always"
      gl={{ antialias: true, powerPreference: 'high-performance', alpha: true }}
      dpr={[1, 2]}
      style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', background: '#0d0f1b' }}
    >
      <color attach="background" args={['#0a0b14']} />

      <ParticleField count={700} />
      {NUCLEI.map(n => <Atom key={n.id} nucleus={n} />)}

      <CameraOrbit />

      <EffectComposer>
        <Bloom intensity={1.2} luminanceThreshold={0.35} mipmapBlur />
      </EffectComposer>
    </Canvas>
  );
}
