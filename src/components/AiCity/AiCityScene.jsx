/**
 * AiCityScene.jsx — AI-City PixiJS scene graph orchestrator
 * Phase 5 FE-01 — Track A (streaming ingest pipeline)
 *
 * Creates and manages a PIXI.Application. Reads agent state from useCityData
 * and renders each agent as either:
 *   - PIXI.AnimatedSprite (when COSMOS atlas is loaded via AiCityAssetLoader)
 *   - Colored rectangle placeholder (fallback while atlas is streaming in)
 *
 * Supports streaming ingest: as each COSMOS atlas arrives mid-session,
 * the corresponding placeholder is swapped for the animated sprite.
 *
 * Props:
 *   width, height — canvas dimensions (default 800×600)
 */

import { useEffect, useRef, useCallback } from 'react';
import * as PIXI from 'pixi.js';
import { useCityData } from '../../hooks/useCityData';
import { loadAgent, loadBuilding, AGENT_COLORS, BUILDING_COLORS } from '../../services/AiCityAssetLoader';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const TILE_W = 64;
const TILE_H = 32;
const GRID_ROWS = 12;
const GRID_COLS = 12;

// ---------------------------------------------------------------------------
// Helper: create placeholder rectangle for unloaded agent
// ---------------------------------------------------------------------------
function createAgentPlaceholder(agentName, color) {
  const container = new PIXI.Container();

  const bg = new PIXI.Graphics();
  bg.beginFill(color, 0.85);
  bg.drawRoundedRect(0, 0, 48, 48, 6);
  bg.endFill();
  container.addChild(bg);

  const text = new PIXI.Text({
    text: agentName.substring(0, 4).toUpperCase(),
    style: {
      fontFamily: 'monospace',
      fontSize: 10,
      fill: 0xFFFFFF,
      fontWeight: 'bold',
    },
  });
  text.anchor.set(0.5, 0.5);
  text.x = 24;
  text.y = 24;
  container.addChild(text);

  return container;
}

// ---------------------------------------------------------------------------
// Helper: create placeholder building
// ---------------------------------------------------------------------------
function createBuildingPlaceholder(category, color) {
  const gfx = new PIXI.Graphics();
  gfx.beginFill(color, 0.7);
  gfx.drawRect(-24, -24, 48, 48);
  gfx.endFill();

  const text = new PIXI.Text({
    text: category.split('-').map(w => w[0]).join('').toUpperCase(),
    style: {
      fontFamily: 'monospace',
      fontSize: 9,
      fill: 0xFFFFFF,
    },
  });
  text.anchor.set(0.5, 0.5);
  text.x = 0;
  text.y = 0;
  gfx.addChild(text);

  return gfx;
}

// ---------------------------------------------------------------------------
// Helper: draw isometric ground grid
// ---------------------------------------------------------------------------
function drawIsometricGrid(stage, centerX, centerY) {
  const gfx = new PIXI.Graphics();
  gfx.lineStyle(1, 0x1a237e, 0.2);

  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const x = (col - row) * TILE_W + centerX;
      const y = (col + row) * TILE_H * 0.5 + 40;
      gfx.moveTo(x, y);
      gfx.lineTo(x + TILE_W, y + TILE_H * 0.5);
      gfx.lineTo(x, y + TILE_H);
      gfx.lineTo(x - TILE_W, y + TILE_H * 0.5);
      gfx.lineTo(x, y);
    }
  }

  stage.addChild(gfx);
  return gfx;
}

