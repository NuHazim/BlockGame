import { BLOCK_TYPES } from './blocks.js';
import { blockIconURL } from './atlas.js';
import { isWeapon, weaponIconURL } from './weapons.js';
import { MATERIAL_TYPES, materialIconURL } from './materials.js';
import { itemLabel } from './items.js';
import { inventory, isCreative } from './inventory.js';
import { autoAssignPickup, updateHotbarUI } from './hotbar.js';
// ---------- Recipes ----------
// Base recipes: crafting table, sticks, torches, and obsidian (all use
// only raw block types + sticks -- no other new intermediate items).
const BASE_RECIPES = [
  { id: 'craftingTable', rows: 2, cols: 2, pattern: ['wood', 'wood', 'wood', 'wood'],
    output: { type: 'craftingTable', count: 1 } },

  // 2 wood stacked vertically -> 4 sticks (stands in for Minecraft's
  // plank-based stick recipe, using the raw wood block directly)
  { id: 'stick', rows: 2, cols: 1, pattern: ['wood', 'wood'],
    output: { type: 'stick', count: 4 } },

  // torches are now "lit sticks" rather than needing coal we don't have
  { id: 'torch', shapeless: true, ingredients: { stick: 1 },
    output: { type: 'torch', count: 4 } },

  { id: 'obsidian', rows: 3, cols: 3,
    pattern: ['stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone'],
    output: { type: 'obsidian', count: 1 } }
];

// ---------- Tool/weapon tiers ----------
// Three material tiers (wood/stone/obsidian) x six tool shapes. Each
// shape's cells use 'MAT' as a placeholder swapped for the tier's block
// type below -- since the material cell differs per tier, wood/stone/
// obsidian versions of the same tool never collide with each other, and
// each tool's shape/dimensions are distinct enough that different tools
// never collide either. Sword/Axe/Hoe fit the personal 2x2 grid; Spear/
// Pickaxe/Shield need >2 rows or columns, so they're naturally table-only
// without needing a separate flag.
const TOOL_TIERS = ['wood', 'stone', 'obsidian'];
const TOOL_SHAPES = {
  Sword:   { rows: 2, cols: 1, cells: ['MAT', 'stick'] },
  Spear:   { rows: 3, cols: 1, cells: ['MAT', 'stick', 'stick'] },
  Axe:     { rows: 2, cols: 2, cells: ['MAT', 'MAT', 'MAT', 'stick'] },
  Hoe:     { rows: 2, cols: 2, cells: ['MAT', 'MAT', null, 'stick'] },
  Pickaxe: { rows: 2, cols: 3, cells: ['MAT', 'MAT', 'MAT', null, 'stick', null] },
  Shield:  { rows: 2, cols: 3, cells: ['MAT', 'MAT', 'MAT', 'MAT', 'stick', 'MAT'] }
};

const TOOL_RECIPES = [];
for (const tier of TOOL_TIERS) {
  for (const toolName in TOOL_SHAPES) {
    const shape = TOOL_SHAPES[toolName];
    TOOL_RECIPES.push({
      id: tier + toolName,
      rows: shape.rows,
      cols: shape.cols,
      pattern: shape.cells.map((c) => (c === 'MAT' ? tier : c)),
      output: { type: tier + toolName, count: 1 } // e.g. 'wood' + 'Sword' = 'woodSword', matching WEAPON_TYPES
    });
  }
}

export const RECIPES = [...BASE_RECIPES, ...TOOL_RECIPES];

const CREATIVE_STACK = 64; // stand-in "full stack" amount used for creative-mode pickups

