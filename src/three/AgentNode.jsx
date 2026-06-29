/**
 * AgentNode.jsx — Pass 3 P3.1 ConstellationScene primitive
 * Single 3D agent node — low-poly icosahedron, color = agent accent
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

export function AgentNode({ position, color, status = 'idle', size = 0.55 }) {
  const meshRef = useRef();
  const active = status === 'active' || status === 'exec';
  const dead = status === 'dead';

  useFrame((state) => {
    if (!meshRef.current) return;
    if (active) {
      const pulse = 1 + 0.12 * Math.sin(state.clock.elapsedTime * 2);
      meshRef.current.scale.set(pulse, pulse, pulse);
    }
    meshRef.current.rotation.y += 0.003;
  });

  return (
    <mesh ref={meshRef} position={position}>
      <icosahedronGeometry args={[size, 0]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={dead ? 0 : (active ? 0.7 : 0.25)}
        wireframe={status === 'idle' || status === 'hold'}
        transparent
        opacity={dead ? 0.3 : 1}
      />
    </mesh>
  );
}
