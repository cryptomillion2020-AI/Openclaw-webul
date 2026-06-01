/**
 * AiCityAssetLoader.js — Lazy asset loader for AI-City spritesheets
 * Phase 5 FE-01 — Track A
 *
 * Manages lazy-loading of per-agent PixiJS spritesheets.
 * Each agent loads independently (per-agent atlas strategy).
 * Falls back to colored rectangle placeholder if asset not yet delivered.
 *
 * PIXI is NOT statically imported here — it is dynamically imported inline
 * so the bundle stays out of non-AiCity pages. Callers (AiCityOverlay)
 * trigger the dynamic import when navigating to Page 4.
 *
 * Usage:
 *   import { loadAgent, getAgentAssetPath } from './services/AiCityAssetLoader';
 *   const sheet = await loadAgent('sevin');
 */

// ---------------------------------------------------------------------------
// Agent color palette (locked)
// ---------------------------------------------------------------------------
const AGENT_COLORS = {
  sevin:     0xFFD700,
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
// Asset path resolution — COSMOS canonical delivery path
// ---------------------------------------------------------------------------
const COSMOS_BASE = `${import.meta.env.BASE_URL}ai-city-assets/`;
const ANDROID_ASSET_BASE = `${COSMOS_BASE}androids/`;
const BUILDING_ASSET_BASE = `${COSMOS_BASE}buildings/`;

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
async function createPlaceholderSprite(agentName, color) {
  const PIXI = await import('pixi.js');

  const container = new PIXI.Container();

  const bg = new PIXI.Graphics();
  bg.beginFill(color, 0.8);
  bg.drawRoundedRect(0, 0, 48, 48, 6);
  bg.endFill();
  container.addChild(bg);

  // PIXI v8 Text with TextStyle instance (avoids v8 canvas measure issues in headless)
  try {
    const style = new PIXI.TextStyle({
      fontFamily: 'monospace',
      fontSize: 9,
      fill: '#FFFFFF',
    });
    const text = new PIXI.Text({
      text: agentName.substring(0, 4),
      style,
    });
    text.anchor.set(0.5, 0.5);
    text.x = 24;
    text.y = 24;
    container.addChild(text);
  } catch (e) {
    // Text rendering may fail in headless environments — skip label
    console.warn(`[AiCity] Label skipped for ${agentName}: ${e.message}`);
  }

  return container;
}

/**
 * Create an animated sprite from a loaded spritesheet.
 */
async function createAnimatedSpriteFromSheet(sheet, state, agentName, color) {
  const PIXI = await import('pixi.js');

  // Build texture names for the requested state
  const textures = [];
  const prefix = `${agentName}-${state}-`;

  // In PIXI v8, sheet.textures is a Map<string, Texture>
  // Use Object.keys() or spread if it's an object, or forEach if Map
  let textureEntries;
  if (sheet.textures instanceof Map) {
    textureEntries = Array.from(sheet.textures.entries());
  } else if (typeof sheet.textures === 'object') {
    textureEntries = Object.entries(sheet.textures);
  } else {
    textureEntries = [];
  }

  for (const [name, tex] of textureEntries) {
    if (name.startsWith(prefix)) {
      textures.push(tex);
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
 * @returns {Promise<{ sheet: PIXI.Spritesheet|null, createSprite: (state: string) => Promise<PIXI.Container|PIXI.AnimatedSprite>, color: number }>}
 */
export async function loadAgent(agentName) {
  const key = `agent:${agentName}`;

  if (_sheetCache.has(key)) {
    return _sheetCache.get(key);
  }

  const PIXI = await import('pixi.js');
  const color = AGENT_COLORS[agentName] || 0x666666;
  const path = getAgentAssetPath(agentName);

  try {
    // PIXI v8: Assets.load for JSON returns parsed data, not a Spritesheet
    const rawData = await PIXI.Assets.load(path);
    const framesData = rawData.frames || rawData;

    // Build a proper PIXI v8 Spritesheet
    // Assets.load for PNG returns a Texture; extract its BaseTexture for Spritesheet
    const imagePath = path.replace('.json', '.png');
    const texture = await PIXI.Assets.load(imagePath);
    const sheet = new PIXI.Spritesheet(texture, framesData);
    await sheet.parse();

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
 * @returns {Promise<{ sheet: PIXI.Spritesheet|null, createSprite: () => Promise<PIXI.Container>, color: number }>}
 */
export async function loadBuilding(category) {
  const key = `building:${category}`;

  if (_sheetCache.has(key)) {
    return _sheetCache.get(key);
  }

  const PIXI = await import('pixi.js');
  const color = BUILDING_COLORS[category] || 0x666666;
  const path = getBuildingAssetPath(category);

  try {
    const sheet = await PIXI.Assets.load(path);

    const result = {
      sheet,
      createSprite: async () => {
        const PIXI2 = await import('pixi.js');
        const textures = Array.from(sheet.textures.values());
        if (textures.length > 0) {
          const sprite = new PIXI2.Sprite(textures[0]);
          return sprite;
        }
        const gfx = new PIXI2.Graphics();
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
    const result = {
      sheet: null,
      createSprite: async () => {
        const PIXI2 = await import('pixi.js');
        const gfx = new PIXI2.Graphics();
        gfx.beginFill(color, 0.8);
        gfx.drawRect(0, 0, 64, 64);
        gfx.endFill();
        return gfx;
      },
      color,
    };
    _sheetCache.set(key, result);
    return result;
  }
}

/**
 * Preload all agent atlases (for bulk load scenario).
 */
export async function preloadAllAgents() {
  const agents = Object.keys(AGENT_COLORS);
  return Promise.allSettled(agents.map(loadAgent));
}

/**
 * Clear the in-memory sheet cache.
 */
export function clearCache() {
  _sheetCache.clear();
}

export { AGENT_COLORS, BUILDING_COLORS };
