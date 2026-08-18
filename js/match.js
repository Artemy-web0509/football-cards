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
    ball: { x: 0.5, y: 0.5, vx: 0, vy: 0 },
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
  match.ball = { x: mid, y: 0.5, vx: 0, vy: 0 };
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
  // Ведение мяча: если мяч у ног, он едет за игроком
  const dToBall = Math.hypot(ctl.x - match.ball.x, ctl.y - match.ball.y);
  if (dToBall < 0.035 && match.possession === 'me') {
    match.ball.x = ctl.x + (match.ball.x > ctl.x ? 0.015 : -0.015);
    match.ball.y = ctl.y + (match.ball.y > ctl.y ? 0.012 : -0.012);
  }

  // --- ИИ моих игроков (кроме управляемого) ---
  for (const p of match.teams.me) {
    if (p === ctl) continue;
    let tx = p.homeX, ty = p.homeY;
    const dp = Math.hypot(p.x - match.ball.x, p.y - match.ball.y);
    if (match.possession === 'bot' && dp < 0.32) { tx = match.ball.x; ty = match.ball.y; }
    else if (match.possession === 'me') {
      // идём вперёд, но не толпимся у мяча
      tx = clamp(p.homeX + 0.03, MATCH_L, MATCH_R); ty = p.homeY;
    }
    moveToward(p, tx, ty, dt);
  }

  // --- ИИ соперника ---
  stepBotAI(dt);

  // --- Мяч: инерция ---
  match.ball.x += match.ball.vx * dt;
  match.ball.y += match.ball.vy * dt;
  match.ball.vx *= Math.pow(0.35, dt);
  match.ball.vy *= Math.pow(0.35, dt);
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

