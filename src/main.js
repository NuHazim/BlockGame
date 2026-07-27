import { BLOCK_TYPES, HOTBAR } from './blocks.js';
import { GAME_KEYS, RENDER_DISTANCE, REACH, MOB_SPAWN_INTERVAL } from './config.js';
import { generateWorld, regenerateTerrain, ensureChunksAround } from './world.js';
import { rebuildTypes, flushDirty, meshGroup, updateRenderCenter } from './meshBuilder.js';
import { player, keys, placePlayerStart, initMouseLook, updatePlayer } from './player.js';
import { isCreative, setCreative } from './inventory.js';
import { initEffects, updateDrops, updateParticles, clearEffects } from './effects.js';
import { initHotbar, updateHotbarUI, selectSlot, scrollSlot, getSelectedIndex } from './hotbar.js';
import { initBlockPicker, openPicker, closePicker, isPickerOpen } from './blockPicker.js';
import { initMenu, updateModeLabel, updateModeButtonLabel } from './menu.js';
import { updateHealthUI, applyFallDamage, regenHealth, damagePlayer } from './health.js';
import { selectionBox, updateTargetBlock, tryDestroy, tryPlace } from './interaction.js';
import { initDayNight } from './dayNight.js';
import { initClouds, updateClouds } from './clouds.js';
import { WEAPON_TYPES, isWeapon } from './weapons.js';
import { initMobs, updateMobs, trySpawnPass, damageMobsRaycast, clearMobs } from './mobs.js';
import { initHeldItem, updateHeldItem, triggerSwing } from './heldItem.js';
import { initLightSources, clearWorldLights, updateLightFlicker } from './lightSources.js';

// ---------- Renderer / Scene ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 40, 130);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 300);
camera.rotation.order = 'YXZ';
scene.add(camera); // needed so the held-item mesh/light (attached to the camera) actually renders

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
rebuildTypes(Object.keys(BLOCK_TYPES));

// ---------- UI init ----------
initHotbar();
initBlockPicker(canvas);
initMenu(canvas, {
  onRegenerate: regenerateWorld,
  onToggleCreative: () => applyCreative(!isCreative())
});
updateModeLabel(isCreative());
updateModeButtonLabel(isCreative());
updateHealthUI();

function applyCreative(on) {
  setCreative(on);
  updateHotbarUI();
  updateHealthUI();
  updateModeLabel(on);
  updateModeButtonLabel(on);
}

function regenerateWorld() {
  regenerateTerrain();
  placePlayerStart();
  updateRenderCenter(player.pos.x, player.pos.z);
  clearEffects();
  clearMobs();
  clearWorldLights();
  rebuildTypes(Object.keys(BLOCK_TYPES));
}

// ---------- Input ----------
initMouseLook(canvas);

document.addEventListener('keydown', (e) => {
  if (document.pointerLockElement === canvas && GAME_KEYS.has(e.code)) {
    e.preventDefault();
  }
  keys[e.code] = true;
  const num = parseInt(e.key);
  if (num >= 1 && num <= 9) selectSlot(num - 1);
  if (e.code === 'KeyC') applyCreative(!isCreative());
  if (e.code === 'KeyB') {
    if (isPickerOpen()) closePicker(canvas);
    else if (document.pointerLockElement === canvas) openPicker(canvas);
  }
  if (e.code === 'Escape' && isPickerOpen()) closePicker(canvas);
});
document.addEventListener('keyup', (e) => keys[e.code] = false);

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
    if (!hitMob && !attacking) tryDestroy();
  }
  if (e.button === 2) tryPlace();
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
    updateHeldItem(dt, isMoving);
  }

  ensureChunksAround(player.pos.x, player.pos.z, RENDER_DISTANCE + 1);
  updateRenderCenter(player.pos.x, player.pos.z);
  flushDirty();
  updateTargetBlock(camera);
  dayNight.update(now, player.pos);
  updateClouds(dt, player.pos);
  updateLightFlicker(now / 1000);

  renderer.render(scene, camera);

  frames++; fpsTimer += dt;
  if (fpsTimer >= 0.5) {
    fpsEl.textContent = Math.round(frames / fpsTimer) + ' fps';
    frames = 0; fpsTimer = 0;
  }
}

animate();