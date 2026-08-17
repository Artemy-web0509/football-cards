// ============ 3D МИР: объекты, генерация, камера, движение ============
// ===================== 3D МИР =====================
// Размеры поля и спиннера у каждой базы в 3D-мире
const FIELD_W = 34, FIELD_D = 26, FIELD_GAP = 12, SPIN_OFFSET = 22;

function fieldRectFor(base) { return { x0: base.x - FIELD_W / 2, x1: base.x + FIELD_W / 2, z0: base.z + FIELD_GAP, z1: base.z + FIELD_GAP + FIELD_D }; }
function spinnerPosFor(base) { return { x: base.x + SPIN_OFFSET, z: base.z + FIELD_GAP + FIELD_D / 2 }; }

// Интерактивные объекты: 8 спиннеров, 8 полей, табло удачи, табло прокачки полей, арена в центре, магазины
const SPINNERS = BASES.map((b, i) => ({ type: 'spinner', idx: i, name: '🎡 Спиннер', x: b.x + SPIN_OFFSET, z: b.z + FIELD_GAP + FIELD_D / 2, w: 4, d: 4, solid: false }));
const FIELDS = BASES.map((b, i) => ({ type: 'field', idx: i, name: b.name, x: b.x, z: b.z + FIELD_GAP + FIELD_D / 2, w: FIELD_W, d: FIELD_D, solid: false }));
const LUCK_SIGNS = BASES.map((b, i) => {
  const sp = spinnerPosFor(b);
  return { type: 'luck', idx: i, name: '🍀 Табло удачи', x: sp.x + 6, z: sp.z, w: 4, d: 2, solid: false };
});
const FIELDUPG_SIGNS = BASES.map((b, i) => {
  return { type: 'fieldupg', idx: i, name: '⚽ Табло поля', x: b.x - FIELD_W / 2 - 8, z: b.z + FIELD_GAP + FIELD_D / 2, w: 4, d: 2, solid: false };
});
const ARENA_OBJ = { type: 'arena', name: ARENA.name, x: ARENA.x, z: ARENA.z, w: ARENA.size, d: ARENA.size, solid: false };
const MARKET_OBJ = { type: 'market', name: MARKET.name, color: MARKET.color, x: MARKET.x, z: MARKET.z, w: 16, d: 16, solid: true };
const INTERACTIVES = [...SPINNERS, ...FIELDS, ...LUCK_SIGNS, ...FIELDUPG_SIGNS, ARENA_OBJ, MARKET_OBJ];
const SOLID_OBJECTS = INTERACTIVES.filter(o => o.solid);

function activeInteractives() {
  const my = homeFieldIndex();
  return INTERACTIVES.filter(o => o.type !== 'field' || o.idx === my);
}

function inFieldArea(x, z) {
  for (const b of BASES) {
    if (Math.abs(x - b.x) < FIELD_W / 2 + 3 && Math.abs(z - (b.z + FIELD_GAP + FIELD_D / 2)) < FIELD_D / 2 + 3) return true;
    const sp = { x: b.x + SPIN_OFFSET, z: b.z + FIELD_GAP + FIELD_D / 2 };
    if (Math.hypot(x - sp.x, z - sp.z) < 6) return true;
    const ls = { x: sp.x + 6, z: sp.z };
    if (Math.hypot(x - ls.x, z - ls.z) < 4) return true;
    const fs = { x: b.x - FIELD_W / 2 - 8, z: sp.z };
    if (Math.hypot(x - fs.x, z - fs.z) < 4) return true;
  }
  if (Math.abs(x - ARENA.x) < ARENA.size / 2 + 3 && Math.abs(z - ARENA.z) < ARENA.size / 2 + 3) return true;
  return false;
}

const POND = { x: 155, z: 22, s: 16 };

