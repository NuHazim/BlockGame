import {
  GRAVITY, JUMP_SPEED, MOVE_SPEED, PLAYER_RADIUS, EYE_HEIGHT, PLAYER_HEIGHT,
  MOUSE_SENS, MAX_HEIGHT, COLLISION_EPS, MAX_HEALTH
} from './config.js';
import { isSolid, heightAt } from './world.js';

export const player = {
  pos: new THREE.Vector3(0, MAX_HEIGHT + 2, 0),
  vel: new THREE.Vector3(0, 0, 0),
  yaw: 0,
  pitch: 0,
  grounded: false,
  health: MAX_HEALTH
};

// raw movement key state, written by main.js's keydown/keyup listeners
export const keys = {};

export function placePlayerStart() {
  const h = heightAt(0, 0);
  player.pos.set(0.5, h + 3, 0.5);
  player.vel.set(0, 0, 0);
  player.grounded = false;
  player.health = MAX_HEALTH;
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

// (x, feetY, z) is the player's FEET position. Tests the whole body box
// (PLAYER_RADIUS in X/Z, PLAYER_HEIGHT tall) against solid blocks across
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
        if (isSolid(bx, by, bz)) return true;
      }
    }
  }
  return false;
}

// onLand(impactSpeed) fires when the player hits the ground -- lets
// health.js apply fall damage without player.js needing to import it.
export function updatePlayer(dt, camera, onLand) {
  const forward = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));

  let moveX = 0, moveZ = 0;
  if (keys['KeyW']) { moveX -= forward.x; moveZ -= forward.z; }
  if (keys['KeyS']) { moveX += forward.x; moveZ += forward.z; }
  if (keys['KeyA']) { moveX -= right.x; moveZ -= right.z; }
  if (keys['KeyD']) { moveX += right.x; moveZ += right.z; }

  const len = Math.hypot(moveX, moveZ);
  if (len > 0) { moveX /= len; moveZ /= len; }

  const dx = moveX * MOVE_SPEED * dt;
  const dz = moveZ * MOVE_SPEED * dt;

  // move on X / Z independently (feet = eye position minus eye height).
  // collidesAt tests the whole body, so one check per axis suffices.
  const feetY = player.pos.y - EYE_HEIGHT;
  if (!collidesAt(player.pos.x + dx, feetY, player.pos.z)) player.pos.x += dx;
  if (!collidesAt(player.pos.x, feetY, player.pos.z + dz)) player.pos.z += dz;

  // gravity
  player.vel.y += GRAVITY * dt;
  if (player.grounded && keys['Space']) {
    player.vel.y = JUMP_SPEED;
    player.grounded = false;
  }

  const newY = player.pos.y + player.vel.y * dt;
  const newFeetY = newY - EYE_HEIGHT;

  if (player.vel.y <= 0) {
    // falling: if body would intersect ground, snap feet to top of block
    if (collidesAt(player.pos.x, newFeetY, player.pos.z)) {
      const impactSpeed = -player.vel.y; // speed at moment of landing
      if (onLand) onLand(impactSpeed);
      player.pos.y = Math.floor(newFeetY + 0.5) + 0.5 + EYE_HEIGHT;
      player.vel.y = 0;
      player.grounded = true;
    } else {
      player.pos.y = newY;
      player.grounded = false;
    }
  } else {
    // rising: if body would intersect a ceiling, stop upward motion
    if (collidesAt(player.pos.x, newFeetY, player.pos.z)) {
      player.vel.y = 0;
    } else {
      player.pos.y = newY;
    }
  }

  // safety floor
  if (player.pos.y < -20) {
    player.pos.set(0.5, MAX_HEIGHT + 5, 0.5);
    player.vel.set(0, 0, 0);
  }

  camera.position.copy(player.pos);
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
}
