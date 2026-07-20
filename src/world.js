import { WORLD_HALF, MAX_HEIGHT, CHUNK_SIZE, CHUNK_COUNT } from './config.js';

// key "x,y,z" -> type string
export const blocks = new Map();
const key = (x, y, z) => x + ',' + y + ',' + z;
export const getBlock = (x, y, z) => blocks.get(key(x, y, z));
export const isSolid = (x, y, z) => blocks.has(key(x, y, z));

export function setBlock(x, y, z, type) {
  if (type === null) blocks.delete(key(x, y, z));
  else blocks.set(key(x, y, z), type);
}

// which chunk (cx, cz) a block's absolute (x, z) falls in
export function chunkOf(x, z) {
  return [Math.floor((x + WORLD_HALF) / CHUNK_SIZE), Math.floor((z + WORLD_HALF) / CHUNK_SIZE)];
}

// shifts the noise so each regenerate produces a new landscape
let worldSeed = 0;

// simple deterministic pseudo-noise (no deps)
export function heightAt(x, z) {
  const s = worldSeed;
  const n =
    Math.sin((x + s) * 0.11) * 2.2 +
    Math.cos((z - s) * 0.13) * 2.2 +
    Math.sin((x + z + s) * 0.06) * 3.0 +
    Math.cos((x - z + s) * 0.09) * 1.4;
  return Math.max(2, Math.floor(6 + n));
}

function chunkOrigin(cx, cz) {
  return [-WORLD_HALF + cx * CHUNK_SIZE, -WORLD_HALF + cz * CHUNK_SIZE];
}

function generateChunk(cx, cz) {
  const [ox, oz] = chunkOrigin(cx, cz);
  const treeSpots = [];
  for (let x = ox; x < ox + CHUNK_SIZE; x++) {
    for (let z = oz; z < oz + CHUNK_SIZE; z++) {
      const h = heightAt(x, z);
      for (let y = 0; y <= h; y++) {
        let type;
        if (y === h) type = 'grass';
        else if (y >= h - 3) type = 'dirt';
        else type = 'stone';
        setBlock(x, y, z, type);
      }
      if (h < MAX_HEIGHT - 3 && Math.abs(x) > 2 && Math.abs(z) > 2) {
        const rnd = Math.abs(Math.sin((x + worldSeed) * 12.9898 + z * 78.233) * 43758.5453) % 1;
        if (rnd > 0.965) treeSpots.push([x, h + 1, z]);
      }
    }
  }
  for (const [x, y, z] of treeSpots) placeTree(x, y, z);
}

export function generateWorld() {
  for (let cx = 0; cx < CHUNK_COUNT; cx++) {
    for (let cz = 0; cz < CHUNK_COUNT; cz++) {
      generateChunk(cx, cz);
    }
  }
}

function placeTree(x, y, z) {
  const trunkH = 3 + (Math.abs(x * 7 + z * 3) % 2);
  for (let i = 0; i < trunkH; i++) setBlock(x, y + i, z, 'wood');
  const top = y + trunkH;
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
        if (isSolid(x + dx, top + dy, z + dz)) continue;
        if (dx === 0 && dz === 0 && dy <= 0) continue;
        setBlock(x + dx, top + dy, z + dz, 'leaves');
      }
    }
  }
  setBlock(x, top + 2, z, 'leaves');
}

// reseed + wipe + regrow terrain data only. Player/effects/meshes are each
// their own module's job -- see main.js's regenerateWorld() for the full reset.
export function regenerateTerrain() {
  worldSeed = Math.floor(Math.random() * 100000);
  blocks.clear();
  generateWorld();
}
