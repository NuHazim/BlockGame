import { TILE_PAINTERS, BLOCK_TYPES } from './blocks.js';

// ---------- Texture atlas ----------
// One shared image cut into TILE_SIZE x TILE_SIZE squares. Every block face
// points at a square in this grid via UV offset/repeat, instead of owning
// its own separate texture. Adding a new block only touches blocks.js --
// this file just consumes whatever's registered there.

export const TILE_SIZE = 16;
export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 8; // room for up to 64 tiles before the atlas needs to grow

const atlasCanvas = document.createElement('canvas');
atlasCanvas.width = TILE_SIZE * ATLAS_COLS;
atlasCanvas.height = TILE_SIZE * ATLAS_ROWS;
const atlasCtx = atlasCanvas.getContext('2d');

export const TILE_UV = {}; // tile name -> { col, row } position in the atlas grid
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
// clone() shares the same underlying image, so this is cheap even with
// many tiles/materials.
function tileMaterial(tileName) {
  const { col, row } = TILE_UV[tileName];
  const tex = atlasTexture.clone();
  tex.needsUpdate = true;
  tex.repeat.set(1 / ATLAS_COLS, 1 / ATLAS_ROWS);
  tex.offset.set(col / ATLAS_COLS, 1 - (row + 1) / ATLAS_ROWS);
  // color stays white + vertexColors:true so the baked per-face brightness
  // (see meshBuilder.js bakeFaceShading) shades the texture instead of
  // tinting it -- keeps the "each face reads as a distinct plane" look,
  // now with real texture detail layered on top.
  // MeshLambertMaterial (not MeshBasicMaterial) so blocks actually respond
  // to the sun/moon lights and the day/night cycle's shadows -- a basic
  // material ignores lights and shadows entirely.
  return new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, map: tex });
}

// build a block type's material(s) from its `faces` entry in BLOCK_TYPES.
// BoxGeometry face-group order is [+x, -x, +y, -y, +z, -z]
// i.e. [right, left, top, bottom, front, back]
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
