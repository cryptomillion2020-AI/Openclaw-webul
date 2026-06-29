/**
 * ConstellationScene.jsx — Pass 3 P3.1 Bridge background scene
 * 13 agent nodes orbiting in 3D sphere around camera. Bloom postprocessing.
 */
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { AgentNode } from './AgentNode';

// 13 agent positions on a loose sphere of radius ~7
const AGENT_POSITIONS = {
  'sevin':      [0, 6.5, 0],
  'overseer':   [0, -6.5, 0],
  'elevin':     [6, 2.8, 2.5],
  'tika':       [-6, 2.8, 2.5],
  'quant':      [6, -2.8, 2.5],
  'nexus':      [-6, -2.8, 2.5],
  'comms':      [4, 0, 5.5],
  'axis':       [-4, 0, 5.5],
  'cosmos':     [4, 0, -5.5],
  'navigator':  [-4, 0, -5.5],
  'stan-local': [0, 0, 7],
  'stan-hl':    [0, 0, -7],
  'vault':      [7, -4, 0],
};

const AGENT_COLOR = {
  'sevin':      '#ff6b35',
  'overseer':   '#3b82f6',
  'elevin':     '#84cc16',
  'tika':       '#a855f7',
  'quant':      '#f43f5e',
  'nexus':      '#fbbf24',
  'comms':      '#22d3ee',
  'axis':       '#fb923c',
  'cosmos':     '#ec4899',
  'navigator':  '#14b8a6',
  'stan-local': '#94a3b8',
  'stan-hl':    '#475569',
  'vault':      '#7c3aed',
};

const MOCK_STATES = {
  'sevin':      'active',
  'overseer':   'active',
  'elevin':     'exec',
  'tika':       'idle',
  'quant':      'hold',
  'nexus':      'idle',
  'comms':      'idle',
  'axis':       'idle',
  'cosmos':     'idle',
  'navigator':  'idle',
  'stan-local': 'idle',
  'stan-hl':    'dead',
  'vault':      'airgap',
};

export function ConstellationScene({ agentStates = MOCK_STATES }) {
  return (
    <Canvas
      camera={{ position: [0, 4, 22], fov: 50 }}
      frameloop="always"
      gl={{ antialias: true, powerPreference: 'high-performance', alpha: true }}
      dpr={[1, 2]}
      style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}
    >
      <color attach="background" args={['#0d0f1b']} />
      <ambientLight intensity={0.4} />
      <pointLight position={[0, 8, 5]} intensity={0.6} color="#a855f7" />
      <pointLight position={[0, -8, -5]} intensity={0.4} color="#22d3ee" />

      {Object.entries(AGENT_POSITIONS).map(([agentId, pos]) => (
        <AgentNode
          key={agentId}
          position={pos}
          color={AGENT_COLOR[agentId]}
          status={agentStates[agentId] || 'idle'}
        />
      ))}

      <OrbitControls
        enablePan={false}
        enableZoom={false}
        autoRotate
        autoRotateSpeed={0.25}
        target={[0, 0, 0]}
      />

      <EffectComposer>
        <Bloom intensity={0.6} luminanceThreshold={0.3} mipmapBlur />
      </EffectComposer>
    </Canvas>
  );
}
