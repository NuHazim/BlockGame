import { BLOCK_TYPES } from './blocks.js';
import { GAME_KEYS } from './config.js';
import { generateWorld, regenerateTerrain } from './world.js';
import { rebuildTypes, flushDirty, meshGroup, updateRenderCenter } from './meshBuilder.js';
import { player, keys, placePlayerStart, initMouseLook, updatePlayer } from './player.js';
import { isCreative, setCreative } from './inventory.js';
import { initEffects, updateDrops, updateParticles, clearEffects } from './effects.js';
import { initHotbar, updateHotbarUI, selectSlot, scrollSlot } from './hotbar.js';
import { initBlockPicker, openPicker, closePicker, isPickerOpen } from './blockPicker.js';
import { initMenu, updateModeLabel, updateModeButtonLabel } from './menu.js';
import { updateHealthUI, applyFallDamage, regenHealth } from './health.js';
import { selectionBox, updateTargetBlock, tryDestroy, tryPlace } from './interaction.js';
import { initDayNight } from './dayNight.js';

// ---------- Renderer / Scene ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 30, 90);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 300);
camera.rotation.order = 'YXZ';

const dayNight = initDayNight(scene, renderer);

scene.add(meshGroup);
scene.add(selectionBox);
initEffects(scene);

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
  if (num >= 1 && num <= 5) selectSlot(num - 1);
  if (e.code === 'KeyC') applyCreative(!isCreative());
  if (e.code === 'KeyB') {
    if (isPickerOpen()) closePicker(canvas);
    else if (document.pointerLockElement === canvas) openPicker();
  }
  if (e.code === 'Escape' && isPickerOpen()) closePicker(canvas);
});
document.addEventListener('keyup', (e) => keys[e.code] = false);

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => {
  if (document.pointerLockElement !== canvas) return;
  if (e.button === 0) tryDestroy();
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
  }

 updateRenderCenter(player.pos.x, player.pos.z);
  flushDirty();
  updateTargetBlock(camera);
  dayNight.update(now, player.pos, isCreative());

  renderer.render(scene, camera);

  frames++; fpsTimer += dt;
  if (fpsTimer >= 0.5) {
    fpsEl.textContent = Math.round(frames / fpsTimer) + ' fps';
    frames = 0; fpsTimer = 0;
  }
}

animate();
