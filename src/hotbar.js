import { HOTBAR } from './blocks.js';
import { blockIconURL } from './atlas.js';
import { inventory, isCreative } from './inventory.js';

let selectedIndex = 0;
export function getSelectedIndex() { return selectedIndex; }

const hotbarEl = document.getElementById('hotbar');

export function initHotbar() {
  HOTBAR.forEach((type, i) => {
    const slot = document.createElement('div');
    slot.className = 'slot' + (i === 0 ? ' active' : '');
    slot.innerHTML = `<span class="num">${i + 1}</span><div class="swatch" style="background-image:url(${blockIconURL(type)})"></div><span class="count"></span>`;
    slot.addEventListener('click', () => selectSlot(i));
    hotbarEl.appendChild(slot);
  });
  updateHotbarUI();
}

export function selectSlot(i) {
  selectedIndex = i;
  document.querySelectorAll('.slot').forEach((el, idx) => el.classList.toggle('active', idx === i));
}

export function scrollSlot(dir) {
  selectSlot((selectedIndex + dir + HOTBAR.length) % HOTBAR.length);
}

// refresh swatches + count badges -- call whenever HOTBAR assignment,
// inventory counts, or creative mode changes (not every frame)
export function updateHotbarUI() {
  const slotEls = hotbarEl.querySelectorAll('.slot');
  slotEls.forEach((slot, i) => {
    const type = HOTBAR[i];
    slot.querySelector('.swatch').style.backgroundImage = `url(${blockIconURL(type)})`;
    slot.querySelector('.count').textContent = isCreative() ? '' : inventory[type];
  });
}
