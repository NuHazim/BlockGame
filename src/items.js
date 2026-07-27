import { BLOCK_TYPES } from './blocks.js';
import { WEAPON_TYPES } from './weapons.js';

// single place to resolve a display name for any placeable/holdable type --
// used by the hotbar and block picker hover tooltips
export function itemLabel(type) {
  if (!type) return '';
  if (WEAPON_TYPES[type]) return WEAPON_TYPES[type].label;
  if (BLOCK_TYPES[type]) return BLOCK_TYPES[type].label || type;
  return type;
}