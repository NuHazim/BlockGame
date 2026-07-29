import { RENDER_DISTANCE } from './config.js';
import { materials, tileTexture } from './atlas.js';
import { BLOCK_TYPES, NON_OCCLUDING_BLOCKS } from './blocks.js';
import { getBlock, isSolid, chunkOf, getChunkBlocks, isChunkGenerated } from './world.js';
import { getBlockLight } from './lighting.js';

const FACE_BRIGHTNESS = [0.86, 0.72, 1.00, 0.55, 0.80, 0.66];

function bakeFaceShading(geo, mult = 1) {
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let f = 0; f < 6; f++) {
    const b = FACE_BRIGHTNESS[f] * mult;
    for (let v = 0; v < 4; v++) {
      const i = (f * 4 + v) * 3;
      colors[i] = b; colors[i + 1] = b; colors[i + 2] = b;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

export const geometry = new THREE.BoxGeometry(1, 1, 1);
bakeFaceShading(geometry);

export const torchGeometry = new THREE.BoxGeometry(0.18, 0.7, 0.18);
torchGeometry.translate(0, -0.15, 0);
bakeFaceShading(torchGeometry);

// ---------- Water surface geometry ----------
// Water renders as a thin flat slab at the top of a column, not a full
// cube -- see the note further down where it's used.
const WATER_SURFACE_THICKNESS = 0.12;
let waterSurfaceGeometry = null;
function getWaterSurfaceGeometry() {
  if (waterSurfaceGeometry) return waterSurfaceGeometry;
  const geo = new THREE.BoxGeometry(1, WATER_SURFACE_THICKNESS, 1);
  geo.translate(0, 0.5 - WATER_SURFACE_THICKNESS / 2, 0);
  bakeFaceShading(geo, 1);
  waterSurfaceGeometry = geo;
  return geo;
}
let waterSurfaceLitGeometry = null;
function getWaterSurfaceLitGeometry() {
  if (waterSurfaceLitGeometry) return waterSurfaceLitGeometry;
  const geo = getWaterSurfaceGeometry().clone();
  bakeFaceShading(geo, LIT_BRIGHTNESS_MULT);
  waterSurfaceLitGeometry = geo;
  return geo;
}

// Single lit tier: any block touched by torchlight (level > 0) renders at
// one fixed brightness via the unlit bucket.
const LIT_BRIGHTNESS_MULT = 0.85;
function isLit(level) { return level > 0; }

let litGeomCache = { block: null, torch: null };
function getLitGeometry(isTorch) {
  const cacheKey = isTorch ? 'torch' : 'block';
  if (litGeomCache[cacheKey]) return litGeomCache[cacheKey];
  const geo = (isTorch ? torchGeometry : geometry).clone();
  bakeFaceShading(geo, LIT_BRIGHTNESS_MULT);
  litGeomCache[cacheKey] = geo;
  return geo;
}

function primaryTileFor(type) {
  const f = BLOCK_TYPES[type].faces;
  return f.all || f.top;
}

const litMatCache = {};
function getLitMaterial(type) {
  if (litMatCache[type]) return litMatCache[type];
  if (type === 'water') {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x5aa8ff, transparent: true, opacity: 0.66,
      depthWrite: false, side: THREE.DoubleSide, vertexColors: true
    });
    litMatCache[type] = mat;
    return mat;
  }
  const tex = tileTexture(primaryTileFor(type));
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: tex, vertexColors: true });
  litMatCache[type] = mat;
  return mat;
}

export const meshGroup = new THREE.Group();
const dummy = new THREE.Object3D();

// ---------- Per-chunk mesh cache ----------
// This is the actual performance fix for "increasing render distance
// causes lag." The old approach rebuilt ONE giant InstancedMesh per block
// type covering every chunk in the whole render radius, and did that full
// rebuild on every single chunk crossing -- cost scaled with
// RENDER_DISTANCE^2, so raising render distance made every step across a
// chunk boundary much more expensive.
//
// Instead, each chunk gets its own small set of InstancedMeshes, built
// once and cached here (chunkKey -> { bucketKey: InstancedMesh }).
// Crossing into a new chunk now only builds the newly-exposed chunks at
// the edge of the render radius (a thin ring, cost scales with
// RENDER_DISTANCE, not its square) and evicts whichever chunks just fell
// out of range -- chunks that were already loaded and are still in view
// aren't touched at all.
const chunkMeshes = new Map();
let centerChunk = null;

