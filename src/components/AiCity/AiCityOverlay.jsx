/**
 * AiCityOverlay.jsx — PixiJS Agent Sprite Overlay for Canvas Host AI City
 * Phase 5 FE-01 — AICITY Phase 2 (Canvas Host + PixiJS Agent Overlay)
 *
 * Renders COSMOS atlas sprites on a transparent PixiJS canvas above the
 * Canvas 2D host renderer. Agent positions and states are driven from
 * AiCityPage's agentPositions/grid state.
 *
 * Architecture: ~50-line overlay integration.
 *   - Canvas Host preserved (no draw path modification)
 *   - PixiJS lazy-loaded via dynamic import()
 *   - Transparent background, pointer-events: none for click-through
 *
 * Props:
 *   agents    — Array<{ id, name, gridPos: {tx, ty}, state }>
 *   timeOfDay — 'day' | 'night'
 */

import { useEffect, useRef } from 'react';
import { loadAgent } from '../../services/AiCityAssetLoader';

// Isometric projection (mirrors AiCityPage)
const TW = 80, TH = 40, SCALE = 0.68;

function isoToScreen(tx, ty, cw, ch) {
  return {
    x: (tx - ty) * (TW / 2) + cw / 2,
    y: ((tx + ty) * (TH / 2)) * SCALE + ch * 0.36 + 15,
  };
}

export function AiCityOverlay({ agents = [], width = 800, height = 600 }) {
  const containerRef = useRef(null);
  const pixiRef = useRef(null); // { app, overlay, PIXI, spriteMap }

  // One-shot: init PixiJS app
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const PIXI = await import('pixi.js');
      if (cancelled || !containerRef.current) return;

      const app = new PIXI.Application();
      await app.init({
        width, height,
        backgroundAlpha: 0, // transparent
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      // Guard: React StrictMode double-mount may cancel during async init
      if (cancelled || !containerRef.current) {
        await app.destroy(true);
        return;
      }

      const overlay = new PIXI.Container();
      app.stage.addChild(overlay);

      containerRef.current.appendChild(app.canvas);
      pixiRef.current = { app, overlay, PIXI, spriteMap: new Map() };
    })();

    return () => {
      cancelled = true;
      if (pixiRef.current) {
        pixiRef.current.app.destroy(true, { children: true, texture: true });
        pixiRef.current = null;
      }
    };
  }, [width, height]);

  // Update sprites when agents change
  useEffect(() => {
    const ctx = pixiRef.current;
    if (!ctx) return;
    const { overlay, PIXI, spriteMap } = ctx;
    const activeIds = new Set(agents.map(a => a.id));

    // Remove stale sprites
    for (const [id, entry] of spriteMap) {
      if (!activeIds.has(id)) {
        overlay.removeChild(entry.sprite);
        spriteMap.delete(id);
      }
    }

    agents.forEach(a => {
      const existing = spriteMap.get(a.id);
      const pos = a.gridPos || { tx: 0, ty: 0 };
      const { x: sx, y: sy } = isoToScreen(pos.tx, pos.ty, width, height);

      if (!existing) {
        // Load atlas and create sprite
        loadAgent(a.name).then(result => {
          const entry = spriteMap.get(a.id);
          if (!entry) return; // agent was removed during load

          const sprite = result.createSprite(a.state || 'idle_day');
          sprite.x = sx;
          sprite.y = sy;

          // §3 condition 2: #FFD700 gold for SEVIN
          if (a.name === 'sevin') sprite.tint = 0xFFD700;

          overlay.removeChild(entry.sprite); // remove placeholder
          overlay.addChild(sprite);
          spriteMap.set(a.id, { sprite, state: a.state });
        });

        // Immediate placeholder
        const gfx = new PIXI.Graphics();
        gfx.beginFill(0xffffff, 0.15);
        gfx.drawCircle(0, 0, 8);
        gfx.endFill();
        gfx.x = sx; gfx.y = sy;
        overlay.addChild(gfx);
        spriteMap.set(a.id, { sprite: gfx, state: null });
      } else {
        // Update position
        existing.sprite.x = sx;
        existing.sprite.y = sy;

        // State transition — reload sprite with new state
        if (existing.state !== a.state) {
          existing.state = a.state;
          loadAgent(a.name).then(result => {
            const entry = spriteMap.get(a.id);
            if (!entry) return;
            const newSprite = result.createSprite(a.state);
            newSprite.x = entry.sprite.x;
            newSprite.y = entry.sprite.y;
            if (a.name === 'sevin') newSprite.tint = 0xFFD700;

            overlay.removeChild(entry.sprite);
            overlay.addChild(newSprite);
            spriteMap.set(a.id, { sprite: newSprite, state: a.state });
          });
        }
      }
    });
  }, [agents, width, height]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: 0, left: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none',
        zIndex: 2,
      }}
    />
  );
}
