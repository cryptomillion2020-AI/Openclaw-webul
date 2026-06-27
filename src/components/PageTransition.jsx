/**
 * PageTransition.jsx — animated slide+fade between pages
 * Pass 2 P1 (2026-06-27)
 */
import { useEffect, useState } from 'react';

export function PageTransition({ pageKey, children }) {
  const [displayed, setDisplayed] = useState(children);
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    // Trigger exit, then swap content, then enter
    setEntering(true);
    const t1 = setTimeout(() => {
      setDisplayed(children);
      const t2 = setTimeout(() => setEntering(false), 30);
      return () => clearTimeout(t2);
    }, 150);
    return () => clearTimeout(t1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey]);

  return (
    <div className={entering ? 'page-transition-enter page-transition-enter-active' : ''}>
      {displayed}
    </div>
  );
}
