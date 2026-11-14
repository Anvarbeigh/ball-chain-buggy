// Ball & Chain Buggy — a toy buggy drags a wrecking ball on a chain. Only the ball smashes things.
// three.js, one file of game code. Physics is our own (fixed sub-steps): arcade car, ball on a rope
// constraint, toy blocks stacked in grid columns (remove one, the ones above fall; a long fall breaks them).
import * as THREE from './vendor/three.module.js';
import { platform } from './platform.js';
import { audio } from './audio.js';
import { getLevel, GOAL, STONE, TNT, STAR, TEDDY, HAND_LEVELS, WORLDS, PER_WORLD, worldOf } from './levels.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const DEBUG = new URLSearchParams(location.search).has('debug');

// ---------------------------------------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------------------------------------
const SKINS = [
  { name: 'Cherry', body: 0xef4b3f, trim: 0xffe9c0, price: 0 },
  { name: 'Sky', body: 0x3b8cf0, trim: 0xfff4dc, price: 150 },
  { name: 'Lime', body: 0x45c05a, trim: 0xfff4dc, price: 300 },
  { name: 'Sunny', body: 0xffc531, trim: 0x3a2414, price: 500 },
  { name: 'Grape', body: 0x9a63f0, trim: 0xffe066, price: 800 },
  { name: 'Panda', body: 0xf6f0e6, trim: 0x2b2b2b, price: 1200 },
];
const UPS = {
  ball: { name: 'Heavier ball', desc: 'Smash at lower speed, push harder', icon: '●', max: 5, cost: (l) => 60 + l * 70 },
  chain: { name: 'Longer chain', desc: 'Wider swings, more reach', icon: '⛓', max: 5, cost: (l) => 50 + l * 60 },
  engine: { name: 'Faster engine', desc: 'More speed = more swing power', icon: '⚡', max: 5, cost: (l) => 70 + l * 80 },
};
let state = { coins: 0, cur: 0, best: 0, stars: [], up: { ball: 0, chain: 0, engine: 0 }, skin: 0, owned: [0], sound: true, music: true, lastSeen: 0 };
const dayNum = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
const totalStars = () => (state.stars || []).reduce((a, b) => a + (b || 0), 0);
const worldOpen = (w) => totalStars() >= WORLDS[w].stars;
const levelOpen = (i) => i <= state.cur && (i >= HAND_LEVELS || worldOpen(worldOf(i)));
function save() { state.lastSeen = Date.now(); const s = JSON.stringify(state); platform.writeSave(s); }

// ---------------------------------------------------------------------------------------------------------
// Renderer / scene
// ---------------------------------------------------------------------------------------------------------
const canvas = $('game');
// touch UI: the CrazyGames SDK says which device it is; otherwise the first touch switches it on
let mobile = false;
function setTouch(on) { mobile = on; document.body.classList.toggle('touch', on); }
addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' && !mobile) setTouch(true); }, true);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9c79a);
scene.fog = new THREE.Fog(0xe9c79a, 40, 75);
const camera = new THREE.PerspectiveCamera(46, 1, 0.5, 200);
const hemi = new THREE.HemisphereLight(0xfff6e6, 0xb48a5a, 1.55); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(-8, 20, 10); sun.castShadow = true;
sun.shadow.mapSize.set(1536, 1536);
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 60 });
sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  // portrait screens see the rug from further back (static per aspect: never animated)
  camera.fov = w / h < 1 ? 62 : 46;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ---------------------------------------------------------------------------------------------------------
// Textures (all painted in code: one toy-box style)
// ---------------------------------------------------------------------------------------------------------
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
const LOOKS = [
  { c: '#ef4b3f', s: 'A' }, { c: '#ffc531', s: 'B' }, { c: '#3b8cf0', s: 'C' }, { c: '#45c05a', s: '★' }, { c: '#ff9132', s: '●' }, { c: '#9a63f0', s: '▲' },
  { c: '#9a948c', s: 'stone' }, { c: '#e5372b', s: 'TNT' }, { c: '#ffd23a', s: 'star' }, { c: '#c48a58', s: 'teddy' },
];
const BLOCK_HEX = LOOKS.map((l) => new THREE.Color(l.c).getHex());
function blockTex(look) {
  return canvasTex(128, 128, (g, w) => {
    const L = LOOKS[look];
    g.fillStyle = L.c; g.fillRect(0, 0, w, w);
    // painted bevel: light top-left, dark bottom-right
    const gr = g.createLinearGradient(0, 0, w, w); gr.addColorStop(0, 'rgba(255,255,255,.28)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,.22)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
    g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, w - 8);
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 3; g.strokeRect(10, 10, w - 20, w - 20);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (L.s === 'stone') {
      g.fillStyle = 'rgba(0,0,0,.12)'; for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(20 + (i * 37) % 90, 22 + (i * 53) % 86, 6 + (i % 3) * 4, 0, 7); g.fill(); }
      g.strokeStyle = 'rgba(40,30,20,.45)'; g.lineWidth = 3; g.beginPath(); g.moveTo(30, 18); g.lineTo(52, 50); g.lineTo(44, 74); g.lineTo(70, 108); g.moveTo(52, 50); g.lineTo(88, 44); g.stroke();
    } else if (L.s === 'TNT') {
      g.fillStyle = '#fff4dc'; g.fillRect(14, 42, w - 28, 44);
      g.fillStyle = '#c0231a'; g.font = '900 38px Rubik, sans-serif'; g.fillText('TNT', w / 2, 66);
    } else if (L.s === 'teddy') {
      // a teddy-bear face: soft, friendly, clearly "don't hit me"
      g.fillStyle = '#8a5a32'; for (const ex of [36, 92]) { g.beginPath(); g.arc(ex, 34, 17, 0, 7); g.fill(); }
      g.fillStyle = '#efc49a'; for (const ex of [36, 92]) { g.beginPath(); g.arc(ex, 34, 8, 0, 7); g.fill(); }
      g.fillStyle = '#d9a46e'; g.beginPath(); g.arc(64, 70, 40, 0, 7); g.fill();
      g.fillStyle = '#f6dcb4'; g.beginPath(); g.ellipse(64, 86, 19, 14, 0, 0, 7); g.fill();
      g.fillStyle = '#2b1a10'; for (const ex of [48, 80]) { g.beginPath(); g.arc(ex, 62, 6, 0, 7); g.fill(); }
      g.beginPath(); g.ellipse(64, 80, 7, 5, 0, 0, 7); g.fill();
      g.strokeStyle = '#2b1a10'; g.lineWidth = 3; g.beginPath(); g.arc(64, 86, 8, 0.2, Math.PI - 0.2); g.stroke();
      g.fillStyle = '#ff7aa8'; g.beginPath(); g.arc(40, 80, 5, 0, 7); g.arc(88, 80, 5, 0, 7); g.fill();
    } else if (L.s === 'star') {
      g.fillStyle = '#fff6c8'; g.font = '900 76px Rubik, sans-serif'; g.fillText('★', w / 2, 70);
      g.strokeStyle = '#c48a00'; g.lineWidth = 3; g.strokeText('★', w / 2, 70);
    } else {
      g.fillStyle = 'rgba(255,244,220,.92)'; g.beginPath(); g.roundRect(26, 26, w - 52, w - 52, 12); g.fill();
      g.fillStyle = L.c; g.font = '900 54px Rubik, sans-serif'; g.fillText(L.s, w / 2, 68);
    }
  });
}
const woodTex = canvasTex(256, 256, (g, w) => {
  g.fillStyle = '#d29a5c'; g.fillRect(0, 0, w, w);
  for (let i = 0; i < 4; i++) {
    g.fillStyle = i % 2 ? '#c88e50' : '#d8a466'; g.fillRect(0, i * 64, w, 62);
    g.fillStyle = 'rgba(90,50,20,.35)'; g.fillRect(0, i * 64 + 62, w, 2);
    g.strokeStyle = 'rgba(120,70,30,.18)'; g.lineWidth = 2;
    for (let k = 0; k < 5; k++) { g.beginPath(); const y = i * 64 + 8 + k * 11; g.moveTo(0, y); g.bezierCurveTo(80, y + 6, 160, y - 6, 256, y + 2); g.stroke(); }
    g.fillStyle = 'rgba(90,50,20,.3)'; g.fillRect(((i * 97) % 200) + 20, i * 64, 2, 62);
  }
}, [8, 8]);

const tileTex = canvasTex(256, 256, (g, w) => {
  g.fillStyle = '#c9d3d8'; g.fillRect(0, 0, w, w);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#d8e0e4' : '#bcc7cd'; g.fillRect(i * 128 + 3, j * 128 + 3, 122, 122); }
}, [8, 8]);
const grassTex = canvasTex(256, 256, (g, w) => {
  g.fillStyle = '#86c463'; g.fillRect(0, 0, w, w);
  g.strokeStyle = '#6fae4f'; g.lineWidth = 3; for (let i = 0; i < 160; i++) { const x = (i * 97) % w, y = (i * 61) % w; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 3, y - 9); g.stroke(); }
}, [8, 8]);
const nightWoodTex = canvasTex(256, 256, (g, w) => {
  g.fillStyle = '#5b4a6a'; g.fillRect(0, 0, w, w);
  for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#56456a' : '#625170'; g.fillRect(0, i * 64, w, 62); g.fillStyle = 'rgba(20,10,40,.4)'; g.fillRect(0, i * 64 + 62, w, 2); }
}, [8, 8]);
const THEMES = {
  playroom: { bg: 0xe9c79a, floor: woodTex, sky: 0xfff6e6, ground: 0xb48a5a, hemi: 1.55, sun: 0xffffff, sunI: 1.6, rails: [0xc98a4b, 0xb87a3e] },
  kitchen: { bg: 0xdfe6ea, floor: tileTex, sky: 0xffffff, ground: 0x9aa7ad, hemi: 1.6, sun: 0xfffaf0, sunI: 1.5, rails: [0xe8e2d6, 0xd6cfc2] },
  sandbox: { bg: 0xbfe3a0, floor: grassTex, sky: 0xfffbe8, ground: 0x9cbf6e, hemi: 1.55, sun: 0xfff1d0, sunI: 1.7, rails: [0x7cc0e8, 0x5aa6d6] },
  bedtime: { bg: 0x2c3360, floor: nightWoodTex, sky: 0xc8d0ff, ground: 0x4a4478, hemi: 1.35, sun: 0xe0e6ff, sunI: 1.15, rails: [0x7a64b8, 0x6650a6] },
};
// play-mat rugs, one per world: stitched border + decoration (purely visual)
function rugTex(W, D, theme = 'playroom', variant = 0) {
  if (theme === 'kitchen') return canvasTex(W * 24, D * 24, (g, w, h) => {
    const s = 24; for (let i = 0; i < W / 2; i++) for (let j = 0; j < D / 2; j++) { g.fillStyle = (i + j) % 2 ? '#fff4dc' : '#e8574c'; g.fillRect(i * s * 2, j * s * 2, s * 2, s * 2); }
    g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(0, 0, w, h);
    for (const [x, y] of [[0.2, 0.25], [0.78, 0.7]]) { g.fillStyle = '#ffffff'; g.beginPath(); g.arc(w * x, h * y, s * 2, 0, 7); g.fill(); g.strokeStyle = '#9cc7e8'; g.lineWidth = 6; g.beginPath(); g.arc(w * x, h * y, s * 1.5, 0, 7); g.stroke(); }
    g.strokeStyle = '#ffffff'; g.lineWidth = s * 0.9; g.strokeRect(s * 0.45, s * 0.45, w - s * 0.9, h - s * 0.9);
    g.strokeStyle = '#e8574c'; g.lineWidth = 3; g.setLineDash([10, 8]); g.strokeRect(s * 0.45, s * 0.45, w - s * 0.9, h - s * 0.9); g.setLineDash([]);
  });
  if (theme === 'sandbox') return canvasTex(W * 24, D * 24, (g, w, h) => {
    const s = 24; g.fillStyle = '#f0d58c'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(190,150,80,.35)'; g.lineWidth = 3; for (let y = 20; y < h; y += 34) { g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += 40) g.quadraticCurveTo(x + 20, y + ((x / 40) % 2 ? 8 : -8), x + 40, y); g.stroke(); }
    for (let i = 0; i < 40; i++) { g.fillStyle = ['#fff4dc', '#ff9fb8', '#9ad0ff'][i % 3]; g.beginPath(); g.arc((i * 331 + 50) % w, (i * 197 + 80) % h, 5, 0, 7); g.fill(); }
    g.fillStyle = '#7cc8f0'; g.beginPath(); g.ellipse(w * 0.8, h * 0.25, s * 2.2, s * 1.4, -0.4, 0, 7); g.fill();
    g.strokeStyle = '#ff9132'; g.lineWidth = s * 0.9; g.strokeRect(s * 0.45, s * 0.45, w - s * 0.9, h - s * 0.9);
    g.strokeStyle = '#fff4dc'; g.lineWidth = 3; g.setLineDash([10, 8]); g.strokeRect(s * 0.45, s * 0.45, w - s * 0.9, h - s * 0.9); g.setLineDash([]);
  });
  if (theme === 'bedtime') return canvasTex(W * 24, D * 24, (g, w, h) => {
    const s = 24; g.fillStyle = '#34428a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3d4c9a'; for (let i = 0; i < 18; i++) { g.beginPath(); g.ellipse((i * 211) % w, (i * 157) % h, 40, 22, 0, 0, 7); g.fill(); }
    g.fillStyle = '#ffe58a'; for (let i = 0; i < 60; i++) { const x = (i * 271 + 30) % w, y = (i * 173 + 40) % h, r = 3 + (i % 3) * 2; g.beginPath(); for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.fill(); }
    g.fillStyle = '#fff2b0'; g.beginPath(); g.arc(w * 0.24, h * 0.3, s * 2.2, 0, 7); g.fill(); g.fillStyle = '#34428a'; g.beginPath(); g.arc(w * 0.24 + s * 0.9, h * 0.3 - s * 0.5, s * 2, 0, 7); g.fill();
    g.strokeStyle = '#9a7cf0'; g.lineWidth = s * 0.9; g.strokeRect(s * 0.45, s * 0.45, w - s * 0.9, h - s * 0.9);
    g.strokeStyle = '#ffe58a'; g.lineWidth = 3; g.setLineDash([10, 8]); g.strokeRect(s * 0.45, s * 0.45, w - s * 0.9, h - s * 0.9); g.setLineDash([]);
  });
  return playRugTex(W, D, variant);
}
// Playroom play-mats: each early rug gets its own layout so no two look alike
function playRugVariant(W, D, v) {
  const s = 24;
  return canvasTex(W * s, D * s, (g, w, h) => {
    g.fillStyle = '#7cc46a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#8fd27a'; for (let i = 0; i < 30; i++) { g.beginPath(); g.arc((i * 137 + v * 50) % w, (i * 251 + v * 70) % h, 14 + (i % 5) * 8, 0, 7); g.fill(); }
    const road = (draw) => { g.strokeStyle = '#6e7380'; g.lineWidth = s * 2.2; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); draw(); g.stroke();
      g.strokeStyle = '#fff4dc'; g.lineWidth = 3; g.setLineDash([s * 0.7, s * 0.6]); g.beginPath(); draw(); g.stroke(); g.setLineDash([]); };
    if (v === 1) { road(() => g.arc(w / 2, h / 2, Math.min(w, h) * 0.36, 0, 7)); g.fillStyle = '#ffd1e0'; g.beginPath(); g.arc(w / 2, h / 2, s * 2.4, 0, 7); g.fill();
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.fillStyle = ['#ff8fb1', '#ffe066'][i % 2]; g.beginPath(); g.arc(w / 2 + Math.cos(a) * s * 1.4, h / 2 + Math.sin(a) * s * 1.4, s * 0.5, 0, 7); g.fill(); } }
    else if (v === 2) { road(() => { for (const f of [0.2, 0.5, 0.8]) { g.moveTo(w * f, s * 2); g.lineTo(w * f, h - s * 2); g.moveTo(s * 2, h * f); g.lineTo(w - s * 2, h * f); } });
      g.fillStyle = '#fff4dc'; for (const fx of [0.2, 0.5, 0.8]) for (const fy of [0.2, 0.5, 0.8]) for (let k = -2; k <= 2; k++) g.fillRect(w * fx + k * 9 - 3, h * fy - s * 1.5, 5, s * 0.6); }
    else if (v === 3) { const r = Math.min(w / 4, h / 2) * 0.62; road(() => { g.arc(w / 2 - r, h / 2, r, 0, 7); }); road(() => { g.arc(w / 2 + r, h / 2, r, 0, 7); }); }
    else if (v === 4) { const cols = ['#ef7a5a', '#e8664a']; g.fillStyle = cols[0]; g.fillRect(s * 2, s * 2, w - s * 4, h - s * 4);
      g.strokeStyle = '#fff4dc'; g.lineWidth = 4; for (let y = s * 2; y <= h - s * 2 + 1; y += (h - s * 4) / 6) { g.beginPath(); g.moveTo(s * 2, y); g.lineTo(w - s * 2, y); g.stroke(); }
      g.fillStyle = '#fff4dc'; g.font = `900 ${s * 1.2}px Rubik, sans-serif`; for (let k = 0; k < 6; k++) g.fillText(String(k + 1), s * 2.6, s * 2 + (k + 0.7) * (h - s * 4) / 6); }
    else if (v === 5) { const R = Math.min(w, h) * 0.42; ['#ef4b3f', '#fff4dc', '#3b8cf0', '#fff4dc', '#ffc531'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(w / 2, h / 2, R * (1 - i * 0.19), 0, 7); g.fill(); }); }
    g.strokeStyle = ['#3b8cf0', '#ff5fa2', '#45c05a', '#9a63f0', '#ffc531', '#ef4b3f'][v % 6]; g.lineWidth = s * 0.9; g.strokeRect(s * 0.45, s * 0.45, w - s * 0.9, h - s * 0.9);
    g.strokeStyle = '#fff4dc'; g.lineWidth = 3; g.setLineDash([10, 8]); g.strokeRect(s * 0.45, s * 0.45, w - s * 0.9, h - s * 0.9); g.setLineDash([]);
  });
}
function playRugTex(W, D, variant = 0) {
  if (variant > 0) return playRugVariant(W, D, variant);
  const s = 24; // px per metre
  return canvasTex(W * s, D * s, (g, w, h) => {
    g.fillStyle = '#7cc46a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#8fd27a'; for (let i = 0; i < 40; i++) { g.beginPath(); g.arc((i * 137) % w, (i * 251) % h, 14 + (i % 5) * 8, 0, 7); g.fill(); }
    // roads
    g.strokeStyle = '#6e7380'; g.lineWidth = s * 2.2; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.roundRect(s * 3, s * 3, w - s * 6, h - s * 6, s * 4); g.stroke();
    g.beginPath(); g.moveTo(w / 2, s * 3); g.lineTo(w / 2, h - s * 3); g.stroke();
    g.strokeStyle = '#fff4dc'; g.lineWidth = 3; g.setLineDash([s * 0.7, s * 0.6]);
    g.beginPath(); g.roundRect(s * 3, s * 3, w - s * 6, h - s * 6, s * 4); g.stroke();
    g.beginPath(); g.moveTo(w / 2, s * 3); g.lineTo(w / 2, h - s * 3); g.stroke(); g.setLineDash([]);
    // pond + flowers
    g.fillStyle = '#5bb2e8'; g.beginPath(); g.ellipse(w * 0.22, h * 0.7, s * 2.4, s * 1.5, 0.3, 0, 7); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.ellipse(w * 0.22, h * 0.7, s * 1.6, s * 0.8, 0.3, 0.3, 2); g.stroke();
    for (let i = 0; i < 30; i++) { g.fillStyle = ['#ffe066', '#ff8fb1', '#fff'][i % 3]; g.beginPath(); g.arc((i * 331 + 50) % w, (i * 197 + 80) % h, 4, 0, 7); g.fill(); }
    // stitched border
    g.strokeStyle = '#3b8cf0'; g.lineWidth = s * 0.9; g.strokeRect(s * 0.45, s * 0.45, w - s * 0.9, h - s * 0.9);
    g.strokeStyle = '#fff4dc'; g.lineWidth = 3; g.setLineDash([10, 8]); g.strokeRect(s * 0.45, s * 0.45, w - s * 0.9, h - s * 0.9); g.setLineDash([]);
  });
}

