// ============ МАТЧ: игровой движок матча ============
// ===================== МАТЧ =====================
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

function beginMatch(o) {
  ensureLineup();
  transient = {};
  match = {
    opp: o,
    myLineup: [...state.starters],
    botSquad: makeBotSquad(o.avg),
    myGoals: 0, botGoals: 0, minute: 0,
    subsUsed: 0, paused: false, running: true, timer: null,
    ball: { x: 0.5, y: 0.5 }, ballTarget: { x: 0.5, y: 0.5 },
  };
  showScreen('match');
  resizeMatch();
  setBallTarget();
  match.timer = setInterval(() => { if (!match.paused && match.running) stepMinute(); }, 200);
}

function myStats() { return teamStats(match.myLineup); }
function botStats() { return teamStats(match.botSquad); }

function possessionPct() {
  const a = myStats(), b = botStats();
  const f = FORMATIONS[state.formation];
  const up = state.upgrades.possession * 0.02;
  let p = 50 + (a.overall - b.overall) * 0.8 + (f.poss + up) * 100;
  return clamp(Math.round(p), 18, 82);
}

function goalProbs() {
  const a = myStats(), b = botStats();
  const f = FORMATIONS[state.formation];
  const diff = (a.overall - b.overall) + (a.attack - b.defense) * 0.4 + f.att * 20;
  const possUp = state.upgrades.possession * 0.002;
  const defBonus = f.def * 20 * 0.0035;
  return {
    pA: clamp(0.030 + diff * 0.0035 + possUp, 0.008, 0.22),
    pB: clamp(0.030 - diff * 0.0035 - defBonus, 0.008, 0.22),
  };
}

function stepMinute() {
  match.minute++;
  const { pA, pB } = goalProbs();
  setBallTarget();
  if (Math.random() < pA) {
    match.myGoals++;
    const name = scorePlayer(match.myLineup);
    addLog('⚽ ГОЛ! ' + name, 'goal');
    showGoalBanner('⚽ ГОЛ!<br>' + name + ' 🟦');
  }
  if (Math.random() < pB) {
    match.botGoals++;
    const name = scorePlayer(match.botSquad);
    addLog('⚽ Гол соперника: ' + name, 'danger');
    showGoalBanner('⚽ ГОЛ ' + match.opp.name + '!<br>' + name + ' 🟥');
  }
  if (Math.random() < 0.09) addLog(Math.random() < 0.5 ? 'Острый момент у ваших ворот!' : 'Опасная атака вашей команды!', 'info');
  if (match.minute === 45) addLog('⏸ Перерыв', 'info');
  updateMatchUI();
  if (match.minute >= 90) endMatch();
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
  const div = document.createElement('div');
  div.className = 'log-line ' + (cls || '');
  div.textContent = match.minute + "' " + text;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function updateMatchUI() {
  $('#match-score').textContent = match.myGoals + ' : ' + match.botGoals;
  $('#match-minute').textContent = match.minute + "'";
  $('#match-poss').textContent = `Владение: вы ${possessionPct()}% — ${100 - possessionPct()}% (${match.opp.emoji} ${match.opp.name})`;
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

function setBallTarget() {
  const r = () => 0.12 + Math.random() * 0.76;
  match.ballTarget = { x: r(), y: r() };
}

function showGoalBanner(text) {
  const b = $('#goal-banner');
  b.innerHTML = text;
  b.classList.remove('hidden');
  clearTimeout(showGoalBanner._t);
  showGoalBanner._t = setTimeout(() => b.classList.add('hidden'), 1900);
}

// --- визуализация матча ---
const mc = $('#match-canvas');
const mctx = mc.getContext('2d');
let mW = 560, mH = 230;
function resizeMatch() {
  mW = mc.width = mc.clientWidth || 560;
  mH = mc.height = 230;
}

function layoutPositions(lineup) {
  const ps = lineup.map(getPlayer).filter(Boolean);
  const groups = { GK: [], DF: [], MF: [], FW: [] };
  ps.forEach(p => groups[p.pos].push(p));
  const rows = [];
  const xMap = { GK: 0.08, DF: 0.25, MF: 0.45, FW: 0.66 };
  for (const pos of POS_ORDER) {
    const arr = groups[pos];
    const n = arr.length;
    arr.forEach((p, i) => {
      const y = n === 1 ? 0.5 : 0.15 + (i / (n - 1)) * 0.7;
      rows.push({ p, x: xMap[pos], y });
    });
  }
  return rows;
}

function drawTeam(lineup, color, side) {
  const rows = layoutPositions(lineup);
  for (const r of rows) {
    let x = r.x; if (side === 'right') x = 1 - x;
    const px = x * mW, py = r.y * mH;
    mctx.beginPath(); mctx.arc(px, py, 9, 0, Math.PI * 2);
    mctx.fillStyle = color; mctx.fill();
    mctx.strokeStyle = 'rgba(255,255,255,.8)'; mctx.lineWidth = 1; mctx.stroke();
    mctx.fillStyle = '#fff'; mctx.font = 'bold 9px sans-serif';
    mctx.textAlign = 'center'; mctx.textBaseline = 'middle';
    mctx.fillText(r.p.rating, px, py);
  }
}

function renderMatchCanvas() {
  mctx.fillStyle = '#2c7a3f'; mctx.fillRect(0, 0, mW, mH);
  for (let i = 0; i < 8; i++) {
    if (i % 2 === 0) { mctx.fillStyle = 'rgba(255,255,255,0.04)'; mctx.fillRect(i * mW / 8, 0, mW / 8, mH); }
  }
  mctx.strokeStyle = 'rgba(255,255,255,0.7)'; mctx.lineWidth = 2;
  mctx.strokeRect(mW * 0.03, mH * 0.05, mW * 0.94, mH * 0.9);
  mctx.beginPath(); mctx.moveTo(mW / 2, mH * 0.05); mctx.lineTo(mW / 2, mH * 0.95); mctx.stroke();
  mctx.beginPath(); mctx.arc(mW / 2, mH / 2, mH * 0.12, 0, Math.PI * 2); mctx.stroke();
  mctx.strokeRect(mW * 0.03, mH * 0.22, mW * 0.14, mH * 0.56);
  mctx.strokeRect(mW * 0.83, mH * 0.22, mW * 0.14, mH * 0.56);
  drawTeam(match.myLineup, '#3f8efc', 'left');
  drawTeam(match.botSquad, '#ff5d5d', 'right');
  if (match.ball) {
    mctx.beginPath(); mctx.arc(match.ball.x * mW, match.ball.y * mH, 6, 0, Math.PI * 2);
    mctx.fillStyle = '#fff'; mctx.fill();
    mctx.strokeStyle = '#333'; mctx.lineWidth = 1; mctx.stroke();
  }
}

function updateMatchVisual(dt) {
  if (!match || !match.ball) return;
  const k = Math.min(1, dt * 2.2);
  match.ball.x += (match.ballTarget.x - match.ball.x) * k;
  match.ball.y += (match.ballTarget.y - match.ball.y) * k;
}

function endMatch() {
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

