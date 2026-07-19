import { BLOCK_TYPES } from './blocks.js';

// per-type owned quantity, only consulted when creative is off
export const inventory = {};
for (const t in BLOCK_TYPES) inventory[t] = 0;

let creative = true; // default ON so the game is fun to test immediately

export function isCreative() { return creative; }
export function setCreative(on) { creative = on; }