// ---------------------------------------------------------------------------------------------------------
// Static world: wooden floor, rug, rails
// ---------------------------------------------------------------------------------------------------------
const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshLambertMaterial({ map: woodTex }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -0.02; floor.receiveShadow = true; scene.add(floor);
woodTex.repeat.set(20, 20);
let rug = null, rails = null;
const railMat = new THREE.MeshLambertMaterial({ color: 0xc98a4b });
function buildArena(W, D, theme = 'playroom', variant = 0) {
  const T0 = THEMES[theme] || THEMES.playroom;
  floor.material.map = T0.floor; floor.material.needsUpdate = true; T0.floor.repeat.set(20, 20);
  scene.background.setHex(T0.bg); scene.fog.color.setHex(T0.bg);
  hemi.color.setHex(T0.sky); hemi.groundColor.setHex(T0.ground); hemi.intensity = T0.hemi; sun.color.setHex(T0.sun); sun.intensity = T0.sunI;
  if (rug) { scene.remove(rug); rug.material.map.dispose(); rug.material.dispose(); rug.geometry.dispose(); }
  if (rails) { scene.remove(rails); rails.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
  rug = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ map: rugTex(W, D, theme, variant) }));
  rug.rotation.x = -Math.PI / 2; rug.receiveShadow = true; scene.add(rug);
  rails = new THREE.Group();
  const H = 0.7, T = 0.6;
  const mk = (w, d, x, z, c) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), new THREE.MeshLambertMaterial({ color: c })); m.position.set(x, H / 2, z); m.castShadow = m.receiveShadow = true; rails.add(m); };
  const [rc1, rc2] = T0.rails;
  mk(W + T * 2, T, 0, -D / 2 - T / 2, rc1); mk(W + T * 2, T, 0, D / 2 + T / 2, rc1);
  mk(T, D, -W / 2 - T / 2, 0, rc2); mk(T, D, W / 2 + T / 2, 0, rc2);
  // corner knobs in toy colours
  [[-1, -1, 0xef4b3f], [1, -1, 0x3b8cf0], [-1, 1, 0xffc531], [1, 1, 0x45c05a]].forEach(([sx, sz, c]) => {
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12), new THREE.MeshLambertMaterial({ color: c }));
    k.position.set(sx * (W / 2 + T / 2), H + 0.3, sz * (D / 2 + T / 2)); k.castShadow = true; rails.add(k);
  });
  scene.add(rails);
}

// ---------------------------------------------------------------------------------------------------------
// Buggy + ball + chain meshes
// ---------------------------------------------------------------------------------------------------------
const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
const bodyMat = lam(0xef4b3f), trimMat = lam(0xffe9c0), tyreMat = lam(0x2e2a2a), hubMat = lam(0xffe9c0), glassMat = lam(0x9fd6ff);
const buggy = new THREE.Group(); scene.add(buggy);
const chassis = new THREE.Group(); buggy.add(chassis);
{
  const add = (geo, mat, x, y, z, parent = chassis) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  add(new THREE.BoxGeometry(1.25, 0.42, 2.0), bodyMat, 0, 0.55, 0);
  add(new THREE.BoxGeometry(1.05, 0.12, 0.5), trimMat, 0, 0.82, 0.62);            // bonnet stripe
  add(new THREE.BoxGeometry(0.95, 0.5, 0.8), bodyMat, 0, 0.98, -0.25);            // cabin
  add(new THREE.BoxGeometry(0.85, 0.32, 0.06), glassMat, 0, 1.02, 0.16);          // windscreen
  add(new THREE.BoxGeometry(1.0, 0.08, 0.9), trimMat, 0, 1.26, -0.25);            // roof
  add(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 10), trimMat, 0, 0.55, -1.08).rotation.x = Math.PI / 2; // hitch
  add(new THREE.SphereGeometry(0.1, 8, 6), lam(0xfff27a), -0.42, 0.62, 1.01); add(new THREE.SphereGeometry(0.1, 8, 6), lam(0xfff27a), 0.42, 0.62, 1.01);
}
const wheels = [];
for (const [x, z] of [[-0.7, 0.68], [0.7, 0.68], [-0.7, -0.68], [0.7, -0.68]]) {
  const pivot = new THREE.Group(); pivot.position.set(x, 0.36, z); buggy.add(pivot);
  const w = new THREE.Group(); pivot.add(w);
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.3, 16), tyreMat); tyre.rotation.z = Math.PI / 2; tyre.castShadow = true; w.add(tyre);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.32, 10), hubMat); hub.rotation.z = Math.PI / 2; w.add(hub);
  wheels.push({ pivot, w, front: z > 0 });
}
const ballMat = new THREE.MeshStandardMaterial({ color: 0x2c2a33, roughness: 0.35, metalness: 0.45 });
const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), ballMat); ballMesh.castShadow = true; scene.add(ballMesh);
{ // a painted star band on the ball, so its spin is visible
  const band = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.07, 6, 28), lam(0xffc531)); ballMesh.add(band);
  const band2 = band.clone(); band2.rotation.y = Math.PI / 2; ballMesh.add(band2);
}
const LINKS = 22;
const linkGeo = new THREE.TorusGeometry(0.15, 0.055, 6, 12);
const links = new THREE.InstancedMesh(linkGeo, new THREE.MeshStandardMaterial({ color: 0xb8bcc8, roughness: 0.4, metalness: 0.6 }), LINKS);
links.castShadow = true; scene.add(links);
// swing trail: a ribbon of the ball's recent path, brighter when the ball is fast enough to smash
const TRAIL = 22;
const trailGeo = new THREE.BufferGeometry();
const trailPos = new Float32Array(TRAIL * 2 * 3), trailCol = new Float32Array(TRAIL * 2 * 4);
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 4));
{ const idx = []; for (let i = 0; i < TRAIL - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } trailGeo.setIndex(idx); }
const trail = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
trail.frustumCulled = false; scene.add(trail);
const trailPts = [];
// soft blob shadow-free "speed ring" under the ball shows when a swing can smash stone
const powerRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 28), new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0, depthWrite: false }));
powerRing.rotation.x = -Math.PI / 2; powerRing.position.y = 0.03; scene.add(powerRing);

// steering arrow: a big curved chevron on the rug in front of the buggy, on the very frame a steer key/pad goes down
const steerArrow = new THREE.Group(); buggy.add(steerArrow);
{
  // arc around the turning centre on the buggy's left (local +x), from its nose curving forward-left; head at the end
  const shape = new THREE.Shape(), C = 3.1, R1 = 2.45, R2 = 3.45, a0 = Math.PI - 0.3, a1 = 1.65;
  const P = (a, r) => [C + Math.cos(a) * r, Math.sin(a) * r];
  shape.moveTo(...P(a0, R2));
  for (let i = 1; i <= 14; i++) shape.lineTo(...P(a0 + (a1 - a0) * i / 14, R2));
  shape.lineTo(...P(a1, R2 + 0.6)); shape.lineTo(...P(a1 - 0.5, (R1 + R2) / 2)); shape.lineTo(...P(a1, R1 - 0.6));
  for (let i = 14; i >= 0; i--) shape.lineTo(...P(a0 + (a1 - a0) * i / 14, R1));
  const geo = new THREE.ShapeGeometry(shape); geo.rotateX(Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const edge = new THREE.MeshBasicMaterial({ color: 0x5a2a12, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const m = new THREE.Mesh(geo, mat), o = new THREE.Mesh(geo, edge);
  o.scale.set(1.16, 1, 1.16); o.position.y = 0.035; m.position.y = 0.045; o.renderOrder = 1; m.renderOrder = 2;
  steerArrow.add(o, m); steerArrow.userData = { mat, edge, side: 0 };
}
function setSteerArrow(side) {   // side: +1 left, -1 right, 0 none
  const u = steerArrow.userData;
  if (side) { u.side = side; steerArrow.scale.set(side > 0 ? 1 : -1, 1, 1); steerArrow.position.set(0, 0, 0.6); u.mat.opacity = 1; u.edge.opacity = 0.95; u.t = 0; }
}
function applySkin() { const s = SKINS[state.skin] || SKINS[0]; bodyMat.color.setHex(s.body); trimMat.color.setHex(s.trim); hubMat.color.setHex(s.trim); }

// ---------------------------------------------------------------------------------------------------------
// Blocks (instanced per look) + chips
// ---------------------------------------------------------------------------------------------------------
const blockGeo = new THREE.BoxGeometry(0.94, 0.94, 0.94);
const blockMats = LOOKS.map((_, i) => new THREE.MeshLambertMaterial({ map: blockTex(i) }));
let blockMeshes = [];
let blocks = [];           // {x,z,y, look, st: 'rest'|'fall'|'fly'|'gone', vy, v:{x,y,z}, q, spin, life, mesh, slot, fallFrom}
let cols = new Map();      // "x,z" -> resting blocks of that column, sorted by y
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpE = new THREE.Euler();
const CHIPS = 360;
const chipMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), new THREE.MeshLambertMaterial({ color: 0xffffff }), CHIPS);
chipMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); chipMesh.frustumCulled = false; scene.add(chipMesh);
const chips = []; let chipCursor = 0;
for (let i = 0; i < CHIPS; i++) { chips.push({ life: 0, x: 0, y: -9, z: 0, vx: 0, vy: 0, vz: 0, r: 0, rv: 0, s: 1 }); chipMesh.setColorAt(i, new THREE.Color(1, 1, 1)); }
const PUFFS = 80;
const puffMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 1), new THREE.MeshLambertMaterial({ color: 0xfff4dc, transparent: true, opacity: 0.85 }), PUFFS);
puffMesh.frustumCulled = false; scene.add(puffMesh);
const puffs = []; let puffCursor = 0;
for (let i = 0; i < PUFFS; i++) puffs.push({ life: 0, max: 1, x: 0, y: -9, z: 0, vx: 0, vy: 0, vz: 0, s: 1 });
function chipBurst(x, y, z, hex, n, vx = 0, vz = 0, power = 1) {
  const c = new THREE.Color(hex);
  for (let i = 0; i < n; i++) {
    const k = chipCursor = (chipCursor + 1) % CHIPS, p = chips[k];
    Object.assign(p, { life: rand(0.7, 1.3), x: x + rand(-0.3, 0.3), y: y + rand(-0.3, 0.3), z: z + rand(-0.3, 0.3),
      vx: vx * 0.5 + rand(-4, 4) * power, vy: rand(3, 7) * power, vz: vz * 0.5 + rand(-4, 4) * power, r: rand(0, 6), rv: rand(-12, 12), s: rand(0.6, 1.3) });
    chipMesh.setColorAt(k, c);
  }
  chipMesh.instanceColor.needsUpdate = true;
}
function puff(x, y, z, n, size = 1, up = 1.5) {
  for (let i = 0; i < n; i++) {
    const p = puffs[puffCursor = (puffCursor + 1) % PUFFS];
    Object.assign(p, { life: 0, max: rand(0.45, 0.8), x: x + rand(-0.4, 0.4), y, z: z + rand(-0.4, 0.4), vx: rand(-1.5, 1.5) * size, vy: rand(0.5, up), vz: rand(-1.5, 1.5) * size, s: size * rand(0.6, 1.1) });
  }
}

