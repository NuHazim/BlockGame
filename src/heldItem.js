import { HOTBAR } from './blocks.js';
import { materials } from './atlas.js';
import { WEAPON_TYPES, isWeapon } from './weapons.js';
import { getSelectedIndex } from './hotbar.js';
import { makeHeldLight, isLightEmitter } from './lightSources.js';

let handGroup = null;
let currentType = null;
let currentMesh = null;
let heldLight = null;
let swingTimer = 0;
let bobTimer = 0;

const REST_POS = new THREE.Vector3(0.55, -0.45, -0.85);
const REST_ROT = new THREE.Euler(0.2, 0.5, -0.1);

export function initHeldItem(camera) {
  handGroup = new THREE.Group();
  handGroup.position.copy(REST_POS);
  handGroup.rotation.copy(REST_ROT);
  camera.add(handGroup);
}

function buildBlockMesh(type) {
  const mat = Array.isArray(materials[type]) ? materials[type][0] : materials[type];
  return new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), mat);
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
  if (heldLight) { handGroup.remove(heldLight); heldLight = null; }
  currentType = type;
  if (!type) return;

  currentMesh = isWeapon(type) ? buildWeaponMesh(type) : buildBlockMesh(type);
  handGroup.add(currentMesh);

  // holding any light-emitting item lights up the area in front of the
  // player -- driven entirely by the lightSources.js registry, so a new
  // glowing item needs no changes here
  if (isLightEmitter(type)) {
    heldLight = makeHeldLight(type);
    heldLight.position.set(0, 0.2, 0);
    handGroup.add(heldLight);
  }
}

export function triggerSwing() { swingTimer = 0.22; }

export function updateHeldItem(dt, isMoving) {
  if (!handGroup) return;
  const type = HOTBAR[getSelectedIndex()];
  if (type !== currentType) rebuildMesh(type);
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