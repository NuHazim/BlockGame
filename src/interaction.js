import { REACH } from './config.js';
import { isSolid, getBlock, setBlock } from './world.js';
import { markEditDirty } from './meshBuilder.js';
import { player } from './player.js';
import { HOTBAR } from './blocks.js';
import { getSelectedIndex, updateHotbarUI } from './hotbar.js';
import { inventory, isCreative } from './inventory.js';
import { spawnParticles, spawnDrop } from './effects.js';
import { isWeapon } from './weapons.js';
import { addWorldLight, removeWorldLight, isLightEmitter } from './lightSources.js';

export const selectionBox = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02)),
  new THREE.LineBasicMaterial({ color: 0x000000 })
);
selectionBox.visible = false;

let targetBlock = null;
let placeAt = null;
const _dir = new THREE.Vector3();

export function updateTargetBlock(camera) {
  camera.getWorldDirection(_dir);
  const ox = camera.position.x, oy = camera.position.y, oz = camera.position.z;
  const dx = _dir.x, dy = _dir.y, dz = _dir.z;

  let vx = Math.round(ox), vy = Math.round(oy), vz = Math.round(oz);

  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;

  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;

  const boundX = vx + stepX * 0.5, boundY = vy + stepY * 0.5, boundZ = vz + stepZ * 0.5;
  let tMaxX = dx !== 0 ? (boundX - ox) / dx : Infinity;
  let tMaxY = dy !== 0 ? (boundY - oy) / dy : Infinity;
  let tMaxZ = dz !== 0 ? (boundZ - oz) / dz : Infinity;

  targetBlock = null;
  placeAt = null;
  let lastEmpty = [vx, vy, vz];

  if (isSolid(vx, vy, vz)) {
    targetBlock = [vx, vy, vz];
  } else {
    while (Math.min(tMaxX, tMaxY, tMaxZ) <= REACH) {
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        vx += stepX; tMaxX += tDeltaX;
      } else if (tMaxY < tMaxZ) {
        vy += stepY; tMaxY += tDeltaY;
      } else {
        vz += stepZ; tMaxZ += tDeltaZ;
      }
      if (isSolid(vx, vy, vz)) {
        targetBlock = [vx, vy, vz];
        placeAt = lastEmpty;
        break;
      }
      lastEmpty = [vx, vy, vz];
    }
  }

  if (targetBlock) {
    selectionBox.position.set(targetBlock[0], targetBlock[1], targetBlock[2]);
    selectionBox.visible = true;
  } else {
    selectionBox.visible = false;
  }
}

export function tryDestroy() {
  if (!targetBlock) return;
  const [x, y, z] = targetBlock;
  const removedType = getBlock(x, y, z);
  markEditDirty(x, y, z, removedType);
  setBlock(x, y, z, null);
  if (isLightEmitter(removedType)) removeWorldLight(x, y, z);
  spawnParticles(x, y, z, removedType);
  if (!isCreative()) {
    spawnDrop(x, y, z, removedType);
  }
}

export function tryPlace() {
  if (!targetBlock || !placeAt) return;
  const [px, py, pz] = placeAt;
  const feet = player.pos.clone();
  const overlapsPlayer =
    Math.abs(px - Math.floor(feet.x + 0.5)) < 1 &&
    Math.abs(pz - Math.floor(feet.z + 0.5)) < 1 &&
    (py === Math.floor(feet.y - 0.5) || py === Math.floor(feet.y + 0.5) || py === Math.floor(feet.y + 1.5));
  if (overlapsPlayer) return;

  const newType = HOTBAR[getSelectedIndex()];
  if (!newType || isWeapon(newType)) return; // empty slot, or a weapon -- nothing to place

  if (!isCreative()) {
    if (inventory[newType] <= 0) return;
    inventory[newType]--;
    // that was the last one -- clear the slot so it actually disappears
    // from the hotbar instead of sitting there showing a "0" count
    if (inventory[newType] <= 0) {
      HOTBAR[getSelectedIndex()] = null;
    }
  }

  setBlock(px, py, pz, newType);
  markEditDirty(px, py, pz, newType);
  if (isLightEmitter(newType)) addWorldLight(newType, px, py, pz);
  if (!isCreative()) updateHotbarUI();
}