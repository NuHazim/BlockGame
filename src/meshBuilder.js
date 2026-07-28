import { BLOCK, RENDER_DISTANCE } from './config.js';
import { materials, tileTexture } from './atlas.js';
import { BLOCK_TYPES, NON_OCCLUDING_BLOCKS } from './blocks.js';
import { blocks, getBlock, chunkOf, getChunkBlocks } from './world.js';
import { getBlockLight } from './lighting.js';

export const geometry = new THREE.BoxGeometry(BLOCK, BLOCK, BLOCK);

const FACE_BRIGHTNESS = [0.86, 0.72, 1.00, 0.55, 0.80, 0.66]; // +x -x +y -y +z -z

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

// ---------- Block-light tiers ----------
// A block whose computed light level (from lighting.js) is > 0 renders via
// a SEPARATE unlit (MeshBasicMaterial) instanced mesh instead of the
// normal day/night-lit one. MeshBasicMaterial ignores the scene's real-time
// lights entirely -- its vertex color IS the final brightness -- so a block
// near a torch is now guaranteed visibly bright regardless of time of day,
// with no dependency on how a dynamic PointLight happens to interact with
// this project's instanced/vertex-colored materials.
const LIGHT_TIERS = [
  { max: 4,  mult: 0.55 }, // dim, edge of torchlight
  { max: 9,  mult: 0.85 }, // mid-range
  { max: 14, mult: 1.05 }  // right next to the source
];

function tierIndexForLevel(level) {
  if (level <= 0) return -1;
  for (let i = 0; i < LIGHT_TIERS.length; i++) {
    if (level <= LIGHT_TIERS[i].max) return i;
  }
  return LIGHT_TIERS.length - 1;
}

const litGeomCache = {};
function getLitGeometry(isTorch, tier) {
  const cacheKey = (isTorch ? 'torch' : 'block') + tier;
  if (litGeomCache[cacheKey]) return litGeomCache[cacheKey];
  const geo = (isTorch ? torchGeometry : geometry).clone();
  bakeFaceShading(geo, LIGHT_TIERS[tier].mult);
  litGeomCache[cacheKey] = geo;
  return geo;
}

function primaryTileFor(type) {
  const f = BLOCK_TYPES[type].faces;
  return f.all || f.top;
}

const litMatCache = {};
function getLitMaterial(type, tier) {
  const cacheKey = type + ':' + tier;
  if (litMatCache[cacheKey]) return litMatCache[cacheKey];
  const tex = tileTexture(primaryTileFor(type));
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: tex, vertexColors: true });
  litMatCache[cacheKey] = mat;
  return mat;
}

export const meshGroup = new THREE.Group();
const meshes = {}; // bucket key -> InstancedMesh
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
  const grouped = {};    // type -> normal (day/night-lit) instances
  const groupedLit = {}; // type -> [tier0 instances, tier1, tier2]
  for (const t of types) { grouped[t] = []; groupedLit[t] = [[], [], []]; }

  function consider(k, type) {
    if (!(type in grouped)) return;
    const x = +k.slice(0, k.indexOf(','));
    const rest = k.slice(k.indexOf(',') + 1);
    const y = +rest.slice(0, rest.indexOf(','));
    const z = +rest.slice(rest.indexOf(',') + 1);

    if (!NON_OCCLUDING_BLOCKS.has(type) && neighborsAllOccluding(x, y, z)) return;

    const level = getBlockLight(x, y, z);
    const tier = tierIndexForLevel(level);
    if (tier >= 0) groupedLit[type][tier].push([x, y, z]);
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
    for (let tier = 0; tier < LIGHT_TIERS.length; tier++) {
      buildBucket(t + ':lit' + tier, groupedLit[t][tier], getLitGeometry(isTorch, tier), getLitMaterial(t, tier));
    }
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

// Marks every tracked type dirty -- used after a lighting change (placing/
// removing a light source), since that can shift the tier bucket of many
// blocks at once, not just ones immediately adjacent to the edit.
export function markAllTypesDirty() {
  for (const t in materials) dirtyTypes.add(t);
}