// ============ МАТЧ: управляемый футбол (как в FIFA) ============
function winChance(myAvg, botAvg) { return Math.round(clamp(50 + (myAvg - botAvg) * 6, 5, 95)); }

function makeBotSquad(avg) {
  const rar = avg >= 86 ? 'secret' : avg >= 79 ? 'gold' : avg >= 73 ? 'silver' : 'bronze';
  const make = pos => { const p = generateFakePlayer(rar, pos, rnd(avg - 6, avg + 4)); transient[p.id] = p; return p.id; };
  const ids = [make('GK')];
  for (let i = 0; i < 4; i++) ids.push(make('DF'));
  for (let i = 0; i < 3; i++) ids.push(make('MF'));
  for (let i = 0; i < 3; i++) ids.push(make('FW'));
  return ids;
}

function startMatch(oppId) {
  const o = OPPONENTS.find(x => x.id === oppId);
  if (!o) return;
  beginMatch(o);
}

function startPvpMatch(otherNick) {
  const myOverall = Math.round(teamStats(state.starters).overall);
  beginMatch({ id: 'pvp', name: otherNick, emoji: '⚔', avg: myOverall, fansWin: 8, fansDraw: 4 });
}

// ---------- Поле и физика (нормированные координаты 0..1) ----------
const MATCH_L = 0.05, MATCH_R = 0.95, MATCH_T = 0.08, MATCH_B = 0.92;
const MATCH_GOAL_Y0 = 0.36, MATCH_GOAL_Y1 = 0.64;
const MATCH_DURATION = 240; // секунд реального времени на весь матч (90 игровых минут)
const MATCH_GRAVITY = 9;    // гравитация для дуг пасов/ударов (метры/с^2)

// ---------- Состояние матча ----------
function beginMatch(o) {
  ensureLineup();
  transient = {};
  match = {
    opp: o,
    myLineup: [...state.starters],
    botSquad: makeBotSquad(o.avg),
    myGoals: 0, botGoals: 0, minute: 0,
    subsUsed: 0, paused: false, running: true, timer: null,
    timeLeft: MATCH_DURATION,
    teams: { me: [], bot: [] },
    ball: { x: 0.5, y: 0.5, vx: 0, vy: 0, z: 0, vz: 0 },
    possession: 'me',
    lastGoalScorer: null,
    controlIdx: 0,
    keys: {},
    joy: { active: false, dx: 0, dy: 0 },
    botShotCooldown: 0,
    kickCooldown: 0,
    goalLock: false,
  };
  buildMatchTeams();
  resetKickoff();
  showScreen('match');
  resizeMatch();
  match.timer = setInterval(() => { if (!match.paused && match.running) stepMatch(); }, 33);
}

function buildMatchTeams() {
  const mk = lineup => {
    const ps = lineup.map(getPlayer).filter(Boolean);
    const groups = { GK: [], DF: [], MF: [], FW: [] };
    ps.forEach(p => groups[p.pos].push(p));
    const rows = [];
    const xMap = { GK: 0.08, DF: 0.24, MF: 0.42, FW: 0.62 };
    for (const pos of POS_ORDER) {
      const arr = groups[pos];
      const n = arr.length;
      arr.forEach((p, i) => {
        const y = n === 1 ? 0.5 : 0.16 + (i / (n - 1)) * 0.68;
        rows.push({ id: p.id, name: p.name, pos, rating: p.rating, homeX: xMap[pos], homeY: y, x: xMap[pos], y, vx: 0, vy: 0 });
      });
    }
    return rows;
  };
  match.teams.me = mk(match.myLineup);
  match.teams.bot = mk(match.botSquad).map(p => ({ ...p, homeX: 1 - p.homeX, x: 1 - p.x }));
}

function resetKickoff() {
  const mid = (MATCH_L + MATCH_R) / 2;
  match.ball = { x: mid, y: 0.5, vx: 0, vy: 0, z: 0, vz: 0 };
  for (const side of ['me', 'bot']) {
    for (const p of match.teams[side]) {
      p.x = p.homeX + (Math.random() - 0.5) * 0.04;
      p.y = p.homeY + (Math.random() - 0.5) * 0.04;
    }
  }
  match.possession = 'me';
  match.kickCooldown = 0;
}

function myStats() { return teamStats(match.myLineup); }
function botStats() { return teamStats(match.botSquad); }

// ---------- Игровой цикл ----------
function playerSpeed(p) { return 0.55 + p.rating * 0.0045; }

