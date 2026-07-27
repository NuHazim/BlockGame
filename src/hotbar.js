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

export function updateHotbarUI() {
  const slotEls = hotbarEl.querySelectorAll('.slot');
  slotEls.forEach((slot, i) => {
    const type = HOTBAR[i];
    const iconUrl = type ? (isWeapon(type) ? weaponIconURL(type) : blockIconURL(type)) : '';
    slot.querySelector('.swatch').style.backgroundImage = iconUrl ? `url(${iconUrl})` : '';
    slot.querySelector('.count').textContent = (type && !isCreative() && !isWeapon(type)) ? inventory[type] : '';
  });
}