// ---------------------------------------------------------------------------------------------------------
// Wind-up robots: tin toys walking a circle or a line; they count as targets
// ---------------------------------------------------------------------------------------------------------
const ROBOT_COLORS = [0xe8473c, 0x3b8cf0, 0x2fb7a4];
const RG = { body: new THREE.BoxGeometry(0.72, 0.62, 0.56), head: new THREE.BoxGeometry(0.5, 0.4, 0.44), eye: new THREE.SphereGeometry(0.07, 8, 6),
  ant: new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6), bulb: new THREE.SphereGeometry(0.08, 8, 6), keyBar: new THREE.BoxGeometry(0.08, 0.36, 0.06), foot: new THREE.BoxGeometry(0.22, 0.2, 0.32), arm: new THREE.BoxGeometry(0.14, 0.42, 0.14) };
const RM = { body: ROBOT_COLORS.map((c) => lam(c)), metal: lam(0xd3d7e0), dark: lam(0x33333d), eye: new THREE.MeshBasicMaterial({ color: 0xfff27a }), bulb: lam(0xff5a5a) };
let robots = [];
function makeRobot(def) {
  const g = new THREE.Group(), add = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  const body = new THREE.Group(); g.add(body);
  add(RG.body, RM.body[def.color % 3], 0, 0.62, 0, body); add(RG.head, RM.metal, 0, 1.13, 0, body);
  add(RG.eye, RM.eye, -0.11, 1.16, 0.23, body); add(RG.eye, RM.eye, 0.11, 1.16, 0.23, body);
  add(RG.ant, RM.dark, 0, 1.47, 0, body); add(RG.bulb, RM.bulb, 0, 1.64, 0, body);
  add(RG.arm, RM.metal, -0.45, 0.66, 0, body); add(RG.arm, RM.metal, 0.45, 0.66, 0, body);
  const key = new THREE.Group(); key.position.set(0, 0.7, -0.34); body.add(key); add(RG.keyBar, RM.metal, 0, 0, 0, key); add(RG.keyBar, RM.metal, 0, 0, 0, key).rotation.z = Math.PI / 2;
  const fl = add(RG.foot, RM.dark, -0.17, 0.1, 0), fr = add(RG.foot, RM.dark, 0.17, 0.1, 0);
  g.scale.setScalar(1.45);
  scene.add(g);
  const len = def.circle ? Math.PI * 2 * def.circle[2] : Math.hypot(def.line[2] - def.line[0], def.line[3] - def.line[1]);
  const r = { def, g, body, key, fl, fr, t: def.phase || 0, dir: 1, len, alive: true, x: 0, z: 0, h: 0, walk: Math.random() * 6, color: ROBOT_COLORS[def.color % 3] };
  robotPos(r, r.t); r.x = r.px; r.z = r.pz;
  return r;
}
function robotPos(r, t) {
  const d = r.def;
  if (d.circle) { const a = t * Math.PI * 2; r.px = d.circle[0] + Math.cos(a) * d.circle[2]; r.pz = d.circle[1] + Math.sin(a) * d.circle[2]; }
  else { const u = ((t % 2) + 2) % 2, k = u < 1 ? u : 2 - u; r.px = d.line[0] + (d.line[2] - d.line[0]) * k; r.pz = d.line[1] + (d.line[3] - d.line[1]) * k; }
}
function buildRobots(defs) {
  for (const r of robots) scene.remove(r.g);
  robots = (defs || []).map(makeRobot);
}
function robotBlocked(x, z) {
  const cx = Math.round(x), cz = Math.round(z);
  for (let i = cx - 2; i <= cx + 2; i++) for (let j = cz - 2; j <= cz + 2; j++) if (hasBase(i, j) && Math.abs(i - x) < 1.15 && Math.abs(j - z) < 1.15) return true;
  return false;
}
function stepRobots(h) {
  for (const r of robots) {
    if (!r.alive) continue;
    if (started && !finished) {
      const nt = r.t + r.dir * r.def.speed * h / r.len;
      robotPos(r, nt);
      if (robotBlocked(r.px, r.pz)) r.dir = -r.dir;      // bumped into a block: walk back
      else { const dx = r.px - r.x, dz = r.pz - r.z; if (dx * dx + dz * dz > 1e-8) r.h = Math.atan2(dx, dz); r.t = nt; r.x = r.px; r.z = r.pz; r.walk += h * 12; }
    }
    // ball
    let nx = ball.x - r.x, nz = ball.z - r.z, d = Math.hypot(nx, nz);
    if (d < ball.r + 0.7 && ball.y < 2.2) {
      const sp = Math.hypot(ball.vx, ball.vz);
      if (sp >= breakSpeed(0)) { swingHit(r.x, 1, r.z); smashRobot(r, ball.vx, ball.vz, sp); continue; }
      nx /= d || 1; nz /= d || 1; ball.x = r.x + nx * (ball.r + 0.7); ball.z = r.z + nz * (ball.r + 0.7);
      const vn = ball.vx * nx + ball.vz * nz; if (vn < 0) { ball.vx -= nx * vn * 1.5; ball.vz -= nz * vn * 1.5; }
    }
    // buggy bumps off it
    nx = car.x - r.x; nz = car.z - r.z; d = Math.hypot(nx, nz);
    if (d < 1.5 && d > 1e-5) { nx /= d; nz /= d; car.x = r.x + nx * 1.5; car.z = r.z + nz * 1.5; if (started && !finished) deflect(nx, nz); }
  }
}
function smashRobot(r, vx, vz, power, quiet = false) {
  if (!r.alive) return;
  r.alive = false; r.g.visible = false;
  chipBurst(r.x, 0.8, r.z, r.color, 10, vx, vz, 1.1); chipBurst(r.x, 1.1, r.z, 0xd3d7e0, 8, vx, vz, 1.2); puff(r.x, 0.4, r.z, 5, 0.8, 1.5);
  if (!quiet) { audio.play('clank', { vol: 0.7, rate: 1.25 }); audio.play('bigsmash', { vol: 0.55, rate: 1.4 }); audio.blip([660, 990, 1320], 0.05, 0.05); }
  scoreHit(r.x, 1.0, r.z, 3, power);
}
function syncRobots(dt) {
  for (const r of robots) {
    if (!r.alive) continue;
    r.g.position.set(r.x, 0, r.z); r.g.rotation.y = r.h;
    r.key.rotation.z += dt * 7;
    const w = Math.sin(r.walk); r.fl.position.y = 0.1 + Math.max(0, w) * 0.08; r.fr.position.y = 0.1 + Math.max(0, -w) * 0.08; r.body.rotation.z = w * 0.06;
  }
}

// teddies are drawn as little 3D bears (the block underneath is hidden; physics stays the block's)
const TG = { body: new THREE.SphereGeometry(0.4, 16, 12), head: new THREE.SphereGeometry(0.31, 16, 12), ear: new THREE.SphereGeometry(0.12, 10, 8), snout: new THREE.SphereGeometry(0.13, 10, 8),
  eye: new THREE.SphereGeometry(0.045, 8, 6), paw: new THREE.SphereGeometry(0.13, 10, 8), bow: new THREE.BoxGeometry(0.26, 0.1, 0.08) };
const TM = { fur: lam(0xc48a58), light: lam(0xf3d2a6), dark: lam(0x2b1a10), bow: lam(0xe8473c) };
let teddyFigs = [];
function makeTeddy() {
  const g = new THREE.Group(), add = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; g.add(m); return m; };
  add(TG.body, TM.fur, 0, 0.42, 0, 1, 1.05, 0.95); add(TG.body, TM.light, 0, 0.42, 0.17, 0.6, 0.65, 0.5);
  add(TG.head, TM.fur, 0, 0.98, 0.02); add(TG.ear, TM.fur, -0.22, 1.22, 0); add(TG.ear, TM.fur, 0.22, 1.22, 0);
  add(TG.snout, TM.light, 0, 0.93, 0.27, 1, 0.8, 0.8); add(TG.eye, TM.dark, -0.11, 1.04, 0.27); add(TG.eye, TM.dark, 0.11, 1.04, 0.27); add(TG.eye, TM.dark, 0, 0.96, 0.37, 1.4, 1, 1);
  add(TG.paw, TM.fur, -0.36, 0.5, 0.1); add(TG.paw, TM.fur, 0.36, 0.5, 0.1); add(TG.paw, TM.fur, -0.2, 0.1, 0.22); add(TG.paw, TM.fur, 0.2, 0.1, 0.22);
  add(TG.bow, TM.bow, 0, 0.72, 0.28);
  scene.add(g); teddyFigs.push(g); return g;
}
function buildBlocks(list) {
  for (const f of teddyFigs) scene.remove(f); teddyFigs = [];
  for (const m of blockMeshes) { scene.remove(m); m.dispose(); }
  blockMeshes = []; blocks = []; cols = new Map();
  const counts = LOOKS.map(() => 0);
  for (const b of list) counts[b.look]++;
  const meshes = LOOKS.map((_, i) => { if (!counts[i]) return null; const m = new THREE.InstancedMesh(blockGeo, blockMats[i], counts[i]); m.castShadow = m.receiveShadow = true; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; scene.add(m); blockMeshes.push(m); return m; });
  const used = LOOKS.map(() => 0);
  for (const b of list) {
    const o = { fig: b.look === TEDDY ? makeTeddy() : null, x: b.x, z: b.z, y: b.y, look: b.look, st: 'rest', vy: 0, v: { x: 0, y: 0, z: 0 }, q: new THREE.Quaternion(), spin: new THREE.Vector3(), life: 0, mesh: meshes[b.look], slot: used[b.look]++, fallFrom: 0, scale: 1 };
    blocks.push(o);
    const k = b.x + ',' + b.z; if (!cols.has(k)) cols.set(k, []); cols.get(k).push(o);
  }
  for (const c of cols.values()) c.sort((a, b) => a.y - b.y);
  for (const b of blocks) drawBlock(b);
  for (const m of blockMeshes) m.instanceMatrix.needsUpdate = true;
}
function drawBlock(b) {
  if (b.fig) { b.fig.position.set(b.x, b.y, b.z); b.fig.rotation.set(0, 0.35 * Math.sin((b.x + b.z) * 1.7), 0.3 * Math.sin((b.wob || 0) * 22) * (b.wob || 0)); }
  tmpP.set(b.x, b.y + 0.47, b.z); tmpS.setScalar(b.fig ? 0.0001 : b.scale);
  tmpM.compose(tmpP, b.q, tmpS); b.mesh.setMatrixAt(b.slot, tmpM);
}

// ---------------------------------------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------------------------------------
let level = null, levelIndex = 0;
const car = { odo: 0, x: 0, z: 0, h: 0, vx: 0, vz: 0, f: 0, steer: 0, roll: 0, wheelSpin: 0, bump: 0 };
const ball = { x: 0, y: 0.6, z: 0, vx: 0, vy: 0, vz: 0, r: 0.6, rot: new THREE.Quaternion() };
let started = false, finished = false, failed = false, panelOpen = null, paused = 0;
let timeLeft = 60, smashed = 0, total = 1, goalCount = 1, levelCoins = 0;
// skill score: every target × combo multiplier, trick shots (3+ targets in one swing), time bonus, teddy penalty
let score = 0, parts = { smash: 0, combo: 0, trick: 0, time: 0, teddy: 0 }, swingHits = 0, swingT = 0, lastTrickShown = 0;
const multOf = (c) => Math.min(5, 1 + Math.floor((c - 1) / 3));
function addScore(n, key) { if (!started || finished) return; score = Math.max(0, score + n); parts[key] += n; updateScoreHud(); }
function updateScoreHud() {
  $('scoreText').textContent = score;
  const m = multOf(combo), mc = $('multChip'); mc.textContent = '×' + m; mc.classList.toggle('hidden', !(m > 1 && performance.now() - comboT < 900));
  const tg = starTargets(), next = tg ? (score < tg[0] ? ['★★', tg[0]] : score < tg[1] ? ['★★★', tg[1]] : null) : null;
  $('starNext').textContent = next ? `${next[0]} ${next[1]}` : tg ? '★★★ ✓' : '';
}
// a ball hit (not TNT / not a falling block): 3+ in one swing = trick shot
function swingHit(x, y, z) {
  const now = performance.now();
  swingHits = now - swingT < 450 ? swingHits + 1 : 1; swingT = now;
  if (swingHits >= 3) {
    addScore(40, 'trick');
    if (now - lastTrickShown > 500) { lastTrickShown = now; proj.set(x, y + 1.5, z).project(camera); floatText(`TRICK SHOT ×${swingHits}`, (proj.x * 0.5 + 0.5) * innerWidth, (-proj.y * 0.5 + 0.5) * innerHeight, 'big'); audio.blip([880, 1175, 1568], 0.05, 0.05); }
  }
}
let combo = 0, comboT = 0, comboTimer = null, firstSmashT = -1, levelT = 0, playT0 = 0;
let input = { l: false, r: false, b: false, kl: false, kr: false, kb: false };
let tutStep = 0, slowHits = 0, lastAdAt = performance.now(), levelsSinceAd = 0, extraUsed = false;
const stats = { smashes: 0, wins: 0, fails: 0, firstSmashS: null, firstWinS: null };
const t0 = performance.now();