// Matches the grid against RECIPES and, if found, also returns exactly how
// much to subtract from which grid indices to consume ONE craft -- shaped
// recipes consume 1 from each cell in the matched shape, shapeless recipes
// consume the required amount from whichever filled cells hold that type
// (first-found order). Returns null if nothing matches.
function evaluateGrid(grid, rows, cols) {
  const filled = [];
  for (let i = 0; i < grid.length; i++) if (grid[i] && grid[i].count > 0) filled.push(i);
  if (filled.length === 0) return null;

  let minR = rows, maxR = -1, minC = cols, maxC = -1;
  for (const i of filled) {
    const r = Math.floor(i / cols), c = i % cols;
    if (r < minR) minR = r; if (r > maxR) maxR = r;
    if (c < minC) minC = c; if (c > maxC) maxC = c;
  }
  const outRows = maxR - minR + 1, outCols = maxC - minC + 1;

  for (const recipe of RECIPES) {
    if (recipe.shapeless) {
      const totals = {};
      for (const i of filled) totals[grid[i].type] = (totals[grid[i].type] || 0) + grid[i].count;
      const needKeys = Object.keys(recipe.ingredients);
      const gotKeys = Object.keys(totals);
      if (needKeys.length !== gotKeys.length) continue;
      let ok = true;
      for (const k of needKeys) if (!totals[k] || totals[k] < recipe.ingredients[k]) { ok = false; break; }
      if (!ok) continue;

      const consume = new Map();
      for (const k of needKeys) {
        let remaining = recipe.ingredients[k];
        for (const i of filled) {
          if (remaining <= 0) break;
          if (grid[i].type !== k) continue;
          const take = Math.min(remaining, grid[i].count);
          consume.set(i, (consume.get(i) || 0) + take);
          remaining -= take;
        }
      }
      return { recipe, consume };
    } else {
      if (outRows !== recipe.rows || outCols !== recipe.cols) continue;
      let ok = true;
      const consume = new Map();
      outer:
      for (let r = 0; r < outRows; r++) {
        for (let c = 0; c < outCols; c++) {
          const gi = (minR + r) * cols + (minC + c);
          const want = recipe.pattern[r * outCols + c];
          const cell = grid[gi];
          if (want) {
            if (!cell || cell.type !== want || cell.count < 1) { ok = false; break outer; }
            consume.set(gi, 1);
          } else if (cell) {
            ok = false; break outer;
          }
        }
      }
      if (ok) return { recipe, consume };
    }
  }
  return null;
}

// Icon resolver shared by the palette, grid, cursor, and recipe book --
// routes to the right icon source depending on which registry the type
// belongs to (weapon/tool, non-placeable material, or placeable block).
function resolveIconURL(type) {
  if (isWeapon(type)) return weaponIconURL(type);
  if (MATERIAL_TYPES[type]) return materialIconURL(type);
  return blockIconURL(type);
}

// ---------- Shared cursor ----------
// A single held stack shared between the personal grid, the table grid,
// and both their palettes -- exactly like Minecraft's cursor stack
// persisting as you move between different crafting screens. Rendered as a
// small floating icon that tracks the mouse (see initCrafting).
let cursor = null; // { type, count } | null
let cursorEl = null;

function renderCursor() {
  if (!cursorEl) return;
  if (cursor && cursor.count > 0) {
    cursorEl.style.display = 'flex';
    cursorEl.innerHTML =
      `<div class="swatch" style="background-image:url(${resolveIconURL(cursor.type)})"></div>` +
      (cursor.count > 1 ? `<span class="count">${cursor.count}</span>` : '');
  } else {
    cursor = null;
    cursorEl.style.display = 'none';
  }
}

function returnCursorToInventory() {
  if (cursor && !isCreative()) {
    inventory[cursor.type] = (inventory[cursor.type] || 0) + cursor.count;
  }
  cursor = null;
  renderCursor();
}

