import { BLOCK_TYPES } from './blocks.js';
import { blockIconURL } from './atlas.js';
import { getSelectedIndex, updateHotbarUI } from './hotbar.js';
import { HOTBAR } from './blocks.js';

const blockPickerEl = document.getElementById('blockPicker');
const pickerGridEl = document.getElementById('pickerGrid');
let pickerOpen = false;

export function isPickerOpen() { return pickerOpen; }

export function initBlockPicker(canvas) {
  Object.keys(BLOCK_TYPES).forEach((type) => {
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
}

export function openPicker() {
  pickerOpen = true;
  blockPickerEl.style.display = 'flex';
  document.exitPointerLock();
}

export function closePicker(canvas) {
  pickerOpen = false;
  blockPickerEl.style.display = 'none';
  canvas.requestPointerLock();
}
