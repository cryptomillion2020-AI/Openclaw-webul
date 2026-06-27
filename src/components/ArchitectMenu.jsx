/**
 * ArchitectMenu.jsx — dropdown menu from Architect badge (Settings + Logout)
 * Pass 2 P1 (2026-06-27)
 */
import { useEffect, useRef, useState } from 'react';

export function ArchitectMenu({ onSettings, onLogout }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (open && wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div className="architect-menu-wrap" ref={wrapRef}>
      <button
        className="architect-menu-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <span style={{ color: '#4ade80' }}>●</span>
        <span>Architect</span>
        <span style={{ fontSize: 10, opacity: 0.6 }}>▾</span>
      </button>
      {open && (
        <div className="architect-menu-dropdown" role="menu">
          <button className="architect-menu-item" onClick={() => { setOpen(false); onSettings?.(); }}>
            Settings
          </button>
          <button className="architect-menu-item architect-menu-item-danger" onClick={() => { setOpen(false); onLogout?.(); }}>
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
