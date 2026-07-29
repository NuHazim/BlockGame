import { TILE_PAINTERS, BLOCK_TYPES } from './blocks.js';

export const TILE_SIZE = 16;
export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 8;

const atlasCanvas = document.createElement('canvas');
atlasCanvas.width = TILE_SIZE * ATLAS_COLS;
atlasCanvas.height = TILE_SIZE * ATLAS_ROWS;
const atlasCtx = atlasCanvas.getContext('2d');

export const TILE_UV = {};
Object.keys(TILE_PAINTERS).forEach((name, i) => {
  const col = i % ATLAS_COLS;
  const row = Math.floor(i / ATLAS_COLS);
  TILE_UV[name] = { col, row };
  TILE_PAINTERS[name](atlasCtx, col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE);
});

const atlasTexture = new THREE.CanvasTexture(atlasCanvas);
atlasTexture.magFilter = THREE.NearestFilter;
atlasTexture.minFilter = THREE.NearestFilter;

// crop the shared atlas down to just one tile's square via UV offset/repeat.
// Shared by tileMaterial (Lambert, day/night responsive) and tileTexture
// (raw texture, used by meshBuilder's unlit torch-lit tiers).
function cropTile(tileName) {
  const { col, row } = TILE_UV[tileName];
  const tex = atlasTexture.clone();
  tex.needsUpdate = true;
  tex.repeat.set(1 / ATLAS_COLS, 1 / ATLAS_ROWS);
  tex.offset.set(col / ATLAS_COLS, 1 - (row + 1) / ATLAS_ROWS);
  return tex;
}

export function tileTexture(tileName) {
  return cropTile(tileName);
}

function tileMaterial(tileName) {
  const tex = cropTile(tileName);
  return new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, map: tex });
}

function buildMaterial(faces) {
  if (faces.all) return tileMaterial(faces.all);
  return [
    tileMaterial(faces.side), tileMaterial(faces.side),
    tileMaterial(faces.top),  tileMaterial(faces.bottom),
    tileMaterial(faces.side), tileMaterial(faces.side)
  ];
}

export const materials = {};
for (const t in BLOCK_TYPES) materials[t] = buildMaterial(BLOCK_TYPES[t].faces);

// ---------- Water override ----------
// A solid, opaque, textured cube reads as "blue wool" and -- since a
// THREE.BoxGeometry's faces are single-sided by default -- standing INSIDE
// one (i.e. swimming) means you're looking at the un-rendered backs of its
// own faces, so you see straight through to whatever's beyond it. Water
// needs to be translucent (so light/blocks read through it, like
// Minecraft) and double-sided (so it still renders correctly from inside
// the volume). Tuned toward Minecraft's fairly saturated water blue rather
// than a washed-out pastel. vertexColors stays on so the shared box
// geometry's baked per-face shading still gives it some directional depth.
export const waterMaterial = new THREE.MeshLambertMaterial({
  color: 0x3f79e0,
  transparent: true,
  opacity: 0.62,
  depthWrite: false, // avoids transparent water fighting itself/the seafloor in the depth buffer
  side: THREE.DoubleSide,
  vertexColors: true
});
materials.water = waterMaterial;

// ---------- Icons (hotbar / block picker) ----------
function tileDataURL(tileName) {
  const { col, row } = TILE_UV[tileName];
  const c = document.createElement('canvas');
  c.width = c.height = TILE_SIZE;
  c.getContext('2d').drawImage(
    atlasCanvas, col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE, 0, 0, TILE_SIZE, TILE_SIZE
  );
  return c.toDataURL();
}

function iconTileFor(type) {
  const f = BLOCK_TYPES[type].faces;
  return f.all || f.top;
}

const iconCache = {};
export function blockIconURL(type) {
  const tileName = iconTileFor(type);
  if (!iconCache[tileName]) iconCache[tileName] = tileDataURL(tileName);
  return iconCache[tileName];
}