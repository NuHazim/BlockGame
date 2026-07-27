// ---------- Weapons ----------
// Separate registry from BLOCK_TYPES since weapons aren't placeable -- they
// live in hotbar slots like blocks (equipped via the block picker) but deal
// damage to mobs on left-click instead of mining/placing.
export const WEAPON_TYPES = {
  woodSword:  { label: 'Wood Sword',  damage: 15, reach: 4.5, color: '#8a5a34', blade: '#c9c9c9' },
  stoneSword: { label: 'Stone Sword', damage: 25, reach: 4.5, color: '#8a8a8e', blade: '#e8e8e8' }
};

export function isWeapon(type) {
  return !!WEAPON_TYPES[type];
}

// small drawn sword icon for the hotbar/picker -- no atlas dependency needed
const iconCache = {};
export function weaponIconURL(type) {
  if (iconCache[type]) return iconCache[type];
  const w = WEAPON_TYPES[type];
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  ctx.fillStyle = w.blade;
  ctx.fillRect(14, 2, 4, 18);
  ctx.fillStyle = w.color;
  ctx.fillRect(9, 20, 14, 3);
  ctx.fillRect(14, 22, 4, 8);
  iconCache[type] = c.toDataURL();
  return iconCache[type];
}