/**
 * AndroidSprite.jsx — Per-agent animated sprite controller (data-driven)
 * Phase 5 FE-01 — Track A
 *
 * Describes an android's visual representation in the AI-City scene.
 * Does NOT render DOM — parent AiCityScene creates/manages PIXI.AnimatedSprite
 * instances using these props as specification.
 *
 * Props:
 *   agentName — lowercase identifier (e.g. 'sevin')
 *   state     — 'active' | 'pending' | 'idle_day' | 'idle_night'
 *   x, y      — isometric grid position
 *   color     — hex fallback color
 *
 * Loading flow:
 *   1. Agent appears → AiCityScene calls loadAgent(agentName)
 *   2. If atlas cached → PIXI.AnimatedSprite created with correct state
 *   3. If atlas not loaded → fallback to colored rectangle placeholder
 *   4. State changes → sprite animation updated via sheet.textures
 *   5. Atlas arrives mid-session → placeholder swapped for animated sprite
 */

export function AndroidSprite({ agentName, state = 'idle_day', x = 0, y = 0, color = '#666' }) {
  // Data contract only — PIXI rendering managed by AiCityScene.
  // This pattern keeps React in data-flow control and PixiJS in render control.
  return null;
}