// ---------- Recipe book (reference panel) ----------
function buildRecipePreview(recipe) {
  const wrap = document.createElement('div');
  wrap.className = 'recipe-row';

  const gridEl = document.createElement('div');
  gridEl.className = 'recipe-mini-grid';

  if (recipe.shapeless) {
    gridEl.style.gridTemplateColumns = `repeat(2, 34px)`;
    Object.entries(recipe.ingredients).forEach(([type, count]) => {
      const cell = document.createElement('div');
      cell.className = 'recipe-mini-cell';
      cell.innerHTML =
        `<div class="swatch" style="background-image:url(${resolveIconURL(type)})"></div>` +
        `<span class="count">${count}</span>`;
      gridEl.appendChild(cell);
    });
  } else {
    gridEl.style.gridTemplateColumns = `repeat(${recipe.cols}, 34px)`;
    recipe.pattern.forEach((type) => {
      const cell = document.createElement('div');
      cell.className = 'recipe-mini-cell';
      if (type) cell.innerHTML = `<div class="swatch" style="background-image:url(${resolveIconURL(type)})"></div>`;
      gridEl.appendChild(cell);
    });
  }

  const arrow = document.createElement('div');
  arrow.className = 'recipe-arrow';
  arrow.textContent = '\u2192';

  const outEl = document.createElement('div');
  outEl.className = 'recipe-mini-cell recipe-mini-output';
  outEl.innerHTML =
    `<div class="swatch" style="background-image:url(${resolveIconURL(recipe.output.type)})"></div>` +
    `<span class="count">${recipe.output.count}</span>`;

  const needsTable = recipe.rows > 2 || recipe.cols > 2;
  const label = document.createElement('span');
  label.className = 'recipe-label';
  label.textContent = itemLabel(recipe.output.type) + (needsTable ? ' (Table)' : '');

  wrap.appendChild(gridEl);
  wrap.appendChild(arrow);
  wrap.appendChild(outEl);
  wrap.appendChild(label);
  return wrap;
}

function renderRecipeBook(containerEl) {
  containerEl.innerHTML = '';
  for (const recipe of RECIPES) containerEl.appendChild(buildRecipePreview(recipe));
}

