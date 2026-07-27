import { MAX_HEALTH, FALL_DAMAGE_THRESHOLD, FALL_DAMAGE_SCALE, HEALTH_REGEN_RATE } from './config.js';
import { player, placePlayerStart } from './player.js';
import { isCreative } from './inventory.js';

const healthBarEl = document.getElementById('healthBar');
const healthFillEl = document.getElementById('healthFill');
const damageFlashEl = document.getElementById('damageFlash');

export function updateHealthUI() {
  healthBarEl.style.display = isCreative() ? 'none' : 'block';
  if (!isCreative()) {
    healthFillEl.style.width = Math.max(0, player.health / MAX_HEALTH) * 100 + '%';
  }
}

function flashDamage() {
  damageFlashEl.classList.remove('hit');
  void damageFlashEl.offsetWidth;
  damageFlashEl.classList.add('hit');
}

export function applyFallDamage(impactSpeed) {
  if (isCreative() || impactSpeed <= FALL_DAMAGE_THRESHOLD) return;
  player.health -= (impactSpeed - FALL_DAMAGE_THRESHOLD) * FALL_DAMAGE_SCALE;
  flashDamage();
  if (player.health <= 0) placePlayerStart();
  updateHealthUI();
}

// generic damage entry point -- used by mob attacks (and reusable for any
// future hazard) without those callers needing to know about respawn logic
export function damagePlayer(amount) {
  if (isCreative()) return;
  player.health -= amount;
  flashDamage();
  if (player.health <= 0) placePlayerStart();
  updateHealthUI();
}

export function regenHealth(dt) {
  if (isCreative() || player.health <= 0 || player.health >= MAX_HEALTH) return;
  player.health = Math.min(MAX_HEALTH, player.health + HEALTH_REGEN_RATE * dt);
  updateHealthUI();
}