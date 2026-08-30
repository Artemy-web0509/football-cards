// ============ МАТЧ: 3D-футбол в стиле FIFA ============
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

// ---------- Поле (нормированные координаты 0..1) ----------
const MATCH_L = 0.05, MATCH_R = 0.95, MATCH_T = 0.08, MATCH_B = 0.92;
const MATCH_GOAL_Y0 = 0.446, MATCH_GOAL_Y1 = 0.554;   // узкие ворота как в FIFA
const MATCH_DURATION = 240;
const MATCH_GRAVITY = 9;
const P_ACCEL = 6;          // ускорение игрока
const P_FRICTION = 4.5;     // инерция
const SPRINT_MULT = 1.55;   // множитель скорости на спринте
const SPRINT_DRAIN = 0.14;  // расход выносливости (в секунду)
const STAM_REGEN = 0.10;    // восстановление выносливости

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
    ball: { x: 0.5, y: 0.5, vx: 0, vy: 0, z: 0, vz: 0, spin: 0 },
    possession: 'me',
    possPlayer: null,
    controlIdx: 0,
    keys: {},
    joy: { active: false, dx: 0, dy: 0 },
    sprint: false,
    charging: false, charge: 0,
    kickCd: 0,
    phase: 'play',
    restart: null,
    lastTouchSide: null,
    goalLock: false,
    kickSide: 'me',
    cam: { cx: -17, cy: 11, cz: 7, tx: 8, ty: 1.3, tz: 0 },
    shotTimeout: 0,
  };
  buildMatchTeams();
  resetKickoff(match.kickSide);
  showScreen('match');
  resizeMatch();
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
        rows.push({
          id: p.id, name: p.name, pos, rating: p.rating,
          homeX: xMap[pos], homeY: y, x: xMap[pos], y,
          vx: 0, vy: 0, facing: 1, run: 0, stamina: 1, sprinting: false,
          passCd: rnd(0, 20) / 10, shootCd: rnd(0, 20) / 10, think: rnd(0, 10) / 10,
        });
      });
    }
    return rows;
  };
  match.teams.me = mk(match.myLineup);
  match.teams.bot = mk(match.botSquad).map(p => ({ ...p, homeX: 1 - p.homeX, x: 1 - p.x }));
}

function resetTeamsToHome() {
  for (const side of ['me', 'bot']) {
    for (const p of match.teams[side]) {
      p.x = p.homeX + (Math.random() - 0.5) * 0.03;
      p.y = p.homeY + (Math.random() - 0.5) * 0.03;
      p.vx = 0; p.vy = 0;
    }
  }
}

function resetKickoff(side) {
  resetTeamsToHome();
  match.ball = { x: 0.5, y: 0.5, vx: 0, vy: 0, z: 0, vz: 0, spin: 0 };
  match.kickSide = side || match.possession || 'me';
  match.possession = match.kickSide;
  match.possPlayer = null;
  match.phase = 'play';
  match.restart = null;
  match.kickCd = 0.4;
  match.goalLock = false;
  const taker = closestToBall(match.kickSide);
  if (taker) { match.possPlayer = taker; taker.x = 0.5 - (match.kickSide === 'me' ? 0.03 : -0.03); taker.y = 0.5; }
}

function myStats() { return teamStats(match.myLineup); }
function botStats() { return teamStats(match.botSquad); }

function playerSpeed(p, sprint) {
  const base = 0.5 + p.rating * 0.004;
  const st = 0.45 + 0.55 * p.stamina;
  return base * st * (sprint ? SPRINT_MULT : 1);
}

