import { BLOCK, RENDER_DISTANCE } from './config.js';
import { materials } from './atlas.js';
import { blocks, isSolid, getBlock, chunkOf, getChunkBlocks } from './world.js';

export const geometry = new THREE.BoxGeometry(BLOCK, BLOCK, BLOCK);

function bakeFaceShading(geo) {
  // Fake directional lighting baked into vertex colors so each cube face
  // reads as a distinct plane: top brightest, sides mid, bottom darkest.
  // BoxGeometry face order is +X, -X, +Y, -Y, +Z, -Z (4 verts each).
  const FACE_BRIGHTNESS = [0.86, 0.72, 1.00, 0.55, 0.80, 0.66];
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let f = 0; f < 6; f++) {
    const b = FACE_BRIGHTNESS[f];
    for (let v = 0; v < 4; v++) {
      const i = (f * 4 + v) * 3;
      colors[i] = b; colors[i + 1] = b; colors[i + 2] = b;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}
bakeFaceShading(geometry);

// Torches use their own thinner geometry instead of a full 1x1x1 cube, and
// are translated down so they sit low in the cell (like a post standing on
// the ground) rather than centered like a normal block.
export const torchGeometry = new THREE.BoxGeometry(0.18, 0.7, 0.18);
torchGeometry.translate(0, -0.15, 0);
bakeFaceShading(torchGeometry);

export const meshGroup = new THREE.Group();
const meshes = {}; // type -> InstancedMesh
const dummy = new THREE.Object3D();

// types whose meshes need rebuilding this frame
let dirtyTypes = new Set();

// chunk the player currently occupies -- only blocks within RENDER_DISTANCE
// chunks of this are meshed; everything else is skipped entirely
let centerChunk = null;

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

// Rebuild only the instanced meshes for the given types. Scans only chunks
// within RENDER_DISTANCE of centerChunk (via the chunk index in world.js)
// instead of the whole world, so cost stays bounded regardless of how much
// has been explored.
export function rebuildTypes(types) {
  const grouped = {};
  for (const t of types) grouped[t] = [];

  function consider(k, type) {
    if (!grouped[type]) return;
    const x = +k.slice(0, k.indexOf(','));
    const rest = k.slice(k.indexOf(',') + 1);
    const y = +rest.slice(0, rest.indexOf(','));
    const z = +rest.slice(rest.indexOf(',') + 1);
    // torches are thin, not full cubes -- never hide them via the
    // "fully surrounded" cull check the way a solid block would be
    if (type !== 'torch' && neighborsAllSolid(x, y, z)) return;
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
    for (const [k, type] of blocks) consider(k, type);
  }

  for (const t of types) {
    if (meshes[t]) {
      meshGroup.remove(meshes[t]);
      delete meshes[t];
    }
    const list = grouped[t];
    if (!list || list.length === 0) continue;
    const geo = t === 'torch' ? torchGeometry : geometry;
    const mesh = new THREE.InstancedMesh(geo, materials[t], list.length);
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

export function markEditDirty(x, y, z, ownType) {
  if (ownType) dirtyTypes.add(ownType);
  const nb = [
    getBlock(x + 1, y, z), getBlock(x - 1, y, z),
    getBlock(x, y + 1, z), getBlock(x, y - 1, z),
    getBlock(x, y, z + 1), getBlock(x, y, z - 1)
  ];
  for (const t of nb) if (t) dirtyTypes.add(t);
}