// one boost picked on the win panel, for the next rug only (a fixed choice of three, never random)
const BOOSTS = { big: { name: 'Big Ball', desc: 'Huge ball next rug', icon: '●' }, turbo: { name: 'Turbo', desc: '+15% speed next rug', icon: '⚡' }, time: { name: '+15 s', desc: 'Extra time next rug', icon: '⏱' } };
let pendingBoost = null, boost = null;
const ballPower = () => (1 + state.up.ball * 0.14) * (boost === 'big' ? 1.25 : 1);
const chainLen = () => 3.6 + state.up.chain * 0.4;
const vmax = () => (8.6 + state.up.engine * 0.75) * (boost === 'turbo' ? 1.15 : 1);
const breakSpeed = (look) => (look === STONE ? 8.2 : look === TNT ? 1.8 : 2.5) / ballPower();

function resetActors() {
  const [sx, sz, sh] = level.start;
  Object.assign(car, { x: sx, z: sz, h: sh, vx: 0, vz: 0, f: 0, steer: 0, roll: 0, bump: 0 });
  const L = chainLen() * 0.8;
  Object.assign(ball, { x: sx - Math.sin(sh) * (1.1 + L), y: 0.6, z: sz - Math.cos(sh) * (1.1 + L), vx: 0, vy: 0, vz: 0 });
  ball.r = (0.65 + state.up.ball * 0.06) * (boost === 'big' ? 1.35 : 1);
  ballMesh.scale.setScalar(ball.r);
  trailPts.length = 0;
}