function closestToBall(side) {
  let best = null, bd = 1e9;
  for (const p of match.teams[side]) {
    const d = Math.hypot(p.x - match.ball.x, p.y - match.ball.y);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

function nearestOf(side) { return closestToBall(side); }

// Кем управляем: владелец мяча у моей команды, иначе ближайший полевой
function controlTarget() {
  const ball = match.ball;
  if (match.ctrlLock > 0) return match.teams.me[match.controlIdx] || null;
  if (match.possPlayer && match.teams.me.includes(match.possPlayer)) return match.possPlayer;
  let best = null, bd = 1e9;
  for (const p of match.teams.me) {
    if (p.pos === 'GK' && ball.x > 0.22) continue;
    const d = Math.hypot(p.x - ball.x, p.y - ball.y);
    if (d < bd) { bd = d; best = p; }
  }
  return best || closestToBall('me');
}

function setControl(idx) {
  match.controlIdx = clamp(idx, 0, match.teams.me.length - 1);
}

function switchPlayer() {
  if (!match) return;
  if (match.ctrlLock > 0) return;
  const ball = match.ball;
  const me = match.teams.me;
  let best = -1, bd = 1e9;
  for (let i = 0; i < me.length; i++) {
    if (i === match.controlIdx) continue;
    const p = me[i];
    const d = Math.hypot(p.x - ball.x, p.y - ball.y);
    if (d < bd) { bd = d; best = i; }
  }
  if (best >= 0) {
    setControl(best);
    match.ctrlLock = 0.9;
    const p = me[best];
    toast('🔄 Управляешь: ' + p.rating + ' ' + p.name);
  }
}

// ---------- Игровой цикл (вызывается каждый кадр из main.js) ----------
function updateMatchVisual(dt) {
  if (!match || !match.running) return;
  if (match.paused) return;
  const s = Math.min(dt, 0.05);
  mdt = s;
  stepMatchSeconds(s);
}

function stepMatch() { if (match) stepMatchSeconds(0.033); }

function stepMatchSeconds(dt) {
  const ball = match.ball;
  match.timeLeft -= dt;
  if (match.timeLeft <= 0) { endMatch(); return; }
  match.minute = Math.floor((1 - match.timeLeft / MATCH_DURATION) * 90);
  if (match.kickCd > 0) match.kickCd -= dt;
  if (match.shotTimeout > 0) match.shotTimeout -= dt;
  if (match.ctrlLock > 0) match.ctrlLock -= dt;
  if (match.charging) match.charge = clamp(match.charge + dt * 1.4, 0, 1);

  // Фазы перерыва (аут, угловой, от ворот, штрафной)
  if (match.phase !== 'play') {
    if (match.restart) {
      match.restart.t -= dt;
      const side = match.restart.side;
      if (match.restart.t <= 0) {
        match.phase = 'play';
        match.possession = side;
        match.possPlayer = closestToBall(side);
        match.restart = null;
      }
      // во время перерыва можно шевелиться зажаринным игроком
      if (side === 'me') {
        const ctl = match.teams.me[match.controlIdx];
        if (ctl) stepMyAIControl(ctl, dt);
      }
    }
    updateStamina(dt);
    holdFormation(dt);
    return;
  }

  const ctl = controlTarget();
  if (ctl) match.controlIdx = match.teams.me.indexOf(ctl);

  stepMyAIControl(ctl, dt);
  stepMyTeammates(ctl, dt);

  stepMyGK(dt);
  stepBotGK(dt);
  stepBotAI(dt);

  stepBall(dt);

  if (match.possPlayer) {
    match.possession = match.teams.me.includes(match.possPlayer) ? 'me' : 'bot';
    match.lastTouchSide = match.possession;
    glueBall(match.possPlayer);
  } else {
    pickupBall(dt);
  }

  detectTackles(dt);
  checkGoal();
  checkOutOfBounds();
  updateStamina(dt);
  updateMatchUI();
}

// ---------- Выносливость ----------
function updateStamina(dt) {
  for (const side of ['me', 'bot']) {
    for (const p of match.teams[side]) {
      if (p.sprinting) {
        p.stamina = Math.max(0, p.stamina - SPRINT_DRAIN * dt);
        if (p.stamina <= 0.02) p.sprinting = false;
      } else {
        p.stamina = Math.min(1, p.stamina + STAM_REGEN * dt);
      }
    }
  }
}

// ---------- Управление своим игроком ----------
function stepMyAIControl(ctl, dt) {
  if (!ctl) return;
  let mx = 0, my = 0;
  const k = match.keys || {};
  if (k['ArrowUp'] || k['w'] || k['W'] || k['ц'] || k['Ц']) mx += 1;
  if (k['ArrowDown'] || k['s'] || k['S'] || k['ы'] || k['Ы']) mx -= 1;
  if (k['ArrowLeft'] || k['a'] || k['A'] || k['ф'] || k['Ф']) my -= 1;
  if (k['ArrowRight'] || k['d'] || k['D'] || k['в'] || k['В']) my += 1;
  if (k['Shift'] || k['ShiftLeft'] || k['ShiftRight'] || k['z'] || k['Z'] || k['я'] || k['Я']) match.sprint = true;
  if (match.joy && match.joy.active) { mx += match.joy.dy * 1.4; my += match.joy.dx * 1.4; }
  const len = Math.hypot(mx, my);
  let tx = ctl.x, ty = ctl.y;
  if (len > 0.01) {
    mx /= len; my /= len;
    const sp = playerSpeed(ctl, match.sprint);
    ctl.sprinting = match.sprint && ctl.stamina > 0.03;
    const cvx = mx * sp, cvy = my * sp;
    accelToward(ctl, cvx, cvy, dt);
    tx = clamp(ctl.x, MATCH_L + 0.02, MATCH_R - 0.02);
    ty = clamp(ctl.y, MATCH_T + 0.02, MATCH_B - 0.02);
    ctl.x = tx; ctl.y = ty;
    if (Math.abs(cvx) > 0.01 || Math.abs(cvy) > 0.01) ctl.facing = Math.atan2(cvy, cvx);
  } else {
    ctl.sprinting = false;
    accelToward(ctl, 0, 0, dt);
  }
}

function accelToward(p, tvx, tvy, dt) {
  const k = Math.min(1, dt * P_ACCEL);
  p.vx += (tvx - p.vx) * k;
  p.vy += (tvy - p.vy) * k;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.x = clamp(p.x, MATCH_L + 0.02, MATCH_R - 0.02);
  p.y = clamp(p.y, MATCH_T + 0.02, MATCH_B - 0.02);
  if (!tvx && !tvy) {
    const f = Math.max(0, 1 - dt * P_FRICTION);
    p.vx *= f; p.vy *= f;
  }
}

function moveToPos(p, tx, ty, dt, sprint) {
  const dx = tx - p.x, dy = ty - p.y;
  const d = Math.hypot(dx, dy);
  const sp = playerSpeed(p, sprint) * Math.min(1, d * 6);
  const k = Math.min(1, dt * P_ACCEL);
  const cvx = d > 0.002 ? (dx / d) * sp : 0;
  const cvy = d > 0.002 ? (dy / d) * sp : 0;
  p.vx += (cvx - p.vx) * k;
  p.vy += (cvy - p.vy) * k;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.x = clamp(p.x, MATCH_L + 0.02, MATCH_R - 0.02);
  p.y = clamp(p.y, MATCH_T + 0.02, MATCH_B - 0.02);
  if (Math.abs(cvx) > 0.01 || Math.abs(cvy) > 0.01) p.facing = Math.atan2(cvy, cvx);
}

// ---------- Ведение мяча / приём ----------
function glueBall(p) {
  const b = match.ball;
  const c = Math.cos(p.facing), s = Math.sin(p.facing);
  b.x = p.x + c * 0.035;
  b.y = p.y + s * 0.035;
  b.z = 0; b.vz = 0;
  b.vx = p.vx * 0.7; b.vy = p.vy * 0.7;
  // спринт с мячом — мяч уходит чуть вперёд
  b.x += c * 0.012; b.y += s * 0.012;
  b.spin += Math.hypot(p.vx, p.vy) * mdt;
}

function pickupBall(dt) {
  const b = match.ball;
  if (b.z > 0.12) return;
  const moving = Math.hypot(b.vx, b.vy);
  const maxSpd = moving < 0.03 ? 0.055 : 0.032;
  let best = null, bd = maxSpd;
  for (const side of ['me', 'bot']) {
    for (const p of match.teams[side]) {
      const d = Math.hypot(p.x - b.x, p.y - b.y);
      if (d < bd) { bd = d; best = p; }
    }
  }
  if (best) {
    match.possPlayer = best;
    match.possession = match.teams.me.includes(best) ? 'me' : 'bot';
    match.lastTouchSide = match.possession;
  }
}

function detectTackles(dt) {
  const b = match.ball;
  if (!match.possPlayer) return;
  const owner = match.possPlayer;
  const ownerSide = match.teams.me.includes(owner) ? 'me' : 'bot';
  const oppSide = ownerSide === 'me' ? 'bot' : 'me';
  const opps = match.teams[oppSide];
  let pressed = null;
  for (const p of opps) {
    if (p.pos === 'GK') continue;
    const d = Math.hypot(p.x - b.x, p.y - b.y);
    if (d < 0.09) { pressed = p; break; }
  }
  if (!pressed) return;
  const chance = clamp(0.16 + (pressed.rating - owner.rating) * 0.008, 0.04, 0.5) * dt * 14;
  if (Math.random() < chance) {
    match.possPlayer = null;
    match.ball.vx = (b.x > pressed.x ? 1 : -1) * rnd(20, 45) / 100;
    match.ball.vy = rnd(-30, 30) / 100;
    match.ball.z = 0.05; match.ball.vz = rnd(15, 30) / 10;
    addLog('⚔ Отбор: ' + pressed.name + ' (' + oppSide + ')', 'sub');
  }
}

// ---------- Формация / ИИ моей команды ----------
function formationTarget(side, p) {
  const ball = match.ball;
  const attacking = (match.possession === side);
  const fwd = side === 'me' ? 0.06 : -0.06;
  const back = side === 'me' ? -0.04 : 0.04;
  let tx = p.homeX + (attacking ? fwd : back);
  let ty = p.homeY + (ball.y - p.homeY) * (attacking ? 0.22 : 0.16);
  // линия офсайда: атакующие не убегают дальше соперников
  const dir = side === 'me' ? 1 : -1;
  const line = offsideLine(side);
  if (attacking && line !== null) tx = dir > 0 ? Math.min(tx, line - 0.01) : Math.max(tx, line + 0.01);
  tx = clamp(tx, MATCH_L + 0.02, MATCH_R - 0.02);
  ty = clamp(ty, MATCH_T + 0.02, MATCH_B - 0.02);
  return { tx, ty };
}

function offsideLine(side) {
  const opps = match.teams[side === 'me' ? 'bot' : 'me'];
  const others = opps.filter(p => p.pos !== 'GK').map(p => p.x);
  if (!others.length) return null;
  others.sort((a, b) => side === 'me' ? b - a : a - b);
  return others[0];
}

function holdFormation(dt) {
  // во время перерыва игроки спокойно занимают позиции
  for (const side of ['me', 'bot']) {
    for (const p of match.teams[side]) {
      if (side === 'me' && p === match.teams.me[match.controlIdx]) continue;
      if (match.restart && match.restart.side === side && side === 'me') {
        const d = Math.hypot(p.x - match.ball.x, p.y - match.ball.y);
        if (d < 0.06 && p.pos !== 'GK') continue;
      }
      const t = formationTarget(side, p);
      moveToPos(p, t.tx, t.ty, dt, false);
      p.sprinting = false;
    }
  }
}

function stepMyTeammates(ctl, dt) {
  const ball = match.ball;
  for (const p of match.teams.me) {
    if (p === ctl || p.pos === 'GK') continue;
    if (match.possPlayer && match.possPlayer === p) { p.facing = Math.atan2(ball.y - p.y, ball.x - p.x); continue; }
    const attacking = match.possession === 'me';
    let tx, ty;
    if (attacking) {
      // поддержка атаки: ближайший открывается, остальные в линии
      const t = formationTarget('me', p);
      const runBoost = ball.x > 0.45 ? 0.05 : 0;
      tx = clamp(t.tx + runBoost, MATCH_L + 0.02, MATCH_R - 0.02);
      ty = t.ty + (Math.sin(performance.now() / 900 + p.id) * (attacking ? 0.03 : 0));
    } else {
      if (p === nearestOf('me')) { tx = ball.x; ty = ball.y; }
      else { const t = formationTarget('me', p); tx = t.tx; ty = t.ty; }
    }
    moveToPos(p, tx, ty, dt, false);
  }
}

// ---------- ИИ моего вратаря ----------
function stepMyGK(dt) {
  const gkt = match.ball.x;
  let gk = null;
  for (const p of match.teams.me) if (p.pos === 'GK') { gk = p; break; }
  if (!gk) return;
  if (gkt < 0.35) {
    gk.y = clamp(match.ball.y, MATCH_GOAL_Y0 - 0.05, MATCH_GOAL_Y1 + 0.05);
    gk.facing = Math.atan2(match.ball.y - gk.y, match.ball.x - gk.x);
  } else {
    gk.y += (0.5 - gk.y) * Math.min(1, dt * 1.8);
  }
  gk.x = MATCH_L + 0.04;
  gk.vx = 0; gk.vy = 0;
}

// ---------- ИИ соперника ----------
function stepBotGK(dt) {
  let gk = null;
  for (const p of match.teams.bot) if (p.pos === 'GK') { gk = p; break; }
  if (!gk) return;
  if (match.ball.x > 0.65) {
    gk.y = clamp(match.ball.y, MATCH_GOAL_Y0 - 0.05, MATCH_GOAL_Y1 + 0.05);
    gk.facing = Math.atan2(match.ball.y - gk.y, match.ball.x - gk.x);
  } else {
    gk.y += (0.5 - gk.y) * Math.min(1, dt * 1.8);
  }
  gk.x = MATCH_R - 0.04;
  gk.vx = 0; gk.vy = 0;
}

function botPassCooldown(p, dt) { if (p.passCd > 0) p.passCd -= dt; }
function botShotCooldown(p, dt) { if (p.shootCd > 0) p.shootCd -= dt; }

function stepBotAI(dt) {
  const ball = match.ball;
  for (const p of match.teams.bot) {
    if (p.pos === 'GK') continue;
    botPassCooldown(p, dt);
    botShotCooldown(p, dt);
    p.think -= dt;
    if (p === match.possPlayer) {
      // владелец: думает и решает
      if (p.think <= 0) botCarrierThink(p);
      // ведение к воротам, но с случайными зигзагами
      const goalX = MATCH_L;
      const targetX = clamp(ball.x - 0.05, MATCH_L + 0.02, MATCH_R - 0.02);
      const targetY = clamp(ball.y + (Math.sin(performance.now() / 700 + p.id) * 0.05), MATCH_T + 0.02, MATCH_B - 0.02);
      const tx = targetX, ty = targetY;
      moveToPos(p, tx, ty, dt, true);
      p.sprinting = true;
      continue;
    }
    if (match.possession === 'bot') {
      // свои ребята: открываются
      const t = formationTarget('bot', p);
      moveToPos(p, t.tx, t.ty, dt, false);
    } else {
      // оборона: ближайший прессингует
      if (p === nearestOf('bot')) moveToPos(p, ball.x, ball.y, dt, true);
      else {
        const t = formationTarget('bot', p);
        // лёгкий сдвиг к мячу
        const tx = t.tx * 0.85 + ball.x * 0.15;
        const ty = t.ty * 0.85 + ball.y * 0.15;
        moveToPos(p, clamp(tx, MATCH_L + 0.02, MATCH_R - 0.02), clamp(ty, MATCH_T + 0.02, MATCH_B - 0.02), dt, false);
      }
    }
  }
}

function botCarrierThink(p) {
  const ball = match.ball;
  p.think = rnd(15, 40) / 10;
  const distGoal = Math.abs(MATCH_L - ball.x);
  const nearGoal = distGoal < 0.28;
  const friends = match.teams.bot.filter(f => f !== p && f.pos !== 'GK');

  // пас вперёд
  if (p.passCd <= 0 && Math.random() < (nearGoal ? 0.25 : 0.5) && friends.length) {
    const forward = friends.filter(f => f.x < ball.x - 0.08);
    const target = (forward.length && Math.random() < 0.7 ? forward : friends)[0];
    if (target) { botPass(p, target); return; }
  }
  // удар
  if (p.shootCd <= 0 && nearGoal && Math.random() < 0.5) {
    botShoot(p);
    return;
  }
  // иначе вести дальше
}

function botPass(p, target) {
  const ball = match.ball;
  const dx = target.x - ball.x, dy = target.y - ball.y;
  const d = Math.hypot(dx, dy) || 1;
  const power = clamp(0.85 + d * 0.4, 0.9, 1.35);
  ball.vx = (dx / d) * power;
  ball.vy = (dy / d) * power;
  ball.vz = clamp(power * 0.55, 2, 6);
  ball.z = 0.12;
  match.possPlayer = null;
  match.possession = 'me';
  match.lastTouchSide = 'bot';
  p.passCd = rnd(15, 25) / 10;
  addLog('🎯 Пас соперника: ' + p.name + ' → ' + target.name, 'info');
}

function botShoot(p) {
  const ball = match.ball;
  const accuracy = clamp(0.6 + p.rating * 0.002, 0.6, 0.9);
  const tyTarget = Math.random() < accuracy ? (MATCH_GOAL_Y0 + (MATCH_GOAL_Y1 - MATCH_GOAL_Y0) * Math.random()) : (0.2 + Math.random() * 0.6);
  const dx = MATCH_L - ball.x, dy = tyTarget - ball.y;
  const dl = Math.hypot(dx, dy) || 1;
  const power = clamp(1.1 + p.rating * 0.003 + (Math.random() * 0.1), 1.1, 1.5);
  ball.vx = (dx / dl) * power;
  ball.vy = (dy / dl) * power;
  ball.vz = clamp(power * 0.45, 3, 7);
  ball.z = 0.15;
  match.possPlayer = null;
  match.possession = 'me';
  match.lastTouchSide = 'bot';
  p.shootCd = rnd(18, 30) / 10;
  addLog('💨 ' + p.name + ' бьёт по воротам!', 'danger');
}

// ---------- Мяч ----------
function stepBall(dt) {
  const b = match.ball;
  const air = b.z > 0.05;
  const damp = air ? 0.5 : 0.28;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;
  b.vz -= MATCH_GRAVITY * dt;
  if (b.z <= 0) {
    b.z = 0;
    b.vz = b.vz < -1 ? -b.vz * 0.4 : 0;
  }
  b.vx *= Math.pow(damp, dt);
  b.vy *= Math.pow(damp, dt);
  b.spin += Math.hypot(b.vx, b.vy) * dt * 2;
  if (Math.abs(b.vx) < 0.002 && Math.abs(b.vy) < 0.002) { b.vx = 0; b.vy = 0; }
  // не вылетаем за пределы при игре
  b.x = clamp(b.x, MATCH_L - 0.05, MATCH_R + 0.05);
  b.y = clamp(b.y, MATCH_T - 0.05, MATCH_B + 0.05);
}

// ---------- Пас (короткий) ----------
function pickPassTarget() {
  const ball = match.ball;
  const me = match.teams.me.filter(p => p.pos !== 'GK' && p !== match.possPlayer);
  let best = null, bd = 1e9;
  for (const p of me) {
    const d = Math.hypot(p.x - ball.x, p.y - ball.y);
    const bonusForward = Math.max(0, p.x - ball.x) * 2;
    const openBonus = offsideOK('me', p) ? 0 : 0.2;
    const score = d - bonusForward - openBonus;
    if (score < bd) { bd = score; best = p; }
  }
  return best || me[0] || null;
}

function offsideOK(side, p) {
  return p.x < (side === 'me' ? 0.5 : 0.5) + 0.0 || (offsideLine(side) === null || (side === 'me' ? p.x < offsideLine(side) : p.x > offsideLine(side)));
}

function doPass() {
  if (!match || !match.running) return;
  if (match.kickCd > 0) return;
  const ctl = match.possPlayer && match.teams.me.includes(match.possPlayer) ? match.possPlayer : closestToBall('me');
  const d = Math.hypot(ctl.x - match.ball.x, ctl.y - match.ball.y);
  if (d > 0.06) { toast('Подойди к мячу, чтобы пасовать!'); return; }
  const target = pickPassTarget();
  if (!target) return;
  const dx = target.x - match.ball.x, dy = target.y - match.ball.y;
  const dl = Math.hypot(dx, dy) || 1;
  const power = clamp(0.9 + dl * 0.35, 0.9, 1.3);
  match.ball.vx = (dx / dl) * power;
  match.ball.vy = (dy / dl) * power;
  match.ball.vz = clamp(power * 0.55, 2, 6);
  match.ball.z = 0.12;
  match.possPlayer = null;
  match.possession = 'me';
  match.lastTouchSide = 'me';
  match.kickCd = 0.28;
  addLog('🎯 Пас ' + ctl.name + ' → ' + target.name, 'sub');
}

// ---------- Пас вразрез (через) ----------
function doThrough() {
  if (!match || !match.running) return;
  if (match.kickCd > 0) return;
  const ctl = match.possPlayer && match.teams.me.includes(match.possPlayer) ? match.possPlayer : closestToBall('me');
  const d = Math.hypot(ctl.x - match.ball.x, ctl.y - match.ball.y);
  if (d > 0.06) { toast('Подойди к мячу, чтобы сыграть вразрез!'); return; }
  // точка впереди за спину защитникам
  const line = offsideLine('me');
  let tx = (line !== null ? line - 0.02 : MATCH_R - 0.3);
  tx = clamp(tx, 0.5, MATCH_R - 0.15);
  const ty = closestToBall('me');
  const targetY = ty ? clamp(ty.y + (Math.random() - 0.5) * 0.12, MATCH_T + 0.04, MATCH_B - 0.04) : 0.5;
  const dx = tx - match.ball.x, dy = targetY - match.ball.y;
  const dl = Math.hypot(dx, dy) || 1;
  const power = clamp(0.95 + dl * 0.3, 0.95, 1.4);
  match.ball.vx = (dx / dl) * power;
  match.ball.vy = (dy / dl) * power;
  match.ball.vz = clamp(power * 0.65, 3, 7);
  match.ball.z = 0.15;
  match.possPlayer = null;
  match.possession = 'me';
  match.lastTouchSide = 'me';
  match.kickCd = 0.35;
  addLog('🚀 Вразрез! ' + ctl.name, 'sub');
}

// ---------- Удар (с силой 0..1) ----------
function doShoot(charge) {
  if (!match || !match.running) return;
  if (match.kickCd > 0) return;
  const ctl = match.possPlayer && match.teams.me.includes(match.possPlayer) ? match.possPlayer : closestToBall('me');
  const d = Math.hypot(ctl.x - match.ball.x, ctl.y - match.ball.y);
  if (d > 0.06) { toast('Подойди к мячу, чтобы ударить!'); return; }
  const power = clamp(charge || 0.75, 0.25, 1);
  const accuracy = clamp(0.62 + ctl.rating * 0.0025, 0.62, 0.92) * (1 - power * 0.25);
  const inGoal = Math.random() < accuracy;
  let tyTarget;
  if (inGoal) tyTarget = MATCH_GOAL_Y0 + (MATCH_GOAL_Y1 - MATCH_GOAL_Y0) * (0.35 + Math.random() * 0.3);
  else tyTarget = 0.15 + Math.random() * 0.7;
  const dx = MATCH_R - match.ball.x, dy = tyTarget - match.ball.y;
  const dl = Math.hypot(dx, dy) || 1;
  const speed = clamp(1.25 + power * 0.5 + d * 0.2, 1.25, 1.75);
  const kickMult = accuracy > 0.5 ? 1 : 0.92;
  match.ball.vx = (dx / dl) * speed * kickMult;
  match.ball.vy = (dy / dl) * speed * kickMult;
  match.ball.vz = clamp(power * 2.2 + 3, 3, 7);
  match.ball.z = 0.18;
  match.possPlayer = null;
  match.possession = 'me';
  match.lastTouchSide = 'me';
  match.kickCd = 0.5;
  match.shotTimeout = 3;
  addLog('⚽ Удар ' + ctl.name + ' по воротам!', 'goal');
}

// ---------- Голы + сейвы вратарей ----------
function trySave(goalSide, shooterSide) {
  let gk = null;
  for (const p of match.teams[goalSide]) if (p.pos === 'GK') gk = p;
  if (!gk) return false;
  const b = match.ball;
  const dist = Math.hypot(b.x - (goalSide === 'me' ? MATCH_L : MATCH_R), b.y - gk.y);
  const spd = Math.hypot(b.vx, b.vy);
  const chance = clamp(0.3 - dist * 0.3 - spd * 0.1 + (gk.rating - 72) * 0.02, 0.05, 0.8);
  if (Math.random() < chance) {
    // вратарь парирует
    b.vx = -(b.vx || 0.04) * 0.4;
    b.vy = rnd(-50, 50) / 100;
    b.vz = rnd(30, 60) / 10;
    b.z = 0.15;
    addLog('🧤 Сейв вратаря! (' + gk.name + ')', 'info');
    return true;
  }
  return false;
}

function checkGoal() {
  const b = match.ball;
  if (match.goalLock) return;
  if (b.x <= MATCH_L + 0.015 && b.y > MATCH_GOAL_Y0 && b.y < MATCH_GOAL_Y1 && b.z < 3) {
    if (trySave('me', 'bot')) return;
    match.goalLock = true;
    match.botGoals++;
    const sc = match.lastTouchSide === 'bot' ? closestToBall('bot') : null;
    addLog('😱 ГОЛ СОПЕРНИКА: ' + (sc ? sc.name : '??'), 'danger');
    showGoalBanner('⚽ ГОЛ ' + match.opp.name + '!<br>🟥');
    setTimeout(() => { if (match) { match.goalLock = false; resetKickoff('me'); } }, 1600);
    return;
  }
  if (b.x >= MATCH_R - 0.015 && b.y > MATCH_GOAL_Y0 && b.y < MATCH_GOAL_Y1 && b.z < 3) {
    if (trySave('bot', 'me')) return;
    match.goalLock = true;
    match.myGoals++;
    const sc = match.lastTouchSide === 'me' ? closestToBall('me') : null;
    addLog('⚽ ГОЛ! ' + (sc ? sc.name : '??'), 'goal');
    showGoalBanner('⚽ ГОЛ!<br>' + (sc ? sc.name : '??') + ' 🟦');
    match.kickSide = 'bot';
    setTimeout(() => { if (match) { match.goalLock = false; resetKickoff('bot'); } }, 1600);
    return;
  }
}

// ---------- Ауты, угловые, от ворот ----------
function checkOutOfBounds() {
  const b = match.ball;
  if (b.z > 0.1) return;
  const out = !(b.x > MATCH_L + 0.005 && b.x < MATCH_R - 0.005 && b.y > MATCH_T + 0.005 && b.y < MATCH_B - 0.005);
  if (!out) return;
  const last = match.lastTouchSide;
  // аут (боковая линия)
  if (b.y <= MATCH_T || b.y >= MATCH_B) {
    const side = last === 'bot' ? 'me' : 'bot';
    const px = clamp(b.x, MATCH_L + 0.05, MATCH_R - 0.05);
    const py = b.y <= MATCH_T ? MATCH_T + 0.01 : MATCH_B - 0.01;
    addLog('↔️ Аут — вбрасывание ' + (side === 'me' ? 'вашей команды' : 'соперника'), 'info');
    restartBall('throwin', side, px, py);
    return;
  }
  // линия ворот
  if (b.x <= MATCH_L) {
    if (last === 'bot') { restartBall('corner', 'me', MATCH_L + 0.01, b.y <= 0.5 ? MATCH_T + 0.01 : MATCH_B - 0.01); addLog('🚩 Угловой для вас!', 'info'); }
    else { restartBall('goalkick', 'bot', MATCH_L + 0.1, 0.5); addLog('🧤 От ворот: соперник', 'info'); }
    return;
  }
  if (b.x >= MATCH_R) {
    if (last === 'me') { restartBall('corner', 'bot', MATCH_R - 0.01, b.y <= 0.5 ? MATCH_T + 0.01 : MATCH_B - 0.01); addLog('🚩 Угловой у соперника', 'info'); }
    else { restartBall('goalkick', 'me', MATCH_R - 0.1, 0.5); addLog('🧤 От ворот: ваша команда', 'info'); }
  }
}

function restartBall(type, side, px, py) {
  match.ball = { x: px, y: py, vx: 0, vy: 0, z: 0, vz: 0, spin: 0 };
  match.possPlayer = null;
  match.possession = side;
  match.phase = 'restart';
  match.restart = { type, side, t: 0.9 };
  // ставим игрока к мячу
  const taker = closestToBall(side);
  if (taker && taker.pos !== 'GK') {
    taker.x = px + (side === 'me' ? -0.02 : 0.02);
    taker.y = py;
  }
  for (const s of ['me', 'bot']) {
    for (const p of match.teams[s]) {
      if (p === taker) continue;
      p.x += (p.homeX - p.x) * 0.15;
      p.y += (p.homeY - p.y) * 0.2;
    }
  }
}

// ---------- UI ----------
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

// ---------- Визуализация 3D ----------
const mc = $('#match-canvas');
const mctx = mc.getContext('2d');
let mW = 560, mH = 360;
const PITCH_LEN = 105, PITCH_WID = 68;

// толпа на трибунах (детерминированно)
const CROWD = [];
(function buildCrowd() {
  const TONES = ['#e8e2d2', '#d9d2be', '#f2eee0', '#cdbfa8', '#ffffff', '#e3b378'];
  const rows = 3, perRow = 17;
  const x0 = -PITCH_LEN / 2 - 8, x1 = PITCH_LEN / 2 + 8;
  const z0 = PITCH_WID / 2 + 7;
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < perRow; i++) {
      const x = x0 + (x1 - x0) * (i / (perRow - 1)) + (Math.random() - 0.5) * 2;
      const z = z0 + r * 2.4 + (Math.random() - 0.5) * 1.4;
      CROWD.push({ x, z, c: TONES[Math.floor(Math.random() * TONES.length)] });
    }
  }
  const perSide = 6;
  for (let r = 0; r < 2; r++) {
    for (let i = 0; i < perSide; i++) {
      const x = -PITCH_LEN / 2 - 6 + (Math.random() - 0.5) * 4;
      const z = -PITCH_WID / 2 * 0.6 + (PITCH_WID * 0.6) * (i / (perSide - 1)) + (Math.random() - 0.5) * 2;
      CROWD.push({ x, z, c: TONES[Math.floor(Math.random() * TONES.length)] });
    }
  }
})();

