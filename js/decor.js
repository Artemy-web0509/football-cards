// ============ ДЕКОР МИРА: отрисовка полей, фигур, карточек ============
// ===================== ДЕКОР МИРА: ПОЛЕ, СПИННЕР, ИГРОКИ =====================
function fieldSlots() {
  if (!state) return [];
  ensureLineup();
  const groups = lineupGroups();
  const zMap = { GK: 0.88, DF: 0.66, MF: 0.44, FW: 0.22 };
  const rows = [];
  for (const pos of POS_ORDER) {
    const ids = groups[pos];
    const n = ids.length;
    ids.forEach((id, i) => {
      rows.push({ id, pos, x: n === 1 ? 0.5 : 0.12 + (i / (n - 1)) * 0.76, z: zMap[pos] });
    });
  }
  return rows;
}

function groundPoly(cam, x0, z0, x1, z1, y, color, thin) {
  const pts = projectPoly(cam, [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]]);
  if (!pts) return null;
  const depth = pts.reduce((s, p) => s + p.z, 0) / pts.length;
  return { pts: pts.map(p => ({ x: p.x, y: p.y })), color, depth, line: false, flat: true, thin: !!thin };
}

// Ровный одноцветный пол (без клетки и мерцания). Один большой квад с запасом.
function drawGroundBase(cam, polys) {
  const m = 250;
  const g = groundPoly(cam, -m, -m, WORLD_SIZE + m, WORLD_SIZE + m, 0, '#4aa33c');
  if (g) {
    // Рисуем сразу — он всегда позади всех полигонов (y=0), без depth-сортировки.
    drawPoly(g);
  }
}

// Стены по периметру мира
function wallPolys(cam) {
  const polys = [];
  const W = WORLD_SIZE, h = 9, t = 1.4;
  const c = '#eef4e8';
  polys.push(...boxPolys({ x: W / 2, z: 0, w: W, d: t, h, color: c }, cam));
  polys.push(...boxPolys({ x: W / 2, z: W, w: W, d: t, h, color: c }, cam));
  polys.push(...boxPolys({ x: 0, z: W / 2, w: t, d: W, h, color: c }, cam));
  polys.push(...boxPolys({ x: W, z: W / 2, w: t, d: W, h, color: c }, cam));
  const pc = '#ffffff';
  for (const [cx, cz] of [[0, 0], [W, 0], [0, W], [W, W]]) {
    polys.push(...boxPolys({ x: cx, z: cz, w: 2.2, d: 2.2, h: 10.4, color: pc }, cam));
  }
  return polys;
}

// Забор вокруг футбольного поля. Плоские полосы на земле — квадрат виден целиком.
function fieldFencePolys(base, cam) {
  const polys = [];
  const f = fieldRectFor(base);
  const m = 2.4;                     // отступ от кромки поля
  const x0 = f.x0 - m, x1 = f.x1 + m, z0 = f.z0 - m, z1 = f.z1 + m;
  const wood = '#f0ece0';
  const line = (a, b, c, d, col) => { const g = groundPoly(cam, a, b, c, d, 0.055, col, true); if (g) polys.push(g); };
  line(x0, z0, x1, z0, wood);
  line(x0, z1, x1, z1, wood);
  line(x0, z0, x0, z1, wood);
  line(x1, z0, x1, z1, wood);
  return polys;
}

// Отсечение полигона по экрану: если все точки за заметным запасом за краями — пропустить.
function polyOffscreen(pts) {
  const pad = 300;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const q = pts[i];
    if (q.x < minX) minX = q.x;
    if (q.x > maxX) maxX = q.x;
    if (q.y < minY) minY = q.y;
    if (q.y > maxY) maxY = q.y;
    if (maxX > -pad && minX < W + pad && maxY > -pad && minY < H + pad) return false;
  }
  return maxX < -pad || minX > W + pad || maxY < -pad || minY > H + pad;
}