function startLevel(i) {
  if (i !== 'daily' && !levelOpen(i)) { openLevels(); toast(i < HAND_LEVELS && !worldOpen(worldOf(i)) ? `Collect ${WORLDS[worldOf(i)].stars} ★ to open ${WORLDS[worldOf(i)].name}` : 'Clear the previous rug first'); return; }
  closePanels(true);
  levelIndex = i; level = getLevel(i, dayNum());
  buildArena(level.w, level.d, level.theme, level.rug || 0);
  buildBlocks(level.blocks); buildRobots(level.robots);
  total = blocks.filter((b) => b.look !== TEDDY).length + robots.length; goalCount = Math.ceil(total * (level.goal || GOAL)); smashed = 0; levelCoins = 0;
  boost = level.daily ? null : pendingBoost; pendingBoost = null;
  score = 0; parts = { smash: 0, combo: 0, trick: 0, time: 0, teddy: 0 }; swingHits = 0;
  timeLeft = level.time + (boost === 'time' ? 15 : 0); combo = 0; firstSmashT = -1; levelT = 0; extraUsed = false; slowHits = 0;
  finished = false; failed = false; started = true;
  resetActors(); snapCamera();
  $('hud').classList.remove('hidden');
  $('lvlName').textContent = level.daily ? `Daily Rug · ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : `${i < HAND_LEVELS ? WORLDS[worldOf(i)].name + ' ' + (i % PER_WORLD + 1) : 'Level ' + (i + 1)} · ${level.name}`;
  updateHud(); updateScoreHud();
  $('boostChip').classList.toggle('hidden', !boost); if (boost) $('boostChip').innerHTML = `${BOOSTS[boost].icon} ${BOOSTS[boost].name}`;
  tutStep = 0; hideTut();
  if (level.hint === 1) showTut(mobile ? 'Hold ◀ ▶ to steer — the BALL smashes, not the car!' : '◀ ▶ or A D to steer — the BALL smashes, not the car!');
  else if (level.hint === 2) showTut('Circle the towers — the ball swings out wide!', 4000);
  else if (level.hint === 3) showTut('Grey STONE needs a fast swing: turn hard at full speed!', 5000);
  else if (level.hint === 4) showTut('Hit the TNT — it blows up everything near it!', 4500);
  else if (level.hint === 6) showTut('Don\'t smash the TEDDIES! Each hit costs 5 seconds', 5000);
  else if (level.hint === 7) showTut('Wind-up robots! Chase them and swing the ball into them', 4500);
  else if (level.hint === 5) showTut(mobile ? 'Hold BOTH pads to brake — the ball flies over your buggy!' : 'Brake (S / ↓) — the ball flies over your buggy!', 5000);
  if (!mobile) { $('keys').classList.toggle('hidden', i === 'daily' || i > 1); }
  playT0 = performance.now();
  platform.gameplayStart();
}

// ---------------------------------------------------------------------------------------------------------
// Physics
// ---------------------------------------------------------------------------------------------------------
const H = 1 / 120;
function steerInput() {
  const l = input.l || input.kl, r = input.r || input.kr;
  return (l ? 1 : 0) - (r ? 1 : 0);
}
function braking() { const b = input.kb || input.b || (input.l && input.r); if (b && level && level.hint === 5 && !$('tut').classList.contains('hidden') && tutStep === 0) { tutStep = 9; showTut('Nice brake! Use it to fling the ball forward', 1800); } return b; }

function columnTop(x, z) { const c = cols.get(x + ',' + z); return c && c.length ? c[c.length - 1].y + 1 : 0; }
function hasBase(x, z) { const c = cols.get(x + ',' + z); return !!(c && c.length && c[0].y < 0.6); }

function stepCar(h) {
  const W = level.w / 2, D = level.d / 2;
  const s = braking() ? 0 : steerInput();
  car.steer += (s - car.steer) * Math.min(1, h * 14);
  const dx = Math.sin(car.h), dz = Math.cos(car.h);
  let f = car.vx * dx + car.vz * dz;                // forward speed
  let l = car.vx * dz - car.vz * dx;                // sideways speed
  const target = braking() ? (f > 0.5 ? 0 : -3.5) : vmax();
  const acc = braking() ? 22 : 11;
  f += clamp(target - f, -acc * h, acc * h);
  l *= Math.exp(-(braking() ? 2.5 : 7.5) * h);       // grip (lower while braking = a little drift)
  const turn = 2.75 * clamp(Math.abs(f) / 4, 0.4, 1) * Math.sign(f || 1);
  car.h += car.steer * turn * h;
  const ndx = Math.sin(car.h), ndz = Math.cos(car.h);
  car.vx = ndx * f + ndz * l; car.vz = ndz * f - ndx * l; car.f = f;
  car.x += car.vx * h; car.z += car.vz * h; car.odo += Math.hypot(car.vx, car.vz) * h;
  // rails: bumper-car bounce (the buggy turns away, so it never gets pinned against a wall)
  const R = 0.85;
  if (car.x < -W + R) { car.x = -W + R; deflect(1, 0); }
  if (car.x > W - R) { car.x = W - R; deflect(-1, 0); }
  if (car.z < -D + R) { car.z = -D + R; deflect(0, 1); }
  if (car.z > D - R) { car.z = D - R; deflect(0, -1); }
  // blocks: the car only bumps (it never breaks anything)
  const cx = Math.round(car.x), cz = Math.round(car.z);
  for (let i = cx - 2; i <= cx + 2; i++) for (let j = cz - 2; j <= cz + 2; j++) {
    if (!hasBase(i, j)) continue;
    const px = clamp(car.x, i - 0.47, i + 0.47), pz = clamp(car.z, j - 0.47, j + 0.47);
    let nx = car.x - px, nz = car.z - pz; const d = Math.hypot(nx, nz);
    if (d < R && d > 1e-5) {
      nx /= d; nz /= d; car.x += nx * (R - d); car.z += nz * (R - d);
      deflect(nx, nz);
    }
  }
}

// bounce off an obstacle whose surface normal is (nx, nz): velocity reflects, heading swings toward the bounce
function deflect(nx, nz) {
  const vn = car.vx * nx + car.vz * nz;
  if (vn >= 0) return;
  if (vn < -2) knock(-vn);
  car.vx -= nx * vn * 1.5; car.vz -= nz * vn * 1.5;
  const dx = Math.sin(car.h), dz = Math.cos(car.h), dn = dx * nx + dz * nz;
  if (dn < -0.15) {
    const rx = dx - 2 * dn * nx, rz = dz - 2 * dn * nz;
    let d = Math.atan2(rx, rz) - car.h; d = Math.atan2(Math.sin(d), Math.cos(d));
    car.h += d * 0.55;
  }
}
let lastKnock = 0, lastThud = 0, lastClank = 0;
function knock(v) { const t = performance.now(); if (t - lastKnock < 120) return; lastKnock = t; audio.play('knock', { vol: clamp(v / 9, 0.25, 0.8), rate: rand(0.9, 1.1) }); car.bump = 1; }

function stepBall(h) {
  const W = level.w / 2, D = level.d / 2, r = ball.r;
  ball.vy -= 24 * h;
  ball.x += ball.vx * h; ball.y += ball.vy * h; ball.z += ball.vz * h;
  if (ball.y < r) {
    if (ball.vy < -4) { const t = performance.now(); if (t - lastThud > 150) { lastThud = t; audio.play('thud', { vol: clamp(-ball.vy / 14, 0.15, 0.6), rate: rand(0.9, 1.05) }); } puff(ball.x, 0.1, ball.z, 3, 0.6, 1); }
    ball.y = r; ball.vy = -ball.vy * 0.22;
    const k = Math.exp(-1.1 * h); ball.vx *= k; ball.vz *= k;     // rolling friction on the rug
  } else { const k = Math.exp(-0.15 * h); ball.vx *= k; ball.vz *= k; }
  // chain: a rope (slack allowed), the ball tugs the buggy a little
  const dx = Math.sin(car.h), dz = Math.cos(car.h);
  const hx = car.x - dx * 1.1, hz = car.z - dz * 1.1, hy = 0.55;
  let ex = ball.x - hx, ey = ball.y - hy, ez = ball.z - hz;
  const dist = Math.hypot(ex, ey, ez), L = chainLen();
  if (dist > L) {
    ex /= dist; ey /= dist; ez /= dist;
    const over = dist - L;
    ball.x -= ex * over * 0.93; ball.y -= ey * over * 0.93; ball.z -= ez * over * 0.93;
    car.x += ex * over * 0.07; car.z += ez * over * 0.07;
    const rvx = ball.vx - car.vx, rvy = ball.vy, rvz = ball.vz - car.vz;
    const vr = rvx * ex + rvy * ey + rvz * ez;
    if (vr > 0) {
      ball.vx -= ex * vr; ball.vy -= ey * vr; ball.vz -= ez * vr;
      car.vx += ex * vr * 0.06; car.vz += ez * vr * 0.06;
      if (vr > 5) { const t = performance.now(); if (t - lastClank > 220) { lastClank = t; audio.play('clank', { vol: clamp(vr / 16, 0.15, 0.5), rate: rand(0.95, 1.15) }); } }
    }
  }
  // the ball can't pass through the buggy
  {
    let nx = ball.x - car.x, nz = ball.z - car.z; const d = Math.hypot(nx, nz), m = r + 0.8;
    if (d < m && ball.y < 1.4 && d > 1e-5) { nx /= d; nz /= d; ball.x = car.x + nx * m; ball.z = car.z + nz * m; const vn = (ball.vx - car.vx) * nx + (ball.vz - car.vz) * nz; if (vn < 0) { ball.vx -= nx * vn * 1.3; ball.vz -= nz * vn * 1.3; } }
  }
  // rails
  if (ball.x < -W + r) { ball.x = -W + r; if (ball.vx < -3) thudWall(-ball.vx); ball.vx = Math.abs(ball.vx) * 0.5; }
  if (ball.x > W - r) { ball.x = W - r; if (ball.vx > 3) thudWall(ball.vx); ball.vx = -Math.abs(ball.vx) * 0.5; }
  if (ball.z < -D + r) { ball.z = -D + r; if (ball.vz < -3) thudWall(-ball.vz); ball.vz = Math.abs(ball.vz) * 0.5; }
  if (ball.z > D - r) { ball.z = D - r; if (ball.vz > 3) thudWall(ball.vz); ball.vz = -Math.abs(ball.vz) * 0.5; }
  // aim assist: a fast ball that is about to graze a block curves gently into it (near-misses feel unfair)
  {
    const sp = Math.hypot(ball.vx, ball.vz);
    if (sp > breakSpeed(0) + 1 && ball.y < 2.2) {
      let best = null, bd = r + 1.1;
      const cx = Math.round(ball.x), cz = Math.round(ball.z);
      for (let i = cx - 2; i <= cx + 2; i++) for (let j = cz - 2; j <= cz + 2; j++) {
        const c = cols.get(i + ',' + j); if (!c || !c.length || c[0].y > 1.5) continue;
        if ((c[0].look === STONE && sp < breakSpeed(STONE)) || c.some((o) => o.look === TEDDY)) continue;
        const d = Math.hypot(ball.x - i, ball.z - j) - 0.5;
        if (d < bd && ((i - ball.x) * ball.vx + (j - ball.z) * ball.vz) > 0) { bd = d; best = [i, j]; }   // only blocks ahead of the ball
      }
      for (const rb of robots) { if (!rb.alive) continue; const d = Math.hypot(ball.x - rb.x, ball.z - rb.z) - 0.5; if (d < bd && ((rb.x - ball.x) * ball.vx + (rb.z - ball.z) * ball.vz) > 0) { bd = d; best = [rb.x, rb.z]; } }
      if (best) { let ax = best[0] - ball.x, az = best[1] - ball.z; const al = Math.hypot(ax, az) || 1; ball.vx += ax / al * 16 * h; ball.vz += az / al * 16 * h; }
    }
  }
  // blocks
  const bx = Math.round(ball.x), bz = Math.round(ball.z);
  for (let i = bx - 1; i <= bx + 1; i++) for (let j = bz - 1; j <= bz + 1; j++) {
    const c = cols.get(i + ',' + j); if (!c || !c.length) continue;
    for (let n = 0; n < c.length; n++) {
      const b = c[n];
      const px = clamp(ball.x, i - 0.47, i + 0.47), py = clamp(ball.y, b.y, b.y + 0.94), pz = clamp(ball.z, j - 0.47, j + 0.47);
      let nx = ball.x - px, ny = ball.y - py, nz = ball.z - pz; const d = Math.hypot(nx, ny, nz);
      const sp = Math.hypot(ball.vx, ball.vz, ball.vy * 0.5);
      const tedd = b.look === TEDDY;
      if (d >= r + (sp >= breakSpeed(b.look) && !tedd ? 0.2 : 0)) continue;   // a fast ball 'reaches' a little further: hits feel fair
      if (tedd && sp > 1.2) teddyHit(b);
      if (sp >= breakSpeed(b.look) && !tedd) {
        swingHit(b.x, b.y, b.z);
        smash(b, ball.vx, ball.vz, sp);
        const keep = b.look === STONE ? 0.6 : 0.9;
        ball.vx *= keep; ball.vz *= keep;
        n--; // column changed
      } else {
        if (d < 1e-5) { nx = ball.x - i; nz = ball.z - j; ny = 0; }
        const dl = Math.hypot(nx, ny, nz) || 1; nx /= dl; ny /= dl; nz /= dl;
        ball.x = px + nx * r; ball.y = Math.max(ball.y, py + ny * r); ball.z = pz + nz * r;
        const vn = ball.vx * nx + ball.vy * ny + ball.vz * nz;
        if (vn < 0) { ball.vx -= nx * vn * 1.4; ball.vy -= ny * vn * 1.4; ball.vz -= nz * vn * 1.4; }
        if (-vn > 1.5 && !tedd) { knock(-vn); if (b.look === STONE || ++slowHits === 3) tooSlow(b.look === STONE); }
      }
    }
  }
}
function thudWall(v) { const t = performance.now(); if (t - lastThud < 150) return; lastThud = t; audio.play('thud', { vol: clamp(v / 14, 0.2, 0.7), rate: 0.85 }); }
let lastSlowHint = 0;
function tooSlow(stone) {
  const t = performance.now(); if (t - lastSlowHint < 6000 || tutStep > 5) return; lastSlowHint = t;
  showTut(stone ? 'STONE! Swing faster: full speed + hard turn' : 'Too slow! Turn hard so the ball whips around', 2600);
}

// ---------------------------------------------------------------------------------------------------------
// Smashing
// ---------------------------------------------------------------------------------------------------------
let lastSmashSnd = 0;
// returns how many blocks lost their support (they fall; a long fall breaks them, toppling in the hit direction)
function removeFromColumn(b, vx = 0, vz = 0) {
  const k = b.x + ',' + b.z, c = cols.get(k); if (!c) return 0;
  const i = c.indexOf(b); if (i < 0) return 0;
  c.splice(i, 1);
  let n0 = 0;
  for (let n = i; n < c.length; n++) { const o = c[n]; if (o.st === 'rest') { o.st = 'fall'; o.vy = 0; o.fallFrom = o.y; o.pushX = vx; o.pushZ = vz; o.lvl = n - i + 1; n0++; } }
  for (let n = c.length - 1; n >= i; n--) if (c[n].st === 'fall') c.splice(n, 1);
  return n0;
}
let lastTimber = 0;
function teddyHit(b) {
  const now = performance.now(); if (now - (b.hitT || 0) < 1200 || !started || finished) return;
  b.hitT = now; b.wob = 1;
  timeLeft = Math.max(0.5, timeLeft - 5); stats.teddyHits = (stats.teddyHits || 0) + 1; addScore(-100, 'teddy');
  audio.blip([740, 520, 360], 0.07, 0.06);
  proj.set(b.x, b.y + 1.2, b.z).project(camera);
  floatText('−5 s', (proj.x * 0.5 + 0.5) * innerWidth, (-proj.y * 0.5 + 0.5) * innerHeight, 'bad');
  const tc = $('timeChip'); tc.classList.remove('hit'); void tc.offsetWidth; tc.classList.add('hit');
  if (!stats.teddyTip) { stats.teddyTip = 1; showTut('Ouch! Teddies cost 5 seconds — swing around them', 2800); }
  updateHud();
}
// one target gone (block or robot): count, combo, coins, win check
function scoreHit(x, y, z, coins, power) {
  smashed++; stats.smashes++;
  const now = performance.now();
  if (firstSmashT < 0) { firstSmashT = now; if (stats.firstSmashS == null) stats.firstSmashS = +((now - t0) / 1000).toFixed(1); onFirstSmash(); }
  combo = now - comboT < 900 ? combo + 1 : 1; comboT = now;
  if (combo >= 4) showCombo(combo);
  if (combo >= 5) coins += 1;
  { const base = coins >= 5 ? 50 : coins >= 3 ? 30 : 10, m = multOf(combo); addScore(base, 'smash'); if (m > 1) addScore(base * (m - 1), 'combo'); }
  addCoins(coins, x, y, z);
  updateHud();
  if (!finished && smashed >= goalCount) win();
}
function smash(b, vx, vz, power, quiet = false) {
  if (b.st === 'fly' || b.st === 'gone' || b.look === TEDDY) return;
  const sp0 = Math.hypot(vx, vz) || 1;
  const fell = removeFromColumn(b, vx / sp0 * clamp(power, 3, 12), vz / sp0 * clamp(power, 3, 12));
  if (fell >= 2 && !quiet && performance.now() - lastTimber > 700) {   // a tall tower comes down: TIMBER!
    lastTimber = performance.now(); stats.timber = (stats.timber || 0) + 1; if (stats.firstTimberS == null) stats.firstTimberS = +((performance.now() - t0) / 1000).toFixed(1); proj.set(b.x, b.y + 2, b.z).project(camera);
    floatText('TIMBER!', (proj.x * 0.5 + 0.5) * innerWidth, (-proj.y * 0.5 + 0.5) * innerHeight, 'big');
    setTimeout(() => audio.play('plank', { vol: 0.6, rate: 0.7 }), 180);
  }
  b.st = 'fly'; b.life = 0;
  const sp = Math.hypot(vx, vz) || 1, push = clamp(power, 3, 16);
  b.v.x = vx / sp * push * 0.8 + rand(-2, 2); b.v.z = vz / sp * push * 0.8 + rand(-2, 2); b.v.y = rand(3.5, 6.5) + push * 0.15;
  b.spin.set(rand(-9, 9), rand(-9, 9), rand(-9, 9));
  chipBurst(b.x, b.y + 0.5, b.z, BLOCK_HEX[b.look], b.look === STONE ? 10 : 7, b.v.x, b.v.z);
  const now = performance.now();
  if (!quiet && now - lastSmashSnd > 45) {
    lastSmashSnd = now;
    const name = b.look === STONE ? 'bigsmash' : 'smash' + (1 + (Math.random() * 3 | 0));
    audio.play(name, { vol: clamp(0.45 + power / 25, 0.45, 0.85), rate: clamp(0.9 + combo * 0.025, 0.9, 1.25) * rand(0.95, 1.05) });
    audio.blip([Math.min(1400, 620 + combo * 40) * rand(0.97, 1.03)], 0.035, 0.035);   // bright wooden 'tock' (reads on phone speakers)
  }
  if (b.look === STAR) audio.blip([988, 1319], 0.06, 0.05);
  if (b.look === TNT) setTimeout(() => explode(b.x, b.y + 0.5, b.z), 110);
  scoreHit(b.x, b.y + 0.6, b.z, b.look === STAR ? 5 : 1, power);
}
function explode(x, y, z) {
  if (!level) return;
  audio.play('bigsmash', { vol: 0.9, rate: 0.75 });
  puff(x, y, z, 16, 1.6, 3); chipBurst(x, y, z, 0xff9132, 14, 0, 0, 1.4);
  for (const b of blocks) {
    if ((b.st !== 'rest' && b.st !== 'fall') || b.look === TEDDY) continue;
    const dx = b.x - x, dy = b.y + 0.5 - y, dz = b.z - z, d = Math.hypot(dx, dy, dz);
    if (d < 2.7) smash(b, dx / (d || 1) * 12, dz / (d || 1) * 12, 12, true);
  }
  for (const r of robots) { const dx = r.x - x, dz = r.z - z, d = Math.hypot(dx, dz); if (r.alive && d < 3) smashRobot(r, dx / (d || 1) * 10, dz / (d || 1) * 10, 10, true); }
  // the ball gets shoved too
  const bx = ball.x - x, bz = ball.z - z, bd = Math.hypot(bx, bz);
  if (bd < 4) { ball.vx += bx / (bd || 1) * 8; ball.vz += bz / (bd || 1) * 8; ball.vy += 4; }
}
function stepBlocks(h) {
  for (const b of blocks) {
    if (b.wob > 0) { b.wob = Math.max(0, b.wob - h * 1.8); b.scale = 1 + 0.16 * Math.sin(b.wob * 22) * b.wob; drawBlock(b); b.mesh.instanceMatrix.needsUpdate = true; }
    if (b.st === 'fall') {
      b.vy -= 24 * h; b.y += b.vy * h;
      const c = cols.get(b.x + ',' + b.z) || [];
      let sup = 0; for (const o of c) if (o.y < b.y + 0.01) sup = Math.max(sup, o.y + 1);
      if (b.y <= sup) {
        b.y = sup;
        if (b.fallFrom - sup >= 0.9 && b.look !== TEDDY) {   // long fall: it breaks, toppling the way the tower was hit (top flies furthest)
          b.st = 'rest'; insertCol(b); puff(b.x, b.y + 0.1, b.z, 2, 0.6, 0.8);
          const k = 0.6 + 0.35 * (b.lvl || 1); smash(b, (b.pushX || 0) * k + rand(-1.5, 1.5), (b.pushZ || 0) * k + rand(-1.5, 1.5), 4 + (b.lvl || 1) * 1.5, (b.lvl || 1) > 1);
        }
        else { b.st = 'rest'; b.vy = 0; insertCol(b); const t = performance.now(); if (t - lastThud > 90) { lastThud = t; audio.play('plank', { vol: 0.35, rate: rand(0.95, 1.15) }); } }
      }
      drawBlock(b); b.mesh.instanceMatrix.needsUpdate = true;
    } else if (b.st === 'fly') {
      b.life += h; b.v.y -= 24 * h;
      b.x += b.v.x * h; b.y += b.v.y * h; b.z += b.v.z * h;
      if (b.y < 0) { b.y = 0; b.v.y = -b.v.y * 0.35; b.v.x *= 0.7; b.v.z *= 0.7; b.spin.multiplyScalar(0.6); }
      tmpE.set(b.spin.x * h, b.spin.y * h, b.spin.z * h); tmpQ.setFromEuler(tmpE); b.q.multiply(tmpQ);
      b.scale = b.life < 1.3 ? 1 : Math.max(0, 1 - (b.life - 1.3) / 0.5);
      if (b.scale <= 0) { b.st = 'gone'; b.scale = 0; }
      // fly-blocks are drawn with their float position (x,z are no longer grid cells)
      tmpP.set(b.x, b.y + 0.47, b.z); tmpS.setScalar(b.scale); tmpM.compose(tmpP, b.q, tmpS); b.mesh.setMatrixAt(b.slot, tmpM); b.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
function insertCol(b) {
  const k = b.x + ',' + b.z; if (!cols.has(k)) cols.set(k, []);
  const c = cols.get(k); c.push(b); c.sort((a, o) => a.y - o.y);
}

// ---------------------------------------------------------------------------------------------------------
// Coins / HUD / juice
// ---------------------------------------------------------------------------------------------------------
let coinSndT = 0;
const proj = new THREE.Vector3();
function addCoins(n, x, y, z) {
  levelCoins += n; state.coins += n;
  // one coin flies from the smash to the counter (no more than a few per frame)
  if (x !== undefined && document.querySelectorAll('.flycoin').length < 10) {
    proj.set(x, y, z).project(camera);
    const sx = (proj.x * 0.5 + 0.5) * innerWidth, sy = (-proj.y * 0.5 + 0.5) * innerHeight;
    const el = document.createElement('div'); el.className = 'flycoin'; el.style.left = sx + 'px'; el.style.top = sy + 'px'; document.body.appendChild(el);
    const tr = $('coinChip').getBoundingClientRect();
    requestAnimationFrame(() => { el.style.transform = `translate(${tr.left + 20 - sx}px, ${tr.top + 18 - sy}px) scale(.8)`; });
    setTimeout(() => { el.remove(); const c = $('coinChip'); c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); $('coinText').textContent = state.coins; }, 560);
    if (n > 1) floatText('+' + n, sx, sy - 20);
  } else $('coinText').textContent = state.coins;
  const t = performance.now(); if (t - coinSndT > 90) { coinSndT = t; setTimeout(() => audio.play('coin', { vol: 0.35, rate: rand(1, 1.15) }), 520); }
}
function floatText(txt, x, y, cls = '') {
  const el = document.createElement('div'); el.className = 'float ' + cls; el.textContent = txt; el.style.left = x + 'px'; el.style.top = y + 'px'; document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.transform = 'translateY(-40px)'; el.style.opacity = '0'; });
  setTimeout(() => el.remove(), 750);
}
function showCombo(n) {
  const el = $('combo'); el.textContent = `×${n} COMBO!`; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  if (n % 5 === 0) audio.blip([660, 880, 1175], 0.06, 0.05);
  if (n % 10 === 0) { chipBurst(ball.x, ball.y + 0.5, ball.z, 0xffd23a, 18, 0, 0, 1.3); chipBurst(ball.x, ball.y + 0.5, ball.z, 0xff5fa2, 10, 0, 0, 1.2); el.classList.add('mega'); setTimeout(() => el.classList.remove('mega'), 900); }
  clearTimeout(comboTimer); comboTimer = setTimeout(() => el.classList.remove('on'), 900);
}
function updateHud() {
  const p = Math.min(1, smashed / goalCount);
  $('prog').querySelector('i').style.width = (p * 100).toFixed(1) + '%';
  const togo = goalCount - smashed;
  $('progText').textContent = togo > 0 && togo <= 5 ? `${togo} TO GO!` : `${smashed} / ${goalCount}`;
  $('coinText').textContent = state.coins;
  const s = Math.max(0, Math.ceil(timeLeft));
  $('timeText').textContent = s;
  $('timeChip').classList.toggle('low', s <= 10 && started && !finished);
}
let tutTimer = null;
function showTut(text, ms = 0) { const el = $('tut'); el.textContent = text; el.classList.remove('hidden'); el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; clearTimeout(tutTimer); if (ms) tutTimer = setTimeout(hideTut, ms); }
function hideTut() { $('tut').classList.add('hidden'); }
function onFirstSmash() {
  if (level.hint === 1) { showTut('SMASH! Keep turning — the ball swings out wide', 3200); tutStep = 1; }
  else if (!level.hint || level.hint === 2) hideTut();
}

// ---------------------------------------------------------------------------------------------------------
// Win / fail
// ---------------------------------------------------------------------------------------------------------
function canUpgrade() { return Object.entries(UPS).some(([k, u]) => state.up[k] < u.max && state.coins >= u.cost(state.up[k])); }
// rug 1 (and endless/daily) keep the friendly time rule; from rug 2 stars need score: ★★ and ★★★ targets shown in the HUD
function starTargets() {
  if (!level || level.daily || levelIndex === 0 || levelIndex >= HAND_LEVELS) return null;
  if (level.par) return level.par;   // measured per rug: ★★ ≈ 85 % and ★★★ ≈ 125 % of a good bot run
  const base = goalCount * 10, t = level.time * 10, r50 = (v) => Math.round(v / 50) * 50;
  return [r50(base * 2.4 + t * 0.4), r50(base * 3.6 + t * 0.6)];
}
function starsFor() {
  const tg = starTargets();
  if (!tg) { const f = timeLeft / level.time; return f >= 0.45 ? 3 : f >= 0.2 ? 2 : 1; }
  return score >= tg[1] ? 3 : score >= tg[0] ? 2 : 1;
}
function win() {
  finished = true; started = false; platform.gameplayStop(); platform.happytime();
  stats.wins++; if (stats.firstWinS == null) stats.firstWinS = +((performance.now() - t0) / 1000).toFixed(1);
  // finale: the rest of the rug's blocks pop in a quick cascade (no camera move)
  const rest = blocks.filter((b) => (b.st === 'rest' || b.st === 'fall') && b.look !== TEDDY);
  rest.sort((a, b) => Math.hypot(a.x - car.x, a.z - car.z) - Math.hypot(b.x - car.x, b.z - car.z));
  rest.forEach((b, i) => setTimeout(() => { if (level && b.st !== 'fly' && b.st !== 'gone') smash(b, b.x - car.x, b.z - car.z, 6, i % 3 !== 0); }, 60 + i * 28));
  robots.forEach((r, i) => setTimeout(() => smashRobot(r, r.x - car.x, r.z - car.z, 6, true), 100 + i * 60));
  // confetti shower around the buggy
  for (let k = 0; k < 4; k++) setTimeout(() => { const a = k * 1.6; chipBurst(car.x + Math.cos(a) * 2, 1.5, car.z + Math.sin(a) * 2, [0xffd23a, 0xff5fa2, 0x3b8cf0, 0x45c05a][k], 14, 0, 0, 1.4); }, k * 120);
  { const tb = Math.round(timeLeft) * 10; score += tb; parts.time += tb; }
  const stars = starsFor(), daily = !!level.daily, used = Math.round(level.time - timeLeft), tgs = starTargets();
  let newBest = false;
  if (!daily) { state.best = state.best || {}; if ((state.best[levelIndex] || 0) < score) { newBest = (state.best[levelIndex] || 0) > 0; state.best[levelIndex] = score; } }
  let bonus = 15 + stars * 10, best = null, wasLocked = [];
  if (daily) {
    const d = dayNum(), rec = state.daily && state.daily.day === d ? state.daily : { day: d, best: null, paid: false };
    if (rec.best == null || used < rec.best) rec.best = used;
    bonus = rec.paid ? 10 : 60; rec.paid = true; state.daily = rec; best = rec.best;
  } else {
    wasLocked = WORLDS.map((w, k) => !worldOpen(k));
    const prev = state.stars[levelIndex] || 0;
    state.stars[levelIndex] = Math.max(prev, stars);
    state.cur = Math.max(state.cur, levelIndex + 1);
  }
  const opened = WORLDS.findIndex((w, k) => wasLocked[k] && worldOpen(k));
  hideTut();
  audio.play('win', { vol: 0.7 });
  const stamp = $('stamp'); stamp.querySelector('b').textContent = level.daily ? 'DAILY DONE!' : 'RUG CLEARED!'; stamp.classList.remove('on'); void stamp.offsetWidth; stamp.classList.add('on');
  const show = () => {
    openPanel(`<h2>${daily ? 'DAILY RUG DONE!' : 'RUG CLEARED!'}</h2>
      <div class="stars">${[0, 1, 2].map((i) => `<span class="${i < stars ? 'on' : ''}">★</span>`).join('')}</div>
      <div class="score">SCORE <b>${score}</b>${newBest ? ' <em>NEW BEST!</em>' : ''}</div>
      <p class="parts">Smash ${parts.smash} · Combo +${parts.combo}${parts.trick ? ` · Trick +${parts.trick}` : ''} · Time +${parts.time}${parts.teddy ? ` · Teddy ${parts.teddy}` : ''}</p>
      ${tgs ? `<p class="parts">★★ ${tgs[0]} · ★★★ ${tgs[1]}</p>` : ''}
      <div class="reward"><span class="coin"></span> +<span id="coinCount">0</span> coins</div>
      ${daily ? '' : `<p class="note">Pick a boost for the next rug:</p><div class="boosts">${Object.entries(BOOSTS).map(([k, b]) => `<button class="boost ${pendingBoost === k ? 'sel' : ''}" data-boost="${k}"><i>${b.icon}</i><b>${b.name}</b><small>${b.desc}</small></button>`).join('')}</div>`}
      ${daily ? `<p class="note">Time ${used} s · today's best ${best} s · new rug tomorrow</p>` : opened >= 0 ? `<p class="note unlock">🔓 ${WORLDS[opened].name} is open!</p>` : ''}
      <div class="row" id="winBtns">${platform.hasRewarded ? `<button class="btn green" id="btnDouble">${icon('ad')} Coins ×2</button>` : ''}<button class="btn yellow ${canUpgrade() ? 'ready' : ''}" id="btnGarage">${icon('car')} ${canUpgrade() ? 'Upgrade!' : 'Garage'}</button><button class="btn big orange" id="btnNext">${daily ? 'Home' : 'Next ' + icon('next')}</button></div>`, 'winPanel');
    $('btnNext').onclick = () => { audio.play('click'); if (daily) goHome(); else next(); };
    $('btnGarage').onclick = () => { audio.play('click'); openGarage(show); };
    if ($('btnDouble')) $('btnDouble').onclick = async (e) => {
      const btn = e.currentTarget; if (btn.disabled) return; btn.disabled = true;
      const ok = await rewarded();
      if (ok) { const n = levelCoins; addCoins(n); save(); toast(`+${n} coins!`); audio.play('buy'); doubled = true; } else { toast('No ad available right now'); btn.disabled = false; }
    };
    if (doubled && $('btnDouble')) $('btnDouble').disabled = true;
    $('panel').querySelectorAll('[data-boost]').forEach((bt) => { bt.onclick = () => { pendingBoost = pendingBoost === bt.dataset.boost ? null : bt.dataset.boost; audio.play('click'); $('panel').querySelectorAll('[data-boost]').forEach((o) => o.classList.toggle('sel', o.dataset.boost === pendingBoost)); }; });
    // stars chime one by one, coins count up
    [0, 1, 2].forEach((i) => { if (i < stars) setTimeout(() => audio.blip([784 * Math.pow(1.26, i), 1047 * Math.pow(1.26, i)], 0.07, 0.06), 150 + i * 160); });
    const cc = $('coinCount'), target = levelCoins, t0c = performance.now();
    const tick = () => { if (!cc.isConnected) return; const f = Math.min(1, (performance.now() - t0c) / 700); cc.textContent = Math.round(target * f); if (f < 1) requestAnimationFrame(tick); };
    if (counted) cc.textContent = target; else { counted = true; requestAnimationFrame(tick); }
  };
  let counted = false;
  let doubled = false;
  setTimeout(() => { addCoins(bonus); save(); show();
  }, 1300);
}
async function next() {
  levelsSinceAd++;
  closePanels(true);
  if (levelsSinceAd >= 2 && performance.now() - lastAdAt > 100000) {
    levelsSinceAd = 0; lastAdAt = performance.now();
    pause(); await platform.interstitial(() => audio.suspend()); resume();
  }
  const n = levelIndex + 1;
  if (n < HAND_LEVELS && !worldOpen(worldOf(n))) {
    const w = WORLDS[worldOf(n)], need = w.stars - totalStars();
    openPanel(`<h2>${w.name.toUpperCase()} IS LOCKED</h2><p class="note">Collect <b>${need} more ★</b> to open it. Replay rugs faster for 3 stars!</p>
      <div class="row"><button class="btn big" id="lkLevels">${icon('menu')} Levels</button></div>`, 'lockPanel', () => goHome());
    $('lkLevels').onclick = () => { audio.play('click'); openLevels(() => goHome()); };
    return;
  }
  startLevel(n);
}
function goHome() {
  closePanels(true); started = false; finished = true; platform.gameplayStop();
  $('hud').classList.add('hidden'); $('start').classList.remove('hidden'); updateHomeBadges();
}
function timeUp() {
  finished = true; failed = true; started = false; platform.gameplayStop(); stats.fails++;
  audio.play('lose', { vol: 0.6 });
  hideTut();
  const left = goalCount - smashed;
  openPanel(`<h2>TIME'S UP!</h2><p style="font-size:20px;font-weight:800;margin:4px 0 0">Only ${left} more block${left === 1 ? '' : 's'} to go!</p>
    <div class="row">${platform.hasRewarded && !extraUsed ? `<button class="btn green big" id="btnMore">${icon('ad')} +20 seconds</button>` : ''}<button class="btn orange big" id="btnRetry">${icon('retry')} Retry</button></div>`, 'failPanel');
  $('btnRetry').onclick = () => { audio.play('click'); pendingBoost = boost; startLevel(levelIndex); };
  if ($('btnMore')) $('btnMore').onclick = async (e) => {
    e.currentTarget.disabled = true;
    const ok = await rewarded();
    if (ok) { extraUsed = true; timeLeft = 20; finished = false; failed = false; started = true; closePanels(true); platform.gameplayStart(); updateHud(); }
    else toast('No ad available right now');
  };
}
async function rewarded() { pause(); const ok = await platform.rewarded(() => audio.suspend()); resume(); return ok; }

// ---------------------------------------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------------------------------------
const ICONS = {
  pause: '<path d="M7 5h3v14H7zM14 5h3v14h-3z"/>', next: '<path d="M8 5l9 7-9 7z"/>', retry: '<path d="M12 5a7 7 0 1 1-6.6 4.7l2 .7A5 5 0 1 0 12 7v3L7 6l5-4z"/>',
  ad: '<path d="M4 6h16v12H4zM10 9v6l5-3z"/>', car: '<path d="M5 11l2-5h10l2 5h1v6h-2a2 2 0 0 1-4 0H10a2 2 0 0 1-4 0H4v-6zM8 8l-1 3h10l-1-3z"/>',
  menu: '<path d="M4 6h16v3H4zM4 11h16v3H4zM4 16h16v3H4z"/>', gear: '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8 5v-2l-2.2-.6-.6-1.4 1.1-2-1.4-1.4-2 1.1-1.4-.6L13 4h-2l-.6 2.2-1.4.6-2-1.1-1.4 1.4 1.1 2-.6 1.4L4 11v2l2.2.6.6 1.4-1.1 2 1.4 1.4 2-1.1 1.4.6L11 20h2l.6-2.2 1.4-.6 2 1.1 1.4-1.4-1.1-2 .6-1.4z"/>',
  play: '<path d="M8 5l11 7-11 7z"/>', left: '<path d="M15 4l-9 8 9 8z"/>', right: '<path d="M9 4l9 8-9 8z"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24" fill="currentColor">${ICONS[n]}</svg>`;
$('btnPause').innerHTML = icon('pause');
$('padL').innerHTML = `<svg viewBox="0 0 24 24" fill="#fff">${ICONS.left}</svg>`; $('padR').innerHTML = `<svg viewBox="0 0 24 24" fill="#fff">${ICONS.right}</svg>`;

let panelBack = null;   // what Escape / a tap on the shade does for the open panel (null = the panel needs a choice)
function openPanel(html, id, back = null) {
  panelBack = back;
  if (!panelOpen && started && !finished) platform.gameplayStop();
  panelOpen = id; releaseAll();
  const p = $('panel'); p.innerHTML = html; p.classList.remove('hidden'); $('shade').classList.remove('hidden');
}
function closePanels(silent) {
  const was = panelOpen; panelOpen = null; panelBack = null;
  $('panel').classList.add('hidden'); $('shade').classList.add('hidden');
  if (was && !silent) audio.play('close', { vol: 0.5 });
  if (was && started && !finished && !paused) platform.gameplayStart();
}
let toastT = null;
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.add('hidden'), 1800); }

