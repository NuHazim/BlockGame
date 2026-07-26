import { BLOCK, RENDER_DISTANCE } from './config.js';
import { materials } from './atlas.js';
import { blocks, isSolid, getBlock, chunkOf, getChunkBlocks } from './world.js';

export const geometry = new THREE.BoxGeometry(BLOCK, BLOCK, BLOCK);

// Bake fake directional lighting into vertex colors so each cube face reads
// as a distinct plane: top brightest, sides mid, bottom darkest. BoxGeometry
// face order is +X, -X, +Y, -Y, +Z, -Z (4 verts each = 24 total).
(function bakeFaceShading() {
  const FACE_BRIGHTNESS = [
    0.86, // +X  right
    0.72, // -X  left
    1.00, // +Y  top
    0.55, // -Y  bottom
    0.80, // +Z  front
    0.66  // -Z  back
  ];
  const count = geometry.attributes.position.count; // 24
  const colors = new Float32Array(count * 3);
  for (let f = 0; f < 6; f++) {
    const b = FACE_BRIGHTNESS[f];
    for (let v = 0; v < 4; v++) {
      const i = (f * 4 + v) * 3;
      colors[i] = b; colors[i + 1] = b; colors[i + 2] = b;
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
})();

export const meshGroup = new THREE.Group();
const meshes = {}; // type -> InstancedMesh
const dummy = new THREE.Object3D();

// types whose meshes need rebuilding this frame
let dirtyTypes = new Set();

// chunk the player currently occupies -- only blocks within RENDER_DISTANCE
// chunks of this are meshed; everything else is skipped entirely
let centerChunk = null;

// call once per frame with the player's position. Crossing into a new
// chunk changes which blocks should be visible, so it marks every type
// dirty to force a full re-filter (not just types that had edits).
export function updateRenderCenter(x, z) {
  const [cx, cz] = chunkOf(x, z);
  if (!centerChunk || centerChunk[0] !== cx || centerChunk[1] !== cz) {
    centerChunk = [cx, cz];
    for (const t in materials) dirtyTypes.add(t);
  }
}

function neighborsAllSolid(x, y, z) {
  return isSolid(x + 1, y, z) && isSolid(x - 1, y, z) &&
         isSolid(x, y + 1, z) && isSolid(x, y - 1, z) &&
         isSolid(x, y, z + 1) && isSolid(x, y, z - 1);
}

// Rebuild only the instanced meshes for the given types. Breaking/placing a
// block also exposes/hides neighbour faces, so callers must mark the touched
// block's type AND its 6 neighbours' types dirty (see markEditDirty).
//
// Only scans chunks within RENDER_DISTANCE of centerChunk (via the chunk
// index in world.js) instead of the whole `blocks` map -- the map only ever
// grows as the world is explored, so scanning all of it on every chunk
// crossing gets slower and slower over a play session. This keeps rebuild
// cost bounded by "blocks near the player," not "blocks ever generated".
export function rebuildTypes(types) {
  const grouped = {};
  for (const t of types) grouped[t] = [];

  function consider(k, type) {
    if (!grouped[type]) return; // type not dirty, skip
    const x = +k.slice(0, k.indexOf(','));
    const rest = k.slice(k.indexOf(',') + 1);
    const y = +rest.slice(0, rest.indexOf(','));
    const z = +rest.slice(rest.indexOf(',') + 1);
    if (neighborsAllSolid(x, y, z)) return; // fully hidden block
    grouped[type].push([x, y, z]);
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
    // no center yet (shouldn't normally happen -- updateRenderCenter runs
    // before the first rebuildTypes call in main.js) -- fall back to a full scan
    for (const [k, type] of blocks) consider(k, type);
  }

  for (const t of types) {
    if (meshes[t]) {
      meshGroup.remove(meshes[t]);
      delete meshes[t];
    }
    const list = grouped[t];
    if (!list || list.length === 0) continue;
    const mesh = new THREE.InstancedMesh(geometry, materials[t], list.length);
    for (let i = 0; i < list.length; i++) {
      dummy.position.set(list[i][0], list[i][1], list[i][2]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.userData.type = t;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    meshGroup.add(mesh);
    meshes[t] = mesh;
  }
}

export function flushDirty() {
  if (dirtyTypes.size === 0) return;
  rebuildTypes(dirtyTypes);
  dirtyTypes.clear();
}

// mark a block's own type plus every neighbour's type as needing a rebuild
export function markEditDirty(x, y, z, ownType) {
  if (ownType) dirtyTypes.add(ownType);
  const nb = [
    getBlock(x + 1, y, z), getBlock(x - 1, y, z),
    getBlock(x, y + 1, z), getBlock(x, y - 1, z),
    getBlock(x, y, z + 1), getBlock(x, y, z - 1)
  ];
  for (const t of nb) if (t) dirtyTypes.add(t);
}