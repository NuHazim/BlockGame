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
  // restart the CSS animation even if it's already mid-flash
  damageFlashEl.classList.remove('hit');
  void damageFlashEl.offsetWidth; // force reflow so the class re-triggers
  damageFlashEl.classList.add('hit');
}

export function applyFallDamage(impactSpeed) {
  if (isCreative() || impactSpeed <= FALL_DAMAGE_THRESHOLD) return;
  player.health -= (impactSpeed - FALL_DAMAGE_THRESHOLD) * FALL_DAMAGE_SCALE;
  flashDamage();
  if (player.health <= 0) {
    // no death screen for this jam build -- just respawn at full health
    placePlayerStart();
  }
  updateHealthUI();
}

export function regenHealth(dt) {
  if (isCreative() || player.health <= 0 || player.health >= MAX_HEALTH) return;
  player.health = Math.min(MAX_HEALTH, player.health + HEALTH_REGEN_RATE * dt);
  updateHealthUI();
}
