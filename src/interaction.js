import { REACH } from './config.js';
import { isSolid, getBlock, setBlock } from './world.js';
import { markEditDirty } from './meshBuilder.js';
import { player } from './player.js';
import { HOTBAR } from './blocks.js';
import { getSelectedIndex, updateHotbarUI } from './hotbar.js';
import { inventory, isCreative } from './inventory.js';
import { spawnParticles, spawnDrop } from './effects.js';

export const selectionBox = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02)),
  new THREE.LineBasicMaterial({ color: 0x000000 })
);
selectionBox.visible = false;

let targetBlock = null; // [x,y,z] of block being looked at
let placeAt = null;     // [x,y,z] where a new block would go
const _dir = new THREE.Vector3();

// Amanatides-Woo DDA voxel traversal -- steps exactly one voxel boundary at
// a time along the look ray, so it can't tunnel through thin geometry the
// way a fixed-step march can.
export function updateTargetBlock(camera) {
  camera.getWorldDirection(_dir);
  const ox = camera.position.x, oy = camera.position.y, oz = camera.position.z;
  const dx = _dir.x, dy = _dir.y, dz = _dir.z;

  // current voxel (blocks are centred on integers -> round to nearest)
  let vx = Math.round(ox), vy = Math.round(oy), vz = Math.round(oz);

  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;

  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;

  // voxel vx spans [vx-0.5, vx+0.5]; next boundary in the step direction
  // is at vx + step*0.5.
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
  // mark type + neighbours BEFORE deleting, so we can still read what's
  // around it; the delete then exposes those neighbour faces.
  markEditDirty(x, y, z, removedType);
  setBlock(x, y, z, null);
  spawnParticles(x, y, z, removedType); // cosmetic puff, both modes
  if (!isCreative()) {
    spawnDrop(x, y, z, removedType); // survival: collectible item, not instant
  }
}

export function tryPlace() {
  if (!targetBlock || !placeAt) return;
  const [px, py, pz] = placeAt;
  // don't place inside the player
  const feet = player.pos.clone();
  const overlapsPlayer =
    Math.abs(px - Math.floor(feet.x + 0.5)) < 1 &&
    Math.abs(pz - Math.floor(feet.z + 0.5)) < 1 &&
    (py === Math.floor(feet.y - 0.5) || py === Math.floor(feet.y + 0.5) || py === Math.floor(feet.y + 1.5));
  if (overlapsPlayer) return;

  const newType = HOTBAR[getSelectedIndex()];
  if (!newType) return; // empty slot -- nothing to place, grab a block from the picker first
  if (!isCreative()) {
    if (inventory[newType] <= 0) return; // out of stock
    inventory[newType]--;
  }
  setBlock(px, py, pz, newType);
  markEditDirty(px, py, pz, newType);
  if (!isCreative()) updateHotbarUI();
}