function isOccluding(t) {
  return t != null && t !== 'torch' && t !== 'water';
}

function neighborsAllOccluding(x, y, z) {
  return isOccluding(getBlock(x + 1, y, z)) && isOccluding(getBlock(x - 1, y, z)) &&
         isOccluding(getBlock(x, y + 1, z)) && isOccluding(getBlock(x, y - 1, z)) &&
         isOccluding(getBlock(x, y, z + 1)) && isOccluding(getBlock(x, y, z - 1));
}

function parseKey(k) {
  const x = +k.slice(0, k.indexOf(','));
  const rest = k.slice(k.indexOf(',') + 1);
  const y = +rest.slice(0, rest.indexOf(','));
  const z = +rest.slice(rest.indexOf(',') + 1);
  return [x, y, z];
}

// Builds every InstancedMesh needed for one chunk and stores them under
// chunkMeshes.get(chunkKey). Occlusion/lighting checks still read from the
// global block/light data (via getBlock/isSolid/getBlockLight), so a
// chunk's meshing correctly accounts for its neighbors in adjacent chunks
// even though only this one chunk's blocks are being iterated.
//
// Returns false (and builds nothing) if this chunk's terrain data hasn't
// been generated yet -- the caller is responsible for retrying later
// instead of treating "no data yet" as "permanently empty". Getting this
// wrong was the bug where chunks at higher render distances would never
// load until an edit forced a rebuild: the old version cached an empty
// mesh set the instant it saw no data, and then never looked again even
// after the chunk's terrain actually finished generating a few frames
// later.
function buildChunkMeshes(cx, cz) {
  if (!isChunkGenerated(cx, cz)) return false;

  const key = cx + ',' + cz;
  const cm = getChunkBlocks(cx, cz);
  const bucketMeshes = {};

  if (cm) {
    const grouped = {};
    const groupedLit = {};
    for (const t in materials) {
      if (t === 'water') continue;
      grouped[t] = [];
      groupedLit[t] = [];
    }
    const waterSurface = [];
    const waterSurfaceLit = [];

    for (const [k, type] of cm) {
      const [x, y, z] = parseKey(k);

      if (type === 'water') {
        if (isSolid(x, y + 1, z)) continue; // covered from above -- nothing to see
        const level = getBlockLight(x, y, z);
        (isLit(level) ? waterSurfaceLit : waterSurface).push([x, y, z]);
        continue;
      }

      if (!NON_OCCLUDING_BLOCKS.has(type) && neighborsAllOccluding(x, y, z)) continue;
      const level = getBlockLight(x, y, z);
      (isLit(level) ? groupedLit[type] : grouped[type]).push([x, y, z]);
    }

    function build(bucketKey, list, geo, mat) {
      if (!list || list.length === 0) return;
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      for (let i = 0; i < list.length; i++) {
        dummy.position.set(list[i][0], list[i][1], list[i][2]);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      meshGroup.add(mesh);
      bucketMeshes[bucketKey] = mesh;
    }

    for (const t in grouped) {
      const isTorch = t === 'torch';
      const baseGeo = isTorch ? torchGeometry : geometry;
      build(t, grouped[t], baseGeo, materials[t]);
      build(t + ':lit', groupedLit[t], getLitGeometry(isTorch), getLitMaterial(t));
    }
    build('water', waterSurface, getWaterSurfaceGeometry(), materials.water);
    build('water:lit', waterSurfaceLit, getWaterSurfaceLitGeometry(), getLitMaterial('water'));
  }

  chunkMeshes.set(key, bucketMeshes);
  return true;
}

// Chunks that were wanted but whose terrain data wasn't generated yet --
// retried cheaply every frame (see retryPendingChunks) instead of being
// silently forgotten.
const pendingChunks = new Set();

function tryBuildChunk(key) {
  const [cx, cz] = key.split(',').map(Number);
  if (buildChunkMeshes(cx, cz)) {
    pendingChunks.delete(key);
  } else {
    pendingChunks.add(key);
  }
}

function retryPendingChunks() {
  if (pendingChunks.size === 0) return;
  for (const key of Array.from(pendingChunks)) tryBuildChunk(key);
}

function removeChunkMeshes(key) {
  const bucketMeshes = chunkMeshes.get(key);
  if (!bucketMeshes) return;
  for (const bucketKey in bucketMeshes) meshGroup.remove(bucketMeshes[bucketKey]);
  chunkMeshes.delete(key);
}

function rebuildChunk(cx, cz) {
  const key = cx + ',' + cz;
  removeChunkMeshes(key);
  tryBuildChunk(key);
}

// Called every frame from main.js. Retries any chunks still waiting on
// terrain generation first (cheap no-op once the pending list is empty),
// then -- only when the player has actually crossed into a new chunk --
// builds whatever's newly entering the render radius and evicts whatever
// just left it. Chunks already loaded and still in view aren't touched.
export function updateRenderCenter(x, z) {
  retryPendingChunks();

  const [cx, cz] = chunkOf(x, z);
  if (centerChunk && centerChunk[0] === cx && centerChunk[1] === cz) return;
  centerChunk = [cx, cz];

  const wanted = new Set();
  for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++) {
    for (let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++) {
      wanted.add((cx + dx) + ',' + (cz + dz));
    }
  }

  for (const key of wanted) {
    if (!chunkMeshes.has(key) && !pendingChunks.has(key)) tryBuildChunk(key);
  }
  for (const key of Array.from(chunkMeshes.keys())) {
    if (!wanted.has(key)) removeChunkMeshes(key);
  }
  for (const key of Array.from(pendingChunks)) {
    if (!wanted.has(key)) pendingChunks.delete(key);
  }
}