function genTrees() {
  const trees = [];
  let tries = 0;
  while (trees.length < 70 && tries < 6000) {
    tries++;
    const x = 4 + Math.random() * (WORLD_SIZE - 8);
    const z = 4 + Math.random() * (WORLD_SIZE - 8);
    let ok = true;
    for (const o of SOLID_OBJECTS) {
      if (Math.abs(x - o.x) < o.w / 2 + 2.5 && Math.abs(z - o.z) < o.d / 2 + 2.5) { ok = false; break; }
    }
    if (Math.abs(x - POND.x) < POND.s / 2 + 2 && Math.abs(z - POND.z) < POND.s / 2 + 2) ok = false;
    if (ok) trees.push({ x, z, s: 0.8 + Math.random() * 0.7 });
  }
  return trees.filter(t => !inFieldArea(t.x, t.z));
}

function genGrass() {
  const grass = [];
  let tries = 0;
  while (grass.length < 520 && tries < 8000) {
    tries++;
    const x = 4 + Math.random() * (WORLD_SIZE - 8);
    const z = 4 + Math.random() * (WORLD_SIZE - 8);
    let ok = true;
    for (const o of SOLID_OBJECTS) {
      if (Math.abs(x - o.x) < o.w / 2 + 1.5 && Math.abs(z - o.z) < o.d / 2 + 1.5) { ok = false; break; }
    }
    if (Math.abs(x - POND.x) < POND.s / 2 + 1 && Math.abs(z - POND.z) < POND.s / 2 + 1) ok = false;
    if (ok) grass.push({ x, z, h: 0.35 + Math.random() * 0.45, ph: Math.random() * Math.PI * 2, c: 0.75 + Math.random() * 0.25 });
  }
  return grass.filter(g => !inFieldArea(g.x, g.z));
}
function genGroundDots() {
  const dots = [];
  let tries = 0;
  while (dots.length < 900 && tries < 12000) {
    tries++;
    const x = 3 + Math.random() * (WORLD_SIZE - 6), z = 3 + Math.random() * (WORLD_SIZE - 6);
    let ok = true;
    for (const o of SOLID_OBJECTS) {
      if (Math.abs(x - o.x) < o.w / 2 + 1 && Math.abs(z - o.z) < o.d / 2 + 1) { ok = false; break; }
    }
    if (Math.abs(x - POND.x) < POND.s / 2 + 2 && Math.abs(z - POND.z) < POND.s / 2 + 2) ok = false;
    if (ok) {
      const c = Math.random();
      dots.push({
        x, z,
        r: 0.15 + Math.random() * 0.3,
        c: c < 0.4 ? 'rgba(18,96,32,0.5)' : c < 0.7 ? 'rgba(96,180,74,0.42)' : 'rgba(200,170,80,0.35)',
      });
    }
  }
  return dots.filter(d => !inFieldArea(d.x, d.z));
}

const TREES = genTrees();
const GRASS = genGrass();
const GROUND_DOTS = genGroundDots();

// Дорожки между зонами (дорога от магазинов к арене и через центр)
const ROADS = [
  { x0: 71, x1: 79, z0: 62, z1: 176 },
  { x0: 16, x1: 134, z0: 71, z1: 79 },
  { x0: 71, x1: 79, z0: 10, z1: 48 },
  { x0: 30, x1: 38, z0: 62, z1: 176 },
  { x0: 112, x1: 120, z0: 62, z1: 176 },
];

const CLOUDS = [];
for (let i = 0; i < 9; i++) CLOUDS.push({ nx: Math.random(), ny: 0.08 + Math.random() * 0.28, s: 0.5 + Math.random() * 0.8 });

const keys = {};
document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Escape') { if (!$('#bench-modal').classList.contains('hidden')) hideBenchModal(); return; }
  if (activeScreen === 'world') {
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') e.preventDefault();
    if (e.code === 'KeyE') tryEnter();
    if (e.code === 'KeyB') { if (state.held) keepHeld(); else openBackpack(); }
  }
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

const wcanvas = $('#world-canvas');
const wc = wcanvas.getContext('2d');
let W = 800, H = 600;

