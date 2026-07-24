// ---------- Block definitions ----------
// THE file to edit when adding a new block type or changing its look.
//
// BLOCK_TYPES: one entry per block. `color` is used for particles/item-drop
// cubes (not textured -- too small to matter) and as the base hue for
// procedural tile art. `faces` says which tile (see TILE_PAINTERS below)
// goes on which cube face: `all` = same tile every face, otherwise give
// top / bottom / side.
export const BLOCK_TYPES = {
  grass: { color: 0x5aa93b, faces: { top: 'grassTop', side: 'grassSide', bottom: 'dirt' } },
  dirt:  { color: 0x8a5a34, faces: { all: 'dirt' } },
  stone: { color: 0x8a8a8e, faces: { all: 'stone' } },
  wood:  { color: 0x6b4423, faces: { top: 'woodTop', side: 'woodSide', bottom: 'woodTop' } },
  leaves:{ color: 0x2f8f4e, faces: { all: 'leaves' } },
  obsidian:{color:0x2b2b2b, faces: { all: 'obsidian'} },
  sand:  { color: 0xe0d29a, faces: { all: 'sand' } },
  snow:  { color: 0xf5f9ff, faces: { top: 'snow', side: 'snowSide', bottom: 'stone' } },
  water: { color: 0x3a6fd8, faces: { all: 'water' } }
};

// 9 hotbar slots, all empty by default. In survival, slots are filled by
// opening the block picker (B) and choosing from blocks you've actually
// collected -- see blockPicker.js. Creative mode still lets any slot be
// set to any block type, since there's no inventory to draw from there.
export const HOTBAR = [null, null, null, null, null, null, null, null, null];

// ---------- Tile art ----------
// Small drawing helpers used to paint each 16x16 tile. Add a new one here
// if a block needs a genuinely custom pattern -- most blocks can just reuse
// paintSpeckle with a different color. (The standalone tile-editor tool
// exports code in this exact shape for hand-drawn art.)

function shade(hex, amt) {
  let r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  r = Math.max(0, Math.min(255, Math.round(r + amt)));
  g = Math.max(0, Math.min(255, Math.round(g + amt)));
  b = Math.max(0, Math.min(255, Math.round(b + amt)));
  return `rgb(${r},${g},${b})`;
}

// generic noisy fill -- the default pattern for most block types
function paintSpeckle(ctx, x0, y0, size, baseHex, variance) {
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      const amt = (Math.random() - 0.5) * variance * 2;
      ctx.fillStyle = shade(baseHex, amt);
      ctx.fillRect(x0 + x, y0 + y, 1, 1);
    }
  }
}

// dirt base with a jagged green fringe along the top -- grass block sides
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

// concentric rings -- cut-log face, wood top/bottom
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

// vertical bark stripes -- wood trunk sides
function paintWoodBark(ctx, x0, y0, size) {
  for (let x = 0; x < size; x++) {
    const stripe = Math.sin(x * 1.3) * 14;
    for (let y = 0; y < size; y++) {
      ctx.fillStyle = shade(BLOCK_TYPES.wood.color, stripe + (Math.random() - 0.5) * 8);
      ctx.fillRect(x0 + x, y0 + y, 1, 1);
    }
  }
}

// stone base with a jagged white cap along the top -- snow block sides
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

// ---- tile registry: tile name -> paint function ----
// extend this when adding new block art.
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
  // paste into TILE_PAINTERS = { ... }
    obsidian: (ctx, x0, y0, size) => {
    const PIXELS = [
        ["#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b"],
        ["#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b"],
        ["#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b"],
        ["#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b"],
        ["#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b"],
        ["#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b"],
        ["#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b"],
        ["#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b"],
        ["#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b"],
        ["#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b"],
        ["#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b"],
        ["#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b"],
        ["#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b"],
        ["#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b"],
        ["#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b"],
        ["#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b","#2b2b2b"]
    ];
    const scale = size / 16;
    for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
        const c = PIXELS[y][x];
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect(x0 + x * scale, y0 + y * scale, scale, scale);
        }
    }
    },

// and register the block type itself, e.g.:
// obsidianBlock: { color: 0x888888, faces: { all: 'obsidian' } }
};