function resizeMatch() {
  mW = mc.clientWidth || 560;
  mH = mc.clientHeight || 360;
  mc.width = mW; mc.height = mH;
}
function mWX(xn) { return (xn - 0.5) * PITCH_LEN; }
function mWZ(yn) { return (yn - 0.5) * PITCH_WID; }
function mHalfW() { return mW / 2; }
function mHalfH() { return mH / 2; }
function mFocal() { const fov = 64 * Math.PI / 180; return (mW / 2) / Math.tan(fov / 2); }

function mEnsureCam() {
  if (!match.cam) match.cam = { cx: -17, cy: 11, cz: 7, tx: 8, ty: 1.3, tz: 0 };
}
function mUpdateCam() {
  mEnsureCam();
  const bX = mWX(match.ball.x), bZ = mWZ(match.ball.y);
  // камера всегда за спиной атаки: смотрим в сторону ворот соперника (+x)
  const tx = bX + 9, tz = bZ * 0.35;
  const cx = bX - 17, cz = bZ * 0.35 + 7;
  const cy = 11;
  const c = match.cam, k = 0.09;
  c.cx += (cx - c.cx) * k; c.cy += (cy - c.cy) * k; c.cz += (cz - c.cz) * k;
  c.tx += (tx - c.tx) * k; c.ty += (1.3 - c.ty) * k; c.tz += (tz - c.tz) * k;
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
function mFog(depth) { return clamp((depth - 26) / 55, 0, 0.6); }
function mQuad(pts, color, depth) {
  const sp = pts.map(p => mProject(p[0], p[1], p[2]));
  if (sp.some(s => !s)) return;
  mctx.beginPath(); mctx.moveTo(sp[0].x, sp[0].y);
  for (let i = 1; i < sp.length; i++) mctx.lineTo(sp[i].x, sp[i].y);
  mctx.closePath();
  if (depth != null) {
    const a = mFog(depth);
    if (a > 0) { mctx.save(); mctx.globalAlpha = 1; mctx.fillStyle = color; mctx.fill(); mctx.fillStyle = 'rgba(8,30,16,' + a + ')'; mctx.fill(); mctx.restore(); return; }
  }
  mctx.fillStyle = color; mctx.fill();
}
function mLine(x0, z0, x1, z1, depth, color, lw) {
  const a = mProject(x0, 0, z0), b = mProject(x1, 0, z1);
  if (!a || !b) return;
  if (depth != null) { const a2 = mFog(depth); if (a2 > 0) mctx.strokeStyle = 'rgba(255,255,255,' + (0.85 * (1 - a2)) + ')'; }
  mctx.strokeStyle = color || mctx.strokeStyle;
  mctx.lineWidth = lw || 2;
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
function mGoal(x, z0, w, color) {
  const depth = 2.4, h = 2.44;
  const back = x + Math.sign(x) * depth;
  const col = color || 'rgba(255,255,255,0.85)';
  mLine(x, z0, back, z0, null, col, 3);
  mLine(back, z0, back, z0 + w, null, col, 3);
  mLine(back, z0 + w, x, z0 + w, null, col, 3);
  mLine(x, z0 + w, x, z0, null, col, 3);
  const a = mProject(x, h, z0), b = mProject(x, h, z0 + w);
  if (a && b) { mctx.beginPath(); mctx.moveTo(a.x, a.y); mctx.lineTo(b.x, b.y); mctx.stroke(); }
  // сетка
  const N = 6;
  for (let i = 1; i < N; i++) {
    const f = i / N;
    const gx = x + (back - x) * f;
    const aa = mProject(gx, h, z0), bb = mProject(x + (back - x) * f, h, z0 + w);
    const cc = mProject(gx, 0, z0), dd = mProject(x + (back - x) * f, 0, z0 + w);
    if (aa && bb) { mctx.strokeStyle = 'rgba(255,255,255,0.25)'; mctx.lineWidth = 1; mctx.beginPath(); mctx.moveTo(aa.x, aa.y); mctx.lineTo(bb.x, bb.y); mctx.stroke(); }
    if (cc && dd) { mctx.beginPath(); mctx.moveTo(cc.x, cc.y); mctx.lineTo(dd.x, dd.y); mctx.stroke(); }
  }
}

function renderMatchCanvas() {
  mUpdateCam();
  match._basis = mBasis();
  const g = mctx.createLinearGradient(0, 0, 0, mH);
  g.addColorStop(0, '#0a1730'); g.addColorStop(0.55, '#10361f'); g.addColorStop(1, '#0c2a18');
  mctx.fillStyle = g; mctx.fillRect(0, 0, mW, mH);
  drawStadium();
  drawPitch3D();
  drawCrowd();
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
  drawPowerMeter();
  drawMinimap();
}

function drawStadium() {
  const hl = PITCH_LEN / 2, hw = PITCH_WID / 2;
  // кольцо трибун
  mQuad([[-hl - 26, 0, -hw - 22], [-hl - 26, 0, hw + 22], [hl + 26, 0, hw + 22], [hl + 26, 0, -hw - 22]], '#1b2a14', mDepth(0, 0) - 40);
  mQuad([[-hl - 16, 0, -hw - 14], [-hl - 16, 0, hw + 14], [hl + 16, 0, hw + 14], [hl + 16, 0, -hw - 14]], '#22381a', mDepth(0, 0) - 30);
  // рекламные щиты
  const adCol = '#f4e3c7';
  mRect(-hl, -hw - 3, PITCH_LEN, 1.6);
  mRect(-hl, hw + 1.4, PITCH_LEN, 1.6);
  mRect(-hl - 3, -hw, 1.6, PITCH_WID);
  mRect(hl + 1.4, -hw, 1.6, PITCH_WID);
  mctx.strokeStyle = 'rgba(255,255,255,0.5)'; mctx.lineWidth = 2;
  mLine(-hl, -hw - 3, hl, -hw - 3); mLine(-hl, hw + 3, hl, hw + 3);
  mLine(-hl - 3, -hw, -hl - 3, hw); mLine(hl + 3, -hw, hl + 3, hw);
  mctx.strokeStyle = 'rgba(30,60,30,0.9)'; mctx.stroke();
  mctx.font = 'bold 9px sans-serif'; mctx.textAlign = 'center'; mctx.fillStyle = '#fff';
  const ad1 = mProject(0, 0.8, -hw - 3.6), ad2 = mProject(0, 0.8, hw + 3.6);
  if (ad1) mctx.fillText('⚽ FOOTBALL CARDS', ad1.x, ad1.y);
  if (ad2) mctx.fillText('3D MATCH', ad2.x, ad2.y);
}

function drawCrowd() {
  for (const c of CROWD) {
    const p = mProject(c.x, 1.6, c.z);
    if (!p) continue;
    const a = 1 - mFog(p.depth);
    mctx.globalAlpha = Math.max(0.15, a);
    mctx.fillStyle = c.c;
    mctx.fillRect(p.x - 1.6, p.y - 1.6, 3.2, 3.2);
  }
  mctx.globalAlpha = 1;
}

function drawPitch3D() {
  const hl = PITCH_LEN / 2, hw = PITCH_WID / 2;
  mQuad([[-hl, 0, -hw], [-hl, 0, hw], [hl, 0, hw], [hl, 0, -hw]], '#1f7a36', mDepth(0, 0) - 20);
  const N = 14;
  for (let i = 0; i < N; i++) {
    const x0 = -hl + (2 * hl) * (i / N), x1 = -hl + (2 * hl) * ((i + 1) / N);
    mQuad([[x0, 0, -hw], [x0, 0, hw], [x1, 0, hw], [x1, 0, -hw]], i % 2 ? '#1c6f31' : '#23853d', mDepth(0, 0) - 20);
  }
  mctx.strokeStyle = 'rgba(255,255,255,0.85)'; mctx.lineWidth = 2;
  mLine(-hl, -hw, hl, -hw); mLine(hl, -hw, hl, hw); mLine(hl, hw, -hl, hw); mLine(-hl, hw, -hl, -hw);
  mLine(0, -hw, 0, hw);
  mCircle(0, 0, 9.15, 28);
  const boxD = 16.5, boxW = 40, smallD = 5.5, smallW = 18.32;
  mRect(-hl, -boxW / 2, boxD, boxW);
  mRect(hl - boxD, -boxW / 2, boxD, boxW);
  mRect(-hl, -smallW / 2, smallD, smallW);
  mRect(hl - smallD, -smallW / 2, smallD, smallW);
  mGoal(-hl, -7.32 / 2, 7.32, 'rgba(255,255,255,0.95)');
  mGoal(hl, -7.32 / 2, 7.32, 'rgba(255,255,255,0.95)');
  const sp1 = mProject(0, 0, 0), sp2 = mProject(-hl + 11, 0, 0), sp3 = mProject(hl - 11, 0, 0);
  if (sp1) { mctx.fillStyle = '#fff'; mctx.beginPath(); mctx.arc(sp1.x, sp1.y, 1.8, 0, Math.PI * 2); mctx.fill(); }
  if (sp2) { mctx.beginPath(); mctx.arc(sp2.x, sp2.y, 1.8, 0, Math.PI * 2); mctx.fill(); }
  if (sp3) { mctx.beginPath(); mctx.arc(sp3.x, sp3.y, 1.8, 0, Math.PI * 2); mctx.fill(); }
  // офсайдная линия
  if (match && match.possession) {
    const line = offsideLine('me');
    if (line !== null) {
      const lx = mWX(line);
      mctx.strokeStyle = 'rgba(255,200,60,0.5)'; mctx.lineWidth = 2;
      mctx.setLineDash([6, 6]);
      mLine(lx, -hw, lx, hw);
      mctx.setLineDash([]);
    }
  }
}

function mScreenFaceAt(X, Z, facing) {
  const a = mProject(X, 0, Z), b = mProject(X + Math.cos(facing) * 0.4, 0, Z + Math.sin(facing) * 0.4);
  if (!a || !b) return { x: 0, y: -1 };
  let dx = b.x - a.x, dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  dx /= l; dy /= l;
  return { x: dx, y: dy };
}

function mDrawPlayer(p, side, isCtl) {
  const X = mWX(p.x), Z = mWZ(p.y);
  const foot = mProject(X, 0, Z); if (!foot) return;
  const hip = mProject(X, 0.95, Z); if (!hip) return;
  const sh = mProject(X, 1.15, Z); if (!sh) return;
  const head = mProject(X, 1.8, Z); if (!head) return;
  const sc = foot.scale;
  const col = side === 'me' ? '#3f8efc' : '#ff5d5d';
  const dark = side === 'me' ? '#1f5fb0' : '#b02424';
  const skin = side === 'me' ? '#cfe3ff' : '#ffd6d6';
  const fa = mFog(foot.depth);
  const alpha = 1 - fa;
  mctx.globalAlpha = Math.max(0.3, alpha);
  // тень
  mctx.fillStyle = 'rgba(0,0,0,' + (0.32 * alpha) + ')';
  mctx.beginPath(); mctx.ellipse(foot.x, foot.y, Math.max(3, 0.65 * sc), Math.max(1.5, 0.22 * sc), 0, 0, Math.PI * 2); mctx.fill();
  // направление
  const fd = mScreenFaceAt(X, Z, p.facing);
  const perp = { x: -fd.y, y: fd.x };
  const moving = Math.hypot(p.vx, p.vy) > 0.01;
  if (moving) p.run += Math.hypot(p.vx, p.vy) * mdt * 20;
  const stride = Math.max(2, Math.min(0.45 * sc, Math.hypot(p.vx, p.vy) * sc * 2.2));
  const s1 = Math.sin(p.run) * stride, s2 = Math.sin(p.run + Math.PI) * stride;
  // ноги
  mctx.lineCap = 'round'; mctx.lineWidth = Math.max(2, 0.2 * sc);
  mctx.strokeStyle = dark;
  mctx.beginPath();
  mctx.moveTo(hip.x + perp.x * 2, hip.y);
  mctx.lineTo(foot.x + perp.x * s1, foot.y);
  mctx.moveTo(hip.x - perp.x * 2, hip.y);
  mctx.lineTo(foot.x + perp.x * s2, foot.y);
  mctx.stroke();
  // торс
  mctx.lineWidth = Math.max(3.5, 0.5 * sc);
  mctx.strokeStyle = col;
  mctx.beginPath(); mctx.moveTo(hip.x, hip.y); mctx.lineTo(sh.x, sh.y); mctx.stroke();
  // плечи
  mctx.strokeStyle = col; mctx.lineWidth = Math.max(3, 0.34 * sc);
  mctx.beginPath();
  mctx.moveTo(sh.x - perp.x * 0.16 * sc, sh.y + 2);
  mctx.lineTo(sh.x + perp.x * 0.16 * sc, sh.y + 2);
  mctx.stroke();
  // руки (машут при беге)
  mctx.strokeStyle = skin; mctx.lineWidth = Math.max(2, 0.15 * sc);
  const ra = moving ? s1 : 0, rb = moving ? s2 : 0;
  mctx.beginPath();
  mctx.moveTo(sh.x - perp.x * 0.13 * sc, sh.y);
  mctx.lineTo(sh.x - perp.x * 0.13 * sc + perp.x * 0 - fd.x * 0.2 * sc - perp.x * ra * 0.6, sh.y + 0.3 * sc + Math.abs(ra) * 0.3);
  mctx.moveTo(sh.x + perp.x * 0.13 * sc, sh.y);
  mctx.lineTo(sh.x + perp.x * 0.13 * sc - fd.x * 0.2 * sc + perp.x * rb * 0.6, sh.y + 0.3 * sc + Math.abs(rb) * 0.3);
  mctx.stroke();
  // голова
  const hr = Math.max(2.5, 0.3 * sc);
  mctx.fillStyle = skin;
  mctx.beginPath(); mctx.arc(head.x, head.y, hr, 0, Math.PI * 2); mctx.fill();
  mctx.strokeStyle = dark; mctx.lineWidth = 1.5; mctx.stroke();
  // номер
  mctx.font = 'bold ' + Math.max(7, Math.round(0.24 * sc)) + 'px monospace';
  mctx.textAlign = 'center'; mctx.textBaseline = 'middle';
  mctx.fillStyle = 'rgba(255,255,255,0.92)';
  mctx.fillText(p.rating, sh.x, sh.y - 0.02 * sc);
  mctx.globalAlpha = 1;
  // кольцо управления
  if (isCtl) {
    mctx.beginPath(); mctx.ellipse(foot.x, foot.y, Math.max(6, 0.9 * sc), Math.max(3, 0.3 * sc), 0, 0, Math.PI * 2);
    mctx.strokeStyle = '#ffe66b'; mctx.lineWidth = 2.5; mctx.stroke();
    // маркер сверху
    const tp = mProject(X, 2.3, Z);
    if (tp) {
      mctx.fillStyle = '#ffe66b';
      mctx.beginPath();
      mctx.moveTo(tp.x, tp.y - 6);
      mctx.lineTo(tp.x + 5, tp.y + 3);
      mctx.lineTo(tp.x - 5, tp.y + 3);
      mctx.closePath(); mctx.fill();
    }
  }
  // имя + рейтинг (у управляемого)
  if (isCtl) {
    const nm = mProject(X, 2.9, Z);
    if (nm) {
      mctx.font = 'bold ' + Math.max(10, Math.round(0.4 * sc)) + 'px sans-serif';
      mctx.textAlign = 'center'; mctx.textBaseline = 'middle';
      const label = p.rating + ' ' + p.name;
      const tw = mctx.measureText(label).width;
      mctx.fillStyle = 'rgba(0,0,0,0.6)';
      mctx.fillRect(nm.x - tw / 2 - 4, nm.y - 9, tw + 8, 18);
      mctx.fillStyle = '#fff';
      mctx.fillText(label, nm.x, nm.y);
    }
  }
  // грузик над владельцем мяча
  if (match.possPlayer === p && !isCtl) {
    const bp = mProject(X, 2.2, Z);
    if (bp) {
      mctx.fillStyle = '#fff';
      mctx.beginPath(); mctx.arc(bp.x, bp.y, Math.max(2.5, 0.16 * sc), 0, Math.PI * 2); mctx.fill();
    }
  }
  // линейка выносливости у управляемого
  if (isCtl) {
    const sp = mProject(X, 0.2, Z);
    if (sp) {
      const w = Math.max(20, 0.5 * sc);
      mctx.fillStyle = 'rgba(0,0,0,0.55)';
      mctx.fillRect(sp.x - w / 2 - 1, sp.y - 1.5, w + 2, 5);
      mctx.fillStyle = p.stamina > 0.4 ? '#39c98a' : p.stamina > 0.2 ? '#ffd23d' : '#ff5d5d';
      mctx.fillRect(sp.x - w / 2, sp.y - 1, w * p.stamina, 3);
    }
  }
}

function mDrawBall() {
  const X = mWX(match.ball.x), Z = mWZ(match.ball.y);
  const h = match.ball.z;
  const foot = mProject(X, 0, Z); if (!foot) return;
  const sc = foot.scale;
  const shrink = clamp(1 - h / 14, 0.3, 1);
  const fa = mFog(foot.depth);
  mctx.globalAlpha = Math.max(0.3, 1 - fa);
  mctx.fillStyle = 'rgba(0,0,0,' + (0.32 * shrink * (1 - fa)) + ')';
  mctx.beginPath(); mctx.ellipse(foot.x, foot.y, Math.max(2, 0.45 * sc * shrink), Math.max(1, 0.16 * sc * shrink), 0, 0, Math.PI * 2); mctx.fill();
  const c = mProject(X, h + 0.4, Z); if (!c) return;
  const r = Math.max(3, 0.42 * c.scale);
  const spin = match.ball.spin || 0;
  mctx.beginPath(); mctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  mctx.fillStyle = '#fff'; mctx.fill();
  mctx.strokeStyle = '#222'; mctx.lineWidth = 1.5; mctx.stroke();
  mctx.beginPath(); mctx.arc(c.x, c.y, r * 0.34, 0, Math.PI * 2);
  mctx.fillStyle = '#222'; mctx.fill();
  mctx.beginPath();
  mctx.arc(c.x + Math.cos(spin) * r * 0.3, c.y + Math.sin(spin) * r * 0.3, r * 0.22, 0, Math.PI * 2);
  mctx.fillStyle = '#e8e8e8'; mctx.fill();
  mctx.strokeStyle = '#888'; mctx.lineWidth = 1;
  mctx.beginPath(); mctx.moveTo(c.x, c.y - r * 0.8); mctx.lineTo(c.x + Math.cos(spin + 1) * r * 0.8, c.y + Math.sin(spin) * r * 0.6); mctx.stroke();
  mctx.globalAlpha = 1;
}

function drawPowerMeter() {
  if (!match.charging) return;
  const w = 200, h = 14;
  const x = mHalfW() - w / 2, y = mH - 46;
  mctx.fillStyle = 'rgba(0,0,0,0.6)';
  mctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  mctx.fillStyle = 'rgba(255,255,255,0.15)';
  mctx.fillRect(x, y, w, h);
  const pw = w * match.charge;
  const grad = mctx.createLinearGradient(x, y, x + w, y);
  grad.addColorStop(0, '#39c98a'); grad.addColorStop(0.5, '#ffd23d'); grad.addColorStop(1, '#ff5d5d');
  mctx.fillStyle = grad;
  mctx.fillRect(x, y, pw, h);
  mctx.strokeStyle = '#fff'; mctx.lineWidth = 2;
  mctx.strokeRect(x, y, w, h);
  mctx.font = 'bold 12px sans-serif'; mctx.textAlign = 'center'; mctx.fillStyle = '#fff';
  mctx.fillText('⚽ МОЩЬ УДАРА: ' + Math.round(match.charge * 100) + '%', mHalfW(), y - 8);
}

function drawMinimap() {
  const mw = 150, mh = 92;
  const ox = mW - mw - 10, oy = 10;
  mctx.fillStyle = 'rgba(0,0,0,0.55)';
  mctx.fillRect(ox - 4, oy - 4, mw + 8, mh + 8);
  mctx.fillStyle = '#1f7a36';
  mctx.fillRect(ox, oy, mw, mh);
  const mx = n => ox + (n - MATCH_L) / (MATCH_R - MATCH_L) * mw;
  const my = n => oy + (n - MATCH_T) / (MATCH_B - MATCH_T) * mh;
  mctx.strokeStyle = 'rgba(255,255,255,0.4)'; mctx.lineWidth = 1;
  mctx.strokeRect(ox, oy, mw, mh);
  mctx.beginPath(); mctx.moveTo(ox + mw / 2, oy); mctx.lineTo(ox + mw / 2, oy + mh); mctx.stroke();
  for (const side of ['me', 'bot']) {
    for (const p of match.teams[side]) {
      mctx.fillStyle = side === 'me' ? '#3f8efc' : '#ff5d5d';
      mctx.beginPath(); mctx.arc(mx(p.x), my(p.y), 2.5, 0, Math.PI * 2); mctx.fill();
    }
  }
  const b = match.ball;
  mctx.fillStyle = '#fff';
  mctx.beginPath(); mctx.arc(mx(b.x), my(b.y), 3, 0, Math.PI * 2); mctx.strokeStyle = '#000'; mctx.lineWidth = 1; mctx.stroke(); mctx.fill();
  // управляемый
  const ctl = match.teams.me[match.controlIdx];
  if (ctl) {
    mctx.strokeStyle = '#ffe66b'; mctx.lineWidth = 2;
    mctx.beginPath(); mctx.arc(mx(ctl.x), my(ctl.y), 4, 0, Math.PI * 2); mctx.stroke();
  }
}

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
    shootBtn.onclick = () => doShoot(0.8);
    shootBtn.addEventListener('pointerdown', e => { e.preventDefault(); if (match) { match.charging = true; match.charge = 0; } });
    shootBtn.addEventListener('pointerup', () => {
      if (match) { match.charging = false; doShoot(match.charge || 0.8); match.charge = 0; }
    });
    shootBtn.addEventListener('pointerleave', () => {
      if (match && match.charging) { match.charging = false; doShoot(match.charge || 0.8); match.charge = 0; }
    });
  }
  const throughBtn = $('#mj-through');
  if (throughBtn) {
    throughBtn.onclick = doThrough;
    throughBtn.addEventListener('pointerdown', e => { e.preventDefault(); doThrough(); });
  }
  const switchBtn = $('#mj-switch');
  if (switchBtn) {
    switchBtn.onclick = switchPlayer;
    switchBtn.addEventListener('pointerdown', e => { e.preventDefault(); switchPlayer(); });
  }
  const sprintBtn = $('#mj-sprint');
  if (sprintBtn) {
    sprintBtn.addEventListener('pointerdown', e => { e.preventDefault(); if (match) { match.sprint = true; match.sprintBtn = true; } });
    sprintBtn.addEventListener('pointerup', () => { if (match) { match.sprintBtn = false; match.sprint = false; } });
    sprintBtn.addEventListener('pointerleave', () => { if (match) { match.sprintBtn = false; match.sprint = false; } });
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
let mLastFrame = performance.now();
function mDt() {
  const now = performance.now();
  const d = Math.min((now - mLastFrame) / 1000, 0.05);
  mLastFrame = now;
  return d;
}
// глобальный dt для анимации игроков (перекидываем из обновления)
let mdt = 0.016;

document.addEventListener('keydown', e => {
  if (!match || activeScreen !== 'match') return;
  const k = e.key;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Spacebar'].includes(k)) e.preventDefault();
  if (k === 'Escape') return;
  match.keys = match.keys || {};
  match.keys[k] = true;
  if (k === ' ' || k === 'Spacebar' || k === 'j' || k === 'J' || k === 'о' || k === 'О' || k === 'f' || k === 'F' || k === 'а' || k === 'А') {
    if (!match.charging) { match.charging = true; match.charge = 0; }
  }
  if (k === 'e' || k === 'E' || k === 'у' || k === 'У') doPass();
  if (k === 'r' || k === 'R' || k === 'к' || k === 'К') doThrough();
  if (k === 'q' || k === 'Q' || k === 'й' || k === 'Й' || k === 'Tab') switchPlayer();
  if (k === 'Shift' || k === 'ShiftLeft' || k === 'ShiftRight') { match.sprint = true; }
});
document.addEventListener('keyup', e => {
  if (!match || !match.keys) return;
  const k = e.key;
  delete match.keys[e.key];
  if (k === ' ' || k === 'Spacebar' || k === 'j' || k === 'J' || k === 'о' || k === 'О' || k === 'f' || k === 'F' || k === 'а' || k === 'А') {
    if (match.charging) { match.charging = false; doShoot(match.charge); match.charge = 0; }
  }
  if (k === 'Shift' || k === 'ShiftLeft' || k === 'ShiftRight') { if (!match.sprintBtn) match.sprint = false; }
});