// ---------------------------------------------------------------------------
// Main scene component
// ---------------------------------------------------------------------------
export function AiCityScene({ width = 800, height = 600 }) {
  const canvasRef = useRef(null);
  const appRef = useRef(null);
  const sceneRef = useRef(null); // Main PIXI.Container
  const agentsRef = useRef(new Map()); // agentName → { container, sprite, currentState }
  const buildingsRef = useRef(new Map()); // category → { container, sprite }
  const dayNightFilterRef = useRef(null);

  const { agents, buildings, timeOfDay } = useCityData();

  // -------------------------------------------------------------------------
  // Init PIXI Application
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!canvasRef.current || appRef.current) return;

    const app = new PIXI.Application({
      width,
      height,
      backgroundColor: 0x0b1437,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    appRef.current = app;
    canvasRef.current.appendChild(app.view);

    // Scene container (for day/night filter)
    const scene = new PIXI.Container();
    app.stage.addChild(scene);
    sceneRef.current = scene;

    // Isometric grid
    drawIsometricGrid(scene, width / 2, height / 2);

    // Day/night color matrix filter
    const filter = new PIXI.ColorMatrixFilter();
    scene.filters = [filter];
    dayNightFilterRef.current = filter;

    // Animate slow rotation
    app.ticker.add(() => {
      scene.rotation += 0.0005;
    });

    return () => {
      app.destroy(true, { children: true, texture: true });
      appRef.current = null;
      sceneRef.current = null;
    };
  }, [width, height]);

  // -------------------------------------------------------------------------
  // Update buildings
  // -------------------------------------------------------------------------
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    buildings.forEach((bld) => {
      if (buildingsRef.current.has(bld.category)) return;

      const color = BUILDING_COLORS[bld.category] || 0x666666;
      const placeholder = createBuildingPlaceholder(bld.category, color);
      placeholder.x = bld.x;
      placeholder.y = bld.y;
      scene.addChild(placeholder);

      buildingsRef.current.set(bld.category, { container: placeholder, loaded: false });

      // Async load the real building sprite
      loadBuilding(bld.category).then((loaderResult) => {
        const entry = buildingsRef.current.get(bld.category);
        if (!entry || entry.loaded) return;

        // Remove placeholder
        scene.removeChild(placeholder);

        // Create real sprite
        const sprite = loaderResult.createSprite();
        sprite.x = bld.x;
        sprite.y = bld.y;
        scene.addChild(sprite);

        buildingsRef.current.set(bld.category, { container: sprite, loaded: true });
        loaderResult.sheet = loaderResult.sheet; // keep ref
      });
    });
  }, [buildings]);

  // -------------------------------------------------------------------------
  // Update agents
  // -------------------------------------------------------------------------
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    agents.forEach((agent) => {
      const existing = agentsRef.current.get(agent.name);

      if (!existing) {
        // New agent — create placeholder
        const color = parseInt(agent.color.replace('#', ''), 16);
        const placeholder = createAgentPlaceholder(agent.name, color);
        placeholder.x = agent.position.x;
        placeholder.y = agent.position.y;
        scene.addChild(placeholder);

        agentsRef.current.set(agent.name, {
          container: placeholder,
          animatedSprite: null,
          currentState: agent.currentState,
          loaded: false,
        });

        // Async load the real atlas
        loadAgent(agent.name).then((loaderResult) => {
          const entry = agentsRef.current.get(agent.name);
          if (!entry) return;

          // Create the animated sprite
          const sprite = loaderResult.createSprite(agent.currentState);
          sprite.x = agent.position.x;
          sprite.y = agent.position.y;

          // Swap placeholder for animated sprite
          scene.removeChild(entry.container);
          scene.addChild(sprite);

          agentsRef.current.set(agent.name, {
            container: sprite,
            animatedSprite: sprite instanceof PIXI.AnimatedSprite ? sprite : null,
            currentState: agent.currentState,
            loaded: true,
          });
        });
      } else {
        // Agent already exists — update position and state
        existing.container.x = agent.position.x;
        existing.container.y = agent.position.y;

        // Update animation state if changed
        if (existing.animatedSprite && existing.currentState !== agent.currentState) {
          existing.currentState = agent.currentState;

          // Try to swap animation textures
          const prefix = `${agent.name}-${agent.currentState}-`;
          const sheetTextures = existing.animatedSprite.textures;
          // We need to get the textures for the new state from the loaded sheet
          // This requires access to the full spritesheet — load it again
          loadAgent(agent.name).then((loaderResult) => {
            const entry = agentsRef.current.get(agent.name);
            if (!entry || !entry.animatedSprite) return;

            const newSprite = loaderResult.createSprite(agent.currentState);
            if (newSprite instanceof PIXI.AnimatedSprite) {
              newSprite.x = entry.animatedSprite.x;
              newSprite.y = entry.animatedSprite.y;
              newSprite.animationSpeed = 0.1;

              // Swap in scene
              scene.removeChild(entry.container);
              scene.addChild(newSprite);

              entry.container = newSprite;
              entry.animatedSprite = newSprite;
            }
          });
        }
      }
    });
  }, [agents, sceneRef.current]);

  // -------------------------------------------------------------------------
  // Day/night filter
  // -------------------------------------------------------------------------
  useEffect(() => {
    const filter = dayNightFilterRef.current;
    if (!filter) return;

    if (timeOfDay === 'night') {
      // Desaturate + darken + blue tint
      filter.reset();
      // ColorMatrix: multiply matrix for night effect
      filter.matrix = [
        0.3, 0.3, 0.3, 0, 0,
        0.2, 0.2, 0.3, 0, 0,
        0.3, 0.3, 0.5, 0, 0,
        0,   0,   0,   1, 0,
      ];
    } else {
      // Day — identity matrix
      filter.reset();
    }
  }, [timeOfDay]);

  // -------------------------------------------------------------------------
  // Render: PIXI canvas mount point
  // -------------------------------------------------------------------------
  return (
    <div
      ref={canvasRef}
      style={{
        width: '100%',
        height: '100%',
        minHeight: height,
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '8px',
      }}
    />
  );
}
