// ---------- Non-placeable crafting materials ----------
// Sticks (and future items like this) aren't blocks (can't be placed) and
// aren't weapons (can't be equipped/swung) -- they only exist to sit in the
// inventory and get consumed as crafting ingredients. Kept in their own
// registry so blockPicker/hotbar (which only know about BLOCK_TYPES and
// WEAPON_TYPES) don't accidentally try to make them equippable.
export const MATERIAL_TYPES = {
  stick: { label: 'Stick', color: '#a9855c' }
};

export function isMaterial(type) {
  return !!MATERIAL_TYPES[type];
}

const iconCache = {};
export function materialIconURL(type) {
  if (iconCache[type]) return iconCache[type];
  const m = MATERIAL_TYPES[type];
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  ctx.save();
  ctx.translate(16, 16);
  ctx.rotate(-Math.PI / 5);
  ctx.fillStyle = m.color;
  ctx.fillRect(-3, -13, 6, 26);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(-3, -13, 2, 26);
  ctx.restore();
  iconCache[type] = c.toDataURL();
  return iconCache[type];
}