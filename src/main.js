import { HOTBAR } from './blocks.js';
import { GAME_KEYS, RENDER_DISTANCE, REACH, MOB_SPAWN_INTERVAL, MINE_DURATION } from './config.js';
import { generateWorld, regenerateTerrain, ensureChunksAround, getBlock } from './world.js';
import { flushDirty, meshGroup, updateRenderCenter, rebuildAllChunks } from './meshBuilder.js';
import {
  player, keys, placePlayerStart, initMouseLook, updatePlayer,
  notifyKeyWPress, notifySpacePress, cancelFlying
} from './player.js';
import { isCreative, setCreative } from './inventory.js';
import { initEffects, updateDrops, updateParticles, clearEffects } from './effects.js';
import { initHotbar, updateHotbarUI, selectSlot, scrollSlot, getSelectedIndex } from './hotbar.js';
import { initBlockPicker, openPicker, closePicker, isPickerOpen } from './blockPicker.js';
import { initMenu, updateModeLabel, updateModeButtonLabel } from './menu.js';
import { updateHealthUI, applyFallDamage, regenHealth, damagePlayer } from './health.js';
import { selectionBox, updateTargetBlock, tryDestroy, tryPlace, getTargetBlock } from './interaction.js';
import { initDayNight } from './dayNight.js';
import { initClouds, updateClouds } from './clouds.js';
import { WEAPON_TYPES, isWeapon } from './weapons.js';
import { initMobs, updateMobs, trySpawnPass, damageMobsRaycast, clearMobs } from './mobs.js';
import { initHeldItem, updateHeldItem, triggerSwing, resetHeldLightTracking } from './heldItem.js';
import { initLightSources, clearWorldLights, updateLightFlicker } from './lightSources.js';
import { initCrafting, toggleCraftMenu, openTableCraft, isCraftingOpen, closeCraftingIfOpen } from './crafting.js';

// ---------- Renderer / Scene ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

// Fog distances swap between these two sets depending on whether the
// player is underwater (see the animate loop) -- Minecraft's underwater
// fog is short-range and blue-tinted, versus the normal hazy sky-colored
// fog on land.
const SURFACE_FOG_NEAR = 40, SURFACE_FOG_FAR = 130;
const UNDERWATER_FOG_NEAR = 6, UNDERWATER_FOG_FAR = 70; // was 0.5/16 -- far too short, choked visibility while swimming
const UNDERWATER_FOG_COLOR = 0x3f79e0;
scene.fog = new THREE.Fog(0x87ceeb, SURFACE_FOG_NEAR, SURFACE_FOG_FAR);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 300);
camera.rotation.order = 'YXZ';
scene.add(camera);

const dayNight = initDayNight(scene, renderer);

scene.add(meshGroup);
scene.add(selectionBox);
initEffects(scene);
initClouds(scene);
initMobs(scene);
initLightSources(scene);
initHeldItem(camera);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- World + player init ----------
generateWorld();
placePlayerStart();
updateRenderCenter(player.pos.x, player.pos.z);

// ---------- UI init ----------
initHotbar();
initBlockPicker(canvas);
initCrafting();
initMenu(canvas, {
  onRegenerate: regenerateWorld,
  onToggleCreative: () => applyCreative(!isCreative())
});
updateModeLabel(isCreative());
updateModeButtonLabel(isCreative());
updateHealthUI();

const underwaterOverlayEl = document.getElementById('underwaterOverlay');

function applyCreative(on) {
  setCreative(on);
  if (!on) cancelFlying(); // flight only makes sense in Creative
  updateHotbarUI();
  updateHealthUI();
  updateModeLabel(on);
  updateModeButtonLabel(on);
}

function regenerateWorld() {
  regenerateTerrain();
  placePlayerStart();
  rebuildAllChunks();
  updateRenderCenter(player.pos.x, player.pos.z);
  clearEffects();
  clearMobs();
  clearWorldLights();
  resetHeldLightTracking();
}

// ---------- Input ----------
initMouseLook(canvas);

document.addEventListener('keydown', (e) => {
  if (document.pointerLockElement === canvas && GAME_KEYS.has(e.code)) {
    e.preventDefault();
  }
  // Double-tap gestures (swim sprint / creative flight) key off the real
  // browser keydown event so autorepeat-while-held doesn't fake extra taps.
  if (!e.repeat) {
    if (e.code === 'KeyW') notifyKeyWPress();
    if (e.code === 'Space') notifySpacePress();
  }
  keys[e.code] = true;
  const num = parseInt(e.key);
  if (num >= 1 && num <= 9) selectSlot(num - 1);
  if (e.code === 'KeyC') applyCreative(!isCreative());
  if (e.code === 'KeyB' && !e.repeat) {
    if (isCraftingOpen()) {
      // crafting UI takes priority -- ignore B while it's open
    } else if (isPickerOpen()) {
      closePicker(canvas);
    } else if (document.pointerLockElement === canvas) {
      openPicker(canvas);
    }
  }
  if (e.code === 'KeyE' && !e.repeat) {
    if (isPickerOpen()) {
      // block picker takes priority -- ignore E while it's open
    } else {
      toggleCraftMenu(canvas);
    }
  }
  if (e.code === 'Escape') {
    if (isPickerOpen()) closePicker(canvas);
    if (isCraftingOpen()) closeCraftingIfOpen(canvas);
  }
});
document.addEventListener('keyup', (e) => keys[e.code] = false);

