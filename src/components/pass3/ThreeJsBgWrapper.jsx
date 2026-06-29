/**
 * ThreeJsBgWrapper.jsx — Pass 3 Three.js background mount wrapper
 * P3.1 populates this to support arbitrary scene component + visibility pause
 */
import { useEffect } from 'react';

export function ThreeJsBgWrapper({ children, sceneComponent }) {
  // Visibility pause stub — actual frameloop suspension via R3F invalidate hook in P3.1.x
  useEffect(() => {
    const onVis = () => { /* placeholder for frameloop pause logic */ };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      {sceneComponent}
      <div style={{ position: 'relative', zIndex: 10 }}>
        {children}
      </div>
    </div>
  );
}