// Builds one crafting UI instance (shared logic for the personal 2x2 grid
// and the 3x3 table grid). Interaction matches vanilla Minecraft's grid:
//  - Left-click a slot: pick up its whole stack / place your held stack /
//    merge same-type stacks / swap different types.
//  - Left- or right-click a slot holding what your cursor already holds:
//    returns it straight back to your inventory (cancels the selection)
//    instead of stacking more on top -- this is what fixes the "clicking
//    the same material doubles it" bug.
//  - Right-click an empty/different slot: split half into your cursor, or
//    place one at a time from your cursor.
//  - Left-click the output: collects one craft into your cursor.
//  - Shift+left-click the output: crafts repeatedly straight into your
//    inventory until the grid can't supply another craft.
function createCraftUI({ overlayEl, gridEl, outputEl, paletteEl, closeEl, recipesBtnEl, recipesBookEl, rows, cols }) {
  const size = rows * cols;
  let grid = new Array(size).fill(null);
  let open = false;

  function ownedCount(type) {
    return isCreative() ? CREATIVE_STACK : (inventory[type] || 0);
  }

  function renderPalette() {
    paletteEl.innerHTML = '';
    const paletteTypes = [...Object.keys(BLOCK_TYPES), ...Object.keys(MATERIAL_TYPES)];
    paletteTypes.forEach((type) => {
      const owned = ownedCount(type);
      if (!isCreative() && owned <= 0) return;
      const cell = document.createElement('div');
      cell.className = 'palette-cell';
      cell.innerHTML =
        `<div class="swatch" style="background-image:url(${resolveIconURL(type)})"></div>` +
        (isCreative() ? '' : `<span class="count">${owned}</span>`);
      cell.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (e.button === 0) pickupFromPalette(type, false);
        else if (e.button === 2) pickupFromPalette(type, true);
        else return;
        refreshAll();
      });
      paletteEl.appendChild(cell);
    });
    if (paletteEl.children.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.style.gridColumn = '1 / -1';
      empty.textContent = "You don't have any materials yet -- go gather some.";
      paletteEl.appendChild(empty);
    }
  }

  // half=false -> pick up the full available amount; half=true -> half
  // (rounded up), matching Minecraft's left-click / right-click on an
  // inventory stack. Clicking the SAME material your cursor already holds
  // (either button) cancels the pickup and returns it to your inventory --
  // this is the explicit "click again to drop it" behavior.
  function pickupFromPalette(type, half) {
    if (cursor && cursor.type === type) {
      returnCursorToInventory();
      return;
    }
    const owned = ownedCount(type);
    if (owned <= 0) return;
    if (cursor) {
      if (half) return; // mismatched right-click grab -- no-op, same as vanilla
      returnCursorToInventory();
    }
    const take = half ? Math.ceil(owned / 2) : owned;
    if (!isCreative()) inventory[type] = (inventory[type] || 0) - take;
    cursor = { type, count: take };
  }

  function renderGrid() {
    gridEl.innerHTML = '';
    gridEl.style.gridTemplateColumns = `repeat(${cols}, 56px)`;
    for (let i = 0; i < size; i++) {
      const cell = grid[i];
      const el = document.createElement('div');
      el.className = 'craft-cell';
      if (cell) {
        el.innerHTML =
          `<div class="swatch" style="background-image:url(${resolveIconURL(cell.type)})"></div>` +
          (cell.count > 1 ? `<span class="count">${cell.count}</span>` : '');
      }
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (e.button === 0) leftClickGrid(i);
        else if (e.button === 2) rightClickGrid(i);
        else return;
        refreshAll();
      });
      gridEl.appendChild(el);
    }
  }

  function leftClickGrid(i) {
    const cell = grid[i];
    if (!cursor) {
      if (cell) { cursor = cell; grid[i] = null; }
      return;
    }
    if (!cell) {
      grid[i] = cursor;
      cursor = null;
    } else if (cell.type === cursor.type) {
      grid[i] = { type: cell.type, count: cell.count + cursor.count };
      cursor = null;
    } else {
      grid[i] = cursor;
      cursor = cell;
    }
  }

  function rightClickGrid(i) {
    const cell = grid[i];
    if (!cursor) {
      if (!cell) return;
      const half = Math.ceil(cell.count / 2);
      cursor = { type: cell.type, count: half };
      const remaining = cell.count - half;
      grid[i] = remaining > 0 ? { type: cell.type, count: remaining } : null;
      return;
    }
    if (cell && cell.type !== cursor.type) return; // mismatched -- no-op, same as vanilla
    grid[i] = cell ? { type: cell.type, count: cell.count + 1 } : { type: cursor.type, count: 1 };
    cursor.count--;
    if (cursor.count <= 0) cursor = null;
  }

  function updateOutput() {
    const result = evaluateGrid(grid, rows, cols);
    outputEl.classList.toggle('has-result', !!result);
    outputEl.innerHTML = result
      ? `<div class="swatch" style="background-image:url(${resolveIconURL(result.recipe.output.type)})"></div><span class="out-count">${result.recipe.output.count}</span>`
      : '';
  }

  function applyConsume(consume) {
    for (const [i, amount] of consume) {
      grid[i].count -= amount;
      if (grid[i].count <= 0) grid[i] = null;
    }
  }

  outputEl.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (e.button !== 0) return;

    if (e.shiftKey) {
      let guard = 256;
      while (guard-- > 0) {
        const result = evaluateGrid(grid, rows, cols);
        if (!result) break;
        applyConsume(result.consume);
        inventory[result.recipe.output.type] = (inventory[result.recipe.output.type] || 0) + result.recipe.output.count;
        autoAssignPickup(result.recipe.output.type);
      }
    } else {
      const result = evaluateGrid(grid, rows, cols);
      if (!result) return;
      if (cursor && cursor.type !== result.recipe.output.type) return;
      applyConsume(result.consume);
      cursor = cursor
        ? { type: cursor.type, count: cursor.count + result.recipe.output.count }
        : { type: result.recipe.output.type, count: result.recipe.output.count };
    }
    refreshAll();
  });

  if (recipesBtnEl && recipesBookEl) {
    recipesBtnEl.addEventListener('click', () => {
      const showing = recipesBookEl.style.display !== 'none';
      if (showing) {
        recipesBookEl.style.display = 'none';
      } else {
        renderRecipeBook(recipesBookEl);
        recipesBookEl.style.display = 'flex';
      }
    });
  }

  function refreshAll() {
    renderGrid();
    renderPalette();
    updateOutput();
    renderCursor();
    updateHotbarUI();
  }

  // Right-clicking anywhere inside this overlay should split/place-one
  // instead of popping the browser's context menu.
  overlayEl.addEventListener('contextmenu', (e) => e.preventDefault());

  const api = {
    isOpen: () => open,
    open(canvas) {
      open = true;
      refreshAll();
      overlayEl.style.display = 'flex';
      document.exitPointerLock();
    },
    close(canvas) {
      open = false;
      if (!isCreative()) {
        for (const cell of grid) if (cell) inventory[cell.type] = (inventory[cell.type] || 0) + cell.count;
      }
      grid.fill(null);
      returnCursorToInventory();
      if (recipesBookEl) recipesBookEl.style.display = 'none';
      overlayEl.style.display = 'none';
      updateHotbarUI();
      canvas.requestPointerLock();
    }
  };

  if (closeEl) closeEl.addEventListener('click', () => api.close(canvasRef));

  return api;
}