// Поворот камеры правой кнопкой мыши (перетаскивание)
let camDrag = false, camDragX = 0;
wcanvas.addEventListener('contextmenu', e => e.preventDefault());
wcanvas.addEventListener('mousedown', e => { if (e.button === 2) { camDrag = true; camDragX = e.clientX; } });
window.addEventListener('mousemove', e => {
  if (!camDrag || activeScreen !== 'world' || !state) return;
  state.world.yaw += (e.clientX - camDragX) * 0.005;
  camDragX = e.clientX;
});
window.addEventListener('mouseup', e => { if (e.button === 2) camDrag = false; });
wcanvas.addEventListener('click', e => {
  if (e.button === 0 && activeScreen === 'world' && state && nearestInteractive()) {
    const o = nearestInteractive();
    if (o.type === 'luck' || o.type === 'fieldupg') buySignUpgrade(o);
    else tryEnter();
  }
});
function resizeWorld() {
  const dpr = Math.max(2, window.devicePixelRatio || 1);
  W = window.innerWidth;
  H = window.innerHeight;
  wcanvas.width = Math.round(W * dpr);
  wcanvas.height = Math.round(H * dpr);
  wc.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', () => { if (activeScreen === 'world') resizeWorld(); });

const EYE = 3.6, FOV = 1.05;

function camTransform() {
  const p = state.world;
  return { x: p.x, y: EYE, z: p.z, cos: Math.cos(p.yaw), sin: Math.sin(p.yaw) };
}

function project(cam, wx, wy, wz) {
  const dx = wx - cam.x, dy = wy - cam.y, dz = wz - cam.z;
  const xr = dx * cam.cos - dz * cam.sin;
  const zr = dx * cam.sin + dz * cam.cos;
  if (zr < 0.15) return null;
  const focal = (H / 2) / Math.tan(FOV / 2);
  const scale = focal / zr;
  return { x: W / 2 + xr * scale, y: H / 2 - dy * scale, z: zr, scale };
}

function projectPoly(cam, wp) {
  const near = 0.15, tanF = Math.tan(FOV / 2);
  const focal = (H / 2) / tanF;

  // Отсечение выпуклого полигона плоскостями фрустума в мировых координатах.
  // Полуплоскость: f <= 0 -> внутри.
  const planes = [
    // near:  zr >= near
    p => near - ((p[0] - cam.x) * cam.sin + (p[2] - cam.z) * cam.cos),
    // left:  xr + zr*tanF >= 0
    p => -(((p[0] - cam.x) * cam.cos - (p[2] - cam.z) * cam.sin) + ((p[0] - cam.x) * cam.sin + (p[2] - cam.z) * cam.cos) * tanF),
    // right: xr - zr*tanF <= 0
    p => ((p[0] - cam.x) * cam.cos - (p[2] - cam.z) * cam.sin) - ((p[0] - cam.x) * cam.sin + (p[2] - cam.z) * cam.cos) * tanF,
    // top:   yr - zr*tanF <= 0
    p => (p[1] - cam.y) - ((p[0] - cam.x) * cam.sin + (p[2] - cam.z) * cam.cos) * tanF,
    // bottom:-yr - zr*tanF <= 0
    p => -(p[1] - cam.y) - ((p[0] - cam.x) * cam.sin + (p[2] - cam.z) * cam.cos) * tanF,
  ];
  let pts = wp;
  for (const f of planes) {
    const inside = v => f(v) <= 0;
    const out = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const fa = f(a), fb = f(b);
      const aIn = fa <= 0, bIn = fb <= 0;
      if (aIn !== bIn) {
        const t = fa / (fa - fb);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
      }
      if (bIn) out.push(b);
    }
    pts = out;
    if (pts.length < 3) return null;
  }
  const outPts = [];
  for (const p of pts) {
    const dx = p[0] - cam.x, dy = p[1] - cam.y, dz = p[2] - cam.z;
    const xr = dx * cam.cos - dz * cam.sin;
    const zr = dx * cam.sin + dz * cam.cos;
    outPts.push({ x: W / 2 + xr * (focal / zr), y: H / 2 - dy * (focal / zr), z: zr });
  }
  return outPts.length >= 3 ? outPts : null;
}

