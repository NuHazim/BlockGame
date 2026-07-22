import { DAY_LENGTH_SECONDS } from './config.js';

// ---------- Day / night cycle ----------
// Drives a sun and a moon that arc across the sky the way the real sun
// does (rise on one horizon, overhead at "noon", set on the opposite
// horizon, then the moon takes over for "night"), tied to a repeating
// clock rather than a fast arbitrary flicker. Also drives the directional
// light that casts real shadows, plus sky/fog color so it visibly reads
// as day, dusk, night or dawn.

const SUN_ORBIT_RADIUS = 150;
// The visible disc is drawn much closer than the light itself. At 150 units
// out, with the camera's near plane at 0.1, the depth buffer has almost no
// precision left (that range is heavily skewed toward objects close to the
// camera) -- so depthTest ends up unreliable and the sprite can fail to
// draw at all. Keeping the sprite at a modest, fixed distance keeps its
// depth well inside the precise part of the buffer, while still being much
// farther out than any loaded terrain so blocks correctly occlude it.
const SUN_SPRITE_DISTANCE = 80;

const SKY_DAY = new THREE.Color(0x87ceeb);
const SKY_SUNSET = new THREE.Color(0xff9a5c);
const SKY_NIGHT = new THREE.Color(0x0a0e2a);

function smoothstep(edge0, edge1, x) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// flat solid-color square billboard used for both the sun and moon disc --
// always faces the camera, and (with depthTest enabled) gets hidden behind
// blocks instead of showing through them.
function makeSquareSprite(color, size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: true });
  const sprite = new THREE.Sprite(mat);
  return sprite;
}

export function initDayNight(scene, renderer) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // ---------- Sun: shadow-casting directional light ----------
  const sunLight = new THREE.DirectionalLight(0xffffff, 1.1);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = SUN_ORBIT_RADIUS + 80;
  sunLight.shadow.camera.left = -70;
  sunLight.shadow.camera.right = 70;
  sunLight.shadow.camera.top = 70;
  sunLight.shadow.camera.bottom = -70;
  sunLight.shadow.bias = -0.0015;
  scene.add(sunLight);
  scene.add(sunLight.target);

  // ---------- Moon: dim fill light at night, no shadow (keeps cost low) ----------
  const moonLight = new THREE.DirectionalLight(0xaac4ff, 0);
  scene.add(moonLight);
  scene.add(moonLight.target);

  const ambient = new THREE.AmbientLight(0xffffff, 0.2);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x4a4a3a, 0.5);
  scene.add(hemi);

  const sunSprite = makeSquareSprite('#ffdd33', 64);
  sunSprite.scale.set(18, 18, 1);
  sunSprite.frustumCulled = false;
  scene.add(sunSprite);

  const moonSprite = makeSquareSprite('#b9c2cf', 64);
  moonSprite.scale.set(12, 12, 1);
  moonSprite.frustumCulled = false;
  scene.add(moonSprite);

  const skyColor = new THREE.Color();
  const tmpSunDir = new THREE.Vector3();
  const tmpMoonDir = new THREE.Vector3();
  const tmpPos = new THREE.Vector3();

  function update(nowMs, playerPos, creative) {
    // Creative mode is always daytime: freeze the cycle at a fixed
    // midday timestamp instead of advancing with real time.
    const effectiveMs = creative ? (DAY_LENGTH_SECONDS * 1000) / 4 : nowMs;
    // 0..1 progress through one full day/night loop
    const t = (effectiveMs / 1000 % DAY_LENGTH_SECONDS) / DAY_LENGTH_SECONDS;
    const angle = t * Math.PI * 2;

    // sun rises in +x, arcs overhead, sets in -x, tilted a bit toward +z
    // so it doesn't pass through a flat plane directly overhead
    tmpSunDir.set(Math.cos(angle), Math.sin(angle), 0.35).normalize();
    tmpMoonDir.copy(tmpSunDir).negate();

    tmpPos.copy(tmpSunDir).multiplyScalar(SUN_ORBIT_RADIUS).add(playerPos);
    sunLight.position.copy(tmpPos);
    sunLight.target.position.copy(playerPos);
    tmpPos.copy(tmpSunDir).multiplyScalar(SUN_SPRITE_DISTANCE).add(playerPos);
    sunSprite.position.copy(tmpPos);

    tmpPos.copy(tmpMoonDir).multiplyScalar(SUN_ORBIT_RADIUS).add(playerPos);
    moonLight.position.copy(tmpPos);
    moonLight.target.position.copy(playerPos);
    tmpPos.copy(tmpMoonDir).multiplyScalar(SUN_SPRITE_DISTANCE).add(playerPos);
    moonSprite.position.copy(tmpPos);

    const sunElevation = tmpSunDir.y;   // -1..1
    const moonElevation = tmpMoonDir.y;

    // fade each disc out as it dips below the horizon instead of popping
    sunSprite.material.opacity = smoothstep(-0.06, 0.06, sunElevation);
    moonSprite.material.opacity = smoothstep(-0.06, 0.06, moonElevation);

    // overall brightness: 0 at night, 1 once the sun is well clear of the horizon
    const dayAmount = smoothstep(-0.1, 0.35, sunElevation);
    // warm tint that peaks right around sunrise/sunset, fades elsewhere
    const sunsetAmount = 1 - smoothstep(0, 0.3, Math.abs(sunElevation));

    sunLight.intensity = dayAmount * 1.1;
    sunLight.color.set(0xffffff).lerp(new THREE.Color(0xff9a5c), sunsetAmount * 0.85);

    moonLight.intensity = (1 - dayAmount) * 0.22;

    ambient.intensity = 0.12 + dayAmount * 0.18;
    hemi.intensity = 0.15 + dayAmount * 0.4;

    skyColor.copy(SKY_NIGHT).lerp(SKY_DAY, dayAmount).lerp(SKY_SUNSET, sunsetAmount * 0.8);
    scene.background = skyColor;
    if (scene.fog) scene.fog.color.copy(skyColor);
    hemi.color.copy(skyColor);
  }

  return { update, sunLight, moonLight };
}
