import { BLOCK_TYPES } from './blocks.js';
import { blockIconURL } from './atlas.js';
import { isWeapon, weaponIconURL } from './weapons.js';
import { inventory, isCreative } from './inventory.js';
import { autoAssignPickup, updateHotbarUI } from './hotbar.js';

// ---------- Recipes ----------
// Kept intentionally simple per design: every ingredient is an EXISTING
// block/weapon type (no new intermediate items like planks/sticks). Each
// grid cell holds at most one unit of a type -- that's enough to express
// every recipe here as either a literal shape (shaped) or a flat count
// (shapeless), same distinction Minecraft itself uses.
//
// Shaped recipes are matched against the crafting grid's trimmed bounding
// box (see trim() below), so the shape can be placed ANYWHERE within the
// grid -- top-left, bottom-right, whichever column, etc -- exactly like
// vanilla Minecraft's recipe matching.
export const RECIPES = [
  // 2x2 block of wood -> a placeable crafting table. Craftable in the
  // personal 2x2 grid, which is the deliberate bootstrap: you need this
  // recipe to make the table that unlocks the bigger 3x3 recipes.
  { id: 'craftingTable', rows: 2, cols: 2, pattern: ['wood', 'wood', 'wood', 'wood'],
    output: { type: 'craftingTable', count: 1 } },

  // shapeless -- a single wood block anywhere in the grid
  { id: 'torch', shapeless: true, ingredients: { wood: 1 },
    output: { type: 'torch', count: 4 } },

  // 2 wood stacked vertically (1 column, 2 rows)
  { id: 'woodSword', rows: 2, cols: 1, pattern: ['wood', 'wood'],
    output: { type: 'woodSword', count: 1 } },

  // 2 stone stacked vertically
  { id: 'stoneSword', rows: 2, cols: 1, pattern: ['stone', 'stone'],
    output: { type: 'stoneSword', count: 1 } },

  // full 3x3 of stone -- physically can't fit in the 2x2 personal grid, so
  // this is naturally table-only without needing a separate flag
  { id: 'obsidian', rows: 3, cols: 3,
    pattern: ['stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone'],
    output: { type: 'obsidian', count: 1 } }
];

// Crops a flat rows*cols grid down to the smallest bounding box containing
// any filled cell, so a shape can be recognized no matter where in the
// grid it was placed. Returns null if the grid is entirely empty.
function trim(grid, rows, cols) {
  let minR = rows, maxR = -1, minC = cols, maxC = -1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r * cols + c]) {
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }
  }
  if (maxR === -1) return null;
  const outRows = maxR - minR + 1, outCols = maxC - minC + 1;
  const pattern = [];
  for (let r = 0; r < outRows; r++) {
    for (let c = 0; c < outCols; c++) {
      pattern.push(grid[(minR + r) * cols + (minC + c)]);
    }
  }
  return { pattern, rows: outRows, cols: outCols };
}

export function matchRecipe(grid, rows, cols) {
  const trimmed = trim(grid, rows, cols);
  if (!trimmed) return null;

  for (const recipe of RECIPES) {
    if (recipe.shapeless) {
      const counts = {};
      for (const cell of trimmed.pattern) {
        if (!cell) continue;
        counts[cell] = (counts[cell] || 0) + 1;
      }
      const needKeys = Object.keys(recipe.ingredients);
      const gotKeys = Object.keys(counts);
      if (needKeys.length !== gotKeys.length) continue;
      let ok = true;
      for (const k of needKeys) {
        if (counts[k] !== recipe.ingredients[k]) { ok = false; break; }
      }
      if (ok) return recipe;
    } else {
      if (trimmed.rows !== recipe.rows || trimmed.cols !== recipe.cols) continue;
      let ok = true;
      for (let i = 0; i < trimmed.pattern.length; i++) {
        if (trimmed.pattern[i] !== recipe.pattern[i]) { ok = false; break; }
      }
      if (ok) return recipe;
    }
  }
  return null;
}

function itemIconURL(type) {
  return isWeapon(type) ? weaponIconURL(type) : blockIconURL(type);
}

