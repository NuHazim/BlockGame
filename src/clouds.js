import { MAX_HEIGHT } from './config.js';

const CLOUD_HEIGHT = MAX_HEIGHT + 22;   // comfortably above the sun/moon's lowest visible point
const CLOUD_CELL = 14;
const CLOUD_RADIUS = 7;                 // grid cells out from the player -- controls sky coverage
const CLOUD_SPEED = 0.6;                // world units/sec of drift
const CLOUD_COVERAGE = 0.62;            // fraction of cells skipped (noise threshold) -- lower = more clouds
const PUFFS_PER_CLOUD = 5;              // small boxes clustered per cloud, for a lumpy silhouette instead of one flat slab

function hash(x, y) {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function cloudNoise(gx, gz) {
  return hash(gx, gz);
}

// deterministic per-puff shape/offset so a cloud's silhouette stays stable
// across frames without needing to store random state
function puffLayout(gx, gz, i) {
  const a = hash(gx * 3 + i * 7.1, gz * 5 - i * 2.3);
  const b = hash(gx * 5 - i * 1.7, gz * 3 + i * 4.9);
  const c = hash(gx * 7 + i * 3.3, gz * 9 - i * 6.1);
  return {
    offsetX: (a - 0.5) * CLOUD_CELL * 0.8,
    offsetZ: (b - 0.5) * CLOUD_CELL * 0.8,
    offsetY: (c - 0.5) * 1.6,
    sx: 3.5 + a * 4.5,
    sy: 1.6 + b * 1.4,
    sz: 3.5 + c * 4.5
  };
}

let cloudMesh = null;
let cloudCells = [];  // { gx, gz, puffs: [{offsetX, offsetZ, offsetY, sx, sy, sz}, ...] }
let windOffset = 0;
let lastGX = null, lastGZ = null;
const dummy = new THREE.Object3D();

function makePuffGeometry() {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  // bake soft top-lit / bottom-shadowed shading into the shared geometry so
  // every puff instance reads as a rounded volume instead of a flat box,
  // without needing per-instance colors (not supported on older three).
  const FACE_BRIGHTNESS = [0.92, 0.86, 1.0, 0.75, 0.9, 0.86]; // +x -x +y -y +z -z
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let f = 0; f < 6; f++) {
    const b = FACE_BRIGHTNESS[f];
    for (let v = 0; v < 4; v++) {
      const idx = (f * 4 + v) * 3;
      colors[idx] = b; colors[idx + 1] = b; colors[idx + 2] = b;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

export function initClouds(scene) {
  const geometry = makePuffGeometry();
  const material = new THREE.MeshLambertMaterial({
    color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.88, depthWrite: false
  });
  const maxCells = (CLOUD_RADIUS * 2 + 1) ** 2;
  cloudMesh = new THREE.InstancedMesh(geometry, material, maxCells * PUFFS_PER_CLOUD);
  cloudMesh.frustumCulled = false;
  scene.add(cloudMesh);
  return cloudMesh;
}

function rebuildLayout(gx0, gz0) {
  cloudCells = [];
  for (let dx = -CLOUD_RADIUS; dx <= CLOUD_RADIUS; dx++) {
    for (let dz = -CLOUD_RADIUS; dz <= CLOUD_RADIUS; dz++) {
      const gx = gx0 + dx, gz = gz0 + dz;
      if (cloudNoise(gx, gz) > CLOUD_COVERAGE) continue;
      const puffs = [];
      for (let i = 0; i < PUFFS_PER_CLOUD; i++) puffs.push(puffLayout(gx, gz, i));
      cloudCells.push({ gx, gz, puffs });
    }
  }
  lastGX = gx0; lastGZ = gz0;
}

export function updateClouds(dt, playerPos) {
  if (!cloudMesh) return;
  windOffset += dt * CLOUD_SPEED;

  const gx0 = Math.floor(playerPos.x / CLOUD_CELL);
  const gz0 = Math.floor(playerPos.z / CLOUD_CELL);
  if (gx0 !== lastGX || gz0 !== lastGZ) rebuildLayout(gx0, gz0);

  const drift = windOffset % CLOUD_CELL; // bounded so the grid alignment stays valid indefinitely
  let idx = 0;
  for (const cell of cloudCells) {
    const baseX = cell.gx * CLOUD_CELL + drift;
    const baseZ = cell.gz * CLOUD_CELL;
    for (const p of cell.puffs) {
      dummy.position.set(baseX + p.offsetX, CLOUD_HEIGHT + p.offsetY, baseZ + p.offsetZ);
      dummy.scale.set(p.sx, p.sy, p.sz);
      dummy.updateMatrix();
      cloudMesh.setMatrixAt(idx, dummy.matrix);
      idx++;
    }
  }
  cloudMesh.count = idx;
  cloudMesh.instanceMatrix.needsUpdate = true;
}