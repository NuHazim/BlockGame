import { BLOCK_TYPES } from './blocks.js';
import { blockIconURL } from './atlas.js';
import { getSelectedIndex, updateHotbarUI } from './hotbar.js';
import { HOTBAR } from './blocks.js';
import { inventory, isCreative } from './inventory.js';

const blockPickerEl = document.getElementById('blockPicker');
const pickerGridEl = document.getElementById('pickerGrid');
let pickerOpen = false;

export function isPickerOpen() { return pickerOpen; }

// Rebuilds the grid each time the picker opens. Survival mode only offers
// block types currently sitting in the inventory (count > 0) -- this is
// how a mined block gets "equipped" into a hotbar slot. Creative has no
// inventory to draw from, so it keeps showing every block type.
function renderPickerGrid(canvas) {
  pickerGridEl.innerHTML = '';
  Object.keys(BLOCK_TYPES).forEach((type) => {
    if (!isCreative() && inventory[type] <= 0) return;
    const cell = document.createElement('div');
    cell.className = 'picker-cell';
    cell.innerHTML = `<div class="swatch" style="background-image:url(${blockIconURL(type)})"></div>`;
    cell.addEventListener('click', () => {
      HOTBAR[getSelectedIndex()] = type;
      updateHotbarUI();
      closePicker(canvas);
    });
    pickerGridEl.appendChild(cell);
  });
  if (!isCreative() && pickerGridEl.children.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.style.gridColumn = '1 / -1';
    empty.textContent = "You haven't collected any blocks yet — go mine something!";
    pickerGridEl.appendChild(empty);
  }
}

export function initBlockPicker(canvas) {
  renderPickerGrid(canvas);
}

export function openPicker(canvas) {
  renderPickerGrid(canvas); // rebuild every open -- inventory/mode may have changed since last time
  pickerOpen = true;
  blockPickerEl.style.display = 'flex';
  document.exitPointerLock();
}

export function closePicker(canvas) {
  pickerOpen = false;
  blockPickerEl.style.display = 'none';
  canvas.requestPointerLock();
}