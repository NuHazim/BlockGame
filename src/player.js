import {
  GRAVITY, JUMP_SPEED, MOVE_SPEED, PLAYER_RADIUS, EYE_HEIGHT, PLAYER_HEIGHT,
  MOUSE_SENS, MAX_HEIGHT, COLLISION_EPS, MAX_HEALTH, AIR_CONTROL_ACCEL,
  WORLD_BORDER_CHUNKS, CHUNK_SIZE, SWIM_SPEED, SWIM_SPRINT_SPEED, SWIM_RISE_SPEED,
  WATER_GRAVITY_SCALE, WATER_SINK_TERMINAL, DOUBLE_TAP_WINDOW, FLY_SPEED, FLY_VERTICAL_SPEED,
  CROUCH_SPEED_MULT, CROUCH_EYE_OFFSET
} from './config.js';
import { isSolid, getBlock, heightAt } from './world.js';
import { isCreative } from './inventory.js';

// how far from spawn the player can walk before hitting the world border
const WORLD_LIMIT = WORLD_BORDER_CHUNKS * CHUNK_SIZE - 1;

export const player = {
  pos: new THREE.Vector3(0, MAX_HEIGHT + 2, 0),
  vel: new THREE.Vector3(0, 0, 0),
  yaw: 0,
  pitch: 0,
  grounded: false,
  health: MAX_HEALTH,
  inWater: false,       // true when the player's body is submerged -- drives swim controls/speed
  swimSprinting: false, // toggled on by double-tapping W while inWater; auto-cancels, see updatePlayer
  flying: false,        // creative-only; toggled by double-tapping Space; disables gravity while true
  crouching: false      // true while Shift is held and NOT flying -- slows movement, lowers the camera, and (grounded) prevents walking off edges
};

// raw movement key state, written by main.js's keydown/keyup listeners
export const keys = {};

// ---------- Double-tap gestures (swim sprint / creative flight) ----------
let lastWPress = 0;
let lastSpacePress = 0;

// Call from main.js's keydown handler on a non-repeated KeyW press.
// Double-tapping W while in water toggles swim-sprint on -- same gesture as
// Minecraft's sprint. It auto-cancels in updatePlayer the moment W is
// released or the player leaves the water, so there's nothing to untoggle
// here.
export function notifyKeyWPress() {
  const now = performance.now();
  if (now - lastWPress < DOUBLE_TAP_WINDOW) {
    if (player.inWater) player.swimSprinting = true;
    lastWPress = 0; // avoid a third rapid tap immediately re-triggering
  } else {
    lastWPress = now;
  }
}

// Call from main.js's keydown handler on a non-repeated Space press.
// Double-tapping Space toggles creative flight on/off. No-ops outside
// Creative mode.
export function notifySpacePress() {
  if (!isCreative()) return;
  const now = performance.now();
  if (now - lastSpacePress < DOUBLE_TAP_WINDOW) {
    player.flying = !player.flying;
    if (player.flying) player.vel.y = 0;
    lastSpacePress = 0;
  } else {
    lastSpacePress = now;
  }
}

// Flight only makes sense in Creative -- call this when leaving Creative
// mode so the player doesn't stay airborne in Survival.
export function cancelFlying() {
  player.flying = false;
}

export function placePlayerStart() {
  const h = heightAt(0, 0);
  player.pos.set(0.5, h + 3, 0.5);
  player.vel.set(0, 0, 0);
  player.grounded = false;
  player.health = MAX_HEALTH;
  player.inWater = false;
  player.swimSprinting = false;
  player.flying = false;
  player.crouching = false;
}

export function initMouseLook(canvas) {
  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== canvas) return;
    player.yaw -= e.movementX * MOUSE_SENS;
    player.pitch -= e.movementY * MOUSE_SENS;
    const limit = Math.PI / 2 - 0.01;
    player.pitch = Math.max(-limit, Math.min(limit, player.pitch));
  });
}

// Water is swimmable, not solid, for the player -- every other system
// (meshBuilder occlusion, lighting, mob navigation) still treats it as
// solid via world.js's isSolid; this bypass is scoped to player collision
// only.
function isBlocking(x, y, z) {
  return isSolid(x, y, z) && getBlock(x, y, z) !== 'water';
}

