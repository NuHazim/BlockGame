// ---------- World & physics ----------
export const CHUNK_SIZE = 16;
export const BLOCK = 1;
export const CHUNK_COUNT = 6;
export const WORLD_SIZE = CHUNK_SIZE * CHUNK_COUNT;
export const WORLD_HALF = WORLD_SIZE / 2;
export const MAX_HEIGHT = 40

export const SEA_LEVEL = 5;
export const SNOW_LEVEL = 21;
export const RENDER_DISTANCE = 8;                     // chunk radius around the player -- 8 = 17x17 chunks rendered

// How many chunks (per side) get batched into one shared set of meshes.
// Each region draws its grass/dirt/stone/etc as ONE mesh per block type
// covering every chunk inside it, instead of one mesh per type PER CHUNK --
// that's what actually controls draw-call count at higher render
// distances. Bigger = fewer draw calls per frame, but a single block edit
// now has to rebuild its whole region (up to MESH_REGION_SIZE^2 chunks)
// instead of just the edited chunk, so there's a real tradeoff. 4 is a
// reasonable middle ground; drop it to 2 if edits start feeling laggy, or
// raise it if you push RENDER_DISTANCE higher and want fewer draw calls.
export const MESH_REGION_SIZE = 4;

// The world used to generate infinitely outward forever, which was a big
// source of the long-session lag. Real Minecraft's world border defaults to
// ~60,000,000 blocks per side -- far too large to be a meaningful "cap" for
// a browser game -- so this bounds the world to a fixed, generous radius
// (in chunks) from spawn instead. Chunk generation just stops past this,
// and the player can't walk past it either (see player.js). Raise it for
// more room to roam, at the cost of more memory/meshing work overall.
export const WORLD_BORDER_CHUNKS = 24; // 24*16 = 384 block radius (~768x768 total)

export const GRAVITY = -22;
export const JUMP_SPEED = 8.2;
export const MOVE_SPEED = 6.0;
export const AIR_CONTROL_ACCEL = 20;   // how fast horizontal velocity can be steered while airborne (units/s^2) -- keeps some control without erasing existing momentum
export const PLAYER_RADIUS = 0.32;
export const EYE_HEIGHT = 1.62;
export const PLAYER_HEIGHT = 1.8; // full body height, feet to head
export const REACH = 7;
export const COLLISION_EPS = 0.001;

export const MOUSE_SENS = 0.0022;

// ---------- Swimming ----------
// Water is non-solid for the player (see player.js's isBlocking) so it can
// actually be swum through instead of walked on top of like a normal block.
export const SWIM_SPEED = 3.2;         // normal swim speed, units/s
export const SWIM_SPRINT_SPEED = 5.2;  // swim-sprint speed, toggled by double-tapping W while inWater
export const SWIM_RISE_SPEED = 3.0;    // vertical rise speed while holding Space in water
export const WATER_GRAVITY_SCALE = 0.25; // fraction of normal gravity applied while submerged (buoyancy)
export const WATER_SINK_TERMINAL = -2.2; // max downward speed while in water -- slow sink, not a free-fall
export const DOUBLE_TAP_WINDOW = 300;  // ms window for double-tap gestures (swim sprint, creative flight)

// ---------- Flight (Creative only) ----------
export const FLY_SPEED = 9;            // horizontal speed while flying
export const FLY_VERTICAL_SPEED = 7;   // ascend/descend speed while flying (Space / Shift)
// ---------- Crouch / sneak ----------
export const CROUCH_SPEED_MULT = 0.3;  // fraction of normal MOVE_SPEED while sneaking
export const CROUCH_EYE_OFFSET = 0.3;  // how far the camera visually lowers while sneaking (cosmetic only -- collision box is unchanged)
// ---------- Day / night cycle ----------
// how long one full sunrise-to-sunrise loop takes, in real seconds.
// the sun/moon path itself (rise in +x, overhead at noon, set in -x) is
// modeled after the real sun's arc -- this just controls how fast it plays.
export const DAY_LENGTH_SECONDS = 300;

// ---------- Health / survival ----------
export const MAX_HEALTH = 100;
export const FALL_DAMAGE_THRESHOLD = 11.5; // impact speed (units/s) below which a landing is safe -- ~3 blocks of fall: sqrt(2 * |GRAVITY| * 3)
export const FALL_DAMAGE_SCALE = 6;      // hp lost per unit of speed over the threshold
export const HEALTH_REGEN_RATE = 1.5;    // hp / second

// ---------- Item drops ----------
export const PICKUP_RADIUS = 1.1;
export const STACK_RADIUS = 1.6; // drops of the same type this close merge into one stack

// ---------- Mining ----------
export const MINE_DURATION = 0.35; // seconds left click must be held on the same block before it breaks

// ---------- Mobs ----------
export const MOB_SPAWN_INTERVAL = 6;      // seconds between spawn attempts
export const MOB_MAX_COUNT = 12;          // cap on simultaneous mobs
export const MOB_SPAWN_RADIUS = [12, 26]; // [min, max] distance from the player a mob can spawn at
export const MOB_DESPAWN_RADIUS = 45;     // mobs farther than this from the player are removed

// keys the game consumes -- suppressed while playing so the browser/iframe
// doesn't scroll (Space) or trigger other default behavior.
export const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space',
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5',
  'Digit6', 'Digit7', 'Digit8', 'Digit9'
]);