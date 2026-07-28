import { GRAVITY, PICKUP_RADIUS, STACK_RADIUS, EYE_HEIGHT } from './config.js';
import { BLOCK_TYPES } from './blocks.js';
import { player } from './player.js';
import { inventory } from './inventory.js';
import { updateHotbarUI, autoAssignPickup } from './hotbar.js';

let sceneRef = null;
export function initEffects(scene) { sceneRef = scene; }

const dropGeometry = new THREE.BoxGeometry(0.35, 0.35, 0.35);
const dropMaterials = {};
for (const t in BLOCK_TYPES) dropMaterials[t] = new THREE.MeshBasicMaterial({ color: BLOCK_TYPES[t].color });

const drops = [];

export function spawnDrop(x, y, z, type) {
  for (const d of drops) {
    if (d.type !== type) continue;
    const dx = d.mesh.position.x - x, dz = d.mesh.position.z - z, dy = d.baseY - y;
    if (dx * dx + dy * dy + dz * dz < STACK_RADIUS * STACK_RADIUS) {
      d.count++;
      d.mesh.scale.setScalar(Math.min(1.6, 1 + d.count * 0.08));
      return;
    }
  }
  const mesh = new THREE.Mesh(dropGeometry, dropMaterials[type]);
  mesh.position.set(x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3);
  sceneRef.add(mesh);
  drops.push({ mesh, type, count: 1, baseY: y, phase: Math.random() * Math.PI * 2 });
}

export function updateDrops(dt, nowSec) {
  if (drops.length === 0) return;
  const feetY = player.pos.y - EYE_HEIGHT;
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.mesh.position.y = d.baseY + Math.sin(nowSec * 2 + d.phase) * 0.12;
    d.mesh.rotation.y += dt * 1.6;
    const dx = d.mesh.position.x - player.pos.x;
    const dz = d.mesh.position.z - player.pos.z;
    const dy = d.baseY - (feetY + 0.9);
    if (dx * dx + dy * dy + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS) {
      sceneRef.remove(d.mesh);
      drops.splice(i, 1);
      inventory[d.type] += d.count;
      // put it in an empty hotbar slot right away if it isn't equipped
      // anywhere yet; falls back to inventory-only if the bar is full
      autoAssignPickup(d.type);
      updateHotbarUI();
    }
  }
}

const particleGeometry = new THREE.BoxGeometry(0.12, 0.12, 0.12);
const particles = [];

export function spawnParticles(x, y, z, type) {
  const n = 6 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: BLOCK_TYPES[type].color, transparent: true, opacity: 1
    });
    const mesh = new THREE.Mesh(particleGeometry, mat);
    mesh.position.set(x, y, z);
    sceneRef.add(mesh);
    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 3,
      Math.random() * 3 + 1,
      (Math.random() - 0.5) * 3
    );
    particles.push({ mesh, vel, life: 0, maxLife: 0.35 + Math.random() * 0.2 });
  }
}

export function updateParticles(dt) {
  if (particles.length === 0) return;
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life += dt;
    if (p.life >= p.maxLife) {
      sceneRef.remove(p.mesh);
      p.mesh.material.dispose();
      particles.splice(i, 1);
      continue;
    }
    p.vel.y += GRAVITY * 0.4 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    const t = p.life / p.maxLife;
    p.mesh.material.opacity = 1 - t;
    p.mesh.scale.setScalar(1 - t * 0.6);
  }
}

export function clearEffects() {
  for (const d of drops) sceneRef.remove(d.mesh);
  drops.length = 0;
  for (const p of particles) { sceneRef.remove(p.mesh); p.mesh.material.dispose(); }
  particles.length = 0;
}