// ---------- Hold-to-mine ----------
// Left click no longer breaks a block instantly -- it has to be held on the
// SAME targeted block for MINE_DURATION seconds first (see the animate loop
// below). Punching mobs (fists or a weapon) still fires instantly on click,
// same as before -- only plain block breaking got slower.
const mining = { active: false, progress: 0, targetKey: null };

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => {
  if (document.pointerLockElement !== canvas) return;
  if (e.button === 0) {
    const selected = HOTBAR[getSelectedIndex()];
    const attacking = isWeapon(selected);
    const damage = attacking ? WEAPON_TYPES[selected].damage : 6;
    const reach = attacking ? WEAPON_TYPES[selected].reach : REACH;
    const hitMob = damageMobsRaycast(camera, reach, damage);
    triggerSwing();
    if (!hitMob && !attacking) {
      mining.active = true;
      mining.progress = 0;
      mining.targetKey = null; // resolved against the real target next animate tick
    }
  }
  if (e.button === 2) {
    // Right-clicking a placed crafting table opens its 3x3 UI instead of
    // trying to place whatever's in hand -- matches Minecraft's "right
    // click interacts with the block you're looking at" behavior.
    const target = getTargetBlock();
    if (target && getBlock(target[0], target[1], target[2]) === 'craftingTable') {
      openTableCraft(canvas);
    } else {
      tryPlace();
    }
  }
});
canvas.addEventListener('mouseup', (e) => {
  if (e.button === 0) {
    mining.active = false;
    mining.progress = 0;
    mining.targetKey = null;
    selectionBox.material.color.setHex(0x000000);
  }
});
canvas.addEventListener('wheel', (e) => {
  if (document.pointerLockElement !== canvas) return;
  e.preventDefault();
  scrollSlot(e.deltaY > 0 ? 1 : -1);
}, { passive: false });

// ---------- Main loop ----------
let lastTime = performance.now();
let frames = 0, fpsTimer = 0;
const fpsEl = document.getElementById('fps');
const spawnState = { timer: MOB_SPAWN_INTERVAL };
const litColor = new THREE.Color();

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  if (document.pointerLockElement === canvas) {
    updatePlayer(dt, camera, applyFallDamage);
    updateDrops(dt, now / 1000);
    updateParticles(dt);
    regenHealth(dt);
    updateMobs(dt, player.pos, damagePlayer);
    trySpawnPass(player.pos, dt, spawnState);
    const isMoving = keys['KeyW'] || keys['KeyA'] || keys['KeyS'] || keys['KeyD'];
    updateHeldItem(dt, isMoving, player.pos);
  }

  ensureChunksAround(player.pos.x, player.pos.z, RENDER_DISTANCE + 1);
  updateRenderCenter(player.pos.x, player.pos.z);
  flushDirty();
  updateTargetBlock(camera);

  // Advance hold-to-mine progress against whatever's actually targeted right
  // now. Switching targets (or switching to a weapon mid-hold) resets
  // progress instead of carrying it over to a different block.
  if (document.pointerLockElement === canvas && mining.active) {
    const selected = HOTBAR[getSelectedIndex()];
    if (isWeapon(selected)) {
      mining.active = false;
      mining.progress = 0;
      mining.targetKey = null;
    } else {
      const target = getTargetBlock();
      const key = target ? target.join(',') : null;
      if (key !== mining.targetKey) {
        mining.targetKey = key;
        mining.progress = 0;
      }
      if (key) {
        mining.progress += dt;
        if (mining.progress >= MINE_DURATION) {
          tryDestroy();
          mining.progress = 0; // targetKey refreshes next frame against whatever's newly exposed
        }
      }
    }
  }

  // subtle visual feedback: selection outline reddens as mining progresses
  if (mining.active && mining.targetKey) {
    const t = Math.min(1, mining.progress / MINE_DURATION);
    litColor.setRGB(0, 0, 0).lerp(new THREE.Color(0xff2020), t);
    selectionBox.material.color.copy(litColor);
  } else if (!mining.active) {
    selectionBox.material.color.setHex(0x000000);
  }

  dayNight.update(now, player.pos);
  updateClouds(dt, player.pos);
  updateLightFlicker(now / 1000);

  // Underwater atmosphere: tighter blue-tinted fog + a screen tint overlay,
  // applied after dayNight.update() so it overrides that frame's normal
  // sky-fog color rather than fighting it. Restored to the surface values
  // the instant the player isn't submerged.
  if (player.inWater) {
    scene.fog.color.setHex(UNDERWATER_FOG_COLOR);
    scene.fog.near = UNDERWATER_FOG_NEAR;
    scene.fog.far = UNDERWATER_FOG_FAR;
    if (underwaterOverlayEl) underwaterOverlayEl.style.opacity = '1';
  } else {
    scene.fog.near = SURFACE_FOG_NEAR;
    scene.fog.far = SURFACE_FOG_FAR;
    if (underwaterOverlayEl) underwaterOverlayEl.style.opacity = '0';
  }

  renderer.render(scene, camera);

  frames++; fpsTimer += dt;
  if (fpsTimer >= 0.5) {
    fpsEl.textContent = Math.round(frames / fpsTimer) + ' fps';
    frames = 0; fpsTimer = 0;
  }
}

animate();