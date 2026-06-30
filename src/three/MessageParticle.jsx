/**
 * MessageParticle.jsx — Pass 3 P3.1 Tier 2b
 * Bus-event visualization between hero atoms in ConstellationScene.
 * A bright orb travels along a quadratic-Bezier arc from source → destination
 * with a fading tail. Color encodes priority: P0=red, P1=amber, P2=cyan.
 * Distinct from LightningBolt (instantaneous discharge) — MessageParticle = traveling payload.
 */
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const PRIORITY_COLOR = {
  P0: '#ef5350',
  P1: '#fbbf24',
  P2: '#22d3ee',
};

const TAIL_SEGMENTS = 8;

export function MessageParticle({ from, to, priority = 'P2', lifetime = 1.2, onExpire }) {
  const orbRef = useRef();
  const tailRef = useRef();
  const startRef = useRef(performance.now() / 1000);

  const { control, tailGeometry, tailPositions } = useMemo(() => {
    const mid = new THREE.Vector3().lerpVectors(from, to, 0.5);
    const dist = from.distanceTo(to);
    const lift = Math.min(4, dist * 0.18);
    mid.y += lift;
    const positions = new Float32Array((TAIL_SEGMENTS + 1) * 3);
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return { control: mid, tailGeometry: geom, tailPositions: positions };
  }, [from, to]);

  useFrame(() => {
    const now = performance.now() / 1000;
    const age = now - startRef.current;
    const t = age / lifetime;
    if (t >= 1) {
      if (onExpire) onExpire();
      return;
    }
    const oneMinusT = 1 - t;
    const x = oneMinusT * oneMinusT * from.x + 2 * oneMinusT * t * control.x + t * t * to.x;
    const y = oneMinusT * oneMinusT * from.y + 2 * oneMinusT * t * control.y + t * t * to.y;
    const z = oneMinusT * oneMinusT * from.z + 2 * oneMinusT * t * control.z + t * t * to.z;
    if (orbRef.current) {
      orbRef.current.position.set(x, y, z);
      const pulse = 1 + 0.25 * Math.sin(now * 8);
      orbRef.current.scale.setScalar(pulse);
      orbRef.current.material.opacity = Math.min(1, oneMinusT * 2.5);
    }
    for (let i = 0; i <= TAIL_SEGMENTS; i++) {
      const tt = Math.max(0, t - (i / TAIL_SEGMENTS) * 0.22);
      const omt = 1 - tt;
      tailPositions[i * 3] = omt * omt * from.x + 2 * omt * tt * control.x + tt * tt * to.x;
      tailPositions[i * 3 + 1] = omt * omt * from.y + 2 * omt * tt * control.y + tt * tt * to.y;
      tailPositions[i * 3 + 2] = omt * omt * from.z + 2 * omt * tt * control.z + tt * tt * to.z;
    }
    if (tailRef.current) {
      tailRef.current.geometry.attributes.position.needsUpdate = true;
      tailRef.current.material.opacity = Math.min(1, oneMinusT * 0.6);
    }
  });

  const color = PRIORITY_COLOR[priority] || PRIORITY_COLOR.P2;

  return (
    <group>
      <line ref={tailRef}>
        <primitive object={tailGeometry} attach="geometry" />
        <lineBasicMaterial color={color} transparent opacity={0.6} toneMapped={false} linewidth={2} />
      </line>
      <mesh ref={orbRef}>
        <sphereGeometry args={[0.18, 12, 12]} />
        <meshBasicMaterial color={color} transparent opacity={1} toneMapped={false} />
      </mesh>
    </group>
  );
}