function closestToBall(side) {
  let best = null, bd = 1e9;
  for (const p of match.teams[side]) {
    const d = Math.hypot(p.x - match.ball.x, p.y - match.ball.y);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

// Кем управляем: ближайший полевой игрок (не вратарь), кроме случая мяча у своих ворот
function controlTarget() {
  const ball = match.ball;
  let best = null, bd = 1e9;
  for (const p of match.teams.me) {
    if (p.pos === 'GK' && ball.x > 0.22) continue;
    const d = Math.hypot(p.x - ball.x, p.y - ball.y);
    if (d < bd) { bd = d; best = p; }
  }
  return best || closestToBall('me');
}

// ИИ моего вратаря: держит линию ворот и тянется к мячу, когда бот атакует
function stepMyGK(dt) {
  for (const p of match.teams.me) {
    if (p.pos !== 'GK') continue;
    p.x = clamp(MATCH_L + 0.045, MATCH_L + 0.015, MATCH_R - 0.015);
    if (match.ball.x < 0.35) {
      p.y = clamp(match.ball.y, MATCH_GOAL_Y0, MATCH_GOAL_Y1);
    } else {
      p.y += (0.5 - p.y) * Math.min(1, dt * 1.5);
    }
  }
}

function stepMatch() {
  if (!match || !match.running) return;
  if (match.paused) { renderMatchCanvas(); return; }
  const dt = 0.033;
  match.timeLeft -= dt;
  if (match.timeLeft <= 0) { endMatch(); return; }
  match.minute = Math.floor((1 - match.timeLeft / MATCH_DURATION) * 90);

  // Игрок под управлением — ближайший полевой
  const ctl = controlTarget();
  if (ctl) match.controlIdx = match.teams.me.indexOf(ctl);

  // ИИ моего вратаря
  stepMyGK(dt);

  // --- Движение моего подконтрольного игрока ---
  let mx = 0, my = 0;
  if (match.keys && (match.keys['ArrowLeft'] || match.keys['a'] || match.keys['A'] || match.keys['ф'] || match.keys['Ф'])) mx -= 1;
  if (match.keys && (match.keys['ArrowRight'] || match.keys['d'] || match.keys['D'] || match.keys['в'] || match.keys['В'])) mx += 1;
  if (match.keys && (match.keys['ArrowUp'] || match.keys['w'] || match.keys['W'] || match.keys['ц'] || match.keys['Ц'])) my -= 1;
  if (match.keys && (match.keys['ArrowDown'] || match.keys['s'] || match.keys['S'] || match.keys['ы'] || match.keys['Ы'])) my += 1;
  if (match.joy && match.joy.active) { mx += match.joy.dx; my += match.joy.dy; }
  const mlen = Math.hypot(mx, my);
  if (mlen > 0) {
    mx /= mlen; my /= mlen;
    ctl.x = clamp(ctl.x + mx * playerSpeed(ctl) * dt, MATCH_L + 0.015, MATCH_R - 0.015);
    ctl.y = clamp(ctl.y + my * playerSpeed(ctl) * dt, MATCH_T + 0.015, MATCH_B - 0.015);
  }
  // Ведение мяча: если мяч у ног, он едет за игроком (по земле)
  const dToBall = Math.hypot(ctl.x - match.ball.x, ctl.y - match.ball.y);
  if (dToBall < 0.035 && match.possession === 'me' && match.ball.z < 0.1) {
    match.ball.x = ctl.x + (match.ball.x > ctl.x ? 0.015 : -0.015);
    match.ball.y = ctl.y + (match.ball.y > ctl.y ? 0.012 : -0.012);
    match.ball.z = 0; match.ball.vz = 0;
  }

  // --- ИИ моих игроков (кроме управляемого и вратаря) держат формацию ---
  const myNear = nearestOf('me');
  for (const p of match.teams.me) {
    if (p === ctl || p.pos === 'GK') continue;
    let tx, ty;
    if (p === myNear && match.possession !== 'me') { tx = match.ball.x; ty = match.ball.y; }
    else { const t = formationTarget('me', p); tx = t.tx; ty = t.ty; }
    moveToward(p, tx, ty, dt);
  }

  // --- ИИ соперника ---
  stepBotAI(dt);

  // --- Мяч: инерция + гравитация (дуги пасов/ударов) ---
  const air = match.ball.z > 0.05;
  const damp = air ? 0.5 : 0.35;
  match.ball.x += match.ball.vx * dt;
  match.ball.y += match.ball.vy * dt;
  match.ball.z += match.ball.vz * dt;
  match.ball.vz -= MATCH_GRAVITY * dt;
  if (match.ball.z <= 0) {
    match.ball.z = 0;
    match.ball.vz = match.ball.vz < -1 ? -match.ball.vz * 0.45 : 0;
  }
  match.ball.vx *= Math.pow(damp, dt);
  match.ball.vy *= Math.pow(damp, dt);
  if (Math.abs(match.ball.vx) < 0.001 && Math.abs(match.ball.vy) < 0.001) { match.ball.vx = 0; match.ball.vy = 0; }
  match.ball.x = clamp(match.ball.x, MATCH_L + 0.01, MATCH_R - 0.01);
  match.ball.y = clamp(match.ball.y, MATCH_T + 0.01, MATCH_B - 0.01);
  if (match.kickCooldown > 0) match.kickCooldown -= dt;

  // --- Голы ---
  checkGoal();

  // --- Отбор мяча ---
  if (match.ball.vx === 0 && match.ball.vy === 0) {
    const bd = closestToBall('me'), bb = closestToBall('bot');
    const dMe = bd ? Math.hypot(bd.x - match.ball.x, bd.y - match.ball.y) : 1;
    const dBot = bb ? Math.hypot(bb.x - match.ball.x, bb.y - match.ball.y) : 1;
    if (dMe < 0.03) match.possession = 'me';
    else if (dBot < 0.03) match.possession = 'bot';
  }

  if (match.timeLeft % 10 < 0.05 && Math.random() < 0.2) addLog(Math.random() < 0.5 ? 'Острый момент у ваших ворот!' : 'Опасная атака вашей команды!', 'info');

  updateMatchUI();
  renderMatchCanvas();
}

function moveToward(p, tx, ty, dt) {
  const dx = tx - p.x, dy = ty - p.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.004) return;
  const sp = playerSpeed(p);
  p.x += (dx / d) * sp * dt;
  p.y += (dy / d) * sp * dt;
  p.x = clamp(p.x, MATCH_L + 0.015, MATCH_R - 0.015);
  p.y = clamp(p.y, MATCH_T + 0.015, MATCH_B - 0.015);
}

function nearestOf(side) {
  let best = null, bd = 1e9;
  for (const p of match.teams[side]) {
    const d = Math.hypot(p.x - match.ball.x, p.y - match.ball.y);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
function formationTarget(side, p) {
  const ball = match.ball;
  const attacking = (side === 'me' && match.possession === 'me') || (side === 'bot' && match.possession === 'bot');
  const fwd = side === 'me' ? 0.06 : -0.06;
  const back = side === 'me' ? -0.04 : 0.04;
  const tx = p.homeX + (attacking ? fwd : back);
  const ty = p.homeY + (ball.y - p.homeY) * (attacking ? 0.2 : 0.15);
  return { tx: clamp(tx, MATCH_L + 0.015, MATCH_R - 0.015), ty: clamp(ty, MATCH_T + 0.015, MATCH_B - 0.015) };
}
function stepBotGK(p, dt) {
  p.x = clamp(MATCH_R - 0.045, MATCH_L + 0.015, MATCH_R - 0.015);
  if (match.ball.x > 0.65) p.y = clamp(match.ball.y, MATCH_GOAL_Y0, MATCH_GOAL_Y1);
  else p.y += (0.5 - p.y) * Math.min(1, dt * 1.5);
}
function stepBotAI(dt) {
  const ball = match.ball;
  if (match.botShotCooldown > 0) match.botShotCooldown -= dt;
  const near = nearestOf('bot');
  for (const p of match.teams.bot) {
    if (p.pos === 'GK') { stepBotGK(p, dt); continue; }
    let tx, ty;
    if (match.possession === 'bot') {
      if (p === near) {
        tx = ball.x; ty = ball.y;
        const dp = Math.hypot(p.x - ball.x, p.y - ball.y);
        if (dp < 0.04) {
          ball.x = p.x + (ball.x > p.x ? 0.015 : -0.015);
          ball.y = p.y + (ball.y > p.y ? 0.012 : -0.012);
          ball.z = 0; ball.vz = 0;
          if (match.botShotCooldown <= 0) {
            const power = 0.55 + p.rating * 0.0025;
            const aim = Math.random() < (0.55 + p.rating * 0.002) ? 0.75 : 0.25;
            const tyTarget = MATCH_GOAL_Y0 + (MATCH_GOAL_Y1 - MATCH_GOAL_Y0) * (Math.random() < aim ? 0.5 : (Math.random() < 0.5 ? 0.12 : 0.88));
            const dx = MATCH_L - ball.x, dy = tyTarget - ball.y;
            const d = Math.hypot(dx, dy) || 1;
            ball.vx = (dx / d) * power * 0.85; ball.vy = (dy / d) * power * 0.85;
            ball.vz = clamp(power * 0.4, 2.5, 7); ball.z = 0.12;
            match.possession = 'me'; match.botShotCooldown = 1.4;
            addLog('💨 Соперник бьёт по воротам!', 'danger');
          }
        }
      } else { const t = formationTarget('bot', p); tx = t.tx; ty = t.ty; }
    } else {
      if (p === near) { tx = ball.x; ty = ball.y; }
      else { const t = formationTarget('bot', p); tx = t.tx; ty = t.ty; }
    }
    moveToward(p, tx, ty, dt);
  }
}

function doPass() {
  if (!match || !match.running) return;
  if (match.kickCooldown > 0) return;
  const ctl = closestToBall('me');
  const d = Math.hypot(ctl.x - match.ball.x, ctl.y - match.ball.y);
  if (d > 0.04) { toast('Подойди к мячу, чтобы пасовать!'); return; }
  match.possession = 'me';
  // ближайший партнёр впереди
  let best = null, bd = 1e9;
  for (const p of match.teams.me) {
    if (p === ctl) continue;
    const dd = Math.hypot(p.x - ctl.x, p.y - ctl.y);
    if (dd < bd) { bd = dd; best = p; }
  }
  if (!best) return;
  const dx = best.x - ctl.x, dy = best.y - ctl.y;
  const dl = Math.hypot(dx, dy) || 1;
  const power = 0.85;
  match.ball.vx = (dx / dl) * power;
  match.ball.vy = (dy / dl) * power;
  match.ball.vz = clamp(power * 0.6, 2, 6);
  match.ball.z = 0.12;
  match.kickCooldown = 0.25;
  addLog('🎯 Пас ' + ctl.name + ' → ' + best.name, 'sub');
}

function doShoot() {
  if (!match || !match.running) return;
  if (match.kickCooldown > 0) return;
  const ctl = closestToBall('me');
  const d = Math.hypot(ctl.x - match.ball.x, ctl.y - match.ball.y);
  if (d > 0.04) { toast('Подойди к мячу, чтобы ударить!'); return; }
  match.possession = 'me';
  const tyTarget = MATCH_GOAL_Y0 + (MATCH_GOAL_Y1 - MATCH_GOAL_Y0) * (Math.random() < 0.5 ? 0.22 : 0.78);
  const dx = MATCH_R - ctl.x, dy = tyTarget - ctl.y;
  const dl = Math.hypot(dx, dy) || 1;
  const power = 1.15 + ctl.rating * 0.004;
  const baseAcc = 0.82 + ctl.rating * 0.001;
  const acc = Math.random() < baseAcc ? 1 : 0.55;
  match.ball.vx = (dx / dl) * power * acc;
  match.ball.vy = (dy / dl) * power * acc;
  match.ball.vz = clamp(power * 0.4, 2.5, 7);
  match.ball.z = 0.12;
  match.kickCooldown = 0.4;
  addLog('⚽ Удар ' + ctl.name + ' по воротам!', 'goal');
}

function checkGoal() {
  const b = match.ball;
  if (match.goalLock) return;
  // мои ворота слева
  if (b.x <= MATCH_L + 0.012 && b.y > MATCH_GOAL_Y0 && b.y < MATCH_GOAL_Y1 && b.z < 3) {
    match.goalLock = true;
    match.botGoals++;
    const sc = closestToBall('bot');
    addLog('⚽ ГОЛ СОПЕРНИКА: ' + (sc ? sc.name : '??'), 'danger');
    showGoalBanner('⚽ ГОЛ ' + match.opp.name + '!<br>🟥');
    setTimeout(() => { match.goalLock = false; resetKickoff(); }, 1400);
    return;
  }
  // ворота соперника справа
  if (b.x >= MATCH_R - 0.012 && b.y > MATCH_GOAL_Y0 && b.y < MATCH_GOAL_Y1 && b.z < 3) {
    match.goalLock = true;
    match.myGoals++;
    const sc = closestToBall('me');
    addLog('⚽ ГОЛ! ' + (sc ? sc.name : '??'), 'goal');
    showGoalBanner('⚽ ГОЛ!<br>' + (sc ? sc.name : '??') + ' 🟦');
    setTimeout(() => { match.goalLock = false; resetKickoff(); }, 1400);
    return;
  }
}

function showGoalBanner(text) {
  const b = $('#goal-banner');
  if (!b) return;
  b.innerHTML = text;
  b.classList.remove('hidden');
  clearTimeout(showGoalBanner._t);
  showGoalBanner._t = setTimeout(() => b.classList.add('hidden'), 1900);
}

function scorePlayer(lineup) {
  const ps = lineup.map(getPlayer).filter(Boolean);
  const total = ps.reduce((s, p) => s + p.rating, 0);
  let x = Math.random() * total;
  for (const p of ps) { x -= p.rating; if (x <= 0) return p.name; }
  return ps.length ? ps[ps.length - 1].name : '???';
}

function addLog(text, cls) {
  const box = $('#match-log');
  if (!box) return;
  const div = document.createElement('div');
  div.className = 'log-line ' + (cls || '');
  div.textContent = match.minute + "' " + text;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function updateMatchUI() {
  $('#match-score').textContent = match.myGoals + ' : ' + match.botGoals;
  $('#match-minute').textContent = match.minute + "'";
  const pA = possessionPct();
  $('#match-poss').textContent = `Владение: вы ${pA}% — ${100 - pA}% (${match.opp.emoji} ${match.opp.name})`;
  $('#subs-left').textContent = 3 - match.subsUsed;
  $('#m-team-b').textContent = match.opp.emoji + ' ' + match.opp.name;
}

function renderMatchScreen() {
  $('#match-title').textContent = '⚽ Матч против ' + match.opp.name;
  $('#match-log').innerHTML = '';
  $('#match-pause').textContent = '⏸ Пауза';
  match.paused = false;
  updateMatchUI();
}

// ---------- Визуализация 3D (вид как в FIFA) ----------
const mc = $('#match-canvas');
const mctx = mc.getContext('2d');
let mW = 560, mH = 360;
const PITCH_LEN = 105, PITCH_WID = 68;

function resizeMatch() {
  mW = mc.clientWidth || 560;
  mH = mc.clientHeight || 360;
  mc.width = mW; mc.height = mH;
}
function mWX(xn) { return (xn - 0.5) * PITCH_LEN; }
function mWZ(yn) { return (yn - 0.5) * PITCH_WID; }
function mHalfW() { return mW / 2; }
function mHalfH() { return mH / 2; }
function mFocal() { const fov = 58 * Math.PI / 180; return (mW / 2) / Math.tan(fov / 2); }

function mEnsureCam() {
  if (!match.cam) match.cam = { cx: -28, cy: 15, cz: 16, tx: 0, ty: 1.6, tz: 0 };
}
function mUpdateCam() {
  mEnsureCam();
  const bX = mWX(match.ball.x), bZ = mWZ(match.ball.y);
  const dir = match.possession === 'me' ? 1 : -1;
  const tx = bX + dir * 10, tz = bZ * 0.45;
  const cx = bX - dir * 32, cz = bZ * 0.45 + 15;
  const cy = 19;
  const c = match.cam, k = 0.09;
  c.cx += (cx - c.cx) * k; c.cy += (cy - c.cy) * k; c.cz += (cz - c.cz) * k;
  c.tx += (tx - c.tx) * k; c.ty += (1.6 - c.ty) * k; c.tz += (tz - c.tz) * k;
}
function mBasis() {
  const c = match.cam;
  let fx = c.tx - c.cx, fy = c.ty - c.cy, fz = c.tz - c.cz;
  const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
  let rx = -fz, ry = 0, rz = fx;
  const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
  const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
  return { fx, fy, fz, rx, ry, rz, ux, uy, uz };
}
function mProject(X, Y, Z) {
  const c = match.cam, B = match._basis;
  const dx = X - c.cx, dy = Y - c.cy, dz = Z - c.cz;
  const depth = dx * B.fx + dy * B.fy + dz * B.fz;
  if (depth < 0.5) return null;
  const cx_ = dx * B.rx + dy * B.ry + dz * B.rz;
  const cy_ = dx * B.ux + dy * B.uy + dz * B.uz;
  const f = mFocal();
  return { x: mHalfW() + (cx_ / depth) * f, y: mHalfH() - (cy_ / depth) * f, depth, scale: f / depth };
}
function mDepth(X, Z) {
  const c = match.cam, B = match._basis;
  const dx = X - c.cx, dy = -c.cy, dz = Z - c.cz;
  return dx * B.fx + dy * B.fy + dz * B.fz;
}
function mQuad(pts, color) {
  const sp = pts.map(p => mProject(p[0], p[1], p[2]));
  if (sp.some(s => !s)) return;
  mctx.beginPath(); mctx.moveTo(sp[0].x, sp[0].y);
  for (let i = 1; i < sp.length; i++) mctx.lineTo(sp[i].x, sp[i].y);
  mctx.closePath(); mctx.fillStyle = color; mctx.fill();
}
function mLine(x0, z0, x1, z1) {
  const a = mProject(x0, 0, z0), b = mProject(x1, 0, z1);
  if (!a || !b) return;
  mctx.beginPath(); mctx.moveTo(a.x, a.y); mctx.lineTo(b.x, b.y); mctx.stroke();
}
function mCircle(cx, cz, r, seg) {
  mctx.beginPath();
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const p = mProject(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r);
    if (!p) continue;
    if (i === 0) mctx.moveTo(p.x, p.y); else mctx.lineTo(p.x, p.y);
  }
  mctx.stroke();
}
function mRect(x0, z0, w, d) {
  mLine(x0, z0, x0 + w, z0); mLine(x0 + w, z0, x0 + w, z0 + d);
  mLine(x0 + w, z0 + d, x0, z0 + d); mLine(x0, z0 + d, x0, z0);
}
function mGoal(x, z0, w) {
  const depth = 2.4, h = 2.44;
  const back = x + Math.sign(x) * depth;
  mLine(x, z0, back, z0);
  mLine(back, z0, back, z0 + w);
  mLine(back, z0 + w, x, z0 + w);
  mLine(x, z0 + w, x, z0);
  const a = mProject(x, h, z0), b = mProject(x, h, z0 + w);
  if (a && b) { mctx.beginPath(); mctx.moveTo(a.x, a.y); mctx.lineTo(b.x, b.y); mctx.stroke(); }
}

function renderMatchCanvas() {
  mUpdateCam();
  match._basis = mBasis();
  const g = mctx.createLinearGradient(0, 0, 0, mH);
  g.addColorStop(0, '#0a1730'); g.addColorStop(0.55, '#10361f'); g.addColorStop(1, '#0c2a18');
  mctx.fillStyle = g; mctx.fillRect(0, 0, mW, mH);
  drawPitch3D();
  const items = [];
  for (const side of ['me', 'bot']) {
    for (const p of match.teams[side]) {
      const isCtl = (side === 'me' && match.teams.me[match.controlIdx] === p);
      items.push({ depth: mDepth(mWX(p.x), mWZ(p.y)), draw: () => mDrawPlayer(p, side, isCtl) });
    }
  }
  items.push({ depth: mDepth(mWX(match.ball.x), mWZ(match.ball.y)), draw: mDrawBall });
  items.sort((a, b) => b.depth - a.depth);
  for (const it of items) it.draw();
}

function drawPitch3D() {
  const hl = PITCH_LEN / 2, hw = PITCH_WID / 2;
  mQuad([[-hl, 0, -hw], [-hl, 0, hw], [hl, 0, hw], [hl, 0, -hw]], '#1f7a36');
  const N = 14;
  for (let i = 0; i < N; i++) {
    const x0 = -hl + (2 * hl) * (i / N), x1 = -hl + (2 * hl) * ((i + 1) / N);
    mQuad([[x0, 0, -hw], [x0, 0, hw], [x1, 0, hw], [x1, 0, -hw]], i % 2 ? '#1c6f31' : '#23853d');
  }
  mctx.strokeStyle = 'rgba(255,255,255,0.85)'; mctx.lineWidth = 2;
  mLine(-hl, -hw, hl, -hw); mLine(hl, -hw, hl, hw); mLine(hl, hw, -hl, hw); mLine(-hl, hw, -hl, -hw);
  mLine(0, -hw, 0, hw);
  mCircle(0, 0, 9.15, 28);
  const boxD = 16.5, boxW = 40;
  mRect(-hl, -boxW / 2, boxD, boxW);
  mRect(hl - boxD, -boxW / 2, boxD, boxW);
  mGoal(-hl, -7.32 / 2, 7.32);
  mGoal(hl, -7.32 / 2, 7.32);
}

function mDrawPlayer(p, side, isCtl) {
  const X = mWX(p.x), Z = mWZ(p.y);
  const foot = mProject(X, 0, Z); if (!foot) return;
  const head = mProject(X, 1.8, Z); if (!head) return;
  const sc = foot.scale;
  mctx.fillStyle = 'rgba(0,0,0,0.28)';
  mctx.beginPath(); mctx.ellipse(foot.x, foot.y, Math.max(3, 0.6 * sc), Math.max(1.5, 0.2 * sc), 0, 0, Math.PI * 2); mctx.fill();
  const col = side === 'me' ? '#3f8efc' : '#ff5d5d';
  const dark = side === 'me' ? '#1f5fb0' : '#b02424';
  mctx.lineCap = 'round';
  mctx.strokeStyle = dark; mctx.lineWidth = Math.max(3, 0.6 * sc);
  mctx.beginPath(); mctx.moveTo(foot.x, foot.y); mctx.lineTo(head.x, head.y); mctx.stroke();
  mctx.strokeStyle = col; mctx.lineWidth = Math.max(2, 0.45 * sc);
  mctx.beginPath(); mctx.moveTo(foot.x, foot.y); mctx.lineTo(head.x, head.y); mctx.stroke();
  const hr = Math.max(2.5, 0.3 * sc);
  mctx.beginPath(); mctx.arc(head.x, head.y, hr, 0, Math.PI * 2);
  mctx.fillStyle = side === 'me' ? '#cfe3ff' : '#ffd6d6'; mctx.fill();
  mctx.strokeStyle = dark; mctx.lineWidth = 1.5; mctx.stroke();
  if (isCtl) {
    mctx.beginPath(); mctx.ellipse(foot.x, foot.y, Math.max(5, 0.85 * sc), Math.max(2.5, 0.28 * sc), 0, 0, Math.PI * 2);
    mctx.strokeStyle = '#ffe66b'; mctx.lineWidth = 2.5; mctx.stroke();
  }
  mctx.font = 'bold ' + Math.max(8, Math.round(0.42 * sc)) + 'px sans-serif';
  mctx.textAlign = 'center'; mctx.textBaseline = 'middle';
  mctx.lineWidth = 2.5; mctx.strokeStyle = 'rgba(0,0,0,0.6)';
  mctx.strokeText(p.rating, head.x, head.y - hr - 6);
  mctx.fillStyle = '#fff'; mctx.fillText(p.rating, head.x, head.y - hr - 6);
}

function mDrawBall() {
  const X = mWX(match.ball.x), Z = mWZ(match.ball.y);
  const h = match.ball.z;
  const foot = mProject(X, 0, Z); if (!foot) return;
  const sc = foot.scale;
  const shrink = clamp(1 - h / 12, 0.3, 1);
  mctx.fillStyle = 'rgba(0,0,0,0.3)';
  mctx.beginPath(); mctx.ellipse(foot.x, foot.y, Math.max(2, 0.45 * sc * shrink), Math.max(1, 0.16 * sc * shrink), 0, 0, Math.PI * 2); mctx.fill();
  const c = mProject(X, h + 0.4, Z); if (!c) return;
  const r = Math.max(3, 0.42 * c.scale);
  mctx.beginPath(); mctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  mctx.fillStyle = '#fff'; mctx.fill();
  mctx.strokeStyle = '#222'; mctx.lineWidth = 1.5; mctx.stroke();
  mctx.beginPath(); mctx.arc(c.x, c.y, r * 0.34, 0, Math.PI * 2);
  mctx.fillStyle = '#222'; mctx.fill();
}

function updateMatchVisual(dt) {}

function endMatch() {
  if (!match) return;
  match.running = false;
  clearInterval(match.timer);
  const won = match.myGoals > match.botGoals;
  const draw = match.myGoals === match.botGoals;
  let fans = 10, text = 'Поражение 😔';
  if (won) { fans = match.opp.fansWin; text = 'ПОБЕДА! 🏆'; }
  else if (draw) { fans = match.opp.fansDraw; text = 'Ничья 🤝'; }
  state.fans += fans;
  if (won && match.opp.id !== 'pvp') {
    state.matchesWon = (state.matchesWon || 0) + 1;
    if (!state.beatenOpponents.includes(match.opp.id)) state.beatenOpponents.push(match.opp.id);
  }
  if (won && match.opp.id === 'pvp') state.pvpWins = (state.pvpWins || 0) + 1;
  save();
  renderTop();
  showEndCard(text, fans);
}

function showEndCard(text, fans) {
  const el = $('#end-card');
  el.innerHTML = `
    <h2>${text}</h2>
    <div class="end-score">${match.myGoals} : ${match.botGoals}</div>
    <div class="end-reward">+${fans} 👥 фанатов</div>
    <div class="ms-line">Против: ${match.opp.emoji} ${match.opp.name}</div>
    <div class="end-btns">
      <button class="btn btn-primary" id="end-arena">⚔ В арену</button>
      <button class="btn" id="end-world">В мир</button>
    </div>`;
  $('#match-end').classList.remove('hidden');
  $('#end-arena').onclick = () => { $('#match-end').classList.add('hidden'); showScreen('arena'); };
  $('#end-world').onclick = () => { $('#match-end').classList.add('hidden'); showScreen('world'); };
}

function possessionPct() {
  const a = myStats(), b = botStats();
  const f = FORMATIONS[state.formation];
  const up = state.upgrades.possession * 0.02;
  let p = 50 + (a.overall - b.overall) * 0.8 + (f.poss + up) * 100;
  return clamp(Math.round(p), 18, 82);
}

// ---------- Модалки / матч-контролы ----------
function showModal(html) {
  const m = $('#match-modal');
  m.innerHTML = html;
  m.classList.remove('hidden');
}
function hideModal() { $('#match-modal').classList.add('hidden'); }

function bindMatchControls() {
  $('#match-pause').onclick = () => {
    if (!match) return;
    match.paused = !match.paused;
    $('#match-pause').textContent = match.paused ? '▶ Продолжить' : '⏸ Пауза';
  };
  $('#match-sub').onclick = () => { if (match) openSubModal(); };
  $('#match-tactic').onclick = () => { if (match) openTacticModal(); };
  const passBtn = $('#mj-pass');
  if (passBtn) {
    passBtn.onclick = doPass;
    passBtn.addEventListener('pointerdown', e => { e.preventDefault(); doPass(); });
  }
  const shootBtn = $('#mj-shoot');
  if (shootBtn) {
    shootBtn.onclick = doShoot;
    shootBtn.addEventListener('pointerdown', e => { e.preventDefault(); doShoot(); });
  }
  bindMatchJoystick();
}

function bindMatchJoystick() {
  const stick = $('#mj-stick'), knob = $('#mj-knob');
  if (!stick || !knob) return;
  const R = 40;
  let dragging = false;
  const move = (clientX, clientY) => {
    const r = stick.getBoundingClientRect();
    let dx = clientX - (r.left + r.width / 2);
    let dy = clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = dx / d * R; dy = dy / d * R; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const m = Math.hypot(dx, dy);
    match.joy = { active: m > 0.12, dx: m > 0.12 ? dx / R : 0, dy: m > 0.12 ? dy / R : 0 };
  };
  const reset = () => {
    dragging = false;
    knob.style.transform = 'translate(0,0)';
    match.joy = { active: false, dx: 0, dy: 0 };
    stick.classList.remove('mj-pressed');
  };
  stick.addEventListener('pointerdown', e => {
    dragging = true; stick.classList.add('mj-pressed'); stick.setPointerCapture(e.pointerId);
    move(e.clientX, e.clientY);
  });
  stick.addEventListener('pointermove', e => { if (dragging) move(e.clientX, e.clientY); });
  stick.addEventListener('pointerup', reset);
  stick.addEventListener('pointercancel', reset);
}

function openSubModal() {
  const left = 3 - match.subsUsed;
  const myOn = match.myLineup.map(getPlayer).filter(Boolean);
  let html = `<div class="modal-card"><h3>Замена (осталось ${left})</h3>
    <div class="shop-note">Шаг 1: выбери игрока, которого меняем</div><div class="modal-grid">`;
  for (const p of myOn) html += `<div class="modal-opt" data-subout="${p.id}">${p.rating} • ${p.name} (${POS_LABEL[p.pos]})</div>`;
  html += `</div><button class="modal-close" id="sub-cancel">Отмена</button></div>`;
  showModal(html);
  $$('#match-modal [data-subout]').forEach(el => el.onclick = () => showBenchPick(+el.dataset.subout));
  $('#sub-cancel').onclick = hideModal;
}

function showBenchPick(outId) {
  if (match.subsUsed >= 3) { toast('Замен больше нет!'); hideModal(); return; }
  const bench = state.players.filter(p => !match.myLineup.includes(p.id)).sort((a, b) => b.rating - a.rating);
  let html = `<div class="modal-card"><h3>Кого выпустить?</h3><div class="modal-grid">`;
  if (bench.length === 0) html += `<div class="shop-note">Скамейка пуста!</div>`;
  for (const p of bench) html += `<div class="modal-opt" data-subin="${p.id}">${p.rating} • ${p.name} (${POS_LABEL[p.pos]})</div>`;
  html += `</div><button class="modal-close" id="sub-cancel2">Назад</button></div>`;
  showModal(html);
  $$('#match-modal [data-subin]').forEach(el => el.onclick = () => applySub(outId, +el.dataset.subin));
  $('#sub-cancel2').onclick = openSubModal;
}

function applySub(outId, inId) {
  if (match.subsUsed >= 3) return;
  const outP = getPlayer(outId), inP = getPlayer(inId);
  if (!outP || !inP) return;
  match.myLineup = match.myLineup.map(id => id === outId ? inId : id);
  match.subsUsed++;
  // обновляем состав на поле: замена сохраняет позицию
  const idx = match.teams.me.findIndex(p => p.id === outId);
  if (idx >= 0) {
    const old = match.teams.me[idx];
    match.teams.me[idx] = { ...old, id: inId, name: inP.name, rating: inP.rating, pos: inP.pos };
  }
  addLog(`🔄 Замена: ${outP.name} → ${inP.name}`, 'sub');
  updateMatchUI();
  hideModal();
}

function openTacticModal() {
  let html = `<div class="modal-card"><h3>Смена тактики</h3><div class="modal-grid">`;
  for (const key of Object.keys(FORMATIONS)) {
    const f = FORMATIONS[key];
    html += `<div class="modal-opt" data-form="${key}">${f.name} • атака +${Math.round(f.att * 100)}% • защита ${f.def >= 0 ? '+' : ''}${Math.round(f.def * 100)}% • владение +${Math.round(f.poss * 100)}%</div>`;
  }
  html += `</div><button class="modal-close" id="form-cancel">Отмена</button></div>`;
  showModal(html);
  $$('#match-modal [data-form]').forEach(el => el.onclick = () => {
    state.formation = el.dataset.form;
    addLog(`📋 Тактика: ${FORMATIONS[el.dataset.form].name}`, 'sub');
    updateMatchUI(); hideModal();
  });
  $('#form-cancel').onclick = hideModal;
}

// ---------- Клавиатура ----------
document.addEventListener('keydown', e => {
  if (!match || activeScreen !== 'match') return;
  const k = e.key;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Spacebar'].includes(k)) e.preventDefault();
  if (k === 'Escape') return;
  match.keys = match.keys || {};
  match.keys[k] = true;
  if (k === ' ' || k === 'Spacebar') { doShoot(); }
  if (k === 'j' || k === 'J' || k === 'о' || k === 'О' || k === 'f' || k === 'F' || k === 'а' || k === 'А') { doShoot(); }
  if (k === 'e' || k === 'E' || k === 'у' || k === 'У') { doPass(); }
});
document.addEventListener('keyup', e => {
  if (!match || !match.keys) return;
  delete match.keys[e.key];
});