function worldCollides(x, z) {
  if (x < 2 || x > WORLD_SIZE - 2 || z < 2 || z > WORLD_SIZE - 2) return true;
  for (const o of SOLID_OBJECTS) {
    const rx = clamp(x, o.x - o.w / 2, o.x + o.w / 2);
    const rz = clamp(z, o.z - o.d / 2, o.z + o.d / 2);
    const dx = x - rx, dz = z - rz;
    if (dx * dx + dz * dz < 2.2) return true;
  }
  return false;
}

function updateWorld(dt) {
  const p = state.world;
  const sp = 9;
  let mx = 0, mz = 0;
  if (keys.KeyW) { mx += Math.sin(p.yaw); mz += Math.cos(p.yaw); }
  if (keys.KeyS) { mx -= Math.sin(p.yaw); mz -= Math.cos(p.yaw); }
  if (keys.KeyA) { mx -= Math.cos(p.yaw); mz += Math.sin(p.yaw); }
  if (keys.KeyD) { mx += Math.cos(p.yaw); mz -= Math.sin(p.yaw); }
  if (keys.ArrowLeft) p.yaw -= 1.7 * dt;
  if (keys.ArrowRight) p.yaw += 1.7 * dt;
  if (typeof moveVecFromJoy === 'function') {
    const j = moveVecFromJoy();
    if (j.fwd || j.strafe) {
      mx += j.fwd * Math.sin(p.yaw) + j.strafe * Math.cos(p.yaw);
      mz += j.fwd * Math.cos(p.yaw) - j.strafe * Math.sin(p.yaw);
    }
    if (j.yaw) p.yaw += j.yaw;
  }
  const len = Math.hypot(mx, mz);
  if (len > 0) {
    p.facing = Math.atan2(mx, mz);
    p.moving = true;
    const nx = p.x + (mx / len) * sp * dt;
    const nz = p.z + (mz / len) * sp * dt;
    if (!worldCollides(nx, nz)) { p.x = nx; p.z = nz; }
  } else if (p.moving !== false) {
    p.moving = false;
  }
}

