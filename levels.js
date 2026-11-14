// Levels: a rug size, a time limit, the buggy's start, and a build() that places toy blocks on a 1 m grid.
// Block looks: 0-5 painted wood (red, yellow, blue, green, orange, purple), 6 STONE (needs a fast swing),
// 7 TNT (blows up its neighbours), 8 STAR (gold, +5 coins), 9 TEDDY (do NOT smash: -5 s; never counts).
// Wind-up robots (b.robot) walk a circle or a line and count as targets. The level clears at GOAL of all targets.
// 24 handmade rugs in 4 worlds of 6; stars unlock the next world. After that: endless Rug Rumble + a Daily Rug.

export const GOAL = 0.8;
export const STONE = 6, TNT = 7, STAR = 8, TEDDY = 9;
export const WORLDS = [
  { name: 'Playroom', theme: 'playroom', stars: 0 },
  { name: 'Kitchen', theme: 'kitchen', stars: 8 },
  { name: 'Sandbox', theme: 'sandbox', stars: 20 },
  { name: 'Bedtime', theme: 'bedtime', stars: 34 },
];
export const PER_WORLD = 6;

// builder helpers: b.put(x, z, y, look) is the only primitive
function api(list, robots) {
  const used = new Map();
  const b = {
    // wind-up robot: { circle: [cx, cz, r] } or { line: [x1, z1, x2, z2] }, speed in m/s, phase 0..1
    robot(path, speed = 2.2, phase = 0, color = 0) { robots.push({ ...path, speed, phase, color }); },
    // a later put on the same cell replaces the look (so TNT/STAR can be dropped into a built shape)
    put(x, z, y, look) { const k = `${x},${z},${y}`; if (used.has(k)) { used.get(k).look = look; return; } const o = { x, z, y, look }; used.set(k, o); list.push(o); },
    tower(x, z, h, look = -1) { for (let y = 0; y < h; y++) b.put(x, z, y, look < 0 ? (((x * 7 + z * 3 + y) % 6) + 6) % 6 : look); },
    wall(x1, z1, x2, z2, h, look = -1) {
      const n = Math.max(Math.abs(x2 - x1), Math.abs(z2 - z1));
      for (let i = 0; i <= n; i++) b.tower(Math.round(x1 + (x2 - x1) * i / n), Math.round(z1 + (z2 - z1) * i / n), h, look);
    },
    // stepped pyramid: every block rests on one below it (columns), base n x n
    pyramid(x, z, n, look = -1) {
      const h = n >> 1;
      for (let y = 0; y < n; y++) { const s = n - y, o = y >> 1; for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) b.put(x - h + o + i, z - h + o + j, y, look < 0 ? (y + 1) % 6 : look); }
    },
    ring(x, z, r, n, h, look = -1) { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; b.tower(Math.round(x + Math.cos(a) * r), Math.round(z + Math.sin(a) * r), h, look); } },
    box(x, z, w, d, h, look = -1) { for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) b.tower(x + i, z + j, h, look); },
  };
  return b;
}

