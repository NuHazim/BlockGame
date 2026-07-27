import { DAY_LENGTH_SECONDS } from './config.js';

// ---------- Day / night cycle ----------
// Drives a sun and a moon that arc across the sky, tied to a repeating
// real-time clock. Runs identically in Creative and Survival now -- it used
// to freeze at a fixed midday in Creative, but that's gone.

const SUN_ORBIT_RADIUS = 150;
const SUN_SPRITE_DISTANCE = 130;

const SKY_DAY = new THREE.Color(0x87ceeb);
const SKY_SUNSET = new THREE.Color(0xff9a5c);
const SKY_NIGHT = new THREE.Color(0x0a0e2a);

function smoothstep(edge0, edge1, x) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function makeGlowSprite({ core, mid, edge, size = 256 }) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2, cy = size / 2;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
  grad.addColorStop(0, core);
  grad.addColorStop(0.28, mid);
  grad.addColorStop(0.55, edge);
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: true });
  return new THREE.Sprite(mat);
}

export function initDayNight(scene, renderer) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

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

  const moonLight = new THREE.DirectionalLight(0xaac4ff, 0);
  scene.add(moonLight);
  scene.add(moonLight.target);

  const ambient = new THREE.AmbientLight(0xffffff, 0.2);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x4a4a3a, 0.5);
  scene.add(hemi);

  const sunSprite = makeGlowSprite({
    core: 'rgba(255,255,255,1)',
    mid: 'rgba(255,224,140,0.95)',
    edge: 'rgba(255,170,60,0.35)'
  });
  sunSprite.scale.set(34, 34, 1);
  sunSprite.frustumCulled = false;
  scene.add(sunSprite);

  const moonSprite = makeGlowSprite({
    core: 'rgba(255,255,255,1)',
    mid: 'rgba(210,222,245,0.9)',
    edge: 'rgba(160,180,220,0.28)'
  });
  moonSprite.scale.set(22, 22, 1);
  moonSprite.frustumCulled = false;
  scene.add(moonSprite);

  const skyColor = new THREE.Color();
  const tmpSunDir = new THREE.Vector3();
  const tmpMoonDir = new THREE.Vector3();
  const tmpPos = new THREE.Vector3();

  function update(nowMs, playerPos) {
    const t = (nowMs / 1000 % DAY_LENGTH_SECONDS) / DAY_LENGTH_SECONDS;
    const angle = t * Math.PI * 2;

    tmpSunDir.set(Math.cos(angle), Math.sin(angle), 0.35).normalize();
    tmpMoonDir.copy(tmpSunDir).negate();

    tmpPos.copy(tmpSunDir).multiplyScalar(SUN_ORBIT_RADIUS).add(playerPos);
    sunLight.position.copy(tmpPos);
    sunLight.target.position.copy(playerPos);

    tmpPos.copy(tmpMoonDir).multiplyScalar(SUN_ORBIT_RADIUS).add(playerPos);
    moonLight.position.copy(tmpPos);
    moonLight.target.position.copy(playerPos);

    // sprite height is anchored to ground level (y=0), not the player's
    // current altitude, so walking up a hill doesn't visibly move the sun,
    // and it stays correctly below the fixed-height cloud layer.
    sunSprite.position.set(
      playerPos.x + tmpSunDir.x * SUN_SPRITE_DISTANCE,
      tmpSunDir.y * SUN_SPRITE_DISTANCE,
      playerPos.z + tmpSunDir.z * SUN_SPRITE_DISTANCE
    );
    moonSprite.position.set(
      playerPos.x + tmpMoonDir.x * SUN_SPRITE_DISTANCE,
      tmpMoonDir.y * SUN_SPRITE_DISTANCE,
      playerPos.z + tmpMoonDir.z * SUN_SPRITE_DISTANCE
    );

    const sunElevation = tmpSunDir.y;
    const moonElevation = tmpMoonDir.y;

    sunSprite.material.opacity = smoothstep(-0.06, 0.06, sunElevation);
    moonSprite.material.opacity = smoothstep(-0.06, 0.06, moonElevation);

    const dayAmount = smoothstep(-0.1, 0.35, sunElevation);
    const sunsetAmount = 1 - smoothstep(0, 0.3, Math.abs(sunElevation));

    const sunScale = 34 + sunsetAmount * 14;
    sunSprite.scale.set(sunScale, sunScale, 1);

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