// Обрезка полигона к экрану (Сазерленд-Ходжман) — убирает гигантские треугольники у near-плоскости.
function clipToScreen(pts) {
  const pad = 64;
  const x0 = -pad, x1 = W + pad, y0 = -pad, y1 = H + pad;
  // Быстрая проверка: если весь полигон внутри экрана — вернуть как есть (без копирования).
  let minX = pts[0].x, minY = pts[0].y, maxX = pts[0].x, maxY = pts[0].y;
  for (const q of pts) {
    if (q.x < minX) minX = q.x;
    if (q.x > maxX) maxX = q.x;
    if (q.y < minY) minY = q.y;
    if (q.y > maxY) maxY = q.y;
  }
  if (minX >= x0 && maxX <= x1 && minY >= y0 && maxY <= y1) return pts;
  let out = pts;
  const clip = (list, axis, border) => {
    if (!list.length) return [];
    const res = [];
    const n = list.length;
    let a = list[n - 1];
    let ain = axis === 'x' ? (border === 1 ? a.x <= x1 : a.x >= x0) : (border === 1 ? a.y <= y1 : a.y >= y0);
    for (let i = 0; i < n; i++) {
      const b = list[i];
      const bin = axis === 'x' ? (border === 1 ? b.x <= x1 : b.x >= x0) : (border === 1 ? b.y <= y1 : b.y >= y0);
      if (bin !== ain) {
        const t = axis === 'x'
          ? (border === 1 ? (x1 - a.x) / (b.x - a.x) : (x0 - a.x) / (b.x - a.x))
          : (border === 1 ? (y1 - a.y) / (b.y - a.y) : (y0 - a.y) / (b.y - a.y));
        res.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
      if (bin) res.push(b);
      a = b; ain = bin;
    }
    return res;
  };
  out = clip(out, 'x', 0); out = clip(out, 'x', 1);
  out = clip(out, 'y', 0); out = clip(out, 'y', 1);
  return out;
}

function fieldPolys(base, cam, isHome) {
  const f = fieldRectFor(base);
  const polys = [];
  const track = groundPoly(cam, f.x0 - 5, f.z0 - 4.5, f.x1 + 5, f.z1 + 4.5, 0.01, '#7cc350');
  if (track) polys.push(track);
  const field = groundPoly(cam, f.x0 - 3.5, f.z0 - 3, f.x1 + 3.5, f.z1 + 3, 0.012, isHome ? '#3fbf5a' : '#36b04f');
  if (field) polys.push(field);
  const borderCol = isHome ? '#ffd23d' : '#ffffff';
  const line = (a, b, c, d, col) => { const g = groundPoly(cam, a, b, c, d, 0.03, col, true); if (g) polys.push(g); };
  line(f.x0 - 0.4, f.z0 - 0.4, f.x1 + 0.4, f.z0 + 0.4, borderCol);
  line(f.x0 - 0.4, f.z1 - 0.4, f.x1 + 0.4, f.z1 + 0.4, borderCol);
  line(f.x0 - 0.4, f.z0, f.x0 + 0.4, f.z1, borderCol);
  line(f.x1 - 0.4, f.z0, f.x1 + 0.4, f.z1, borderCol);
  line(f.x0, f.z0 + (f.z1 - f.z0) / 2 - 0.3, f.x1, f.z0 + (f.z1 - f.z0) / 2 + 0.3, 'rgba(255,255,255,0.85)');
  const wm = FIELD_W;
  line(f.x0 + wm * 0.14, f.z0 + 0.4, f.x0 + wm * 0.14, f.z0 + 12, 'rgba(255,255,255,0.8)');
  line(f.x1 - wm * 0.14, f.z0 + 0.4, f.x1 - wm * 0.14, f.z0 + 12, 'rgba(255,255,255,0.8)');
  line(f.x0 + wm * 0.14, f.z0 + 12, f.x1 - wm * 0.14, f.z0 + 12, 'rgba(255,255,255,0.8)');
  line(f.x0 + wm * 0.14, f.z1 - 0.4, f.x0 + wm * 0.14, f.z1 - 12, 'rgba(255,255,255,0.8)');
  line(f.x1 - wm * 0.14, f.z1 - 0.4, f.x1 - wm * 0.14, f.z1 - 12, 'rgba(255,255,255,0.8)');
  line(f.x0 + wm * 0.14, f.z1 - 12, f.x1 - wm * 0.14, f.z1 - 12, 'rgba(255,255,255,0.8)');
  const gw = FIELD_W * 0.46, gd = 1.0, gh = 2.4;
  const postC = isHome ? '#ffd23d' : '#f5f5f5';
  polys.push(...boxPolys({ x: f.x0 + FIELD_W / 2, z: f.z0 - gd - 0.4, w: gw, d: gd, h: gh, color: postC }, cam));
  polys.push(...boxPolys({ x: f.x0 + FIELD_W / 2, z: f.z1 + gd + 0.4, w: gw, d: gd, h: gh, color: postC }, cam));
  for (const [cx, cz] of [[f.x0, f.z0], [f.x1, f.z0], [f.x0, f.z1], [f.x1, f.z1]]) {
    polys.push(...boxPolys({ x: cx, z: cz, w: 0.3, d: 0.3, h: 1.8, color: isHome ? '#ffd23d' : '#f0f0f0' }, cam));
  }
  return polys;
}

// 3D-кольцо на земле (правильный перспективный эллипс) — не «парящий овал».
function ringPolys(cam, cx, cz, r1, r2, y0, y1, color, n) {
  const polys = [];
  const seg = n || 18;
  const wpts = [];
  for (let i = 0; i < seg; i++) {
    const a = i / seg * Math.PI * 2, b = (i + 1) / seg * Math.PI * 2;
    wpts.push([
      [cx + Math.cos(a) * r1, y0, cz + Math.sin(a) * r1],
      [cx + Math.cos(b) * r1, y0, cz + Math.sin(b) * r1],
      [cx + Math.cos(b) * r2, y1, cz + Math.sin(b) * r2],
      [cx + Math.cos(a) * r2, y1, cz + Math.sin(a) * r2],
    ]);
  }
  for (const wp of wpts) {
    const pts = projectPoly(cam, wp);
    if (!pts) continue;
    const depth = pts.reduce((s, p) => s + p.z, 0) / pts.length;
    polys.push({ pts: pts.map(p => ({ x: p.x, y: p.y })), color, depth, line: false, flat: true });
  }
  return polys;
}

function fieldCenterRing(base, cam) {
  const f = fieldRectFor(base);
  const cx = f.x0 + FIELD_W / 2, cz = (f.z0 + f.z1) / 2;
  if (distToCam(cx, cz) > 150) return [];
  return ringPolys(cam, cx, cz, 4.4, 4.9, 0.05, 0.09, 'rgba(255,255,255,0.85)');
}

function homeFlagPolys(base, cam, labels) {
  const f = fieldRectFor(base);
  const fx = base.x, fz = f.z0 - 2.2;
  const polys = boxPolys({ x: fx, z: fz, w: 0.4, d: 0.4, h: 7, color: '#8a5a2b' }, cam);
  const pts = [[fx, 7, fz], [fx + 3.2, 6.2, fz], [fx, 5.4, fz]].map(p => project(cam, p[0], p[1], p[2])).filter(Boolean);
  if (pts.length >= 3) {
    const depth = pts.reduce((s, p) => s + p.z, 0) / pts.length;
    polys.push({ pts: pts.map(p => ({ x: p.x, y: p.y })), color: '#ffd23d', depth, line: false });
  }
  labels.push({ text: '🏠 Твоя база', wx: fx, wy: 8.4, wz: fz, color: '#ffd23d', size: 15, mine: true });
  return polys;
}

function billboardPolys(cx, cy, cz, w, h, color, cam, facing) {
  let rx, rz;
  if (facing == null) {
    const dx = cam.x - cx, dz = cam.z - cz;
    const len = Math.hypot(dx, dz) || 1;
    rx = dz / len; rz = -dx / len;
  } else {
    rx = Math.cos(facing); rz = -Math.sin(facing);
  }
  const hw = w / 2, hh = h / 2;
  const wp = [
    [cx + rx * hw, cy + hh, cz + rz * hw],
    [cx - rx * hw, cy + hh, cz - rz * hw],
    [cx - rx * hw, cy - hh, cz - rz * hw],
    [cx + rx * hw, cy - hh, cz + rz * hw],
  ];
  const pts = projectPoly(cam, wp);
  if (!pts) return [];
  const depth = pts.reduce((s, p) => s + p.z, 0) / pts.length;
  return [{ pts: pts.map(p => ({ x: p.x, y: p.y })), color, depth, line: false }];
}

function slotPositions(cards) {
  const groups = { GK: [], DF: [], MF: [], FW: [] };
  for (const p of cards) { if (groups[p.pos]) groups[p.pos].push(p); }
  const zMap = { GK: 0.88, DF: 0.66, MF: 0.44, FW: 0.22 };
  const rows = [];
  for (const pos of POS_ORDER) {
    const arr = groups[pos];
    const n = arr.length;
    arr.forEach((p, i) => rows.push({ p, x: n === 1 ? 0.5 : 0.12 + (i / (n - 1)) * 0.76, z: zMap[pos] }));
  }
  return rows;
}

function drawRoundBillboard(cam, x, y, z, r, color) {
  const p = project(cam, x, y, z);
  if (!p) return;
  const rr = Math.min(Math.max(1.5, r * p.scale), 220);
  wc.fillStyle = shade(color, 1.15);
  wc.beginPath(); wc.arc(p.x, p.y, rr, 0, Math.PI * 2); wc.fill();
  wc.fillStyle = shade(color, 0.7);
  wc.beginPath(); wc.arc(p.x - rr * 0.3, p.y - rr * 0.3, rr * 0.55, 0, Math.PI * 2); wc.fill();
}

function distToCam(x, z) {
  const c = state.world;
  return Math.hypot(x - c.x, z - c.z);
}
function pushRound(depth, draw) {
  rounds.push({ depth, draw });
}
function drawDisc(cam, x, y, z, r, color) {
  const p = project(cam, x, y, z);
  if (!p) return;
  const rr = Math.min(Math.max(1.5, r * p.scale), 220);
  wc.fillStyle = color;
  wc.beginPath(); wc.arc(p.x, p.y, rr, 0, Math.PI * 2); wc.fill();
}

function drawRing(cam, x, y, z, r, color, width) {
  const p = project(cam, x, y, z);
  if (!p) return;
  const rr = Math.min(Math.max(2, r * p.scale), 220);
  wc.strokeStyle = color;
  wc.lineWidth = width || 1.5;
  wc.beginPath(); wc.arc(p.x, p.y, rr, 0, Math.PI * 2); wc.stroke();
}

function drawSun(cam) {
  const sx = W * 0.78, sy = H * 0.14, sr = 34;
  const g = wc.createRadialGradient(sx, sy, 4, sx, sy, sr * 3);
  g.addColorStop(0, 'rgba(255,244,200,0.95)');
  g.addColorStop(0.25, 'rgba(255,232,150,0.55)');
  g.addColorStop(1, 'rgba(255,232,150,0)');
  wc.fillStyle = g;
  wc.beginPath(); wc.arc(sx, sy, sr * 3, 0, Math.PI * 2); wc.fill();
  wc.fillStyle = '#fffbe8';
  wc.beginPath(); wc.arc(sx, sy, sr, 0, Math.PI * 2); wc.fill();
}

function drawFog(cam) {
  const fy = H * 0.48;
  const g = wc.createLinearGradient(0, fy - H * 0.06, 0, fy + H * 0.015);
  g.addColorStop(0, 'rgba(205,232,252,0)');
  g.addColorStop(1, 'rgba(205,232,252,0.32)');
  wc.fillStyle = g;
  wc.fillRect(0, fy - H * 0.06, W, H * 0.075);
}

function pondRound(cam) {
  const R = POND.s / 2;
  drawDisc(cam, POND.x, 0.02, POND.z, R + 1.8, '#dcc58f');
  drawDisc(cam, POND.x, 0.04, POND.z, R + 0.6, '#c9ae72');
  drawDisc(cam, POND.x, 0.06, POND.z, R, '#2f7fd0');
  drawDisc(cam, POND.x, 0.08, POND.z, R * 0.7, 'rgba(255,255,255,0.08)');
}

function drawGroundDots(cam) {
  for (const d of GROUND_DOTS) {
    const dx = d.x - cam.x, dz = d.z - cam.z;
    if (dx * dx + dz * dz > 1400) continue;
    let onRoad = false;
    for (const r of ROADS) {
      if (d.x > r.x0 && d.x < r.x1 && d.z > r.z0 && d.z < r.z1) { onRoad = true; break; }
    }
    if (onRoad) continue;
    const p = project(cam, d.x, 0.02, d.z);
    if (!p) continue;
    const rr = Math.max(1, d.r * p.scale);
    wc.fillStyle = d.c;
    wc.beginPath(); wc.arc(p.x, p.y, rr, 0, Math.PI * 2); wc.fill();
  }
}

function drawGrass(cam) {
  wc.lineWidth = 1.5;
  for (const g of GRASS) {
    const dx = g.x - cam.x, dz = g.z - cam.z;
    if (dx * dx + dz * dz > 1900) continue;
    const p0 = project(cam, g.x, 0.02, g.z);
    const p1 = project(cam, g.x, g.h, g.z);
    if (!p0 || !p1) continue;
    wc.strokeStyle = 'rgba(' + Math.round(60 * g.c) + ',' + Math.round(170 * g.c) + ',70,0.9)';
    wc.beginPath();
    wc.moveTo(p0.x, p0.y);
    wc.lineTo(p1.x, p1.y);
    wc.stroke();
  }
}

function drawMinimap() {
  const mm = $('#minimap');
  if (!mm) return;
  const m = mm.getContext('2d');
  const S = mm.width, sc = S / WORLD_SIZE;
  m.clearRect(0, 0, S, S);
  const fx = (x) => x * sc, fy = (z) => z * sc;
  const myHome = homeFieldIndex();
  BASES.forEach((b, i) => {
    const r = fieldRectFor(b);
    const px = fx(r.x0), py = fy(r.z0), pw = (r.x1 - r.x0) * sc, ph = (r.z1 - r.z0) * sc;
    m.fillStyle = i === myHome ? '#ffd23d' : b.color;
    m.globalAlpha = 0.85;
    m.fillRect(px, py, pw, ph);
    m.globalAlpha = 1;
    m.strokeStyle = 'rgba(255,255,255,0.7)';
    m.lineWidth = 1;
    m.strokeRect(px, py, pw, ph);
    if (i === myHome) {
      m.strokeStyle = '#ffd23d';
      m.lineWidth = 3;
      m.strokeRect(px - 2, py - 2, pw + 4, ph + 4);
    }
  });
  m.fillStyle = 'rgba(255,220,150,0.9)';
  m.fillRect(fx(ARENA.x - ARENA.size / 2), fy(ARENA.z - ARENA.size / 2), ARENA.size * sc, ARENA.size * sc);
  m.fillStyle = '#ffb347';
  m.fillRect(fx(MARKET.x - 8), fy(MARKET.z - 8), 16 * sc, 16 * sc);
  for (const rp of server.players) {
    m.fillStyle = rp.color || '#ffffff';
    m.beginPath(); m.arc(fx(rp.x), fy(rp.z), 4, 0, Math.PI * 2); m.fill();
  }
  m.fillStyle = '#ffffff';
  m.beginPath(); m.arc(fx(state.world.x), fy(state.world.z), 5, 0, Math.PI * 2); m.fill();
  m.strokeStyle = '#111'; m.lineWidth = 2;
  m.stroke();
}

function roadPolys(r, cam) {
  const polys = [];
  const e = groundPoly(cam, r.x0, r.z0, r.x1, r.z1, 0.015, '#9a7a55');
  if (e) polys.push(e);
  const stripe = (a, b, c, d) => { const g = groundPoly(cam, a, b, c, d, 0.018, 'rgba(255,235,180,0.45)', true); if (g) polys.push(g); };
  if (r.x0 === r.x1) {
    for (let z = r.z0; z < r.z1; z += 8) stripe(r.x0 - 0.7, z, r.x1 + 0.7, z + 0.6);
  } else {
    for (let x = r.x0; x < r.x1; x += 8) stripe(x, r.z0 - 0.7, x + 0.6, r.z1 + 0.7);
  }
  return polys;
}

function drawFigures(cam, labels) {
  const skin = '#f2c99c';
  const drawOne = (px, pz, facing, c, nick, isMe, showLabel) => {
    const bob = 0;
    const sh = project(cam, px, 0.02, pz);
    if (sh) {
      wc.fillStyle = 'rgba(0,0,0,0.25)';
      wc.beginPath();
      wc.ellipse(sh.x, sh.y, Math.min(1.5 * sh.scale, 300), Math.min(0.5 * sh.scale, 100), 0, 0, Math.PI * 2);
      wc.fill();
    }
    const base = project(cam, px, 0, pz);
    if (!base) return;
    const fx = Math.sin(facing), fz = Math.cos(facing);
    const fa = project(cam, px + fx * 0.6, 0.15, pz + fz * 0.6);
    const fb = project(cam, px - fx * 0.6, 0.15, pz - fz * 0.6);
    if (!fa || !fb) return;
    let sx = fa.x - fb.x, sy = fa.y - fb.y;
    const sl = Math.hypot(sx, sy) || 1; sx /= sl; sy /= sl;
    const ang = Math.atan2(sx, -sy);
    const toCamX = cam.x - px, toCamZ = cam.z - pz;
    const towardCam = (fx * toCamX + fz * toCamZ) > 0;
    const U = base.scale;
    const bobPx = bob * U;
    wc.save();
    wc.translate(base.x, base.y);
    wc.rotate(ang);
    const block = (cx, cy, w, h, col) => { wc.fillStyle = col; wc.fillRect(cx - w / 2, cy - h / 2, w, h); };
    block(-0.34 * U, -0.5 * U - bobPx, 0.46 * U, 1.0 * U, shade(c, 0.72));
    block(0.34 * U, -0.5 * U - bobPx, 0.46 * U, 1.0 * U, shade(c, 0.72));
    block(-0.88 * U, -1.475 * U - bobPx, 0.32 * U, 0.95 * U, shade(c, 0.85));
    block(0.88 * U, -1.475 * U - bobPx, 0.32 * U, 0.95 * U, shade(c, 0.85));
    block(0, -1.475 * U - bobPx, 1.25 * U, 1.05 * U, c);
    if (towardCam) {
      block(0, -2.525 * U - bobPx, 1.1 * U, 1.05 * U, skin);
      const er = Math.max(1, 0.1 * U);
      wc.fillStyle = '#1a1a1a';
      wc.beginPath(); wc.arc(-0.28 * U, -2.5 * U - bobPx, er, 0, Math.PI * 2); wc.fill();
      wc.beginPath(); wc.arc(0.28 * U, -2.5 * U - bobPx, er, 0, Math.PI * 2); wc.fill();
      wc.fillStyle = 'rgba(255,255,255,0.9)';
      wc.beginPath(); wc.arc(-0.28 * U - er * 0.25, -2.5 * U - er * 0.25 - bobPx, er * 0.35, 0, Math.PI * 2); wc.fill();
      wc.beginPath(); wc.arc(0.28 * U - er * 0.25, -2.5 * U - er * 0.25 - bobPx, er * 0.35, 0, Math.PI * 2); wc.fill();
    } else {
      block(0, -2.525 * U - bobPx, 1.1 * U, 1.05 * U, shade(skin, 0.6));
    }
    block(0, -3.17 * U - bobPx, 1.22 * U, 0.26 * U, shade(skin, 0.55));
    wc.restore();
    if (isMe) labels.push({ text: nick, wx: px, wy: 3.55 + bob, wz: pz, color: c, size: 13, mine: true });
    else if (showLabel) labels.push({ text: nick, wx: px, wy: 3.55 + bob, wz: pz, color: c, size: 12 });
  };
  const wf = state.world.facing != null ? state.world.facing : state.world.yaw;
  drawOne(state.world.x, state.world.z, wf, playerColor(currentUser), currentUser, true);
  for (const rp of effectiveServerPlayers()) drawOne(rp.x, rp.z, rp.yaw != null ? rp.yaw : 0, rp.color || '#ffffff', rp.nick, false);
}

function drawClouds(cam) {
  const rot = state.world.yaw;
  const span = W + 600;
  for (const c of CLOUDS) {
    const baseX = c.nx * (W + 300) - 150;
    const off = ((rot / (Math.PI * 2)) * span) % span;
    let px = baseX - off;
    if (px < -200) px += span;
    if (px > W + 200) px -= span;
    const py = c.ny * H;
    const rs = c.s * 34;
    wc.fillStyle = 'rgba(255,255,255,0.72)';
    for (let k = 0; k < 3; k++) {
      wc.beginPath();
      wc.arc(px + (k - 1) * rs * 0.6, py, rs * (0.55 + (k === 1 ? 0.4 : 0)), 0, Math.PI * 2);
      wc.fill();
    }
  }
}

function cardFaceCorners(cam, x, y, z, w, h, facing) {
  const rx = Math.cos(facing), rz = -Math.sin(facing);
  const hw = w / 2, hh = h / 2;
  return [
    [x + rx * hw, y + hh, z + rz * hw],
    [x - rx * hw, y + hh, z - rz * hw],
    [x - rx * hw, y - hh, z - rz * hw],
    [x + rx * hw, y - hh, z + rz * hw],
  ].map(p => project(cam, p[0], p[1], p[2])).filter(Boolean);
}

function drawCardFaceText(cam, x, y, z, w, h, rc, flag, name, rating, facing, mut) {
  const pts = cardFaceCorners(cam, x, y, z, w, h, facing);
  if (pts.length < 3) return;
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const cw = maxX - minX, ch = maxY - minY;
  if (cw < 2 || ch < 2) return;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const glow = Math.max(8, cw * 0.3);
  wc.save();
  wc.shadowColor = rc;
  wc.shadowBlur = glow;
  wc.fillStyle = rc;
  wc.fillRect(cx - cw / 2, cy - ch / 2, cw, ch);
  wc.restore();
  wc.strokeStyle = 'rgba(255,255,255,0.9)';
  wc.lineWidth = Math.max(1.5, cw * 0.05);
  wc.strokeRect(cx - cw / 2 + 2, cy - ch / 2 + 2, cw - 4, ch - 4);
  wc.fillStyle = '#fff';
  wc.textAlign = 'center'; wc.textBaseline = 'middle';
  wc.font = '900 ' + Math.max(10, cw * 0.48) + 'px sans-serif';
  wc.fillText(rating, cx, cy - ch * 0.12);
  wc.font = 'bold ' + Math.max(7, cw * 0.14) + 'px sans-serif';
  wc.fillText(flag + ' ' + name, cx, cy + ch * 0.3);
  if (mut) {
    const txt = mut.icon + (mut.mult ? '×' + mut.mult : '') + (mut.label || '');
    wc.font = '900 ' + Math.max(7, cw * 0.13) + 'px sans-serif';
    wc.fillStyle = mut.color || '#ffe66b';
    wc.fillText(txt, cx, cy + ch * 0.5);
  }
}

function card3DPolys(cam, x, z, rc, flag, name, rating, facing, mut, sc) {
  const s = sc || 1;
  const w = 1.7 * s, d = 0.4 * s, h = 3.4 * s;
  const y = 0.12, cy = y + h / 2;
  const polys = boxPolys({ x, z, w, d, h, color: rc }, cam);
  if (mut) polys.push(...glowRingPolys(cam, x, z, w, h, mut.color || '#ffe66b'));
  pushRound(distToCam(x, z), () => drawCardFaceText(cam, x, cy, z, w, h, rc, flag, name, rating, facing, mut));
  return polys;
}

function glowRingPolys(cam, x, z, w, h, color) {
  const polys = [];
  const a = 0.09, b = 0.26;
  const rgba = hexToRgba(color || '#ffe66b', 0.45);
  const pts = [[x - w / 2 - a, b, z - a], [x + w / 2 + a, b, z - a], [x + w / 2 + a, b, z + a], [x - w / 2 - a, b, z + a]]
    .map(p => project(cam, p[0], p[1], p[2])).filter(Boolean);
  if (pts.length >= 4) {
    polys.push({ pts: pts.map(p => ({ x: p.x, y: p.y })), color: rgba, line: false, flat: true });
  }
  return polys;
}

function hexToRgba(hex, al) {
  const m = String(hex).replace('#', '');
  const n = m.length === 3 ? m.split('').map(c => c + c).join('') : m;
  const v = parseInt(n, 16);
  return 'rgba(' + ((v >> 16) & 255) + ',' + ((v >> 8) & 255) + ',' + (v & 255) + ',' + al + ')';
}

function fieldCardsPolys(f, cards, color, cam, labels) {
  const polys = [];
  const fcx = f.x0 + FIELD_W / 2, fcz = (f.z0 + f.z1) / 2;
  if (distToCam(fcx, fcz) > 135) return polys;
  for (const s of slotPositions(cards)) {
    const x = f.x0 + s.x * FIELD_W;
    const z = f.z1 - s.z * FIELD_D;
    const p = s.p;
    const facing = Math.atan2(cam.x - x, cam.z - z);
    polys.push(...card3DPolys(cam, x, z, rarityColor(p.rarity), p.flag, p.name, p.rating, facing, faceExtra(p)));
  }
  return polys;
}

function fieldOwnerPolys(base, idx, cam, labels) {
  const owner = fieldOwnerCards(idx);
  if (!owner || !owner.cards || !owner.cards.length) return [];
  const f = fieldRectFor(base);
  const polys = fieldCardsPolys(f, owner.cards, owner.color || '#888888', cam, labels);
  return polys;
}

function arenaPolys(cam) {
  const a = ARENA_OBJ;
  const x0 = a.x - a.w / 2, x1 = a.x + a.w / 2, z0 = a.z - a.d / 2, z1 = a.z + a.d / 2;
  const polys = [];
  const g = groundPoly(cam, x0, z0, x1, z1, 0.2, '#c9a25f');
  if (g) polys.push(g);
  const line = (a2, b2, c2, d2, col) => { const gg = groundPoly(cam, a2, b2, c2, d2, 0.3, col, true); if (gg) polys.push(gg); };
  line(x0 - 0.5, z0 - 0.5, x1 + 0.5, z0 + 0.5, '#ffffff');
  line(x0 - 0.5, z1 - 0.5, x1 + 0.5, z1 + 0.5, '#ffffff');
  line(x0 - 0.5, z0, x0 + 0.5, z1, '#ffffff');
  line(x1 - 0.5, z0, x1 + 0.5, z1, '#ffffff');
  line(x0, (z0 + z1) / 2 - 0.4, x1, (z0 + z1) / 2 + 0.4, 'rgba(255,255,255,0.7)');
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  polys.push(...arenaRingPolys(cx, cz, cam));
  return polys;
}

// Проверено-шахматное кольцо вокруг арены как настоящие 3D-полигоны на земле.
function arenaRingPolys(cx, cz, cam) {
  const segs = [];
  for (let i = 0; i < 20; i++) {
    const a = i / 20 * Math.PI * 2, b = (i + 1) / 20 * Math.PI * 2;
    segs.push([[cx + Math.cos(a) * 5.4, 0.22, cz + Math.sin(a) * 5.4],
      [cx + Math.cos(b) * 5.4, 0.22, cz + Math.sin(b) * 5.4],
      [cx + Math.cos(b) * 6.6, 0.24, cz + Math.sin(b) * 6.6],
      [cx + Math.cos(a) * 6.6, 0.24, cz + Math.sin(a) * 6.6]]);
  }
  const polys = [];
  for (const wp of segs) {
    const pts = projectPoly(cam, wp);
    if (!pts) continue;
    const depth = pts.reduce((s, p) => s + p.z, 0) / pts.length;
    polys.push({ pts: pts.map(p => ({ x: p.x, y: p.y })), color: '#b3572e', depth, line: false, flat: true });
  }
  return polys;
}

function marketPolys(cam) {
  const m = MARKET_OBJ;
  const polys = [];
  const awnings = ['#ff4d4d', '#ff9f1c', '#ffd23d'];
  for (let i = -1; i <= 1; i++) {
    polys.push(...boxPolys({ x: m.x + i * 7, z: m.z, w: 5, d: 5, h: 5, color: '#fffdf2' }, cam));
    polys.push(...boxPolys({ x: m.x + i * 7, z: m.z, w: 5.8, d: 5.8, h: 0.9, color: awnings[i + 1] }, cam));
  }
  return polys;
}

function rarityColor(r) {
  return { bronze: '#ff8c2a', silver: '#c9d4de', gold: '#ffd23d', diamond: '#57c7ff', secret: '#c050ff', bingi: '#ff4dc0' }[r] || '#fff';
}

function heldCardPolys(cam, labels) {
  if (!state.held) return [];
  const p = state.world;
  const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
  const x = p.x + fx * 3.9 + rx * 0.8, z = p.z + fz * 3.9 + rz * 0.8;
  const h = state.held;
  const polys = card3DPolys(cam, x, z, rarityColor(h.rarity), h.flag, h.name, h.rating, p.yaw, faceExtra(h), 0.55);
  labels.push({ text: h.name + ' ' + h.rating, wx: x, wy: 4.9, wz: z, color: '#ffffff', size: 13, mine: true });
  return polys;
}

// План всех слотов формации (включая пустые) — для подсветки мест установки
function slotPlan(cards) {
  const counts = formationCounts();
  const groups = lineupGroups();
  const zMap = { GK: 0.88, DF: 0.66, MF: 0.44, FW: 0.22 };
  const rows = [];
  for (const pos of POS_ORDER) {
    const arr = groups[pos];
    const n = counts[pos];
    for (let i = 0; i < n; i++) {
      const id = arr[i] != null ? arr[i] : null;
      const x = n === 1 ? 0.5 : 0.12 + (i / (n - 1)) * 0.76;
      rows.push({ id, pos, x, z: zMap[pos] });
    }
  }
  return rows;
}

function heldTargetSlot(plan) {
  const p = state.held; if (!p) return null;
  for (const r of plan) if (r.id == null && r.pos === p.pos) return r;
  const samePos = plan.filter(r => r.id != null && getPlayer(r.id) && getPlayer(r.id).pos === p.pos)
    .sort((a, b) => getPlayer(a.id).rating - getPlayer(b.id).rating);
  if (samePos.length) return samePos[0];
  return plan.filter(r => r.id != null).sort((a, b) => getPlayer(a.id).rating - getPlayer(b.id).rating)[0] || null;
}

// Подсветка слотов, когда несёшь карточку к своему полю
function drawHeldSlotMarkers(cam) {
  if (!state || !state.held) return;
  const home = homeFieldIndex();
  const f = fieldRectFor(BASES[home]);
  const c = state.world;
  if (distToCam(f.x0 + FIELD_W / 2, (f.z0 + f.z1) / 2) > 70) return;
  const cards = state.starters.map(getPlayer).filter(Boolean);
  const plan = slotPlan(cards);
  const target = heldTargetSlot(plan);
  plan.forEach((r) => {
    const x = f.x0 + r.x * FIELD_W;
    const z = f.z1 - r.z * FIELD_D;
    const isTarget = target && ((target.id == null && r.id == null && r.pos === target.pos) || (target.id != null && r.id === target.id));
    const col = isTarget ? '#ffd23d' : 'rgba(255,255,255,0.55)';
    pushRound(distToCam(x, z), () => {
      drawRing(cam, x, 0.18, z, 1.7, col, isTarget ? 3.5 : 2);
      drawDisc(cam, x, 0.06, z, 0.5, 'rgba(255,255,255,0.35)');
    });
  });
  if (target) {
    const tx = f.x0 + target.x * FIELD_W;
    const tz = f.z1 - target.z * FIELD_D;
    pushRound(distToCam(tx, tz), () => drawRing(cam, tx, 0.3, tz, 2.6, '#ffd23d', 4));
  }
}

function spinnerPolys(base, cam) {
  const sp = spinnerPosFor(base);
  const polys = boxPolys({ x: sp.x, z: sp.z, w: 2.0, d: 2.0, h: 3.4, color: '#c77a3a' }, cam);
  polys.push(...boxPolys({ x: sp.x, z: sp.z, w: 2.2, d: 2.2, h: 0.5, color: '#ffd23d' }, cam));
  polys.push(...boxPolys({ x: sp.x, z: sp.z, w: 3.6, d: 3.6, h: 0.7, color: '#ff9f1c' }, cam));
  return polys;
}

function signPolys(o, title, color, cam, labels) {
  const polys = [];
  polys.push(...boxPolys({ x: o.x - 1.6, z: o.z, w: 0.5, d: 0.5, h: 2.4, color: '#7a4a2b' }, cam));
  polys.push(...boxPolys({ x: o.x + 1.6, z: o.z, w: 0.5, d: 0.5, h: 2.4, color: '#7a4a2b' }, cam));
  polys.push(...boxPolys({ x: o.x, z: o.z, w: 4.6, d: 0.6, h: 2.6, color }, cam));
  return polys;
}



function drawWorldRoulette(cam, base) {
  const sp = spinnerPosFor(base);
  if (distToCam(sp.x, sp.z) > 120) return;
  const R = 3.4, y = 4.9;
  const c = project(cam, sp.x, y, sp.z);
  if (!c) return;
  const cols = ['#ff5d5d', '#ffd23d', '#57c7ff', '#3ddc84', '#c050ff'];
  const seg = 30;
  wc.lineWidth = 1.2;
  wc.strokeStyle = 'rgba(0,0,0,0.45)';
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const p0 = project(cam, sp.x + Math.cos(a0) * R, y, sp.z + Math.sin(a0) * R);
    const p1 = project(cam, sp.x + Math.cos(a1) * R, y, sp.z + Math.sin(a1) * R);
    if (!p0 || !p1) continue;
    wc.beginPath();
    wc.moveTo(c.x, c.y);
    wc.lineTo(p0.x, p0.y);
    wc.lineTo(p1.x, p1.y);
    wc.closePath();
    wc.fillStyle = cols[Math.floor(i / (seg / 5)) % 5];
    wc.fill();
    wc.stroke();
  }
  const rim = [];
  for (let i = 0; i <= 24; i++) {
    const a = i / 24 * Math.PI * 2;
    const p = project(cam, sp.x + Math.cos(a) * (R + 0.45), y, sp.z + Math.sin(a) * (R + 0.45));
    if (p) rim.push(p);
  }
  if (rim.length > 3) {
    wc.beginPath();
    wc.moveTo(rim[0].x, rim[0].y);
    for (let i = 1; i < rim.length; i++) wc.lineTo(rim[i].x, rim[i].y);
    wc.closePath();
    wc.strokeStyle = '#ffd23d';
    wc.lineWidth = Math.max(2, 0.5 * c.scale);
    wc.stroke();
    wc.strokeStyle = 'rgba(255,255,255,0.7)';
    wc.lineWidth = Math.max(1, 0.22 * c.scale);
    wc.stroke();
  }
  wc.save();
  wc.shadowColor = 'rgba(255,200,60,0.9)';
  wc.shadowBlur = Math.max(6, 1.4 * c.scale);
  wc.beginPath(); wc.arc(c.x, c.y, Math.max(2.5, 0.8 * c.scale), 0, Math.PI * 2);
  wc.fillStyle = '#2a1a05'; wc.fill();
  wc.restore();
  const np = project(cam, sp.x, y, sp.z - R * 1.25);
  const nc = project(cam, sp.x, y, sp.z - R * 0.3);
  if (np && nc) {
    let dx = nc.x - np.x, dy = nc.y - np.y;
    const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
    const px = -dy, py = dx;
    const s = Math.max(5, 0.6 * np.scale);
    wc.fillStyle = '#ffd23d';
    wc.beginPath();
    wc.moveTo(np.x + dx * s, np.y + dy * s);
    wc.lineTo(np.x + px * s * 0.6, np.y + py * s * 0.6);
    wc.lineTo(np.x - px * s * 0.6, np.y - py * s * 0.6);
    wc.closePath(); wc.fill();
    wc.strokeStyle = '#222'; wc.lineWidth = 1.5; wc.stroke();
  }
}

function drawDecorLabels(cam, labels) {
  for (const l of labels) {
    if (!l.mine) continue;
    const dx = l.wx - cam.x, dz = l.wz - cam.z;
    if (dx * dx + dz * dz > 2500) continue;
    const p = project(cam, l.wx, l.wy, l.wz);
    if (!p) continue;
    wc.font = 'bold ' + (l.size || 11) + 'px sans-serif';
    wc.textAlign = 'center'; wc.textBaseline = 'middle';
    wc.fillStyle = 'rgba(0,0,0,0.55)';
    wc.fillText(l.text, p.x + 1, p.y + 1);
    wc.fillStyle = l.color;
    wc.fillText(l.text, p.x, p.y);
  }
}

