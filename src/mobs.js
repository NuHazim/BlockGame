import { MOB_SPAWN_INTERVAL, MOB_MAX_COUNT, MOB_SPAWN_RADIUS, MOB_DESPAWN_RADIUS } from './config.js';
import { surfaceHeightAt, getBlock, isSolid } from './world.js';

export const MOB_TYPES = {
  zombie: {
    bodyColor: 0x3a7d44, headColor: 0x2e6b38,
    health: 40, speed: 1.6, damage: 8,
    attackRange: 1.3, attackCooldown: 1.1, aggroRange: 12
  }
};

const KNOCKBACK_FORCE = 6.5;
const KNOCKBACK_DURATION = 0.28;
const KNOCKBACK_DECAY = 0.86;

// mob body footprint for wall collision -- roughly matches the visible
// body box (0.6 wide) with a little clearance
const MOB_HALF_WIDTH = 0.28;
const MOB_BODY_HEIGHT = 1.1;

const mobs = [];
let sceneRef = null;

export function initMobs(scene) {
  sceneRef = scene;
  mobs.length = 0;
}

function buildMobMesh(def) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 1.1, 0.35),
    new THREE.MeshLambertMaterial({ color: def.bodyColor })
  );
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.45, 0.45),
    new THREE.MeshLambertMaterial({ color: def.headColor })
  );
  head.position.y = 1.35;
  head.castShadow = true;
  group.add(head);

  group.userData.bodyMat = body.material;
  group.userData.headMat = head.material;
  return group;
}

export function spawnMob(typeName, x, z) {
  const def = MOB_TYPES[typeName];
  if (!def || !sceneRef) return;
  const group = buildMobMesh(def);
  group.position.set(x, surfaceHeightAt(x, z), z);
  sceneRef.add(group);
  mobs.push({
    type: typeName, def, group,
    health: def.health,
    wanderTarget: null, wanderTimer: 0,
    attackTimer: 0, hitFlash: 0,
    knockback: { x: 0, z: 0, timer: 0 }
  });
}

function pickWanderTarget(mob) {
  const angle = Math.random() * Math.PI * 2;
  const dist = 3 + Math.random() * 5;
  mob.wanderTarget = {
    x: mob.group.position.x + Math.cos(angle) * dist,
    z: mob.group.position.z + Math.sin(angle) * dist
  };
  mob.wanderTimer = 3 + Math.random() * 3;
}

// AABB collision check against real solid blocks, so mobs stop at walls
// instead of walking straight through them. `feetY` is the mob's own feet
// height (mob.group.position.y is already feet-level -- see spawnMob).
function mobCollides(x, feetY, z) {
  const minX = Math.floor(x - MOB_HALF_WIDTH + 0.5);
  const maxX = Math.floor(x + MOB_HALF_WIDTH + 0.5);
  const minZ = Math.floor(z - MOB_HALF_WIDTH + 0.5);
  const maxZ = Math.floor(z + MOB_HALF_WIDTH + 0.5);
  const minY = Math.floor(feetY + 0.05 + 0.5);
  const maxY = Math.floor(feetY + MOB_BODY_HEIGHT - 0.05 + 0.5);
  for (let by = minY; by <= maxY; by++) {
    for (let bx = minX; bx <= maxX; bx++) {
      for (let bz = minZ; bz <= maxZ; bz++) {
        if (isSolid(bx, by, bz)) return true;
      }
    }
  }
  return false;
}

