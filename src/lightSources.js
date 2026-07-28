import { addLightSource, removeLightSource, clearLighting } from './lighting.js';
import { markAllTypesDirty } from './meshBuilder.js';

export const LIGHT_EMITTERS = {
  torch: {
    level: 9,          // was 14 -- shorter reach, closer to a cozy campfire radius than a floodlight
    glowColor: '#ffcf6b',
    glowEdge: 'rgba(255,140,20,0.45)', // slightly softer edge
    glowSize: 0.45,     // was 0.55 -- smaller flame glow to match the toned-down range
    flicker: 0.05,
    flickerSpeed: 10
  }
};

export function isLightEmitter(type) {
  return !!LIGHT_EMITTERS[type];
}

function makeFlameSprite(def, size = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.25, def.glowColor);
  grad.addColorStop(0.6, def.glowEdge);
  grad.addColorStop(1, 'rgba(255,140,20,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(def.glowSize, def.glowSize, 1);
  return sprite;
}

const worldGlows = new Map();
let sceneRef = null;

export function initLightSources(scene) {
  sceneRef = scene;
  worldGlows.clear();
}

const key = (x, y, z) => x + ',' + y + ',' + z;

export function addWorldLight(type, x, y, z) {
  const def = LIGHT_EMITTERS[type];
  if (!def || !sceneRef) return;
  const k = key(x, y, z);
  if (worldGlows.has(k)) return;

  const sprite = makeFlameSprite(def);
  sprite.position.set(x, y + 0.35, z);
  sceneRef.add(sprite);
  worldGlows.set(k, { sprite, def, baseScale: sprite.scale.x });

  addLightSource(x, y, z, def.level);
  markAllTypesDirty();
}

export function removeWorldLight(x, y, z) {
  const k = key(x, y, z);
  const entry = worldGlows.get(k);
  if (entry) {
    sceneRef.remove(entry.sprite);
    worldGlows.delete(k);
  }
  removeLightSource(x, y, z);
  markAllTypesDirty();
}

export function updateLightFlicker(nowSec) {
  for (const entry of worldGlows.values()) {
    const { sprite, def, baseScale } = entry;
    const flick = Math.sin(nowSec * def.flickerSpeed + sprite.position.x * 3) * def.flicker;
    const s = baseScale * (1 + flick * 0.1);
    sprite.scale.set(s, s, 1);
  }
}

export function clearWorldLights() {
  for (const entry of worldGlows.values()) sceneRef.remove(entry.sprite);
  worldGlows.clear();
  clearLighting();
}