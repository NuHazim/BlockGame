import { HOTBAR } from './blocks.js';
import { blockIconURL } from './atlas.js';
import { isWeapon, weaponIconURL } from './weapons.js';
import { itemLabel } from './items.js';
import { inventory, isCreative } from './inventory.js';

let selectedIndex = 0;
export function getSelectedIndex() { return selectedIndex; }

const hotbarEl = document.getElementById('hotbar');
const tooltipEl = document.getElementById('itemTooltip');

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

export function initHotbar() {
  HOTBAR.forEach((type, i) => {
    const slot = document.createElement('div');
    slot.className = 'slot' + (i === 0 ? ' active' : '');
    slot.innerHTML = `<span class="num">${i + 1}</span><div class="swatch"></div><span class="count"></span>`;
    slot.addEventListener('click', () => selectSlot(i));
    slot.addEventListener('mouseenter', () => {
      const t = HOTBAR[i];
      if (t) showTooltip(itemLabel(t), slot);
    });
    slot.addEventListener('mouseleave', hideTooltip);
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

// Called when a block/item is picked up (see effects.js's updateDrops).
// If that type is already sitting in a hotbar slot, its count badge just
// updates on its own -- nothing to do here. Otherwise, drop it into the
// first empty slot so it shows up immediately without opening the picker.
// If every slot is full, it silently stays inventory-only (still pickable
// via the block picker) -- never bumps something already equipped.
export function autoAssignPickup(type) {
  if (HOTBAR.includes(type)) return;
  const emptyIndex = HOTBAR.indexOf(null);
  if (emptyIndex !== -1) {
    HOTBAR[emptyIndex] = type;
  }
}

export function updateHotbarUI() {
  const slotEls = hotbarEl.querySelectorAll('.slot');
  slotEls.forEach((slot, i) => {
    const type = HOTBAR[i];
    const iconUrl = type ? (isWeapon(type) ? weaponIconURL(type) : blockIconURL(type)) : '';
    slot.querySelector('.swatch').style.backgroundImage = iconUrl ? `url(${iconUrl})` : '';
    slot.querySelector('.count').textContent = (type && !isCreative() && !isWeapon(type)) ? inventory[type] : '';
  });
}