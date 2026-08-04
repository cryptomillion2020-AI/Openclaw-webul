/**
 * PageTransition.jsx — animated slide+fade between pages
 * Pass 2 P1 (2026-06-27)
 */
import { useEffect, useState } from 'react';

export function PageTransition({ pageKey, children }) {
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    setEntering(true);
    const timer = setTimeout(() => setEntering(false), 180);
    return () => clearTimeout(timer);
  }, [pageKey]);

  return (
    <div className={`page-transition${entering ? ' page-transition-enter page-transition-enter-active' : ''}`}>
      {children}
    </div>
  );
}