// Forces every currently-visible chunk to be rebuilt from scratch --
// needed after a full world regenerate, where the block DATA under
// existing chunk coordinates has completely changed even though the
// player's chunk position often hasn't (so updateRenderCenter alone
// wouldn't otherwise detect anything needs rebuilding).
export function rebuildAllChunks() {
  for (const key of Array.from(chunkMeshes.keys())) removeChunkMeshes(key);
  pendingChunks.clear();
  centerChunk = null;
}

// ---------- Dirty tracking for edits / lighting changes ----------
const dirtyChunks = new Set();

function markChunkDirty(cx, cz) { dirtyChunks.add(cx + ',' + cz); }

// Called after a block is placed/destroyed. Marks the chunk containing the
// edit dirty, plus its immediate neighbor chunks -- an edit near a chunk
// boundary can change occlusion for blocks just across that boundary too,
// even though this chunk's own data didn't change.
export function markEditDirty(x, y, z) {
  markChunkDirty(...chunkOf(x, z));
  markChunkDirty(...chunkOf(x + 1, z));
  markChunkDirty(...chunkOf(x - 1, z));
  markChunkDirty(...chunkOf(x, z + 1));
  markChunkDirty(...chunkOf(x, z - 1));
}

// Used when a light source is added/removed/moved -- torchlight can affect
// the lit/unlit bucket assignment of blocks anywhere within its radius, and
// tracking that precisely per-chunk isn't worth the complexity for how
// rarely this actually fires (placing/breaking a torch), so it just marks
// every currently-loaded chunk dirty. Kept under its original name so
// heldItem.js/lightSources.js/interaction.js don't need any changes.
export function markAllTypesDirty() {
  for (const key of chunkMeshes.keys()) dirtyChunks.add(key);
}

export function flushDirty() {
  if (dirtyChunks.size === 0) return;
  for (const key of dirtyChunks) {
    const [cx, cz] = key.split(',').map(Number);
    rebuildChunk(cx, cz);
  }
  dirtyChunks.clear();
}