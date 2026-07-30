// ---------- Weapons & tools ----------
// Separate registry from BLOCK_TYPES since these aren't placeable -- they
// live in hotbar slots like blocks (equipped via the block picker) but deal
// damage to mobs on left-click instead of mining/placing. Three material
// tiers (wood/stone/obsidian) mirror the block types those tiers are
// crafted from -- see crafting.js's TOOL_TIERS/TOOL_SHAPES for the recipes.
// Note: only damage/reach differ between tools right now -- there's no
// mining-speed system in this engine, so a pickaxe doesn't mine faster
// than bare hands, it just hits harder/differently than a sword in a fight.
export const WEAPON_TYPES = {
  // ---------- Wood tier ----------
  woodSword:   { label: 'Wood Sword',   damage: 15, reach: 4.5, color: '#8a5a34', blade: '#c9c9c9' },
  woodSpear:   { label: 'Wood Spear',   damage: 12, reach: 5.5, color: '#8a5a34', blade: '#c9c9c9' },
  woodAxe:     { label: 'Wood Axe',     damage: 13, reach: 4.2, color: '#8a5a34', blade: '#c9c9c9' },
  woodHoe:     { label: 'Wood Hoe',     damage: 5,  reach: 4.0, color: '#8a5a34', blade: '#c9c9c9' },
  woodPickaxe: { label: 'Wood Pickaxe', damage: 9,  reach: 4.0, color: '#8a5a34', blade: '#c9c9c9' },
  woodShield:  { label: 'Wood Shield',  damage: 4,  reach: 3.0, color: '#8a5a34', blade: '#c9c9c9' },

  // ---------- Stone tier ----------
  stoneSword:   { label: 'Stone Sword',   damage: 25, reach: 4.5, color: '#8a8a8e', blade: '#e8e8e8' },
  stoneSpear:   { label: 'Stone Spear',   damage: 20, reach: 5.5, color: '#8a8a8e', blade: '#e8e8e8' },
  stoneAxe:     { label: 'Stone Axe',     damage: 22, reach: 4.2, color: '#8a8a8e', blade: '#e8e8e8' },
  stoneHoe:     { label: 'Stone Hoe',     damage: 8,  reach: 4.0, color: '#8a8a8e', blade: '#e8e8e8' },
  stonePickaxe: { label: 'Stone Pickaxe', damage: 15, reach: 4.0, color: '#8a8a8e', blade: '#e8e8e8' },
  stoneShield:  { label: 'Stone Shield',  damage: 6,  reach: 3.0, color: '#8a8a8e', blade: '#e8e8e8' },

  // ---------- Obsidian tier ----------
  obsidianSword:   { label: 'Obsidian Sword',   damage: 38, reach: 4.7, color: '#2b2b2b', blade: '#b98aff' },
  obsidianSpear:   { label: 'Obsidian Spear',   damage: 30, reach: 5.8, color: '#2b2b2b', blade: '#b98aff' },
  obsidianAxe:     { label: 'Obsidian Axe',     damage: 34, reach: 4.4, color: '#2b2b2b', blade: '#b98aff' },
  obsidianHoe:     { label: 'Obsidian Hoe',     damage: 12, reach: 4.0, color: '#2b2b2b', blade: '#b98aff' },
  obsidianPickaxe: { label: 'Obsidian Pickaxe', damage: 22, reach: 4.2, color: '#2b2b2b', blade: '#b98aff' },
  obsidianShield:  { label: 'Obsidian Shield',  damage: 9,  reach: 3.0, color: '#2b2b2b', blade: '#b98aff' }
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