function openPause() {
  if (!started || finished) return;
  audio.play('open', { vol: 0.5 });
  openPanel(`<h2>PAUSED</h2>${settingsHtml()}
    <div class="row"><button class="btn green big" id="pCont">${icon('play')} Continue</button></div>
    <div class="row"><button class="btn orange" id="pRetry">${icon('retry')} Retry</button><button class="btn" id="pLevels">${icon('menu')} Levels</button><button class="btn yellow" id="pGarage">${icon('car')} Garage</button></div>`, 'pausePanel', () => closePanels());
  bindSettings();
  $('pCont').onclick = () => closePanels();
  $('pRetry').onclick = () => { audio.play('click'); pendingBoost = boost; startLevel(levelIndex); };
  $('pLevels').onclick = () => { audio.play('click'); openLevels(() => openPause()); };
  $('pGarage').onclick = () => { audio.play('click'); openGarage(() => openPause()); };
}
function settingsHtml() {
  if (platform.ownAudioControl) return '';
  return `<div class="toggle">Sound <button class="btn ${state.sound ? 'green' : 'grey'}" id="tSound">${state.sound ? 'ON' : 'OFF'}</button></div>
          <div class="toggle">Music <button class="btn ${state.music ? 'green' : 'grey'}" id="tMusic">${state.music ? 'ON' : 'OFF'}</button></div>`;
}
function bindSettings() {
  if (!$('tSound')) return;
  $('tSound').onclick = (e) => { state.sound = !state.sound; audio.setSound(state.sound); e.currentTarget.textContent = state.sound ? 'ON' : 'OFF'; e.currentTarget.className = 'btn ' + (state.sound ? 'green' : 'grey'); audio.play('click'); save(); };
  $('tMusic').onclick = (e) => { state.music = !state.music; audio.setMusic(state.music); e.currentTarget.textContent = state.music ? 'ON' : 'OFF'; e.currentTarget.className = 'btn ' + (state.music ? 'green' : 'grey'); audio.play('click'); save(); };
}
function openLevels(back) {
  const ts = totalStars();
  let html = `<div class="lvTop"><span class="reward" style="margin:0">★ ${ts}</span><button class="btn purple" id="lvDaily">${icon('play')} Daily Rug${state.daily && state.daily.day === dayNum() ? ' ✓' : ''}</button></div>`;
  WORLDS.forEach((w, k) => {
    const open = worldOpen(k);
    html += `<div class="world"><h3 class="wh">${w.name}${open ? '' : ` <small>🔒 ${w.stars} ★</small>`}</h3><div class="grid">`;
    for (let i = k * PER_WORLD; i < (k + 1) * PER_WORLD; i++) {
      const ok = levelOpen(i), st = state.stars[i] || 0;
      html += `<button class="cell ${ok ? '' : 'locked'} ${i === state.cur ? 'cur' : ''}" data-i="${i}" ${ok ? '' : 'disabled'}>${i % PER_WORLD + 1}<small>${ok ? '★'.repeat(st) || '·' : '🔒'}</small></button>`;
    }
    html += '</div></div>';
  });
  html = html.replace('<div class="world">', '<div class="worlds"><div class="world">') + '</div>';
  if (state.cur >= HAND_LEVELS) {
    html += `<h3 class="wh">Rug Rumble</h3><div class="grid">`;
    for (let i = HAND_LEVELS; i <= state.cur; i++) html += `<button class="cell ${i === state.cur ? 'cur' : ''}" data-i="${i}">${i - HAND_LEVELS + 1}<small>${'★'.repeat(state.stars[i] || 0) || '·'}</small></button>`;
    html += '</div>';
  }
  const goBack = () => { audio.play('click'); if (back) back(); else closePanels(); };
  openPanel(`<h2>LEVELS</h2><div class="lvScroll">${html}</div><div class="row"><button class="btn grey" id="lvBack">Back</button></div>`, 'levelsPanel', goBack);
  $('panel').querySelectorAll('.cell:not(.locked)').forEach((c) => { c.onclick = () => { audio.unlock(); audio.play('click'); $('start').classList.add('hidden'); startLevel(+c.dataset.i); }; });
  $('lvDaily').onclick = () => { audio.unlock(); audio.play('click'); $('start').classList.add('hidden'); startLevel('daily'); };
  $('lvBack').onclick = goBack;
  const cur = $('panel').querySelector('.cell.cur'); if (cur) cur.scrollIntoView({ block: 'nearest' });
}
function openGarage(back) {
  const ups = Object.entries(UPS).map(([k, u]) => {
    const lv = state.up[k], maxed = lv >= u.max, cost = u.cost(lv);
    return `<div class="up"><div class="ic">${u.icon}</div><div class="tx"><b>${u.name}</b><span>${u.desc}</span><div class="pips">${Array.from({ length: u.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div></div>
      <button class="btn ${maxed ? 'grey' : 'green'}" data-up="${k}" ${maxed || state.coins < cost ? 'disabled' : ''}>${maxed ? 'MAX' : `<span class="coin"></span> ${cost}`}</button></div>`;
  }).join('');
  const skins = SKINS.map((s, i) => {
    const own = state.owned.includes(i);
    return `<div class="skin ${state.skin === i ? 'sel' : ''}" data-skin="${i}" style="background:#${s.body.toString(16).padStart(6, '0')}"><small>${own ? s.name : s.price}</small></div>`;
  }).join('');
  openPanel(`<h2>GARAGE</h2><div class="reward" style="margin:0 0 10px"><span class="coin"></span> ${state.coins}</div><div class="ups">${ups}</div><h3>Paint</h3><div class="skins">${skins}</div>
    <div class="row"><button class="btn grey" id="gBack">Back</button></div>`, 'garagePanel', () => { audio.play('click'); if (back) back(); else closePanels(); });
  $('panel').querySelectorAll('[data-up]').forEach((b) => { b.onclick = () => {
    const k = b.dataset.up, cost = UPS[k].cost(state.up[k]);
    if (state.coins < cost || state.up[k] >= UPS[k].max) { audio.play('error'); return; }
    state.coins -= cost; state.up[k]++; save(); audio.play('buy'); $('coinText').textContent = state.coins;
    if (level && started) { ball.r = 0.65 + state.up.ball * 0.06; ballMesh.scale.setScalar(ball.r); }
    openGarage(back);
  }; });
  $('panel').querySelectorAll('[data-skin]').forEach((b) => { b.onclick = () => {
    const i = +b.dataset.skin, s = SKINS[i];
    if (!state.owned.includes(i)) { if (state.coins < s.price) { audio.play('error'); toast(`Need ${s.price} coins`); return; } state.coins -= s.price; state.owned.push(i); audio.play('unlock'); }
    else audio.play('click');
    state.skin = i; applySkin(); save(); openGarage(back);
  }; });
  $('gBack').onclick = () => { audio.play('click'); if (back) back(); else closePanels(); };
}