// Builds one crafting UI instance (shared logic for the personal 2x2 grid
// and the 3x3 table grid -- only the DOM refs/dimensions differ).
//
// Interaction model: click a material in the palette to "arm" it, then
// click an empty grid cell to place it there (click again elsewhere to
// keep placing, or click the armed item again to unarm). Click a FILLED
// grid cell to return that item to your inventory. Click the output slot
// to craft -- this consumes the whole grid at once (every cell only ever
// holds 1 unit, so a single craft always uses up exactly what's placed).
function createCraftUI({ overlayEl, gridEl, outputEl, paletteEl, rows, cols }) {
  const size = rows * cols;
  let grid = new Array(size).fill(null);
  let armedType = null;
  let open = false;

  function renderPalette() {
    paletteEl.innerHTML = '';
    Object.keys(BLOCK_TYPES).forEach((type) => {
      const owned = inventory[type] || 0;
      if (!isCreative() && owned <= 0) return;
      const cell = document.createElement('div');
      cell.className = 'palette-cell' + (armedType === type ? ' armed' : '');
      cell.innerHTML =
        `<div class="swatch" style="background-image:url(${blockIconURL(type)})"></div>` +
        (isCreative() ? '' : `<span class="count">${owned}</span>`);
      cell.addEventListener('click', () => {
        armedType = armedType === type ? null : type;
        renderPalette();
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

  function renderGrid() {
    gridEl.innerHTML = '';
    gridEl.style.gridTemplateColumns = `repeat(${cols}, 56px)`;
    for (let i = 0; i < size; i++) {
      const type = grid[i];
      const cell = document.createElement('div');
      cell.className = 'craft-cell';
      if (type) {
        cell.innerHTML = `<div class="swatch" style="background-image:url(${blockIconURL(type)})"></div>`;
      }
      cell.addEventListener('click', () => {
        if (grid[i]) {
          if (!isCreative()) inventory[grid[i]] = (inventory[grid[i]] || 0) + 1;
          grid[i] = null;
        } else if (armedType) {
          if (!isCreative()) {
            if ((inventory[armedType] || 0) <= 0) return;
            inventory[armedType]--;
          }
          grid[i] = armedType;
        } else {
          return;
        }
        renderGrid();
        renderPalette();
        updateOutput();
        updateHotbarUI();
      });
      gridEl.appendChild(cell);
    }
  }

  function updateOutput() {
    const recipe = matchRecipe(grid, rows, cols);
    outputEl.classList.toggle('has-result', !!recipe);
    outputEl.innerHTML = recipe
      ? `<div class="swatch" style="background-image:url(${itemIconURL(recipe.output.type)})"></div><span class="out-count">${recipe.output.count}</span>`
      : '';
  }

  outputEl.addEventListener('click', () => {
    const recipe = matchRecipe(grid, rows, cols);
    if (!recipe) return;
    grid.fill(null); // a single craft always consumes the whole grid -- see the note above
    inventory[recipe.output.type] = (inventory[recipe.output.type] || 0) + recipe.output.count;
    autoAssignPickup(recipe.output.type);
    renderGrid();
    renderPalette();
    updateOutput();
    updateHotbarUI();
  });

  return {
    isOpen: () => open,
    open(canvas) {
      open = true;
      armedType = null;
      renderPalette();
      renderGrid();
      updateOutput();
      overlayEl.style.display = 'flex';
      document.exitPointerLock();
    },
    close(canvas) {
      open = false;
      // anything still sitting in the grid pops back into the inventory,
      // same as closing a crafting screen in Minecraft
      if (!isCreative()) {
        for (const type of grid) if (type) inventory[type] = (inventory[type] || 0) + 1;
      }
      grid.fill(null);
      armedType = null;
      overlayEl.style.display = 'none';
      updateHotbarUI();
      canvas.requestPointerLock();
    }
  };
}

let personalUI = null;
let tableUI = null;

export function initCrafting() {
  personalUI = createCraftUI({
    overlayEl: document.getElementById('craftingOverlay'),
    gridEl: document.getElementById('craftGridPersonal'),
    outputEl: document.getElementById('craftOutputPersonal'),
    paletteEl: document.getElementById('craftPalettePersonal'),
    rows: 2, cols: 2
  });
  tableUI = createCraftUI({
    overlayEl: document.getElementById('craftingTableOverlay'),
    gridEl: document.getElementById('craftGridTable'),
    outputEl: document.getElementById('craftOutputTable'),
    paletteEl: document.getElementById('craftPaletteTable'),
    rows: 3, cols: 3
  });
}

// E key -- toggles the personal 2x2 grid. Ignored while the table is open
// (Esc closes that one).
export function toggleCraftMenu(canvas) {
  if (tableUI.isOpen()) return;
  if (personalUI.isOpen()) personalUI.close(canvas);
  else if (document.pointerLockElement === canvas) personalUI.open(canvas);
}

// Right-click on a placed crafting table block -- opens the 3x3 grid.
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