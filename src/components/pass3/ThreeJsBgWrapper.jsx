/**
 * ThreeJsBgWrapper.jsx — Pass 3 Three.js background mount wrapper (skeleton)
 *
 * In P3.1+ this becomes:
 *   - R3F Canvas mount with sceneComponent
 *   - Visibility-detection pause loop (per SPEC §2.4)
 *   - Dynamic LOD downgrade
 *   - ?no-3d=1 query param fallback
 *
 * For P3.0 foundation: renders a static gradient placeholder + the overlay children.
 */
export function ThreeJsBgWrapper({ sceneComponent, children, fallback2D = false }) {
  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        background: 'radial-gradient(ellipse at center, rgba(168, 85, 247, 0.06) 0%, var(--bg-deep) 60%)',
        pointerEvents: 'none',
      }}>
        {/* P3.1+ mounts <Canvas>{sceneComponent}</Canvas> here */}
      </div>
      <div style={{ position: 'relative', zIndex: 10 }}>
        {children}
      </div>
    </div>
  );
}
