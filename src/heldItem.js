import { HOTBAR } from './blocks.js';
import { materials } from './atlas.js';
import { WEAPON_TYPES, isWeapon } from './weapons.js';
import { getSelectedIndex } from './hotbar.js';
import { isLightEmitter, LIGHT_EMITTERS } from './lightSources.js';
import { addLightSource, removeLightSource } from './lighting.js';
import { markAllTypesDirty } from './meshBuilder.js';

let handGroup = null;
let currentType = null;
let currentMesh = null;
let flameSprite = null;
let swingTimer = 0;
let bobTimer = 0;
let heldSourceKey = null; // "x,y,z" cell currently registered as a light source for a held torch

// Repositioning the held-item's light source triggers a full lighting BFS
// recompute (lighting.js) + a full remesh of every block type in render
// distance (meshBuilder.js's markAllTypesDirty). Doing that every single
// time the player crosses a block boundary while holding a torch is what
// caused the walking-with-a-torch stutter. Throttling to a few times a
// second is imperceptible positionally but eliminates the per-frame-ish
// remesh storm. Still updates immediately when the held item itself changes,
// so switching to/from a torch reacts instantly.
let heldLightUpdateTimer = 0;
const HELD_LIGHT_UPDATE_INTERVAL = 0.2; // seconds between held-light repositions

const REST_POS = new THREE.Vector3(0.55, -0.45, -0.85);
const REST_ROT = new THREE.Euler(0.2, 0.5, -0.1);

function makeHeldBlockGeometry() {
  const geo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
  const FACE_BRIGHTNESS = [0.95, 0.85, 1.0, 0.75, 0.9, 0.85];
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let f = 0; f < 6; f++) {
    const b = FACE_BRIGHTNESS[f];
    for (let v = 0; v < 4; v++) {
      const i = (f * 4 + v) * 3;
      colors[i] = b; colors[i + 1] = b; colors[i + 2] = b;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}
const heldBlockGeometry = makeHeldBlockGeometry();

function makeHeldFlameSprite(def) {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.25, def.glowColor);
  grad.addColorStop(0.6, def.glowEdge);
  grad.addColorStop(1, 'rgba(255,140,20,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(def.glowSize * 0.7, def.glowSize * 0.7, 1);
  return sprite;
}

export function initHeldItem(camera) {
  handGroup = new THREE.Group();
  handGroup.position.copy(REST_POS);
  handGroup.rotation.copy(REST_ROT);
  camera.add(handGroup);
}

function buildBlockMesh(type) {
  const mat = Array.isArray(materials[type]) ? materials[type][0] : materials[type];
  return new THREE.Mesh(heldBlockGeometry, mat);
}

function buildWeaponMesh(type) {
  const w = WEAPON_TYPES[type];
  const group = new THREE.Group();
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.55, 0.05),
    new THREE.MeshLambertMaterial({ color: w.blade })
  );
  blade.position.y = 0.35;
  const handle = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.22, 0.1),
    new THREE.MeshLambertMaterial({ color: w.color })
  );
  handle.position.y = -0.05;
  group.add(blade, handle);
  return group;
}

function rebuildMesh(type) {
  if (currentMesh) { handGroup.remove(currentMesh); currentMesh = null; }
  if (flameSprite) { handGroup.remove(flameSprite); flameSprite = null; }
  currentType = type;
  if (!type) return;

  currentMesh = isWeapon(type) ? buildWeaponMesh(type) : buildBlockMesh(type);
  handGroup.add(currentMesh);

  if (isLightEmitter(type)) {
    flameSprite = makeHeldFlameSprite(LIGHT_EMITTERS[type]);
    flameSprite.position.set(0, 0.3, 0.1);
    handGroup.add(flameSprite);
  }
}

// Registers/moves a real light source (lighting.js) at the player's current
// block cell while a light-emitting item is held, so nearby blocks actually
// brighten -- like holding a torch in Minecraft. Only re-registers when the
// player has moved to a new integer cell AND the throttle timer (see
// updateHeldItem) allows it, keeping this cheap.
function updateHeldLightTracking(type, playerPos) {
  if (!isLightEmitter(type)) {
    if (heldSourceKey) {
      const [x, y, z] = heldSourceKey.split(',').map(Number);
      removeLightSource(x, y, z);
      markAllTypesDirty();
      heldSourceKey = null;
    }
    return;
  }

  const x = Math.round(playerPos.x), y = Math.round(playerPos.y), z = Math.round(playerPos.z);
  const k = x + ',' + y + ',' + z;
  if (k === heldSourceKey) return;

  if (heldSourceKey) {
    const [ox, oy, oz] = heldSourceKey.split(',').map(Number);
    removeLightSource(ox, oy, oz);
  }
  addLightSource(x, y, z, LIGHT_EMITTERS[type].level);
  markAllTypesDirty();
  heldSourceKey = k;
}

// call on world regenerate so a stale registration doesn't linger against
// the freshly-cleared lighting state
export function resetHeldLightTracking() {
  if (heldSourceKey) {
    const [x, y, z] = heldSourceKey.split(',').map(Number);
    removeLightSource(x, y, z);
    heldSourceKey = null;
  }
  heldLightUpdateTimer = 0;
}

export function triggerSwing() { swingTimer = 0.22; }

export function updateHeldItem(dt, isMoving, playerPos) {
  if (!handGroup) return;
  const type = HOTBAR[getSelectedIndex()];
  const itemChanged = type !== currentType;
  if (itemChanged) rebuildMesh(type);

  // Throttled: see comment above heldLightUpdateTimer's declaration.
  // Still fires immediately on an item swap so the glow doesn't lag behind
  // equipping/unequipping a torch.
  heldLightUpdateTimer -= dt;
  if (itemChanged || heldLightUpdateTimer <= 0) {
    heldLightUpdateTimer = HELD_LIGHT_UPDATE_INTERVAL;
    updateHeldLightTracking(type, playerPos);
  }
  if (!currentMesh) return;

  bobTimer += dt * (isMoving ? 10 : 2.2);
  const bobX = Math.sin(bobTimer) * (isMoving ? 0.02 : 0.006);
  const bobY = Math.abs(Math.cos(bobTimer)) * (isMoving ? 0.025 : 0.008);

  let swingOffsetZ = 0, swingRotX = 0;
  if (swingTimer > 0) {
    swingTimer -= dt;
    const t = 1 - Math.max(0, swingTimer) / 0.22;
    const s = Math.sin(t * Math.PI);
    swingOffsetZ = -s * 0.25;
    swingRotX = -s * 0.9;
  }

  currentMesh.position.set(bobX, -bobY, swingOffsetZ);
  currentMesh.rotation.x = swingRotX;
}