const L = [
  // ---- World 1: Playroom --------------------------------------------------------------------------------
  { name: 'First Smash', goal: 0.7, w: 20, d: 20, time: 60, start: [0, 7, Math.PI],
    hint: 1, build(b) { b.tower(0, -1, 5, 0); b.tower(-4, -4, 4, 2); b.tower(4, -4, 4, 3); b.tower(-6, 2, 3, 4); b.tower(6, 2, 3, 5); b.tower(0, -7, 3, 1); b.put(0, -4, 0, STAR); } },
  { name: 'Wind-up Parade', par: [400, 550], rug: 1, w: 22, d: 22, time: 50, start: [0, 7, Math.PI],
    hint: 7, build(b) { b.robot({ circle: [0, -1, 4.5] }, 1.6, 0, 0); b.robot({ circle: [0, -1, 4.5] }, 1.6, 0.5, 1); b.tower(0, -1, 4); b.tower(-7, -7, 2); b.tower(7, -7, 2); b.put(0, -8, 0, STAR); } },
  { name: 'Teddy Time', par: [850, 1250], rug: 2, w: 22, d: 22, time: 55, start: [0, 7, Math.PI],
    hint: 6, build(b) { b.box(-2, -4, 4, 3, 2); b.put(-4, -3, 0, TEDDY); b.put(3, -3, 0, TEDDY); b.tower(-6, 2, 2); b.tower(6, 2, 2); b.put(0, -8, 0, STAR); } },
  { name: 'Ring Around', par: [600, 850], rug: 3, w: 24, d: 24, time: 65, start: [0, 0, Math.PI],
    hint: 2, build(b) { b.ring(0, 0, 6, 8, 3); b.put(0, -3, 0, STAR); } },
  { name: 'Tiny Pyramid', par: [1800, 2700], rug: 5, w: 24, d: 24, time: 60, start: [0, 8, Math.PI],
    hint: 5, build(b) { b.pyramid(0, 0, 4); b.tower(-7, -7, 2); b.tower(7, -7, 2); b.put(0, -9, 0, STAR); } },
  { name: 'Boom Box', par: [1950, 2850], rug: 4, w: 26, d: 26, time: 70, start: [0, 9, Math.PI],
    hint: 4, build(b) { b.box(-6, -4, 3, 3, 2, 1); b.put(-5, -3, 0, TNT); b.box(4, -4, 3, 3, 2, 3); b.put(5, -3, 0, TNT); b.box(-1, -9, 3, 2, 3, 5); b.put(0, -9, 0, TNT); } },
  // ---- World 2: Kitchen ---------------------------------------------------------------------------------
  { name: 'Domino Lanes', par: [2850, 4200], w: 30, d: 22, time: 60, start: [-11, 8, Math.PI],
    build(b) { b.wall(-6, -6, 6, -6, 2, 1); b.wall(-6, -1, 6, -1, 2, 2); b.wall(-6, 4, 6, 4, 2, 3); b.robot({ line: [-7, -3.5, 7, -3.5] }, 2.2, 0, 1); b.put(8, -9, 0, STAR); b.put(-8, -9, 0, STAR); } },
  { name: 'Hard Rock', par: [800, 1150], w: 26, d: 26, time: 85, start: [0, 9, Math.PI],
    hint: 3, build(b) { b.tower(-4, 0, 3, 0); b.tower(4, 0, 3, 2); b.tower(0, -5, 1, STONE); b.tower(-6, -6, 1, STONE); b.tower(6, -6, 1, STONE); b.tower(0, 2, 3, 4); b.tower(-7, 3, 3, 1); b.tower(7, 3, 3, 5); b.wall(-3, -9, 3, -9, 1, 3); b.put(0, -8, 0, STAR); } },
  { name: 'Robot Rush', par: [600, 900], w: 28, d: 26, time: 70, start: [0, 9, Math.PI],
    build(b) { for (let k = 0; k < 3; k++) { b.robot({ line: [-9, -7 + k * 4, 9, -7 + k * 4] }, 2.4 + k * 0.4, k * 0.33, k % 3); b.robot({ line: [9, -5 + k * 4, -9, -5 + k * 4] }, 2.2, 0.5, (k + 1) % 3); }
      b.tower(-11, -9, 2); b.tower(11, -9, 2); b.tower(-11, 5, 2); b.tower(11, 5, 2); b.put(0, -10, 0, STAR); } },
  { name: 'Toy Castle', par: [3100, 4600], w: 28, d: 28, time: 75, start: [0, 10, Math.PI],
    build(b) { b.wall(-5, -8, 5, -8, 2); b.wall(-5, -2, 5, -2, 2); b.wall(-5, -8, -5, -2, 2); b.wall(5, -8, 5, -2, 2);
      for (const [x, z] of [[-5, -8], [5, -8], [-5, -2], [5, -2]]) b.tower(x, z, 4, 0); b.put(0, -5, 0, TNT); b.put(1, -5, 0, STAR);
      b.put(-7, 0, 0, TEDDY); b.put(7, 0, 0, TEDDY); b.put(0, 1, 0, TEDDY); } },
  { name: 'Block City', w: 30, d: 30, time: 80, start: [0, 12, Math.PI],
    build(b) { for (let i = -2; i <= 2; i++) for (let j = -2; j <= 1; j++) { const h = 1 + ((i * 5 + j * 3 + 9) % 4); b.tower(i * 4, j * 4 - 2, h); }
      b.put(-8, -10, 0, STAR); b.put(8, -10, 0, STAR); b.put(0, -2, 0, TNT); b.robot({ line: [-11, 5, 11, 5] }, 2.2, 0, 2); } },
  { name: 'Sugar Cubes', par: [1800, 2600], w: 30, d: 28, time: 85, start: [0, 11, Math.PI],
    build(b) { b.pyramid(-7, -4, 3, 1); b.pyramid(0, -6, 4, 4); b.pyramid(7, -4, 3, 3);
      for (const [x, z] of [[-4, -2], [4, -2], [-3, -10], [3, -10], [0, 0]]) b.put(x, z, 0, TEDDY); b.put(0, -11, 0, STAR); } },
  // ---- World 3: Sandbox ---------------------------------------------------------------------------------
  { name: 'Stone Fort', par: [3500, 5150], w: 30, d: 30, time: 95, start: [0, 12, Math.PI],
    build(b) { b.wall(-6, -9, 6, -9, 2, STONE); b.wall(-6, -9, -6, -2, 2, STONE); b.wall(6, -9, 6, -2, 2, STONE);
      b.box(-2, -7, 5, 3, 3); b.put(0, -6, 0, TNT); b.put(-3, -4, 0, TNT); b.put(3, -4, 0, TNT); b.tower(-9, 2, 3); b.tower(9, 2, 3); } },
  { name: 'Spiral', par: [1350, 2000], w: 30, d: 30, time: 80, start: [0, 0, 0],
    build(b) { for (let i = 0; i < 26; i++) { const a = i * 0.55, r = 3 + i * 0.36; b.tower(Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r), 1 + (i % 3), i % 6); }
      b.put(0, 3, 0, STAR); b.put(11, 0, 0, TNT); } },
  { name: 'Sand Robots', par: [1150, 1700], w: 30, d: 30, time: 85, start: [0, 12, Math.PI],
    build(b) { for (const [cx, cz] of [[-7, -6], [7, -6], [0, 2]]) { b.tower(cx, cz, 3); b.robot({ circle: [cx, cz, 2.6] }, 2.0, 0, 0); b.robot({ circle: [cx, cz, 2.6] }, 2.0, 0.5, 1); }
      b.wall(-3, -11, 3, -11, 2); b.put(0, -12, 0, STAR); } },
  { name: 'Teddy Maze', w: 30, d: 30, time: 100, start: [0, 12, Math.PI],
    build(b) { b.wall(-9, -8, 9, -8, 2); b.wall(-9, -3, 9, -3, 2); b.wall(-9, 2, 9, 2, 2);
      for (const x of [-6, -1, 4]) b.put(x, -8, 0, TEDDY); for (const x of [-4, 1, 6]) b.put(x, -3, 0, TEDDY); for (const x of [-6, -1, 4]) b.put(x, 2, 0, TEDDY);
      b.put(0, -11, 0, STAR); } },
  { name: 'Twin Peaks', w: 32, d: 30, time: 90, start: [0, 12, Math.PI],
    build(b) { b.pyramid(-6, -4, 4); b.pyramid(6, -4, 4); b.put(-6, -4, 0, TNT); b.put(6, -4, 0, TNT); b.wall(-3, -11, 3, -11, 2, STONE); b.put(0, -12, 0, STAR); b.put(0, 3, 0, STAR);
      b.robot({ line: [-12, 1, 12, 1] }, 2.6, 0, 2); } },
  { name: 'Bucket Brigade', par: [2050, 3050], w: 32, d: 30, time: 85, start: [0, 12, Math.PI],
    build(b) { for (const [cx, cz] of [[-8, -7], [0, -7], [8, -7], [-4, 0], [4, 0]]) { b.ring(cx, cz, 2, 6, 2); b.put(cx, cz, 0, TNT); } b.put(0, -12, 0, STAR); } },
  // ---- World 4: Bedtime ---------------------------------------------------------------------------------
  { name: 'Night Patrol', par: [1750, 2600], w: 30, d: 30, time: 80, start: [0, 12, Math.PI],
    build(b) { for (let k = 0; k < 5; k++) b.robot({ circle: [0, -3, 7] }, 2.4, k / 5, k % 3);
      b.box(-1, -4, 3, 3, 3); b.put(0, -3, 0, TNT); b.tower(-11, -11, 3); b.tower(11, -11, 3); b.put(0, -12, 0, STAR); } },
  { name: 'Pillow Fort', par: [3600, 5300], w: 30, d: 30, time: 90, start: [0, 12, Math.PI],
    build(b) { b.box(-6, -9, 4, 4, 2); b.box(3, -9, 4, 4, 2); b.box(-2, -2, 4, 3, 3);
      for (const [x, z] of [[-7, -10], [7, -10], [-1, -6], [2, -6], [-4, -1], [5, -1], [0, 3], [-8, -3], [8, -3]]) b.put(x, z, 0, TEDDY); b.put(0, -12, 0, STAR); } },
  { name: 'Boom Spiral', w: 30, d: 30, time: 85, start: [0, 0, 0],
    build(b) { for (let i = 0; i < 22; i++) { const a = i * 0.6, r = 3.5 + i * 0.4; b.tower(Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r), 2, (i % 7 === 3) ? TNT : i % 6); } b.put(0, 4, 0, STAR); } },
  { name: 'Robot Disco', par: [700, 1050], w: 30, d: 30, time: 80, start: [0, 12, Math.PI],
    build(b) { for (let k = 0; k < 4; k++) b.robot({ circle: [0, -4, 4] }, 2.0, k / 4, k % 3); for (let k = 0; k < 4; k++) b.robot({ circle: [0, -4, 8] }, 2.8, k / 4 + 0.12, (k + 1) % 3);
      b.tower(0, -4, 4, STONE); b.put(-12, -12, 0, STAR); b.put(12, -12, 0, STAR); } },
  { name: 'Heavy Hats', par: [500, 700], w: 32, d: 30, time: 100, start: [0, 12, Math.PI],
    build(b) { for (const [x, z] of [[-9, -8], [-3, -8], [3, -8], [9, -8], [-6, -2], [0, -2], [6, -2]]) { b.put(x, z, 0, 1); b.put(x, z, 1, 3); b.put(x, z, 2, STONE); b.put(x, z, 3, STONE); }
      for (const [x, z] of [[-6, -8], [0, -8], [6, -8], [-3, -2], [3, -2]]) b.put(x, z, 0, TEDDY); b.put(0, -12, 0, STAR); } },
  { name: 'Grand Castle', par: [6400, 9400], w: 34, d: 34, time: 130, start: [0, 14, Math.PI],
    build(b) { b.wall(-8, -12, 8, -12, 3); b.wall(-8, -2, 8, -2, 2); b.wall(-8, -12, -8, -2, 3); b.wall(8, -12, 8, -2, 3);
      for (const [x, z] of [[-8, -12], [8, -12], [-8, -2], [8, -2]]) b.tower(x, z, 5, STONE);
      b.pyramid(0, -7, 3, 1); b.put(0, -7, 0, TNT); b.put(-4, -7, 0, TNT); b.put(4, -7, 0, TNT); b.put(0, -10, 0, STAR); b.put(0, 4, 0, STAR);
      b.robot({ line: [-12, 1, 12, 1] }, 2.4, 0, 0); b.robot({ line: [12, 3, -12, 3] }, 2.4, 0.5, 1); } },
];