// ---------------------------------------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------------------------------------
const touches = new Map();   // pointerId -> 'l' | 'r'
function updateTouch() {
  input.l = false; input.r = false;
  for (const s of touches.values()) { if (s === 'l') input.l = true; else input.r = true; }
  $('padL').classList.toggle('on', input.l || input.kl); $('padR').classList.toggle('on', input.r || input.kr);
  carKick();
}
function releaseAll() { touches.clear(); input = { l: false, r: false, b: false, kl: false, kr: false, kb: false }; $('padL').classList.remove('on'); $('padR').classList.remove('on'); }
// steering answers on the very next frame: front wheels snap to the turn, body leans (the camera never moves for it)
let wheelVis = 0;
function carKick() { const s = steerInput(); wheelVis = s * 0.5; if (s && started && !finished) setSteerArrow(s); }
canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  if (panelOpen || !started) return;
  e.preventDefault();
  touches.set(e.pointerId, e.clientX < innerWidth / 2 ? 'l' : 'r'); updateTouch();
});
for (const id of ['padL', 'padR']) $(id).addEventListener('pointerdown', (e) => { audio.unlock(); e.preventDefault(); if (panelOpen || !started) return; touches.set(e.pointerId, id === 'padL' ? 'l' : 'r'); updateTouch(); });
$('hud').style.pointerEvents = 'none'; $('padL').style.pointerEvents = $('padR').style.pointerEvents = 'auto'; $('btnPause').style.pointerEvents = 'auto';
const endTouch = (e) => { if (touches.delete(e.pointerId)) updateTouch(); };
addEventListener('pointerup', endTouch); addEventListener('pointercancel', endTouch);
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  audio.unlock();
  if (e.code === 'Escape' || e.code === 'KeyP') { if (panelOpen) { if (panelBack) panelBack(); } else openPause(); return; }
  if (e.repeat) return;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') input.kl = true;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') input.kr = true;
  if (e.code === 'ArrowDown' || e.code === 'KeyS' || e.code === 'Space') input.kb = true;
  if ((e.code === 'Enter' || e.code === 'Space') && panelOpen === 'winPanel') { next(); return; }
  updateTouch();
});
addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') input.kl = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') input.kr = false;
  if (e.code === 'ArrowDown' || e.code === 'KeyS' || e.code === 'Space') input.kb = false;
  updateTouch();
});
$('btnPause').addEventListener('click', () => { audio.unlock(); openPause(); });
$('shade').addEventListener('click', () => { if (panelOpen && panelBack) panelBack(); });

// ---------------------------------------------------------------------------------------------------------
// Pause / visibility (silence + freeze whenever the game is not in front)
// ---------------------------------------------------------------------------------------------------------
function pause() { if (paused++ === 0 && started && !panelOpen && !finished) platform.gameplayStop(); audio.suspend(); }
function resume() { if (paused > 0 && --paused === 0) { last = performance.now(); if (started && !panelOpen && !finished) platform.gameplayStart(); } audio.resume(); }
platform.onPause = () => pause();
platform.onResume = () => resume();
platform.onAudio = (on) => { if (on) audio.resume(); else audio.suspend(); };
let away = false;
function setAway(v) { if (v === away) return; away = v; if (v) { releaseAll(); pause(); } else resume(); }
if (!platform.ownPauseEvents) {
  document.addEventListener('visibilitychange', () => setAway(document.hidden || !document.hasFocus()));
  addEventListener('blur', () => setAway(true));
  addEventListener('focus', () => setAway(document.hidden));
  addEventListener('pagehide', () => setAway(true));
  addEventListener('pageshow', () => setAway(document.hidden || !document.hasFocus()));
}

// ---------------------------------------------------------------------------------------------------------
// Camera: fixed angle (never rotates with the buggy), smooth follow, no shake, no zoom changes
// ---------------------------------------------------------------------------------------------------------
const camTarget = new THREE.Vector3(), camLook = new THREE.Vector3();
function camOffset() { return innerWidth / innerHeight < 1 ? [0, 22.5, 15] : [0, 17.8, 12.2]; }
function snapCamera() {
  const [ox, oy, oz] = camOffset();
  camVel.set(0, 0, 0); camGoal(camLook); camS1.copy(camLook); camera.position.set(camLook.x + ox, oy, camLook.z + oz); camera.lookAt(camLook);
}
const camS1 = new THREE.Vector3(), camVel = new THREE.Vector3();
function camGoal(out) {
  const W = level.w / 2, D = level.d / 2;
  out.set(clamp(car.x + camVel.x * 0.3, Math.min(0, -W + 7), Math.max(0, W - 7)), 0, clamp(car.z + camVel.z * 0.3, Math.min(0, -D + 2.5), Math.max(0, D - 5.5)));
  return out;
}
function updateCamera(dt) {
  const [ox, oy, oz] = camOffset();
  // two cascaded smoothers on a target that never jumps: no jitter on bumps, chain tugs or rapid steering taps
  const kv = 1 - Math.exp(-2.5 * dt); camVel.x += (car.vx - camVel.x) * kv; camVel.z += (car.vz - camVel.z) * kv;
  camGoal(tmpP);
  const k = 1 - Math.exp(-3.5 * dt);
  camS1.x += (tmpP.x - camS1.x) * k; camS1.z += (tmpP.z - camS1.z) * k;
  camLook.x += (camS1.x - camLook.x) * k; camLook.z += (camS1.z - camLook.z) * k;
  camera.position.set(camLook.x + ox, oy, camLook.z + oz);
  camera.lookAt(camLook);
  sun.position.set(camLook.x - 8, 20, camLook.z + 10); sun.target.position.set(camLook.x, 0, camLook.z);
}

// ---------------------------------------------------------------------------------------------------------
// Render sync
// ---------------------------------------------------------------------------------------------------------
const linkM = new THREE.Matrix4(), linkQ = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), dirV = new THREE.Vector3();
function syncMeshes(dt) {
  buggy.position.set(car.x, 0, car.z); buggy.rotation.y = car.h;
  const lean = -car.steer * clamp(car.f / vmax(), 0, 1) * 0.09;
  car.roll += (lean - car.roll) * Math.min(1, dt * 10);
  car.bump = Math.max(0, car.bump - dt * 4);
  chassis.rotation.z = car.roll; chassis.position.y = Math.sin(car.bump * 9) * 0.04 * car.bump;
  car.wheelSpin += car.f * dt / 0.36;
  const wantWheel = steerInput() * 0.5; wheelVis += (wantWheel - wheelVis) * Math.min(1, dt * 20);
  for (const w of wheels) { w.w.rotation.x = car.wheelSpin; w.pivot.rotation.y = w.front ? wheelVis : 0; }
  { const u = steerArrow.userData; u.t = (u.t || 0) + dt; const held = steerInput() !== 0 && started && !finished && u.t < 0.45; if (!held) { u.mat.opacity = Math.max(0, u.mat.opacity - dt * 3.5); u.edge.opacity = Math.max(0, u.edge.opacity - dt * 3); } if (steerInput() && steerInput() !== u.side && started && !finished) setSteerArrow(steerInput()); steerArrow.visible = u.mat.opacity > 0.01; }
  // ball: rolls with its ground velocity
  ballMesh.position.set(ball.x, ball.y, ball.z);
  const sp = Math.hypot(ball.vx, ball.vz);
  if (sp > 0.01) { dirV.set(ball.vz, 0, -ball.vx).normalize(); linkQ.setFromAxisAngle(dirV, -sp * dt / ball.r); ballMesh.quaternion.premultiply(linkQ); }
  // chain: links from the hitch to the ball, sagging when slack
  const dx = Math.sin(car.h), dz = Math.cos(car.h);
  const hx = car.x - dx * 1.1, hz = car.z - dz * 1.1, hy = 0.55;
  const ex = ball.x - hx, ez = ball.z - hz, ey = ball.y - hy, d = Math.hypot(ex, ey, ez), L = chainLen();
  const sag = Math.sqrt(Math.max(0, L * L - d * d)) * 0.5;
  for (let i = 0; i < LINKS; i++) {
    const t = (i + 0.5) / LINKS;
    const x = hx + ex * t, z = hz + ez * t; let y = hy + ey * t - sag * 4 * t * (1 - t);
    y = Math.max(0.08, y);
    dirV.set(ex, ey, ez).normalize();
    linkQ.setFromUnitVectors(up, dirV);
    if (i % 2) { tmpQ.setFromAxisAngle(up, Math.PI / 2); linkQ.multiply(tmpQ); }
    tmpQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2); linkQ.multiply(tmpQ);
    linkM.compose(tmpP.set(x, y, z), linkQ, tmpS.setScalar(1)); links.setMatrixAt(i, linkM);
  }
  links.instanceMatrix.needsUpdate = true;
  // power: yellow ring + bright trail once the ball is fast enough to smash, orange-hot for stone
  const smashOk = sp >= breakSpeed(0), stoneOk = sp >= breakSpeed(STONE);
  powerRing.position.set(ball.x, 0.03, ball.z); powerRing.scale.setScalar(ball.r * 1.6);
  powerRing.material.color.setHex(stoneOk ? 0xff6a2a : 0xffd23a);
  powerRing.material.opacity += ((smashOk ? 0.75 : 0) - powerRing.material.opacity) * Math.min(1, dt * 12);
  trailPts.unshift([ball.x, ball.y, ball.z, sp]); if (trailPts.length > TRAIL) trailPts.pop();
  const cr = stoneOk ? 1 : 1, cg = stoneOk ? 0.45 : 0.85, cb = stoneOk ? 0.15 : 0.3;
  for (let i = 0; i < TRAIL; i++) {
    const p = trailPts[Math.min(i, trailPts.length - 1)] || [ball.x, ball.y, ball.z, 0];
    const q = trailPts[Math.min(i + 1, trailPts.length - 1)] || p;
    let nx = -(p[2] - q[2]), nz = p[0] - q[0]; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
    const w = ball.r * 0.8 * (1 - i / TRAIL);
    trailPos.set([p[0] + nx * w, p[1], p[2] + nz * w, p[0] - nx * w, p[1], p[2] - nz * w], i * 6);
    const a = clamp((p[3] - 2.5) / 8, 0, 0.7) * (1 - i / TRAIL);
    trailCol.set([cr, cg, cb, a, cr, cg, cb, a], i * 8);
  }
  trailGeo.attributes.position.needsUpdate = true; trailGeo.attributes.color.needsUpdate = true;
}
function stepFx(dt) {
  let any = false;
  for (let i = 0; i < CHIPS; i++) {
    const p = chips[i];
    if (p.life > 0) {
      any = true; p.life -= dt; p.vy -= 22 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.r += p.rv * dt;
      if (p.y < 0.1) { p.y = 0.1; p.vy = -p.vy * 0.3; p.vx *= 0.6; p.vz *= 0.6; }
      const s = p.s * Math.min(1, p.life * 3);
      tmpE.set(p.r, p.r * 0.7, 0); tmpQ.setFromEuler(tmpE); tmpM.compose(tmpP.set(p.x, p.y, p.z), tmpQ, tmpS.setScalar(s)); chipMesh.setMatrixAt(i, tmpM);
    } else if (p.y > -5) { p.y = -9; tmpM.compose(tmpP.set(0, -9, 0), tmpQ.identity(), tmpS.setScalar(0.001)); chipMesh.setMatrixAt(i, tmpM); any = true; }
  }
  if (any) chipMesh.instanceMatrix.needsUpdate = true;
  for (let i = 0; i < PUFFS; i++) {
    const p = puffs[i];
    if (p.life < p.max) {
      p.life += dt; const t = p.life / p.max; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vx *= 0.95; p.vz *= 0.95;
      tmpM.compose(tmpP.set(p.x, p.y, p.z), tmpQ.identity(), tmpS.setScalar(p.s * (0.5 + t) * (t > 0.7 ? (1 - t) / 0.3 : 1))); puffMesh.setMatrixAt(i, tmpM);
    } else if (p.y > -5) { p.y = -9; tmpM.compose(tmpP.set(0, -9, 0), tmpQ.identity(), tmpS.setScalar(0.001)); puffMesh.setMatrixAt(i, tmpM); }
  }
  puffMesh.instanceMatrix.needsUpdate = true;
}