// (x, feetY, z) is the player's FEET position. Tests the whole body box
// (PLAYER_RADIUS in X/Z, PLAYER_HEIGHT tall) against blocking blocks across
// every vertical layer it spans, so torso-height blocks aren't missed.
function collidesAt(x, feetY, z) {
  const minX = Math.floor(x - PLAYER_RADIUS + 0.5);
  const maxX = Math.floor(x + PLAYER_RADIUS + 0.5);
  const minZ = Math.floor(z - PLAYER_RADIUS + 0.5);
  const maxZ = Math.floor(z + PLAYER_RADIUS + 0.5);
  // epsilon shrinks the span slightly so a body resting exactly on a
  // surface doesn't register the block it's standing on as a collision.
  const minY = Math.floor(feetY + COLLISION_EPS + 0.5);
  const maxY = Math.floor(feetY + PLAYER_HEIGHT - COLLISION_EPS + 0.5);
  for (let by = minY; by <= maxY; by++) {
    for (let bx = minX; bx <= maxX; bx++) {
      for (let bz = minZ; bz <= maxZ; bz++) {
        if (isBlocking(bx, by, bz)) return true;
      }
    }
  }
  return false;
}

// Ground-support check used for sneak edge-protection. Unlike collidesAt
// (which tests the whole body column), this only tests the single block
// layer directly beneath a properly-grounded feet position -- a grounded
// feetY always lands exactly on blockIndex + 0.5 (see the landing snap
// below), so Math.floor(feetY) recovers that supporting block's index.
function hasSupportAt(x, feetY, z) {
  const minX = Math.floor(x - PLAYER_RADIUS + 0.5);
  const maxX = Math.floor(x + PLAYER_RADIUS + 0.5);
  const minZ = Math.floor(z - PLAYER_RADIUS + 0.5);
  const maxZ = Math.floor(z + PLAYER_RADIUS + 0.5);
  const by = Math.floor(feetY);
  for (let bx = minX; bx <= maxX; bx++) {
    for (let bz = minZ; bz <= maxZ; bz++) {
      if (isBlocking(bx, by, bz)) return true;
    }
  }
  return false;
}

// True once the player's body is actually sitting in water -- checks feet
// and chest height so wading in triggers swim state right away, rather than
// only once fully submerged.
function computeInWater(x, eyeY, z) {
  const feetY = eyeY - EYE_HEIGHT;
  const chestY = eyeY - EYE_HEIGHT * 0.4;
  const fx = Math.floor(x + 0.5), fz = Math.floor(z + 0.5);
  return getBlock(fx, Math.floor(feetY + 0.5), fz) === 'water' ||
         getBlock(fx, Math.floor(chestY + 0.5), fz) === 'water';
}