function stepBotAI(dt) {
  const ball = match.ball;
  const nearest = closestToBall('bot');
  if (match.botShotCooldown > 0) match.botShotCooldown -= dt;

  for (const p of match.teams.bot) {
    let tx = p.homeX, ty = p.homeY;
    const dp = Math.hypot(p.x - ball.x, p.y - ball.y);
    const isNearest = p === nearest;
    if (match.possession === 'bot' && isNearest) {
      // преследуем мяч, чтобы ударить
      tx = ball.x; ty = ball.y;
      if (dp < 0.04 && match.botShotCooldown <= 0) {
        // бьём по моим воротам
        const power = 0.55 + p.rating * 0.0025;
        const aim = Math.random() < (0.55 + p.rating * 0.002) ? 0.75 : 0.25;
        const tyTarget = MATCH_GOAL_Y0 + (MATCH_GOAL_Y1 - MATCH_GOAL_Y0) * (Math.random() < aim ? 0.5 : (Math.random() < 0.5 ? 0.12 : 0.88));
        const dx = MATCH_L - ball.x, dy = tyTarget - ball.y;
        const d = Math.hypot(dx, dy) || 1;
        ball.vx = (dx / d) * power * 0.85;
        ball.vy = (dy / d) * power * 0.85;
        match.possession = 'me';
        match.botShotCooldown = 1.4;
        addLog('💨 Соперник бьёт по воротам!', 'danger');
      }
    } else if (match.possession === 'me' && dp < 0.25) {
      tx = ball.x; ty = ball.y;
    } else if (dp < 0.4 && !isNearest) {
      // поддержка: ближе к мячу
      tx = ball.x + (p.x - ball.x) * 0.5; ty = ball.y + (p.y - ball.y) * 0.5;
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
  const power = 0.75;
  match.ball.vx = (dx / dl) * power;
  match.ball.vy = (dy / dl) * power;
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
  const power = 0.95 + ctl.rating * 0.004;
  const baseAcc = 0.82 + ctl.rating * 0.001;
  const acc = Math.random() < baseAcc ? 1 : 0.55;
  match.ball.vx = (dx / dl) * power * acc;
  match.ball.vy = (dy / dl) * power * acc;
  match.kickCooldown = 0.4;
  addLog('⚽ Удар ' + ctl.name + ' по воротам!', 'goal');
}

function checkGoal() {
  const b = match.ball;
  if (match.goalLock) return;
  // мои ворота слева
  if (b.x <= MATCH_L + 0.012 && b.y > MATCH_GOAL_Y0 && b.y < MATCH_GOAL_Y1) {
    match.goalLock = true;
    match.botGoals++;
    const sc = closestToBall('bot');
    addLog('⚽ ГОЛ СОПЕРНИКА: ' + (sc ? sc.name : '??'), 'danger');
    showGoalBanner('⚽ ГОЛ ' + match.opp.name + '!<br>🟥');
    setTimeout(() => { match.goalLock = false; resetKickoff(); }, 1400);
    return;
  }
  // ворота соперника справа
  if (b.x >= MATCH_R - 0.012 && b.y > MATCH_GOAL_Y0 && b.y < MATCH_GOAL_Y1) {
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

// ---------- Визуализация ----------
const mc = $('#match-canvas');
const mctx = mc.getContext('2d');
let mW = 560, mH = 230;
function resizeMatch() {
  mW = mc.width = mc.clientWidth || 560;
  mH = mc.height = 230;
}

function px(x) { return (x - MATCH_L) / (MATCH_R - MATCH_L) * mW; }
function py(y) { return (y - MATCH_T) / (MATCH_B - MATCH_T) * mH; }

function renderMatchCanvas() {
  mctx.fillStyle = '#2c7a3f'; mctx.fillRect(0, 0, mW, mH);
  for (let i = 0; i < 8; i++) {
    if (i % 2 === 0) { mctx.fillStyle = 'rgba(255,255,255,0.04)'; mctx.fillRect(i * mW / 8, 0, mW / 8, mH); }
  }
  mctx.strokeStyle = 'rgba(255,255,255,0.7)'; mctx.lineWidth = 2;
  mctx.strokeRect(px(MATCH_L), py(MATCH_T), mW, mH);
  mctx.beginPath(); mctx.moveTo(px(0.5), py(MATCH_T)); mctx.lineTo(px(0.5), py(MATCH_B)); mctx.stroke();
  mctx.beginPath(); mctx.arc(px(0.5), py(0.5), mH * 0.12, 0, Math.PI * 2); mctx.stroke();
  // штрафные и ворота
  mctx.strokeRect(px(MATCH_L), py(MATCH_GOAL_Y0), mW * 0.16, (MATCH_GOAL_Y1 - MATCH_GOAL_Y0) * mH / (MATCH_B - MATCH_T));
  mctx.strokeRect(px(MATCH_R) - mW * 0.16, py(MATCH_GOAL_Y0), mW * 0.16, (MATCH_GOAL_Y1 - MATCH_GOAL_Y0) * mH / (MATCH_B - MATCH_T));
  mctx.fillStyle = 'rgba(255,255,255,0.25)';
  mctx.fillRect(px(MATCH_L), py(MATCH_GOAL_Y0), 6, (MATCH_GOAL_Y1 - MATCH_GOAL_Y0) * mH / (MATCH_B - MATCH_T));
  mctx.fillRect(px(MATCH_R) - 6, py(MATCH_GOAL_Y0), 6, (MATCH_GOAL_Y1 - MATCH_GOAL_Y0) * mH / (MATCH_B - MATCH_T));

  drawTeamField('me', '#3f8efc');
  drawTeamField('bot', '#ff5d5d');

  // мяч
  mctx.beginPath(); mctx.arc(px(match.ball.x), py(match.ball.y), 6, 0, Math.PI * 2);
  mctx.fillStyle = '#fff'; mctx.fill();
  mctx.strokeStyle = '#333'; mctx.lineWidth = 1; mctx.stroke();
}

function drawTeamField(side, color) {
  const ctl = match.teams[side][match.controlIdx];
  for (const p of match.teams[side]) {
    const isCtl = (side === 'me' && p === ctl);
    const cx = px(p.x), cy = py(p.y);
    mctx.beginPath(); mctx.arc(cx, cy, isCtl ? 12 : 9, 0, Math.PI * 2);
    mctx.fillStyle = color; mctx.fill();
    mctx.strokeStyle = 'rgba(255,255,255,.8)'; mctx.lineWidth = isCtl ? 3 : 1;
    mctx.stroke();
    if (isCtl) {
      mctx.beginPath(); mctx.arc(cx, cy, 16, 0, Math.PI * 2);
      mctx.strokeStyle = '#ffe66b'; mctx.lineWidth = 2; mctx.stroke();
    }
    mctx.fillStyle = '#fff'; mctx.font = 'bold 9px sans-serif';
    mctx.textAlign = 'center'; mctx.textBaseline = 'middle';
    mctx.fillText(p.rating, cx, cy);
  }
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
