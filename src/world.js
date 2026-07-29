import { MAX_HEIGHT, CHUNK_SIZE, WORLD_BORDER_CHUNKS, SEA_LEVEL, SNOW_LEVEL, RENDER_DISTANCE } from './config.js';

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
//
// Layers three signals on top of the original rolling-hills noise:
//  - base: the original gentle hill noise (unchanged)
//  - mountainMask: low-frequency noise, only kept where positive and then
//    squared, so it produces isolated peaks rather than a bumpy plateau
//    everywhere. Pushes height well above SEA_LEVEL.
//  - oceanMask: same idea mirrored (kept where negative), carving basins
//    below SEA_LEVEL for oceans.
// Everything is anchored around SEA_LEVEL so water/beaches/snow line up
// with config.js's SEA_LEVEL/SNOW_LEVEL constants, and the whole thing is
// clamped so mountains never poke through MAX_HEIGHT.
export function heightAt(x, z) {
  const s = worldSeed;
  const base =
    Math.sin((x + s) * 0.11) * 2.2 +
    Math.cos((z - s) * 0.13) * 2.2 +
    Math.sin((x + z + s) * 0.06) * 3.0 +
    Math.cos((x - z + s) * 0.09) * 1.4;

  const mountainMask = Math.max(0, Math.sin((x + s * 1.7) * 0.015) * Math.cos((z - s * 1.3) * 0.017));
  const mountain = mountainMask * mountainMask * 22; // squared -- keeps peaks isolated instead of everywhere

  const oceanMask = Math.min(0, Math.sin((x - s * 1.3) * 0.014) * Math.cos((z + s * 1.9) * 0.016));
  const ocean = oceanMask * 14; // negative -- carves basins below sea level

  const h = Math.floor(SEA_LEVEL + 3 + base + mountain + ocean);
  return Math.max(1, Math.min(MAX_HEIGHT - 2, h));
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

// meshBuilder needs to tell "this chunk has no data yet, try again later"
// apart from "this chunk is generated and genuinely has nothing to mesh" --
// getChunkBlocks() returning undefined can't distinguish those on its own.
export function isChunkGenerated(cx, cz) {
  return generatedChunks.has(chunkKey(cx, cz));
}

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
      const underwater = h < SEA_LEVEL;
      const snowy = h >= SNOW_LEVEL;
      const topType = underwater ? 'sand' : (snowy ? 'snow' : 'grass');

      for (let y = 0; y <= h; y++) {
        let type;
        if (y === h) type = topType;
        else if (y >= h - 3) type = underwater ? 'sand' : 'dirt';
        else type = 'stone';
        setBlock(x, y, z, type);
      }

      // fill the basin up to sea level with water so oceans actually appear
      if (underwater) {
        for (let y = h + 1; y <= SEA_LEVEL; y++) setBlock(x, y, z, 'water');
      }

      // trees only spawn on dry, non-snowy grass
      if (!underwater && !snowy && h < MAX_HEIGHT - 3 && Math.abs(x) > 2 && Math.abs(z) > 2) {
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
  // was hardcoded to a radius of 2 regardless of RENDER_DISTANCE -- fine
  // back when RENDER_DISTANCE was small, but at higher values the mesh
  // builder would immediately try to mesh chunks whose terrain hadn't been
  // generated yet on startup. It has its own retry queue for that now (see
  // meshBuilder.js), but there's no reason to rely on it for the very first
  // load -- just generate enough terrain up front to match what's actually
  // going to be rendered.
  ensureChunksAround(0, 0, RENDER_DISTANCE + 1);
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