// onLand(impactSpeed) fires when the player hits the ground -- lets
// health.js apply fall damage without player.js needing to import it.
export function updatePlayer(dt, camera, onLand) {
  player.inWater = computeInWater(player.pos.x, player.pos.y, player.pos.z);

  // swim-sprint auto-cancels the instant W is released or the player
  // leaves the water -- same trigger conditions as Minecraft's sprint-swim
  if (!keys['KeyW'] || !player.inWater) player.swimSprinting = false;

  // Sneak is just "Shift held, and not currently using Shift for flight
  // descent" -- flying's own branch below reads the raw keys directly, so
  // there's no conflict between the two uses of the same key.
  player.crouching = !player.flying && (keys['ShiftLeft'] || keys['ShiftRight']);

  const forward = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));

  let moveX = 0, moveZ = 0;
  if (keys['KeyW']) { moveX -= forward.x; moveZ -= forward.z; }
  if (keys['KeyS']) { moveX += forward.x; moveZ += forward.z; }
  if (keys['KeyA']) { moveX -= right.x; moveZ -= right.z; }
  if (keys['KeyD']) { moveX += right.x; moveZ += right.z; }

  const len = Math.hypot(moveX, moveZ);
  if (len > 0) { moveX /= len; moveZ /= len; }

  if (player.flying) {
    // Flight: direct, snappy control on all three axes, gravity disabled.
    // Space ascends, Shift descends, matching Minecraft creative flight.
    player.vel.x = moveX * FLY_SPEED;
    player.vel.z = moveZ * FLY_SPEED;
    if (keys['Space']) player.vel.y = FLY_VERTICAL_SPEED;
    else if (keys['ShiftLeft'] || keys['ShiftRight']) player.vel.y = -FLY_VERTICAL_SPEED;
    else player.vel.y = 0;
    player.grounded = false;
  } else if (player.inWater) {
    // Swimming: also direct control (not the acceleration-based air
    // steering used for jumps) so it feels responsive rather than sluggish.
    // Space rises; otherwise buoyancy-scaled gravity makes the player sink
    // slowly instead of free-falling, capped at a gentle terminal speed.
    const swimSpeed = player.swimSprinting ? SWIM_SPRINT_SPEED : SWIM_SPEED;
    player.vel.x = moveX * swimSpeed;
    player.vel.z = moveZ * swimSpeed;
    if (keys['Space']) {
      player.vel.y = SWIM_RISE_SPEED;
    } else {
      player.vel.y += GRAVITY * WATER_GRAVITY_SCALE * dt;
      player.vel.y = Math.max(WATER_SINK_TERMINAL, player.vel.y);
    }
    player.grounded = false;
  } else if (player.grounded) {
    // Grounded movement sets horizontal velocity directly (snappy, classic
    // block-game walk control). Sneaking scales this down to a slow,
    // deliberate creep, same spirit as Minecraft. Airborne movement instead
    // STEERS the existing horizontal velocity by a limited amount per
    // frame (see the else branch below), and never zeroes it out just
    // because keys were released -- that's what makes a running jump carry
    // its momentum through the air instead of stopping dead the instant
    // you let go of WASD mid-jump.
    const speed = player.crouching ? MOVE_SPEED * CROUCH_SPEED_MULT : MOVE_SPEED;
    player.vel.x = moveX * speed;
    player.vel.z = moveZ * speed;
  } else {
    if (len > 0) {
      player.vel.x += moveX * AIR_CONTROL_ACCEL * dt;
      player.vel.z += moveZ * AIR_CONTROL_ACCEL * dt;
    }
    const airSpeed = Math.hypot(player.vel.x, player.vel.z);
    if (airSpeed > MOVE_SPEED) {
      const scale = MOVE_SPEED / airSpeed;
      player.vel.x *= scale;
      player.vel.z *= scale;
    }
  }

  const dx = player.vel.x * dt;
  const dz = player.vel.z * dt;

  // move on X / Z independently (feet = eye position minus eye height).
  // collidesAt tests the whole body, so one check per axis suffices.
  const feetY = player.pos.y - EYE_HEIGHT;

  // Sneaking mirrors Minecraft's edge protection: while grounded and
  // crouching, a step that would walk the player off a ledge (no block
  // supporting the new feet position) is cancelled on that axis, same as
  // an ordinary wall collision -- lets you shuffle right up to an edge
  // without falling off.
  const edgeProtect = player.grounded && player.crouching && !player.flying;

  const nextX = player.pos.x + dx;
  if (!collidesAt(nextX, feetY, player.pos.z) && !(edgeProtect && !hasSupportAt(nextX, feetY, player.pos.z))) {
    player.pos.x = nextX;
  } else {
    player.vel.x = 0; // hit a wall (or a sneak-protected edge) -- kill momentum on that axis
  }
  const nextZ = player.pos.z + dz;
  if (!collidesAt(player.pos.x, feetY, nextZ) && !(edgeProtect && !hasSupportAt(player.pos.x, feetY, nextZ))) {
    player.pos.z = nextZ;
  } else {
    player.vel.z = 0;
  }

  if (player.flying) {
    // Simple direct vertical move + collision -- no landing/fall-damage
    // logic since there's no "falling" while flying.
    const newY = player.pos.y + player.vel.y * dt;
    const newFeetY = newY - EYE_HEIGHT;
    if (!collidesAt(player.pos.x, newFeetY, player.pos.z)) {
      player.pos.y = newY;
    } else {
      player.vel.y = 0;
    }
  } else {
    // gravity -- skipped in water, since the swim branch above already
    // wrote this frame's vel.y (buoyancy-scaled gravity or Space-rise)
    if (!player.inWater) player.vel.y += GRAVITY * dt;

    if (player.grounded && keys['Space'] && !player.inWater) {
      player.vel.y = JUMP_SPEED;
      player.grounded = false;
    }

    const newY = player.pos.y + player.vel.y * dt;
    const newFeetY = newY - EYE_HEIGHT;

    if (player.vel.y <= 0) {
      if (collidesAt(player.pos.x, newFeetY, player.pos.z)) {
        const impactSpeed = -player.vel.y;
        // water absorbs fall damage entirely, same as landing in water in
        // Minecraft -- inWater here reflects the START of this frame, so a
        // swim-to-seafloor landing is correctly damage-free
        if (onLand && !player.inWater) onLand(impactSpeed);
        player.pos.y = Math.floor(newFeetY + 0.5) + 0.5 + EYE_HEIGHT;
        player.vel.y = 0;
        player.grounded = true;
      } else {
        player.pos.y = newY;
        player.grounded = false;
      }
    } else {
      if (collidesAt(player.pos.x, newFeetY, player.pos.z)) {
        player.vel.y = 0;
      } else {
        player.pos.y = newY;
      }
    }
  }

  // safety floor
  if (player.pos.y < -20) {
    player.pos.set(0.5, MAX_HEIGHT + 5, 0.5);
    player.vel.set(0, 0, 0);
  }

  // world border -- invisible wall instead of walking into an unloaded void
  player.pos.x = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, player.pos.x));
  player.pos.z = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, player.pos.z));

  camera.position.copy(player.pos);
  // Cosmetic sneak crouch: lowers the camera a bit without touching the
  // actual collision box (feetY/EYE_HEIGHT are unchanged), same trick used
  // by most block-game clones -- cheap and doesn't risk breaking collision.
  if (player.crouching) camera.position.y -= CROUCH_EYE_OFFSET;
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
}