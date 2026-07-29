import { isPickerOpen } from './blockPicker.js';
import { isCraftingOpen } from './crafting.js';

const overlay = document.getElementById('overlay');
const menuButtons = document.getElementById('menuButtons');
const controlsPanel = document.getElementById('controlsPanel');
const menuTitle = document.getElementById('menuTitle');
const menuSubtitle = document.getElementById('menuSubtitle');
const btnResume = document.getElementById('btnResume');
const btnCreativeEl = document.getElementById('btnCreative');
const modeLabelEl = document.getElementById('modeLabel');

let hasStarted = false; // false until first play; controls first-load copy
export function getHasStarted() { return hasStarted; }

function showControls(show) {
  controlsPanel.style.display = show ? 'flex' : 'none';
  menuButtons.style.display = show ? 'none' : 'flex';
}

export function play(canvas) {
  showControls(false);
  canvas.requestPointerLock();
}

export function initMenu(canvas, { onRegenerate, onToggleCreative }) {
  btnResume.addEventListener('click', () => play(canvas));
  document.getElementById('btnControls').addEventListener('click', () => showControls(true));
  document.getElementById('btnBack').addEventListener('click', () => showControls(false));
  document.getElementById('btnRegen').addEventListener('click', () => {
    onRegenerate();
    play(canvas);
  });
  btnCreativeEl.addEventListener('click', () => onToggleCreative());

  document.addEventListener('pointerlockchange', () => {
    if (isPickerOpen() || isCraftingOpen()) return; // those manage their own overlays; don't pop pause menu
    const locked = document.pointerLockElement === canvas;
    overlay.style.display = locked ? 'none' : 'flex';
    if (!locked) {
      showControls(false);
      if (hasStarted) {
        menuTitle.textContent = 'Paused';
        menuSubtitle.textContent = 'Press Play or Esc to resume';
        btnResume.textContent = 'Resume';
      }
    } else {
      hasStarted = true;
    }
  });
}

export function updateModeLabel(creative) {
  modeLabelEl.textContent = creative ? 'Creative' : 'Survival';
}

export function updateModeButtonLabel(creative) {
  btnCreativeEl.textContent = 'Mode: ' + (creative ? 'Creative' : 'Survival');
}