let personalUI = null;
let tableUI = null;
let canvasRef = null;

export function initCrafting(canvas) {
  canvasRef = canvas;

  personalUI = createCraftUI({
    overlayEl: document.getElementById('craftingOverlay'),
    gridEl: document.getElementById('craftGridPersonal'),
    outputEl: document.getElementById('craftOutputPersonal'),
    paletteEl: document.getElementById('craftPalettePersonal'),
    closeEl: document.getElementById('craftClosePersonal'),
    recipesBtnEl: document.getElementById('craftRecipesBtnPersonal'),
    recipesBookEl: document.getElementById('craftRecipeBookPersonal'),
    rows: 2, cols: 2
  });
  tableUI = createCraftUI({
    overlayEl: document.getElementById('craftingTableOverlay'),
    gridEl: document.getElementById('craftGridTable'),
    outputEl: document.getElementById('craftOutputTable'),
    paletteEl: document.getElementById('craftPaletteTable'),
    closeEl: document.getElementById('craftCloseTable'),
    recipesBtnEl: document.getElementById('craftRecipesBtnTable'),
    recipesBookEl: document.getElementById('craftRecipeBookTable'),
    rows: 3, cols: 3
  });

  cursorEl = document.getElementById('craftCursor');
  document.addEventListener('mousemove', (e) => {
    if (!cursorEl) return;
    cursorEl.style.left = e.clientX + 'px';
    cursorEl.style.top = e.clientY + 'px';
  });
}

export function toggleCraftMenu(canvas) {
  if (tableUI.isOpen()) return;
  if (personalUI.isOpen()) personalUI.close(canvas);
  else if (document.pointerLockElement === canvas) personalUI.open(canvas);
}

export function openTableCraft(canvas) {
  if (personalUI.isOpen()) personalUI.close(canvas);
  tableUI.open(canvas);
}

export function isCraftingOpen() {
  return (personalUI && personalUI.isOpen()) || (tableUI && tableUI.isOpen());
}

export function closeCraftingIfOpen(canvas) {
  if (personalUI && personalUI.isOpen()) personalUI.close(canvas);
  if (tableUI && tableUI.isOpen()) tableUI.close(canvas);
}