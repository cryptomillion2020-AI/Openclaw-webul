/**
 * AiCityAssetLoader.js — Lazy asset loader for AI-City spritesheets
 * Phase 5 FE-01 — Track A
 *
 * Manages lazy-loading of per-agent PixiJS spritesheets.
 * Each agent loads independently (per-agent atlas strategy).
 * Falls back to colored rectangle placeholder if asset not yet delivered.
 *
 * Usage:
 *   import { loadAgent, getAgentAssetPath } from './services/AiCityAssetLoader';
 *   const sheet = await loadAgent('sevin');
 */

import * as PIXI from 'pixi.js';

// ---------------------------------------------------------------------------
// Agent color palette (locked)
// ---------------------------------------------------------------------------
const AGENT_COLORS = {
  sevin:     0xF57F17,
  overseer:  0x1565C0,
  elevin:    0x1B5E20,
  tika:      0x7B1FA2,
  quant:     0xFF6F00,
  navigator: 0x00BCD4,
  cosmos:    0xE91E63,
  axis:      0xE65100,
  comms:     0x00897B,
  nexus:     0xFFFFFF,
  roots:     0x558B2F,
  stan:      0x616161,
  vault:     0x37474F,
};

const BUILDING_COLORS = {
  'server-tower':    0x1565C0,
  'lab':             0x7B1FA2,
  'market-floor':    0xFF6F00,
  'bunker':          0x37474F,
  'broadcast-tower': 0x00BCD4,
};

// ---------------------------------------------------------------------------
// Asset path resolution
// ---------------------------------------------------------------------------

const ANDROID_ASSET_BASE = `${import.meta.env.BASE_URL}ai-city/androids/`;
const BUILDING_ASSET_BASE = `${import.meta.env.BASE_URL}ai-city/buildings/`;

export function getAgentAssetPath(agentName) {
  return `${ANDROID_ASSET_BASE}${agentName}.json`;
}

export function getBuildingAssetPath(category) {
  return `${BUILDING_ASSET_BASE}${category}.json`;
}

// ---------------------------------------------------------------------------
// Loaded sheet cache
// ---------------------------------------------------------------------------
const _sheetCache = new Map();

// ---------------------------------------------------------------------------
// Sprite creation helpers
// ---------------------------------------------------------------------------

/**
 * Create a placeholder colored rectangle for when atlas is not yet loaded.
 * Returns a PIXI.Graphics (rect + text label).
 */
function createPlaceholderSprite(agentName, color) {
  const container = new PIXI.Container();

  const bg = new PIXI.Graphics();
  bg.beginFill(color, 0.8);
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
  text.x = 24 - text.width / 2;
  text.y = 24 - text.height / 2;
  container.addChild(text);

  return container;
}

/**
 * Create an animated sprite from a loaded spritesheet.
 */
function createAnimatedSpriteFromSheet(sheet, state, agentName, color) {
  // Build texture names for the requested state
  const textures = [];
  // Detect available frames by enumerating texture names
  const prefix = `${agentName}-${state}-`;
  let frameCount = 0;

  for (const name of sheet.textures.keys()) {
    if (name.startsWith(prefix)) {
      textures.push(sheet.textures.get(name));
      frameCount++;
    }
  }

  if (textures.length === 0) {
    console.warn(`[AiCity] No frames found for ${agentName}-${state} — falling back to placeholder`);
    return createPlaceholderSprite(agentName, color);
  }

  const sprite = new PIXI.AnimatedSprite(textures);
  sprite.animationSpeed = 0.1;
  sprite.play();
  return sprite;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load a single agent's spritesheet and return a function to create animated sprites.
 *
 * @param {string} agentName — lowercase agent name (e.g. 'sevin', 'overseer')
 * @returns {Promise<{ sheet: PIXI.Spritesheet, createSprite: (state: string) => PIXI.Container|PIXI.AnimatedSprite }>}
 */
export async function loadAgent(agentName) {
  const key = `agent:${agentName}`;

  if (_sheetCache.has(key)) {
    return _sheetCache.get(key);
  }

  const color = AGENT_COLORS[agentName] || 0x666666;
  const path = getAgentAssetPath(agentName);

  try {
    const sheet = await PIXI.Assets.load(path);

    const result = {
      sheet,
      createSprite: (state) => createAnimatedSpriteFromSheet(sheet, state, agentName, color),
      color,
    };

    _sheetCache.set(key, result);
    return result;
  } catch (err) {
    console.warn(`[AiCity] Failed to load agent ${agentName}: ${err.message}. Using placeholder.`);
    const result = {
      sheet: null,
      createSprite: () => createPlaceholderSprite(agentName, color),
      color,
    };
    _sheetCache.set(key, result);
    return result;
  }
}

/**
 * Load a building spritesheet.
 *
 * @param {string} category — building type (e.g. 'server-tower', 'lab')
 * @returns {Promise<{ sheet: PIXI.Spritesheet|null, createSprite: () => PIXI.Container, color: number }>}
 */
export async function loadBuilding(category) {
  const key = `building:${category}`;

  if (_sheetCache.has(key)) {
    return _sheetCache.get(key);
  }

  const color = BUILDING_COLORS[category] || 0x666666;
  const path = getBuildingAssetPath(category);

  try {
    const sheet = await PIXI.Assets.load(path);

    const result = {
      sheet,
      createSprite: () => {
        const textures = Array.from(sheet.textures.values());
        if (textures.length > 0) {
          const sprite = new PIXI.Sprite(textures[0]);
          return sprite;
        }
        const gfx = new PIXI.Graphics();
        gfx.beginFill(color, 0.8);
        gfx.drawRect(0, 0, 64, 64);
        gfx.endFill();
        return gfx;
      },
      color,
    };

    _sheetCache.set(key, result);
    return result;
  } catch (err) {
    console.warn(`[AiCity] Failed to load building ${category}: ${err.message}. Using placeholder.`);
    const gfx = new PIXI.Graphics();
    gfx.beginFill(color, 0.8);
    gfx.drawRect(0, 0, 64, 64);
    gfx.endFill();
    const result = {
      sheet: null,
      createSprite: () => gfx,
      color,
    };
    _sheetCache.set(key, result);
    return result;
  }
}

/**
 * Preload all agent atlases (for bulk load scenario). Not called by default —
 * lazy-load per agent is preferred. Use for mega-atlas or initial page load.
 */
export async function preloadAllAgents() {
  const agents = Object.keys(AGENT_COLORS);
  return Promise.allSettled(agents.map(loadAgent));
}

/**
 * Clear the in-memory sheet cache (for hot-reload or cleanup).
 */
export function clearCache() {
  _sheetCache.clear();
}

export { AGENT_COLORS, BUILDING_COLORS };
