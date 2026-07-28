import { BLOCK, RENDER_DISTANCE } from './config.js';
import { materials, tileTexture } from './atlas.js';
import { BLOCK_TYPES, NON_OCCLUDING_BLOCKS } from './blocks.js';
import { blocks, getBlock, chunkOf, getChunkBlocks } from './world.js';
import { getBlockLight } from './lighting.js';

export const geometry = new THREE.BoxGeometry(BLOCK, BLOCK, BLOCK);

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
bakeFaceShading(geometry);

export const torchGeometry = new THREE.BoxGeometry(0.18, 0.7, 0.18);
torchGeometry.translate(0, -0.15, 0);
bakeFaceShading(torchGeometry);

// Single lit tier: any block touched by torchlight (level > 0) renders at
// one fixed brightness via the unlit bucket. Toned down from 1.05 to 0.85
// so it reads as "lit" without blowing out to near-white.
const LIT_BRIGHTNESS_MULT = 0.85;

function isLit(level) {
  return level > 0;
}

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
  const tex = tileTexture(primaryTileFor(type));
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: tex, vertexColors: true });
  litMatCache[type] = mat;
  return mat;
}

export const meshGroup = new THREE.Group();
const meshes = {};
const dummy = new THREE.Object3D();

let dirtyTypes = new Set();
let centerChunk = null;

export function updateRenderCenter(x, z) {
  const [cx, cz] = chunkOf(x, z);
  if (!centerChunk || centerChunk[0] !== cx || centerChunk[1] !== cz) {
    centerChunk = [cx, cz];
    for (const t in materials) dirtyTypes.add(t);
  }
}

function isOccluding(x, y, z) {
  const t = getBlock(x, y, z);
  return t != null && !NON_OCCLUDING_BLOCKS.has(t);
}

function neighborsAllOccluding(x, y, z) {
  return isOccluding(x + 1, y, z) && isOccluding(x - 1, y, z) &&
         isOccluding(x, y + 1, z) && isOccluding(x, y - 1, z) &&
         isOccluding(x, y, z + 1) && isOccluding(x, y, z - 1);
}

export function rebuildTypes(types) {
  const grouped = {};
  const groupedLit = {};
  for (const t of types) { grouped[t] = []; groupedLit[t] = []; }

  function consider(k, type) {
    if (!(type in grouped)) return;
    const x = +k.slice(0, k.indexOf(','));
    const rest = k.slice(k.indexOf(',') + 1);
    const y = +rest.slice(0, rest.indexOf(','));
    const z = +rest.slice(rest.indexOf(',') + 1);

    if (!NON_OCCLUDING_BLOCKS.has(type) && neighborsAllOccluding(x, y, z)) return;

    const level = getBlockLight(x, y, z);
    if (isLit(level)) groupedLit[type].push([x, y, z]);
    else grouped[type].push([x, y, z]);
  }

  if (centerChunk) {
    const [ccx, ccz] = centerChunk;
    for (let dcx = -RENDER_DISTANCE; dcx <= RENDER_DISTANCE; dcx++) {
      for (let dcz = -RENDER_DISTANCE; dcz <= RENDER_DISTANCE; dcz++) {
        const cm = getChunkBlocks(ccx + dcx, ccz + dcz);
        if (!cm) continue;
        for (const [k, type] of cm) consider(k, type);
      }
    }
  } else {
    for (const [k, type] of blocks) consider(k, type);
  }

  function buildBucket(bucketKey, list, geo, mat) {
    if (meshes[bucketKey]) {
      meshGroup.remove(meshes[bucketKey]);
      delete meshes[bucketKey];
    }
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
    meshes[bucketKey] = mesh;
  }

  for (const t of types) {
    const isTorch = t === 'torch';
    const baseGeo = isTorch ? torchGeometry : geometry;
    buildBucket(t, grouped[t], baseGeo, materials[t]);
    buildBucket(t + ':lit', groupedLit[t], getLitGeometry(isTorch), getLitMaterial(t));
  }
}

export function flushDirty() {
  if (dirtyTypes.size === 0) return;
  rebuildTypes(dirtyTypes);
  dirtyTypes.clear();
}

export function markEditDirty(x, y, z, ownType) {
  if (ownType) dirtyTypes.add(ownType);
  const nb = [
    getBlock(x + 1, y, z), getBlock(x - 1, y, z),
    getBlock(x, y + 1, z), getBlock(x, y - 1, z),
    getBlock(x, y, z + 1), getBlock(x, y, z - 1)
  ];
  for (const t of nb) if (t) dirtyTypes.add(t);
}

export function markAllTypesDirty() {
  for (const t in materials) dirtyTypes.add(t);
}