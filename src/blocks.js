// ---------- Block definitions ----------
export const BLOCK_TYPES = {
  grass: { label: 'Grass', color: 0x5aa93b, faces: { top: 'grassTop', side: 'grassSide', bottom: 'dirt' } },
  dirt:  { label: 'Dirt',  color: 0x8a5a34, faces: { all: 'dirt' } },
  stone: { label: 'Stone', color: 0x8a8a8e, faces: { all: 'stone' } },
  wood:  { label: 'Wood',  color: 0x6b4423, faces: { top: 'woodTop', side: 'woodSide', bottom: 'woodTop' } },
  leaves:{ label: 'Leaves',color: 0x2f8f4e, faces: { all: 'leaves' } },
  obsidian:{label:'Obsidian', color:0x2b2b2b, faces: { all: 'obsidian'} },
  sand:  { label: 'Sand',  color: 0xe0d29a, faces: { all: 'sand' } },
  snow:  { label: 'Snow',  color: 0xf5f9ff, faces: { top: 'snow', side: 'snowSide', bottom: 'stone' } },
  water: { label: 'Water', color: 0x3a6fd8, faces: { all: 'water' } },
  torch: { label: 'Torch', color: 0xffaa33, faces: { all: 'torch' } }
};

// Block types that occupy a cell (solid for placement/collision/targeting)
// but should NOT count as "blocking" a neighboring block's visibility.
// A torch is thin -- if it counted as a full occluder the same way stone
// does, placing one next to a block could make that block's last exposed
// face register as "surrounded," causing the whole block to be culled
// from the mesh and vanish. See meshBuilder.js's isOccluding().
export const NON_OCCLUDING_BLOCKS = new Set(['torch']);

// 9 hotbar slots, all empty by default.
export const HOTBAR = [null, null, null, null, null, null, null, null, null];

// ---------- Tile art ----------
function shade(hex, amt) {
  let r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  r = Math.max(0, Math.min(255, Math.round(r + amt)));
  g = Math.max(0, Math.min(255, Math.round(g + amt)));
  b = Math.max(0, Math.min(255, Math.round(b + amt)));
  return `rgb(${r},${g},${b})`;
}

function paintSpeckle(ctx, x0, y0, size, baseHex, variance) {
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      const amt = (Math.random() - 0.5) * variance * 2;
      ctx.fillStyle = shade(baseHex, amt);
      ctx.fillRect(x0 + x, y0 + y, 1, 1);
    }
  }
}

function paintGrassSide(ctx, x0, y0, size) {
  paintSpeckle(ctx, x0, y0, size, BLOCK_TYPES.dirt.color, 14);
  const bandBase = Math.round(size * 0.26);
  for (let x = 0; x < size; x++) {
    const band = bandBase + (Math.random() < 0.5 ? 1 : 0);
    for (let y = 0; y < band; y++) {
      ctx.fillStyle = shade(BLOCK_TYPES.grass.color, (Math.random() - 0.5) * 18);
      ctx.fillRect(x0 + x, y0 + y, 1, 1);
    }
  }
}

function paintWoodRings(ctx, x0, y0, size) {
  const cx = size / 2, cy = size / 2;
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      const d = Math.hypot(x - cx + 0.5, y - cy + 0.5);
      const ring = Math.sin(d * 1.6) * 12;
      ctx.fillStyle = shade(BLOCK_TYPES.wood.color, ring + (Math.random() - 0.5) * 6);
      ctx.fillRect(x0 + x, y0 + y, 1, 1);
    }
  }
}

function paintWoodBark(ctx, x0, y0, size) {
  for (let x = 0; x < size; x++) {
    const stripe = Math.sin(x * 1.3) * 14;
    for (let y = 0; y < size; y++) {
      ctx.fillStyle = shade(BLOCK_TYPES.wood.color, stripe + (Math.random() - 0.5) * 8);
      ctx.fillRect(x0 + x, y0 + y, 1, 1);
    }
  }
}

function paintSnowSide(ctx, x0, y0, size) {
  paintSpeckle(ctx, x0, y0, size, BLOCK_TYPES.stone.color, 14);
  const bandBase = Math.round(size * 0.3);
  for (let x = 0; x < size; x++) {
    const band = bandBase + (Math.random() < 0.5 ? 1 : 0);
    for (let y = 0; y < band; y++) {
      ctx.fillStyle = shade(BLOCK_TYPES.snow.color, (Math.random() - 0.5) * 10);
      ctx.fillRect(x0 + x, y0 + y, 1, 1);
    }
  }
}

function paintTorch(ctx, x0, y0, size) {
  paintSpeckle(ctx, x0, y0, size, 0x1a1410, 4);
  const stickW = Math.max(1, Math.round(size * 0.18));
  const stickX = x0 + Math.round(size * 0.5 - stickW / 2);
  for (let y = Math.round(size * 0.35); y < size; y++) {
    for (let x = 0; x < stickW; x++) {
      ctx.fillStyle = shade(BLOCK_TYPES.wood.color, (Math.random() - 0.5) * 10);
      ctx.fillRect(stickX + x, y0 + y, 1, 1);
    }
  }
  const cx = x0 + size / 2, cy = y0 + size * 0.28;
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size * 0.42; y++) {
      const d = Math.hypot(x0 + x - cx, y0 + y - cy);
      if (d < size * 0.2) {
        ctx.fillStyle = shade(0xffcc55, (Math.random() - 0.5) * 40);
        ctx.fillRect(x0 + x, y0 + y, 1, 1);
      } else if (d < size * 0.3) {
        ctx.fillStyle = shade(0xff5010, (Math.random() - 0.5) * 30);
        ctx.fillRect(x0 + x, y0 + y, 1, 1);
      }
    }
  }
}

export const TILE_PAINTERS = {
  grassTop:  (ctx, x, y, s) => paintSpeckle(ctx, x, y, s, BLOCK_TYPES.grass.color, 16),
  grassSide: (ctx, x, y, s) => paintGrassSide(ctx, x, y, s),
  dirt:      (ctx, x, y, s) => paintSpeckle(ctx, x, y, s, BLOCK_TYPES.dirt.color, 14),
  stone:     (ctx, x, y, s) => paintSpeckle(ctx, x, y, s, BLOCK_TYPES.stone.color, 18),
  woodTop:   (ctx, x, y, s) => paintWoodRings(ctx, x, y, s),
  woodSide:  (ctx, x, y, s) => paintWoodBark(ctx, x, y, s),
  leaves:    (ctx, x, y, s) => paintSpeckle(ctx, x, y, s, BLOCK_TYPES.leaves.color, 26),
  sand:      (ctx, x, y, s) => paintSpeckle(ctx, x, y, s, BLOCK_TYPES.sand.color, 10),
  snow:      (ctx, x, y, s) => paintSpeckle(ctx, x, y, s, BLOCK_TYPES.snow.color, 8),
  snowSide:  (ctx, x, y, s) => paintSnowSide(ctx, x, y, s),
  water:     (ctx, x, y, s) => paintSpeckle(ctx, x, y, s, BLOCK_TYPES.water.color, 12),
  torch:     (ctx, x, y, s) => paintTorch(ctx, x, y, s),
  obsidian: (ctx, x0, y0, size) => {
    const PIXELS = Array.from({ length: 16 }, () => Array(16).fill('#2b2b2b'));
    const scale = size / 16;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        ctx.fillStyle = PIXELS[y][x];
        ctx.fillRect(x0 + x * scale, y0 + y * scale, scale, scale);
      }
    }
  }
};