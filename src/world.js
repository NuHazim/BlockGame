import { MAX_HEIGHT, CHUNK_SIZE, WORLD_BORDER_CHUNKS } from './config.js';

// key "x,y,z" -> type string
export const blocks = new Map();
// chunk key "cx,cz" -> Map(blockKey -> type) -- lets meshBuilder scan only
// nearby chunks instead of the entire world every rebuild
const chunkIndex = new Map();

const key = (x, y, z) => x + ',' + y + ',' + z;
export const getBlock = (x, y, z) => blocks.get(key(x, y, z));
export const isSolid = (x, y, z) => blocks.has(key(x, y, z));

// which chunk (cx, cz) a block's absolute (x, z) falls in
export function chunkOf(x, z) {
  return [Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)];
}

function chunkKeyOf(x, z) {
  const [cx, cz] = chunkOf(x, z);
  return cx + ',' + cz;
}

export function setBlock(x, y, z, type) {
  const k = key(x, y, z);
  const ck = chunkKeyOf(x, z);
  if (type === null) {
    blocks.delete(k);
    const cm = chunkIndex.get(ck);
    if (cm) cm.delete(k);
  } else {
    blocks.set(k, type);
    let cm = chunkIndex.get(ck);
    if (!cm) { cm = new Map(); chunkIndex.set(ck, cm); }
    cm.set(k, type);
  }
}

// returns the Map(blockKey -> type) for one chunk, or undefined if empty/ungenerated
export function getChunkBlocks(cx, cz) {
  return chunkIndex.get(cx + ',' + cz);
}

// shifts the noise so each regenerate (and each fresh page load) produces a
// new landscape instead of the same one every time
let worldSeed = Math.floor(Math.random() * 100000);

// simple deterministic pseudo-noise (no deps) -- describes the ORIGINAL
// generated terrain shape only. Do not use this for anything that needs to
// reflect player edits (mining/building) -- use surfaceHeightAt for that.
export function heightAt(x, z) {
  const s = worldSeed;
  const n =
    Math.sin((x + s) * 0.11) * 2.2 +
    Math.cos((z - s) * 0.13) * 2.2 +
    Math.sin((x + z + s) * 0.06) * 3.0 +
    Math.cos((x - z + s) * 0.09) * 1.4;
  return Math.max(2, Math.floor(6 + n));
}

// actual top-of-world height at (x, z), reflecting any placed/mined blocks
// -- used by mobs so they walk on the real current terrain (including
// player edits) instead of the original generated shape. Returns the Y
// position a foot standing on the surface should sit at (top solid + 1).
export function surfaceHeightAt(x, z) {
  const ix = Math.round(x), iz = Math.round(z);
  for (let y = MAX_HEIGHT; y >= 0; y--) {
    if (isSolid(ix, y, iz)) return y + 1;
  }
  // chunk not generated/loaded at this column yet -- fall back to the
  // predicted terrain height so mobs don't fall through the world
  return heightAt(x, z) + 1;
}

function chunkOrigin(cx, cz) {
  return [cx * CHUNK_SIZE, cz * CHUNK_SIZE];
}

// tracks which chunks already have block data so we never regenerate
// (and overwrite any player edits in) the same chunk twice
const generatedChunks = new Set();
const chunkKey = (cx, cz) => cx + ',' + cz;

function generateChunk(cx, cz) {
  // bounded world -- stop generating past the border instead of growing forever
  if (Math.abs(cx) > WORLD_BORDER_CHUNKS || Math.abs(cz) > WORLD_BORDER_CHUNKS) return;

  const ck = chunkKey(cx, cz);
  if (generatedChunks.has(ck)) return;
  generatedChunks.add(ck);

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

export function ensureChunksAround(x, z, radius) {
  const [cx, cz] = chunkOf(x, z);
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      generateChunk(cx + dx, cz + dz);
    }
  }
}

export function generateWorld() {
  ensureChunksAround(0, 0, 2);
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

export function regenerateTerrain() {
  worldSeed = Math.floor(Math.random() * 100000);
  blocks.clear();
  chunkIndex.clear();
  generatedChunks.clear();
  generateWorld();
}