export function updateMobs(dt, playerPos, damagePlayer) {
  for (let i = mobs.length - 1; i >= 0; i--) {
    const mob = mobs[i];
    const pos = mob.group.position;
    const dx = playerPos.x - pos.x, dz = playerPos.z - pos.z;
    const distToPlayer = Math.hypot(dx, dz);

    if (mob.health <= 0 || distToPlayer > MOB_DESPAWN_RADIUS) {
      sceneRef.remove(mob.group);
      mobs.splice(i, 1);
      continue;
    }

    if (mob.hitFlash > 0) {
      mob.hitFlash -= dt;
      const flashOn = mob.hitFlash > 0 && Math.floor(mob.hitFlash * 12) % 2 === 0;
      mob.group.userData.bodyMat.color.setHex(flashOn ? 0xffffff : mob.def.bodyColor);
      mob.group.userData.headMat.color.setHex(flashOn ? 0xffffff : mob.def.headColor);
    }

    if (mob.knockback.timer > 0) {
      mob.knockback.timer -= dt;
      const kx = mob.knockback.x * dt, kz = mob.knockback.z * dt;
      if (!mobCollides(pos.x + kx, pos.y, pos.z)) pos.x += kx;
      if (!mobCollides(pos.x, pos.y, pos.z + kz)) pos.z += kz;
      mob.knockback.x *= KNOCKBACK_DECAY;
      mob.knockback.z *= KNOCKBACK_DECAY;
    } else {
      let moveX = 0, moveZ = 0;
      if (distToPlayer < mob.def.aggroRange) {
        moveX = dx / (distToPlayer || 1);
        moveZ = dz / (distToPlayer || 1);
        mob.wanderTarget = null;
        if (distToPlayer < mob.def.attackRange) {
          moveX = 0; moveZ = 0;
          mob.attackTimer -= dt;
          if (mob.attackTimer <= 0) {
            damagePlayer(mob.def.damage);
            mob.attackTimer = mob.def.attackCooldown;
          }
        }
      } else {
        mob.wanderTimer -= dt;
        if (!mob.wanderTarget || mob.wanderTimer <= 0) pickWanderTarget(mob);
        const wx = mob.wanderTarget.x - pos.x, wz = mob.wanderTarget.z - pos.z;
        const wd = Math.hypot(wx, wz);
        if (wd > 0.3) { moveX = wx / wd; moveZ = wz / wd; }
      }

      if (moveX || moveZ) {
        const stepX = moveX * mob.def.speed * dt;
        const stepZ = moveZ * mob.def.speed * dt;
        // move each axis independently so a mob sliding along a wall keeps
        // whatever component of motion isn't blocked, instead of freezing
        // entirely the instant either axis is obstructed
        if (!mobCollides(pos.x + stepX, pos.y, pos.z)) pos.x += stepX;
        if (!mobCollides(pos.x, pos.y, pos.z + stepZ)) pos.z += stepZ;
        mob.group.rotation.y = Math.atan2(moveX, moveZ);
      }
    }

    // follow the REAL current terrain (placed/mined blocks included), not
    // the original generated shape -- smoothed so it doesn't teleport-snap
    const groundY = surfaceHeightAt(pos.x, pos.z);
    pos.y += (groundY - pos.y) * Math.min(1, dt * 8);
  }
}

export function damageMobsRaycast(camera, reach, damage) {
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  const toMob = new THREE.Vector3();
  let best = null, bestAngle = 0.28;

  for (const mob of mobs) {
    toMob.copy(mob.group.position).sub(camera.position);
    toMob.y += 0.7;
    const dist = toMob.length();
    if (dist > reach) continue;
    const dirToMob = toMob.clone().normalize();
    const angle = camDir.angleTo(dirToMob);
    if (angle < bestAngle) { bestAngle = angle; best = mob; }
  }

  if (best) {
    best.health -= damage;
    best.hitFlash = 0.3;
    const kx = best.group.position.x - camera.position.x;
    const kz = best.group.position.z - camera.position.z;
    const klen = Math.hypot(kx, kz) || 1;
    best.knockback.x = (kx / klen) * KNOCKBACK_FORCE;
    best.knockback.z = (kz / klen) * KNOCKBACK_FORCE;
    best.knockback.timer = KNOCKBACK_DURATION;
    return true;
  }
  return false;
}

export function trySpawnPass(playerPos, dt, state) {
  state.timer -= dt;
  if (state.timer > 0) return;
  state.timer = MOB_SPAWN_INTERVAL;
  if (mobs.length >= MOB_MAX_COUNT) return;

  const angle = Math.random() * Math.PI * 2;
  const dist = MOB_SPAWN_RADIUS[0] + Math.random() * (MOB_SPAWN_RADIUS[1] - MOB_SPAWN_RADIUS[0]);
  const x = Math.floor(playerPos.x + Math.cos(angle) * dist) + 0.5;
  const z = Math.floor(playerPos.z + Math.sin(angle) * dist) + 0.5;
  const feetY = surfaceHeightAt(x, z);
  const groundType = getBlock(Math.round(x), feetY - 1, Math.round(z));
  if (groundType === 'water') return;

  spawnMob('zombie', x, z);
}

export function mobCount() { return mobs.length; }

export function clearMobs() {
  for (const mob of mobs) sceneRef.remove(mob.group);
  mobs.length = 0;
}