function nearestInteractive() {
  const p = state.world;
  let best = null, bd = 8;
  for (const o of activeInteractives()) {
    const rx = clamp(p.x, o.x - o.w / 2, o.x + o.w / 2);
    const rz = clamp(p.z, o.z - o.d / 2, o.z + o.d / 2);
    const d = Math.hypot(p.x - rx, p.z - rz);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

function tryEnter() {
  const o = nearestInteractive();
  if (!o) return;
  if (o.type === 'spinner') { renderSpinnerPanel(); showScreen('spinner'); }
  else if (o.type === 'field') {
    if (o.idx !== homeFieldIndex()) { toast('Это чужое поле — трогать нельзя!'); return; }
    if (state.held) { placeHeld(); return; }
    renderFieldScreen(o.idx); showScreen('field');
  }
  else if (o.type === 'arena') { renderArena(); showScreen('arena'); }
  else if (o.type === 'market') { showScreen('market'); }
  else if (o.type === 'luck') { renderLuckUpgrades(); showScreen('luck'); }
  else if (o.type === 'fieldupg') { renderFieldUpg(); showScreen('fieldupg'); }
}

// ---------- Игрок в руках / рюкзак ----------
function benchCount() { return state ? state.players.filter(p => !state.starters.includes(p.id)).length : 0; }

function pickUpBestBench() {
  const bench = state.players.filter(p => !state.starters.includes(p.id)).sort((a, b) => b.rating - a.rating);
  if (!bench.length) return false;
  const p = bench[0];
  setHeld(p);
  state.players = state.players.filter(x => x.id !== p.id);
  save();
  toast('🤚 Взял ' + p.name + ' в руки. Подойди к полю и нажми E, чтобы поставить.');
  updateHeldHud();
  return true;
}

function removeFromStarters(id) {
  if (!state.starters.includes(id)) return;
  state.starters = state.starters.filter(x => x !== id);
  ensureLineup(); save(); refreshMyFieldOwner();
  if (activeScreen === 'field') renderFieldScreen(currentField);
  toast('Игрок переведён в запас 🎒');
}

function keepHeld() {
  if (!state.held) return;
  state.players.push(state.held);
  state.held = null;
  save();
  toast('Карточка в рюкзаке 🎒');
}

function placeHeld() {
  if (!state.held) return;
  const p = state.held;
  state.players.push(p);
  if (state.starters.length < 11) {
    state.starters.push(p.id);
  } else {
    const samePos = state.starters.map(getPlayer).filter(Boolean)
      .filter(x => x.pos === p.pos && x.id !== p.id)
      .sort((a, b) => a.rating - b.rating);
    const weakest = (samePos.length ? samePos : state.starters.map(getPlayer).filter(Boolean))
      .sort((a, b) => a.rating - b.rating)[0];
    if (weakest) state.starters = state.starters.map(id => id === weakest.id ? p.id : id);
  }
  state.held = null;
  ensureLineup();
  save();
  refreshMyFieldOwner();
  toast('⭐ ' + p.name + ' вышел на поле!');
  if (p.kind && loveBuff() > 1) toast('💞 Любовь! Мама и Папа вместе на базе — их доход ×2!');
}

function openBackpack() {
  if (!state) return;
  renderBackpack();
  showScreen('backpack');
}

function hexRgb(hex) { return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]; }
function shade(hex, f) {
  const [r, g, b] = hexRgb(hex);
  return `rgb(${Math.min(255, Math.round(r * f))},${Math.min(255, Math.round(g * f))},${Math.min(255, Math.round(b * f))})`;
}

function drawPoly(poly) {
  if (poly.pts.length < 3) return;
  const clipped = clipToScreen(poly.pts);
  if (clipped.length < 3) return;
  if (poly.thin) {
    if (clipped.length < 4) return;
    const p = clipped, n = p.length;
    let best = -1, bi = -1;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const d = (p[i].x - p[j].x) * (p[i].x - p[j].x) + (p[i].y - p[j].y) * (p[i].y - p[j].y);
      if (d > best) { best = d; bi = i; }
    }
    const a = p[bi], b = p[(bi + 1) % n];
    const c = p[(bi + 2) % n], d = p[(bi + 3) % n];
    const mx1 = (a.x + b.x) / 2, my1 = (a.y + b.y) / 2;
    const mx2 = (c.x + d.x) / 2, my2 = (c.y + d.y) / 2;
    const thickness = Math.hypot(mx1 - mx2, my1 - my2);
    wc.strokeStyle = poly.color;
    wc.lineWidth = Math.max(3.6, thickness);
    wc.lineCap = 'round';
    wc.beginPath();
    wc.moveTo(mx1, my1);
    wc.lineTo(mx2, my2);
    wc.stroke();
    return;
  }
  wc.beginPath();
  wc.moveTo(clipped[0].x, clipped[0].y);
  for (let i = 1; i < clipped.length; i++) wc.lineTo(clipped[i].x, clipped[i].y);
  wc.closePath();
  wc.fillStyle = poly.color;
  wc.fill();
  if (poly.line) { wc.strokeStyle = 'rgba(0,0,0,0.25)'; wc.lineWidth = 1; wc.stroke(); }
}

