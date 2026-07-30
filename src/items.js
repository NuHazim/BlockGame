import { BLOCK_TYPES } from './blocks.js';
import { WEAPON_TYPES } from './weapons.js';
import { MATERIAL_TYPES } from './materials.js';

// single place to resolve a display name for any placeable/holdable/
// craftable-only type -- used by the hotbar, block picker, and crafting
// UI's tooltips/recipe book
export function itemLabel(type) {
  if (!type) return '';
  if (WEAPON_TYPES[type]) return WEAPON_TYPES[type].label;
  if (MATERIAL_TYPES[type]) return MATERIAL_TYPES[type].label;
  if (BLOCK_TYPES[type]) return BLOCK_TYPES[type].label || type;
  return type;
}