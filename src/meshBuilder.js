import { RENDER_DISTANCE, MESH_REGION_SIZE, WORLD_BORDER_CHUNKS } from './config.js';
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
// cube -- see where it's used further down.
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

// ---------- Region-based mesh cache ----------
// Draw-call count is what actually limits how far RENDER_DISTANCE can go
// before things get choppy -- a mesh per block type PER CHUNK adds up fast
// once dozens of chunks are in view. Regions batch a MESH_REGION_SIZE x
// MESH_REGION_SIZE block of chunks into one shared set of meshes instead,
// cutting draw calls by roughly MESH_REGION_SIZE^2. Crossing into a new
// chunk still only builds/evicts whatever regions just entered/left the
// render radius -- regions already loaded and still in view aren't
// touched.
const REGION = MESH_REGION_SIZE;
const regionMeshes = new Map(); // regionKey -> { bucketKey: InstancedMesh }
const pendingRegions = new Set(); // regions waiting on terrain generation
let centerChunk = null;

function regionOf(cx, cz) {
  return [Math.floor(cx / REGION), Math.floor(cz / REGION)];
}
function regionKey(rx, rz) { return rx + ',' + rz; }

function regionChunkList(rx, rz) {
  const list = [];
  for (let dx = 0; dx < REGION; dx++) {
    for (let dz = 0; dz < REGION; dz++) {
      list.push([rx * REGION + dx, rz * REGION + dz]);
    }
  }
  return list;
}

// A chunk outside the world border will NEVER generate (see world.js's
// generateChunk), so that shouldn't count as "not ready yet" -- otherwise
// any region straddling the border would sit in the pending queue forever
// and never render even its valid chunks.
function isChunkReady(cx, cz) {
  if (Math.abs(cx) > WORLD_BORDER_CHUNKS || Math.abs(cz) > WORLD_BORDER_CHUNKS) return true;
  return isChunkGenerated(cx, cz);
}

function isRegionReady(rx, rz) {
  for (const [cx, cz] of regionChunkList(rx, rz)) {
    if (!isChunkReady(cx, cz)) return false;
  }
  return true;
}

// Builds every InstancedMesh needed for one region (spanning up to
// REGION*REGION chunks) and caches them under regionMeshes.get(regionKey).
// Returns false without building anything if the region isn't fully ready
// yet -- caller is responsible for retrying later (see pendingRegions).
function buildRegionMeshes(rx, rz) {
  if (!isRegionReady(rx, rz)) return false;

  const key = regionKey(rx, rz);
  const grouped = {};
  const groupedLit = {};
  for (const t in materials) {
    if (t === 'water') continue;
    grouped[t] = [];
    groupedLit[t] = [];
  }
  const waterSurface = [];
  const waterSurfaceLit = [];

  for (const [cx, cz] of regionChunkList(rx, rz)) {
    const cm = getChunkBlocks(cx, cz);
    if (!cm) continue; // generated but genuinely has no blocks (or beyond the world border)

    for (const [k, type] of cm) {
      const [x, y, z] = parseKey(k);

      if (type === 'water') {
        if (isSolid(x, y + 1, z)) continue;
        const level = getBlockLight(x, y, z);
        (isLit(level) ? waterSurfaceLit : waterSurface).push([x, y, z]);
        continue;
      }

      if (!NON_OCCLUDING_BLOCKS.has(type) && neighborsAllOccluding(x, y, z)) continue;
      const level = getBlockLight(x, y, z);
      (isLit(level) ? groupedLit[type] : grouped[type]).push([x, y, z]);
    }
  }

  const bucketMeshes = {};
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

  regionMeshes.set(key, bucketMeshes);
  return true;
}

function removeRegionMeshes(key) {
  const bucketMeshes = regionMeshes.get(key);
  if (!bucketMeshes) return;
  for (const bucketKey in bucketMeshes) meshGroup.remove(bucketMeshes[bucketKey]);
  regionMeshes.delete(key);
}

function tryBuildRegion(key) {
  const [rx, rz] = key.split(',').map(Number);
  if (buildRegionMeshes(rx, rz)) pendingRegions.delete(key);
  else pendingRegions.add(key);
}

function retryPendingRegions() {
  if (pendingRegions.size === 0) return;
  for (const key of Array.from(pendingRegions)) tryBuildRegion(key);
}

function rebuildRegion(rx, rz) {
  const key = regionKey(rx, rz);
  removeRegionMeshes(key);
  tryBuildRegion(key);
}

// Called every frame from main.js. Retries any regions still waiting on
// terrain generation first, then -- only when the player has actually
// crossed into a new chunk -- builds whatever regions are newly within
// the render radius and evicts whichever fell out of it.
export function updateRenderCenter(x, z) {
  retryPendingRegions();

  const [cx, cz] = chunkOf(x, z);
  if (centerChunk && centerChunk[0] === cx && centerChunk[1] === cz) return;
  centerChunk = [cx, cz];

  const minRx = Math.floor((cx - RENDER_DISTANCE) / REGION);
  const maxRx = Math.floor((cx + RENDER_DISTANCE) / REGION);
  const minRz = Math.floor((cz - RENDER_DISTANCE) / REGION);
  const maxRz = Math.floor((cz + RENDER_DISTANCE) / REGION);

  const wanted = new Set();
  for (let rx = minRx; rx <= maxRx; rx++) {
    for (let rz = minRz; rz <= maxRz; rz++) {
      wanted.add(regionKey(rx, rz));
    }
  }

  for (const key of wanted) {
    if (!regionMeshes.has(key) && !pendingRegions.has(key)) tryBuildRegion(key);
  }
  for (const key of Array.from(regionMeshes.keys())) {
    if (!wanted.has(key)) removeRegionMeshes(key);
  }
  for (const key of Array.from(pendingRegions)) {
    if (!wanted.has(key)) pendingRegions.delete(key);
  }
}

// Forces every currently-visible region to be rebuilt from scratch --
// needed after a full world regenerate, where the block DATA has
// completely changed even though the player's chunk position often hasn't.
export function rebuildAllChunks() {
  for (const key of Array.from(regionMeshes.keys())) removeRegionMeshes(key);
  pendingRegions.clear();
  centerChunk = null;
}

// ---------- Dirty tracking for edits / lighting changes ----------
const dirtyRegions = new Set();

function markRegionDirtyForChunk(cx, cz) {
  const [rx, rz] = regionOf(cx, cz);
  dirtyRegions.add(regionKey(rx, rz));
}

// Called after a block is placed/destroyed. Marks the region containing the
// edit dirty, plus the regions of its immediate neighbor chunks -- an edit
// near a chunk (or region) boundary can change occlusion for blocks just
// across that boundary too.
export function markEditDirty(x, y, z) {
  markRegionDirtyForChunk(...chunkOf(x, z));
  markRegionDirtyForChunk(...chunkOf(x + 1, z));
  markRegionDirtyForChunk(...chunkOf(x - 1, z));
  markRegionDirtyForChunk(...chunkOf(x, z + 1));
  markRegionDirtyForChunk(...chunkOf(x, z - 1));
}

// Used when a light source is added/removed/moved. Kept under its original
// name so heldItem.js/lightSources.js/interaction.js don't need changes.
export function markAllTypesDirty() {
  for (const key of regionMeshes.keys()) dirtyRegions.add(key);
}

export function flushDirty() {
  if (dirtyRegions.size === 0) return;
  for (const key of dirtyRegions) {
    const [rx, rz] = key.split(',').map(Number);
    rebuildRegion(rx, rz);
  }
  dirtyRegions.clear();
}