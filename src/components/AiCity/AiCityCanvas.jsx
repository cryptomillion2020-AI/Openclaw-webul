/**
 * AiCityCanvas.jsx — AI-City PixiJS Application Mount
 * Phase 5 FE-01 — Track A (dev placeholder)
 *
 * Mounts a PixiJS Application instance into a React ref container.
 * Currently renders dev-mode colored placeholders until COSMOS sprites are delivered.
 *
 * Gate: COSMOS sprites delivered → SEVIN review → Architect sign-off → Page 4 unblocked
 */

import { useEffect, useRef } from 'react';

// Placeholder colors for dev-mode (agent color palette)
const AGENT_COLORS = {
  SEVIN:    0xFFD700,
  OVERSEER: 0x1565C0,
  ELEVIN:   0x1B5E20,
  TIKA:     0x7B1FA2,
  QUANT:    0xFF6F00,
  NAVIGATOR:0x00BCD4,
  COSMOS:   0xE91E63,
  AXIS:     0xE65100,
  COMMS:    0x00897B,
  NEXUS:    0xFFFFFF,
  ROOTS:    0x558B2F,
  STAN:     0x616161,
  VAULT:    0x37474F,
};

const AGENT_NAMES = Object.keys(AGENT_COLORS);

export function AiCityCanvas({ width = 800, height = 600 }) {
  const containerRef = useRef(null);
  const appRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function initPixi() {
      // Dynamic import — PixiJS is only loaded when user navigates to Page 4
      const PIXI = await import('pixi.js');

      if (cancelled || !containerRef.current) return;

      const app = new PIXI.Application({
        width,
        height,
        backgroundColor: 0x0B1437,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      appRef.current = app;
      containerRef.current.appendChild(app.view); // PIXI v8: app.view is a canvas

      // ---- DEV PLACEHOLDER: colored rectangles + agent initials ----
      const container = new PIXI.Container();
      app.stage.addChild(container);

      // Draw isometric ground grid
      const gridGfx = new PIXI.Graphics();
      gridGfx.lineStyle(1, 0x1a237e, 0.3);
      const tileW = 64, tileH = 32;
      for (let row = 0; row < 12; row++) {
        for (let col = 0; col < 12; col++) {
          const x = (col - row) * tileW + width / 2;
          const y = (col + row) * tileH * 0.5 + 50;
          gridGfx.moveTo(x, y);
          gridGfx.lineTo(x + tileW, y + tileH * 0.5);
          gridGfx.lineTo(x, y + tileH);
          gridGfx.lineTo(x - tileW, y + tileH * 0.5);
          gridGfx.lineTo(x, y);
        }
      }
      container.addChild(gridGfx);

      // Placeholder android rectangles
      const textStyle = new PIXI.TextStyle({
        fontFamily: 'monospace',
        fontSize: 11,
        fill: '#ffffff',
        fontWeight: 'bold',
      });

      AGENT_NAMES.forEach((name, i) => {
        const col = i % 5;
        const row = Math.floor(i / 5);
        const x = 80 + col * 140;
        const y = 80 + row * 120;

        const gfx = new PIXI.Graphics();
        gfx.beginFill(AGENT_COLORS[name], 0.9);
        gfx.drawRoundedRect(0, 0, 48, 48, 6);
        gfx.endFill();
        gfx.x = x;
        gfx.y = y;
        container.addChild(gfx);

        const text = new PIXI.Text(name.substring(0, 4), textStyle);
        text.x = x + 24 - text.width / 2;
        text.y = y + 48 + 4;
        container.addChild(text);
      });

      // Animate — idle rotate
      app.ticker.add(() => {
        container.rotation += 0.001;
      });
    }

    initPixi();

    return () => {
      cancelled = true;
      if (appRef.current) {
        appRef.current.destroy(true, { children: true, texture: true });
        appRef.current = null;
      }
    };
  }, [width, height]);

  return (
    <div
      ref={containerRef}
      className="ai-city-canvas"
      style={{
        width: '100%',
        height: '100%',
        minHeight: height,
        background: '#0B1437',
        borderRadius: '8px',
        overflow: 'hidden',
        position: 'relative',
      }}
    />
  );
}
