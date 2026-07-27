// ---------- Light-emitting items ----------
// Central registry for any block/item that emits light, so adding a new
// glowing block later (lantern, glowstone, campfire...) is just one entry
// here -- interaction.js and heldItem.js consult this registry generically
// instead of special-casing block names.
export const LIGHT_EMITTERS = {
  torch: { color: 0xffaa33, intensity: 1.4, distance: 9, flicker: 0.15, flickerSpeed: 14 }
  // example for later:
  // lantern: { color: 0xfff0c8, intensity: 1.8, distance: 11, flicker: 0.05, flickerSpeed: 6 }
};

export function isLightEmitter(type) {
  return !!LIGHT_EMITTERS[type];
}

// ---------- Placed-in-world lights ----------
// One real PointLight per placed light-emitting block, since a block in the
// `blocks` Map alone doesn't emit light in three.js. Keyed by position so
// interaction.js can add/remove one exactly when a block is placed/mined.
const worldLights = new Map(); // "x,y,z" -> PointLight
let sceneRef = null;

export function initLightSources(scene) {
  sceneRef = scene;
  worldLights.clear();
}

const key = (x, y, z) => x + ',' + y + ',' + z;

export function addWorldLight(type, x, y, z) {
  const def = LIGHT_EMITTERS[type];
  if (!def) return;
  const k = key(x, y, z);
  if (worldLights.has(k)) return;
  const light = new THREE.PointLight(def.color, def.intensity, def.distance, 2);
  light.position.set(x, y + 0.3, z);
  light.userData.def = def;
  sceneRef.add(light);
  worldLights.set(k, light);
}

export function removeWorldLight(x, y, z) {
  const k = key(x, y, z);
  const light = worldLights.get(k);
  if (!light) return;
  sceneRef.remove(light);
  worldLights.delete(k);
}

// subtle per-light flicker so lit blocks feel alive rather than static --
// call once per frame from the main loop
export function updateLightFlicker(nowSec) {
  for (const light of worldLights.values()) {
    const def = light.userData.def;
    light.intensity = def.intensity + Math.sin(nowSec * def.flickerSpeed + light.position.x * 3) * def.flicker;
  }
}

export function clearWorldLights() {
  for (const light of worldLights.values()) sceneRef.remove(light);
  worldLights.clear();
}

// ---------- Held light source ----------
// One light attached to whatever's in the player's hand right now (e.g.
// holding a torch lights the area ahead of you). heldItem.js owns the
// mesh/positioning; this just builds the light object itself when asked.
export function makeHeldLight(type) {
  const def = LIGHT_EMITTERS[type];
  if (!def) return null;
  const light = new THREE.PointLight(def.color, def.intensity, def.distance, 2);
  return light;
}