function boxPolys(o, cam) {
  const x0 = o.x - o.w / 2, x1 = o.x + o.w / 2, z0 = o.z - o.d / 2, z1 = o.z + o.d / 2, y0 = 0, y1 = o.h;
  const md = Math.hypot(o.x - cam.x, (y0 + y1) / 2 - cam.y, o.z - cam.z);
  const defs = [
    { pts: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], n: { x: 0, y: 1, z: 0 }, br: 1.18 },
    { pts: [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], n: { x: 1, y: 0, z: 0 }, br: 0.95 },
    { pts: [[x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1]], n: { x: -1, y: 0, z: 0 }, br: 0.7 },
    { pts: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], n: { x: 0, y: 0, z: 1 }, br: 0.9 },
    { pts: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], n: { x: 0, y: 0, z: -1 }, br: 0.62 },
  ];
  const light = { x: -0.4, y: 0.85, z: -0.3 };
  const ll = Math.hypot(light.x, light.y, light.z);
  const lx = light.x / ll, ly = light.y / ll, lz = light.z / ll;
  const polys = [];
  for (const d of defs) {
    const cx = (d.pts[0][0] + d.pts[2][0]) / 2;
    const cy = (d.pts[0][1] + d.pts[2][1]) / 2;
    const cz = (d.pts[0][2] + d.pts[2][2]) / 2;
    if (d.n.y !== 1 && d.n.x * (cam.x - cx) + d.n.y * (cam.y - cy) + d.n.z * (cam.z - cz) <= 0) continue;
    const ld = Math.max(0, d.n.x * lx + d.n.y * ly + d.n.z * lz);
    const f = d.br * (0.6 + 0.4 * ld);
    const proj = projectPoly(cam, d.pts);
    if (proj) {
      polys.push({ pts: proj.map(p => ({ x: p.x, y: p.y })), color: shade(o.color, f), depth: md, line: false });
    }
  }
  return polys;
}

function treePolys(t, cam) {
  const polys = [];
  const rx = Math.cos(state.world.yaw), rz = -Math.sin(state.world.yaw);
  const tpts = [
    [t.x + rx * 0.3, 2.4 * t.s, t.z + rz * 0.3],
    [t.x - rx * 0.3, 2.4 * t.s, t.z - rz * 0.3],
    [t.x - rx * 0.3, 0, t.z - rz * 0.3],
    [t.x + rx * 0.3, 0, t.z + rz * 0.3],
  ];
  const tp = tpts.map(p => project(cam, p[0], p[1], p[2])).filter(Boolean);
  if (tp.length >= 3) {
    const depth = tp.reduce((s, p) => s + p.z, 0) / tp.length;
    polys.push({ pts: tp.map(p => ({ x: p.x, y: p.y })), color: '#7a4a2b', depth, line: false });
  }
  return polys;
}

function treeCanopy(t, cam) {
  const r = t.s * 2.0;
  const y = 4.6 * t.s;
  drawDisc(cam, t.x, y, t.z, r, shade('#2f9e44', t.s));
  drawDisc(cam, t.x - r * 0.22, y + r * 0.18, t.z, r * 0.62, '#45c459');
  drawDisc(cam, t.x + r * 0.28, y - r * 0.1, t.z, r * 0.34, '#247a33');
}

function drawLabels(cam) {
  const ni = nearestInteractive();
  for (const o of INTERACTIVES) {
    if (o.type === 'spinner' || o.type === 'luck' || o.type === 'fieldupg') continue;
    const ly = o.type === 'market' ? 7.5 : 6;
    const p = project(cam, o.x, ly, o.z);
    if (!p) continue;
    const near = ni === o;
    wc.font = 'bold 14px sans-serif';
    wc.textAlign = 'center'; wc.textBaseline = 'middle';
    wc.fillStyle = 'rgba(0,0,0,0.55)';
    wc.fillText(o.name, p.x + 1, p.y + 1);
    wc.fillStyle = near ? '#ffffff' : 'rgba(255,255,255,0.85)';
    wc.fillText(o.name, p.x, p.y);
    wc.fillStyle = o.color || '#ffffff';
    wc.beginPath();
    wc.moveTo(p.x, p.y + 15);
    wc.lineTo(p.x - 6, p.y + 27);
    wc.lineTo(p.x + 6, p.y + 27);
    wc.closePath(); wc.fill();
  }
}

function drawGroundGrid(cam) {
  const c = state.world;
  const step = 6, range = 7;
  wc.lineWidth = 1;
  wc.strokeStyle = 'rgba(255,255,255,0.13)';
  for (let i = -range; i <= range; i++) {
    const z = c.z + i * step;
    const p1 = project(cam, c.x - range * step * 1.6, 0, z);
    const p2 = project(cam, c.x + range * step * 1.6, 0, z);
    if (p1 && p2) { wc.beginPath(); wc.moveTo(p1.x, p1.y); wc.lineTo(p2.x, p2.y); wc.stroke(); }
  }
  for (let i = -range; i <= range; i++) {
    const x = c.x + i * step;
    const p1 = project(cam, x, 0, c.z - range * step * 1.6);
    const p2 = project(cam, x, 0, c.z + range * step * 1.6);
    if (p1 && p2) { wc.beginPath(); wc.moveTo(p1.x, p1.y); wc.lineTo(p2.x, p2.y); wc.stroke(); }
  }
}