// after the handmade set: endless "Rug Rumble" levels from a seed, a bit bigger each time
function rng(seed) { let s = seed * 9301 + 49297; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }
function procedural(i, seed = 0) {
  const r = rng(seed || i * 17 + 3), n = i - L.length;
  const size = Math.min(40, 28 + n * 1.5) | 0;
  return { name: `Rug Rumble ${n + 1}`, w: size, d: size, time: 80 + Math.min(40, n * 4), start: [0, size / 2 - 3, Math.PI],
    build(b) {
      const half = size / 2 - 4;
      const k = 4 + Math.min(6, n);
      for (let q = 0; q < k; q++) {
        const x = Math.round((r() * 2 - 1) * half), z = Math.round((r() * 2 - 1) * (half - 1)) - 2, t = r();
        if (Math.hypot(x, z - (size / 2 - 3)) < 5) continue;
        if (t < 0.3) b.tower(x, z, 2 + (r() * 3 | 0));
        else if (t < 0.5) b.pyramid(x, z, 2 + (r() * 2 | 0));
        else if (t < 0.7) b.wall(x - 3, z, x + 3, z, 2, r() < 0.3 ? STONE : -1);
        else if (t < 0.85) { b.box(x - 1, z - 1, 3, 3, 2); b.put(x, z, 0, TNT); }
        else if (t < 0.93) b.ring(x, z, 3, 6, 2);
        else { b.tower(x, z, 2); b.robot({ circle: [x, z, 2.6] }, 2.2, r(), q % 3); }
        if (r() < 0.25) b.put(x + 2, z + 2, 0, TEDDY);
      }
      b.put(Math.round((r() * 2 - 1) * half), -half, 0, STAR);
    } };
}

export const HAND_LEVELS = L.length;
export const worldOf = (i) => (i < L.length ? Math.floor(i / PER_WORLD) : i % WORLDS.length);
// i = level index, or 'daily' for today's seeded rug
export function getLevel(i, daySeed = 0) {
  const def = i === 'daily' ? { ...procedural(L.length + 3 + (daySeed % 7), daySeed % 233280), name: 'Daily Rug', daily: true } : i < L.length ? L[i] : procedural(i);
  const blocks = [], robots = [];
  def.build(api(blocks, robots));
  const inside = blocks.filter((q) => Math.abs(q.x) <= def.w / 2 - 2 && Math.abs(q.z) <= def.d / 2 - 2);
  const theme = WORLDS[i === 'daily' ? daySeed % WORLDS.length : worldOf(i)].theme;
  return { ...def, index: i, blocks: inside, robots, theme };
}
