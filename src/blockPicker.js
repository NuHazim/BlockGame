import { BLOCK_TYPES, HOTBAR } from './blocks.js';
import { blockIconURL } from './atlas.js';
import { WEAPON_TYPES, weaponIconURL } from './weapons.js';
import { itemLabel } from './items.js';
import { getSelectedIndex, updateHotbarUI } from './hotbar.js';
import { inventory, isCreative } from './inventory.js';

const blockPickerEl = document.getElementById('blockPicker');
const pickerGridEl = document.getElementById('pickerGrid');
const tooltipEl = document.getElementById('itemTooltip');
let pickerOpen = false;

export function isPickerOpen() { return pickerOpen; }

function showTooltip(text, anchorEl) {
  if (!text || !tooltipEl) return;
  tooltipEl.textContent = text;
  const rect = anchorEl.getBoundingClientRect();
  tooltipEl.style.left = (rect.left + rect.width / 2) + 'px';
  tooltipEl.style.top = rect.top + 'px';
  tooltipEl.style.display = 'block';
}
function hideTooltip() {
  if (tooltipEl) tooltipEl.style.display = 'none';
}

function addCell(iconUrl, type, canvas) {
  const cell = document.createElement('div');
  cell.className = 'picker-cell';
  cell.innerHTML = `<div class="swatch" style="background-image:url(${iconUrl})"></div>`;
  cell.addEventListener('click', () => {
    HOTBAR[getSelectedIndex()] = type;
    updateHotbarUI();
    closePicker(canvas);
  });
  cell.addEventListener('mouseenter', () => showTooltip(itemLabel(type), cell));
  cell.addEventListener('mouseleave', hideTooltip);
  pickerGridEl.appendChild(cell);
}

// Rebuilds the grid each time the picker opens. Survival mode only offers
// block types AND weapons/tools currently sitting in the inventory
// (count > 0) -- with 18 crafted weapon/tool variants now existing,
// letting them all be picked for free regardless of whether you've
// actually crafted one would make the whole crafting tier system
// pointless, so weapons are gated the same way blocks already were.
function renderPickerGrid(canvas) {
  pickerGridEl.innerHTML = '';
  Object.keys(BLOCK_TYPES).forEach((type) => {
    if (!isCreative() && inventory[type] <= 0) return;
    addCell(blockIconURL(type), type, canvas);
  });
  Object.keys(WEAPON_TYPES).forEach((type) => {
    if (!isCreative() && (inventory[type] || 0) <= 0) return;
    addCell(weaponIconURL(type), type, canvas);
  });
  if (pickerGridEl.children.length === 0) {
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
  renderPickerGrid(canvas);
  pickerOpen = true;
  blockPickerEl.style.display = 'flex';
  document.exitPointerLock();
}

export function closePicker(canvas) {
  pickerOpen = false;
  blockPickerEl.style.display = 'none';
  hideTooltip();
  canvas.requestPointerLock();
}