// ---------------------------------------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------------------------------------
let last = performance.now(), dustT = 0;
function step(h) {
  if (!level) return;
  if (started && !finished) {
    stepCar(h);
    timeLeft -= h; levelT += h;
    if (timeLeft <= 0) { timeLeft = 0; updateHud(); timeUp(); }
  } else {
    // menus / finale: the buggy coasts to a stop
    car.vx *= Math.exp(-3 * h); car.vz *= Math.exp(-3 * h); car.x += car.vx * h; car.z += car.vz * h; car.f *= Math.exp(-3 * h);
  }
  stepBall(h);
  stepRobots(h);
  stepBlocks(h);
}
// "N TO GO": when few blocks are left, an arrow at the screen edge points at the nearest one that is off screen
const arrowEl = document.createElement('div'); arrowEl.id = 'arrow'; arrowEl.className = 'hidden'; arrowEl.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 12l12-8v5h4v6h-4v5z" fill="#ffc531" stroke="#5a2a12" stroke-width="1.6" stroke-linejoin="round"/></svg>';
$('hud').appendChild(arrowEl);
function updateArrow() {
  const left = goalCount - smashed;
  if (!started || finished || left > 5 || left <= 0) { arrowEl.classList.add('hidden'); return; }
  let best = null, bd = 1e9;
  for (const b of blocks) if (b.st === 'rest' && b.look !== TEDDY) { const d = Math.hypot(b.x - car.x, b.z - car.z); if (d < bd) { bd = d; best = b; } }
  for (const r of robots) if (r.alive) { const d = Math.hypot(r.x - car.x, r.z - car.z); if (d < bd) { bd = d; best = { x: r.x, y: 0.5, z: r.z }; } }
  if (!best) { arrowEl.classList.add('hidden'); return; }
  proj.set(best.x, best.y + 0.5, best.z).project(camera);
  const on = Math.abs(proj.x) < 0.85 && Math.abs(proj.y) < 0.8 && proj.z < 1;
  if (on) { arrowEl.classList.add('hidden'); return; }
  let ax = proj.x, ay = proj.y; if (proj.z > 1) { ax = -ax; ay = -ay; }
  const ang = Math.atan2(-ay, ax), m = Math.max(Math.abs(ax) / 0.88, Math.abs(ay) / 0.78, 1e-3);
  const sx = (ax / m * 0.5 + 0.5) * innerWidth, sy = (-ay / m * 0.5 + 0.5) * innerHeight;
  arrowEl.classList.remove('hidden');
  arrowEl.style.transform = `translate(${sx - 28}px, ${sy - 28}px) rotate(${ang}rad)`;
}
// last few targets: a bobbing marker over each (no more hunting for the last blocks)
const MARKS = [];
{ const geo = new THREE.ConeGeometry(0.32, 0.6, 12); geo.rotateX(Math.PI); const mat = new THREE.MeshBasicMaterial({ color: 0xffd23a });
  for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(geo, mat); m.visible = false; scene.add(m); MARKS.push(m); } }
function updateMarks(t) {
  const left = goalCount - smashed, show = started && !finished && left > 0 && left <= 5;
  let k = 0;
  if (show) {
    const list = [];
    for (const b of blocks) if (b.st === 'rest' && b.look !== TEDDY) list.push([Math.hypot(b.x - car.x, b.z - car.z), b.x, columnTop(b.x, b.z), b.z]);
    for (const r of robots) if (r.alive) list.push([Math.hypot(r.x - car.x, r.z - car.z), r.x, 2.4, r.z]);
    list.sort((a, b) => a[0] - b[0]);
    for (const [, x, y, z] of list.slice(0, MARKS.length)) { const m = MARKS[k++]; m.visible = true; m.position.set(x, y + 0.9 + Math.sin(t * 5 + x) * 0.18, z); }
  }
  for (; k < MARKS.length; k++) MARKS[k].visible = false;
}
let hudT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (paused || panelOpen === 'pausePanel' || panelOpen === 'garagePanel' && started && !finished || panelOpen === 'levelsPanel' && started && !finished) dt = 0;
  if (level) {
    // whole frame time in equal sub-steps (no leftover accumulator = no uneven motion between frames)
    if (dt > 0) { const n = Math.ceil(dt / H - 1e-6), h = dt / n; for (let i = 0; i < n; i++) step(h); }
    syncMeshes(dt); syncRobots(dt); stepFx(dt); updateCamera(dt);
    // dust behind the wheels when turning hard at speed
    dustT -= dt; if (started && Math.abs(car.steer) > 0.6 && car.f > 5 && dustT < 0) { dustT = 0.07; puff(car.x - Math.sin(car.h) * 0.9, 0.1, car.z - Math.cos(car.h) * 0.9, 1, 0.5, 0.8); }
    hudT += dt; if (hudT > 0.2) { hudT = 0; updateHud(); if (level && started) updateScoreHud(); }
    updateArrow(); updateMarks(now / 1000);
    audio.engine(started && !finished ? 1 : 0, clamp(Math.abs(car.f) / vmax(), 0, 1), !!level && !paused);
  }
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------------------------------------
async function boot() {
  const bar = $('bar').querySelector('i');
  bar.style.width = '20%';
  await platform.init();
  const dev = platform.device(); if (dev === 'mobile' || dev === 'tablet') { setTouch(true); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); }
  bar.style.width = '55%';
  try { const s = await platform.loadSave(); if (s) state = Object.assign(state, JSON.parse(s)); } catch (e) { /* fresh start */ }
  state.up = Object.assign({ ball: 0, chain: 0, engine: 0 }, state.up);
  audio.setSound(state.sound); audio.setMusic(state.music);
  applySkin();
  try { await Promise.race([document.fonts.load('900 54px Rubik'), new Promise((r) => setTimeout(r, 1500))]); } catch (e) { /* draw anyway */ }
  // block textures were painted before the font loaded: repaint them once
  blockMats.forEach((m, i) => { const old = m.map; m.map = blockTex(i); m.needsUpdate = true; old.dispose(); });
  // attract mode behind the title: the current level, the buggy idling
  levelIndex = Math.min(state.cur, 999); if (!levelOpen(levelIndex)) levelIndex = 0; level = getLevel(levelIndex); buildArena(level.w, level.d, level.theme, level.rug || 0); buildBlocks(level.blocks); buildRobots(level.robots); resetActors(); snapCamera();
  bar.style.width = '100%';
  requestAnimationFrame(frame);
  $('loader').classList.add('hidden'); $('start').classList.remove('hidden');
  $('coinText').textContent = state.coins;
  const row = $('startRow');
  const lb = document.createElement('button'); lb.className = 'btn'; lb.id = 'btnLevels'; lb.innerHTML = icon('menu') + ' Levels'; lb.onclick = () => { audio.unlock(); audio.play('click'); openLevels(); }; row.appendChild(lb);
  const db = document.createElement('button'); db.className = 'btn purple'; db.id = 'btnDaily'; db.innerHTML = icon('play') + ' Daily'; db.onclick = () => { audio.unlock(); audio.play('click'); $('start').classList.add('hidden'); startLevel('daily'); }; row.appendChild(db);
  const gb = document.createElement('button'); gb.className = 'btn yellow'; gb.id = 'btnGarageHome'; gb.innerHTML = icon('car') + ' Garage'; gb.onclick = () => { audio.unlock(); audio.play('click'); openGarage(); }; row.appendChild(gb);
  if (!platform.ownAudioControl) { const sb = document.createElement('button'); sb.className = 'btn grey'; sb.id = 'btnSettings'; sb.setAttribute('aria-label', 'Settings'); sb.innerHTML = icon('gear'); sb.onclick = () => { audio.unlock(); audio.play('click'); openPanel(`<h2>SETTINGS</h2>${settingsHtml()}<div class="row"><button class="btn grey" id="sBack">Back</button></div>`, 'settingsPanel', () => closePanels()); bindSettings(); $('sBack').onclick = () => closePanels(); }; row.appendChild(sb); }
  requestAnimationFrame(() => platform.loadingDone());
  $('btnPlay').addEventListener('click', () => {
    audio.unlock(); audio.play('click');
    const t = Math.min(state.cur, 9999);
    if (!levelOpen(t)) { openLevels(); toast(`Collect ${WORLDS[worldOf(t)].stars} ★ to open ${WORLDS[worldOf(t)].name}`); return; }
    $('start').classList.add('hidden'); startLevel(t);
  });
  updateHomeBadges();
  maybeDailyGift();
}
function updateHomeBadges() { const d = $('btnDaily'); if (d) d.classList.toggle('ready', !(state.daily && state.daily.day === dayNum()) && state.cur >= 2); }
// daily gift: fixed amounts, a 7-day streak (no random rewards). Only for returning players, never on the very first visit.
const GIFTS = [50, 75, 100, 150, 200, 250, 400];
function maybeDailyGift() {
  const d = dayNum();
  if (state.cur < 1 || state.giftDay === d) { const gb = $('btnGift'); if (gb) gb.remove(); return; }
  // non-blocking: a pulsing gift button on the title screen; the panel opens only when the player taps it
  if (!$('btnGift')) { const gb = document.createElement('button'); gb.id = 'btnGift'; gb.className = 'btn green ready'; gb.innerHTML = '🎁 Gift'; gb.onclick = () => { audio.unlock(); audio.play('open', { vol: 0.5 }); openGift(); }; $('startRow').prepend(gb); }
}
function openGift() {
  const d = dayNum();
  if (state.giftDay === d) return;
  const streak = state.giftDay === d - 1 ? ((state.giftStreak || 0) % 7) + 1 : 1, amount = GIFTS[streak - 1];
  const days = GIFTS.map((g, k) => `<div class="gday ${k + 1 < streak ? 'got' : k + 1 === streak ? 'now' : ''}"><small>Day ${k + 1}</small><b>${g}</b></div>`).join('');
  openPanel(`<h2>DAILY GIFT</h2><p class="note">Come back every day for a bigger gift!</p><div class="gifts">${days}</div>
    <div class="row"><button class="btn green big" id="giftTake"><span class="coin"></span> Take ${amount}</button></div>`, 'giftPanel', () => closePanels());
  $('giftTake').onclick = () => {
    state.giftDay = d; state.giftStreak = streak; state.coins += amount; save(); $('coinText').textContent = state.coins;
    audio.unlock(); audio.play('buy'); closePanels(true); toast(`+${amount} coins!`); const gb = $('btnGift'); if (gb) gb.remove();
  };
}
boot();

if (platform.name === 'local' || (DEBUG && /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) window.__game = {
  get state() { return state; }, get car() { return car; }, get ball() { return ball; }, get level() { return levelIndex; }, get started() { return started; }, get finished() { return finished; },
  get panel() { return panelOpen; }, get paused() { return paused; }, get smashed() { return smashed; }, get goal() { return goalCount; }, get timeLeft() { return timeLeft; }, get stats() { return stats; },
  get blocksLeft() { return blocks.filter((b) => (b.st === 'rest' || b.st === 'fall') && b.look !== TEDDY).map((b) => ({ x: b.x, z: b.z, y: b.y, look: b.look })).concat(robots.filter((r) => r.alive).map((r) => ({ x: r.x, z: r.z, y: 0, look: 'robot' }))); },
  get teddies() { return blocks.filter((b) => b.look === TEDDY).map((b) => ({ x: b.x, z: b.z })); }, get robots() { return robots.filter((r) => r.alive).length; }, goHome: () => goHome(),
  camera, startLevel, closePanels, openPanel, next, platform, audio, measureMix: (s) => audio.measureMix(s), step(n) { for (let i = 0; i < n; i++) step(H); },
  get mem() { return renderer.info.memory; }, get score() { return score; }, get parts() { return parts; }, get targets() { return starTargets(); }, setInput(o) { Object.assign(input, o); updateTouch(); }, win: () => win(), timeUp: () => timeUp(), openGarage: () => openGarage(), openLevels: () => openLevels(), openPause: () => openPause(), addCoins: (n) => { state.coins += n; $('coinText').textContent = state.coins; }, get info() { return renderer.info.render; },
};
