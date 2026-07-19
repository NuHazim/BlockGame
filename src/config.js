// ---------- World & physics ----------
export const WORLD_SIZE = 48;
export const WORLD_HALF = WORLD_SIZE / 2;
export const MAX_HEIGHT = 14;
export const BLOCK = 1;

export const GRAVITY = -22;
export const JUMP_SPEED = 8.2;
export const MOVE_SPEED = 6.0;
export const PLAYER_RADIUS = 0.32;
export const EYE_HEIGHT = 1.62;
export const PLAYER_HEIGHT = 1.8; // full body height, feet to head
export const REACH = 7;
export const COLLISION_EPS = 0.001;

export const MOUSE_SENS = 0.0022;

// ---------- Health / survival ----------
export const MAX_HEALTH = 100;
export const FALL_DAMAGE_THRESHOLD = 10; // impact speed below this is a safe landing
export const FALL_DAMAGE_SCALE = 6;      // hp lost per unit of speed over the threshold
export const HEALTH_REGEN_RATE = 1.5;    // hp / second

// ---------- Item drops ----------
export const PICKUP_RADIUS = 1.1;
export const STACK_RADIUS = 1.6; // drops of the same type this close merge into one stack

// keys the game consumes -- suppressed while playing so the browser/iframe
// doesn't scroll (Space) or trigger other default behavior.
export const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space',
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5',
  'Digit6', 'Digit7', 'Digit8', 'Digit9'
]);