function renderWorld() {
  const cam = camTransform();
  const grad = wc.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#55b3f2');
  grad.addColorStop(0.42, '#c9ecff');
  grad.addColorStop(0.46, '#a9e075');
  grad.addColorStop(0.53, '#55b347');
  grad.addColorStop(1, '#46a23a');
  wc.fillStyle = grad;
  wc.fillRect(0, 0, W, H);
  drawClouds(cam);
  drawSun(cam);
  const polys = [];
  rounds = [];
  drawGroundBase(cam, polys);
  polys.push(...wallPolys(cam));
  for (const r of ROADS) polys.push(...roadPolys(r, cam));
  polys.push(...marketPolys(cam));
  polys.push(...arenaPolys(cam));
  const labels = [];
  const nearBases = [];
  const myHome = homeFieldIndex();
  BASES.forEach((base, i) => {
    nearBases.push(base);
    polys.push(...fieldPolys(base, cam, i === myHome));
    polys.push(...fieldFencePolys(base, cam));
    polys.push(...fieldCenterRing(base, cam));
    polys.push(...fieldOwnerPolys(base, i, cam, labels));    polys.push(...spinnerPolys(base, cam));
    if (i === myHome) polys.push(...homeFlagPolys(base, cam, labels));
    const ls = LUCK_SIGNS[i], fs = FIELDUPG_SIGNS[i];
    polys.push(...signPolys(ls, '🍀 Удача', '#ffd23d', cam, labels));
    polys.push(...signPolys(fs, '⚽ Владение · 💰 Доход', '#39c98a', cam, labels));
  });
  polys.push(...heldCardPolys(cam, labels));
  if (state.held) drawHeldSlotMarkers(cam);
  pushRound(0.1, () => drawFigures(cam, labels));
  const flatPolys = polys.filter(p => p.flat);
  const sortedPolys = polys.filter(p => !p.flat).sort((a, b) => b.depth - a.depth);
  for (const poly of flatPolys) drawPoly(poly);
  for (const poly of sortedPolys) drawPoly(poly);
  rounds.sort((a, b) => b.depth - a.depth);
  for (const rd of rounds) rd.draw();
  drawFog(cam);
  for (const base of nearBases) drawWorldRoulette(cam, base);
  drawDecorLabels(cam, labels);
  drawMinimap();
  const ni = nearestInteractive();
  const prompt = $('#interact-prompt');
  if (ni) { prompt.textContent = promptText(ni); prompt.classList.remove('hidden'); }
  else prompt.classList.add('hidden');
  updateHeldHud();
}

function promptText(o) {
  if (o.type === 'spinner') return '🎡 Спиннер — нажми E или кликни';
  if (o.type === 'luck') return '🍀 Табло удачи — нажми E или кликни';
  if (o.type === 'fieldupg') return '⚽ Табло поля (владение · доход) — нажми E или кликни';
  if (o.type === 'field') return state.held ? '⭐ Поставить ' + state.held.name + ' — E (место подсвечено)' : '🏟️ ' + o.name + ' — E: взять лучшего из запаса или открыть команду';
  if (o.type === 'arena') return '⚔ Арена (матчи 1×1) — нажми E или кликни';
  return '🏪 ' + MARKET.name + ' — нажми E или кликни';
}

function updateHeldHud() {
  const el = $('#held-card');
  if (!el) return;
  if (state && state.held) {
    const r = RARITIES[state.held.rarity];
    el.innerHTML = '🤚 В руках: ' + r.emoji + ' ' + state.held.rating + ' ' + state.held.name + ' <span style="opacity:.7">— E: на поле • B: в рюкзак</span>';
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

