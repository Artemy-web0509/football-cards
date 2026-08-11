// ============ ЭКРАНЫ: спиннер, поле, рюкзак, арена, шансы ============
// ===================== ЭКРАНЫ: СПИННЕР / ПОЛЕ / РЮКЗАК / АРЕНА =====================
function renderSpinnerPanel() {
  $('#spin-btn').textContent = 'Крутить (' + SPIN_COST + ' 💰)';
  renderOdds();
  if (!$('#roulette-track').children.length) {
    let html = '';
    for (let i = 0; i < 14; i++) html += miniCardHTML(generateFakePlayer(pickRarity(), pick(POS_ORDER)));
    $('#roulette-track').innerHTML = html;
  }
  $('#spin-result').classList.add('hidden');
}

function upgradeRowHTML(u) {
  const lvl = state.upgrades[u.id] || 0;
  const maxed = lvl >= u.maxLevel;
  const cost = upgradeCost(u, lvl);
  return `<div class="upgrade-row">
    <div class="upgrade-info">
      <div class="up-name">${u.icon} ${u.name} <span class="up-lvl">ур. ${lvl}</span></div>
      <div class="up-desc">${u.bonusDesc}</div>
    </div>
    ${maxed ? '<div class="up-lvl">МАКС</div>'
      : `<div><div class="upgrade-cost">${cost} 💰</div>
         <button class="btn upgrade-btn" data-ubuy="${u.id}" style="margin-top:6px;">Улучшить</button></div>`}
  </div>`;
}

function renderUpgradeList(container, ids) {
  let html = '';
  for (const id of ids) {
    const u = UPGRADES.find(x => x.id === id);
    if (u) html += upgradeRowHTML(u);
  }
  $(container).innerHTML = html;
  $$(container + ' [data-ubuy]').forEach(b => b.onclick = () => buyUpgrade(b.dataset.ubuy));
}

function renderLuckUpgrades() {
  renderUpgradeList('#luck-upgrades', ['luck']);
}

function renderFieldUpg() {
  renderUpgradeList('#fieldupg-upgrades', ['possession', 'income']);
}

function renderFieldScreen(idx) {
  currentField = idx;
  ensureLineup();
  const f = FORMATIONS[state.formation];
  $('#field-title').textContent = '🏟️ ' + BASES[idx].name;
  let html = '';
  if (loveBuff() > 1) html += `<div class="love-banner">💞 Любовь Мамы и Папы активна! Доход им обоим ×2</div>`;
  html += formationBarHTML();
  html += `<button class="btn autofill-btn" id="autofill-btn">✨ Авто-состав (лучшие)</button>`;
  html += `<div class="shop-note">Схема ${f.name}. Это твоя команда. Новых игроков получай из спиннера и ставь на поле клавишей E.</div>`;
  const counts = formationCounts();
  const groups = lineupGroups();
  for (const pos of POS_ORDER) {
    const need = counts[pos];
    html += `<div class="lineup-block"><div class="lineup-title">${posName(pos)} (${need})</div><div class="lineup-row">`;
    for (let i = 0; i < need; i++) {
      const pid = groups[pos][i];
      const p = pid ? getPlayer(pid) : null;
      html += p ? `<div class="slot">${cardHTML(p)}<button class="col-sell" data-bk-rem="${p.id}" title="В запас">⬇️ В запас</button></div>` : `<div class="slot">+ пусто</div>`;
    }
    html += `</div></div>`;
  }
  $('#field-lineup').innerHTML = html;
  $('#autofill-btn').onclick = autofill;
  $$('#field-lineup [data-form]').forEach(c => c.onclick = () => { state.formation = c.dataset.form; save(); renderFieldScreen(idx); });
  $$('#field-lineup [data-bk-rem]').forEach(c => c.onclick = () => removeFromStarters(+c.dataset.bkRem));
}

function renderBackpack() {
  const ps = [...state.players].sort((a, b) => b.rating - a.rating);
  let html = `<div class="shop-note">Всего игроков: ${ps.length} • В основе: ${state.starters.length}/11</div>`;
  html += `<button class="btn" id="bk-field-btn" style="display:block;margin:0 auto 12px;">🏟️ Состав поля</button>`;
  const d = dupeCount();
  if (d > 0) html += `<button class="btn btn-primary" id="sell-dupes-btn" style="display:block;margin:0 auto 12px;">Продать дубли (+${d} шт)</button>`;
  html += '<div class="collection-grid">';
  for (const p of ps) {
    const inBase = state.starters.includes(p.id);
    html += `<div class="col-card">${cardHTML(p)}
      <button class="col-sell" data-bk-place="${p.id}" ${inBase ? 'disabled' : ''}>${inBase ? 'В основе ✅' : '⭐ На поле'}</button>
      <button class="col-sell" data-bk-sell="${p.id}">Продать ${sellPrice(p)} 💰</button>
    </div>`;
  }
  html += '</div>';
  $('#backpack-grid').innerHTML = html;
  $$('#backpack-grid [data-bk-place]').forEach(b => b.onclick = () => backpackPlace(+b.dataset.bkPlace));
  $$('#backpack-grid [data-bk-sell]').forEach(b => b.onclick = () => sellPlayer(+b.dataset.bkSell));
  const sd = $('#sell-dupes-btn');
  if (sd) sd.onclick = sellDupes;
  const bf = $('#bk-field-btn');
  if (bf) bf.onclick = openFieldScreen;
}

function openFieldScreen() {
  renderFieldScreen(homeFieldIndex());
  showScreen('field');
}

function backpackPlace(id) {
  const p = getPlayer(id); if (!p) return;
  if (state.starters.length >= 11) { toast('Мест в основе нет — замени кого-то на поле'); return; }
  state.starters.push(id);
  ensureLineup(); save(); refreshMyFieldOwner(); renderBackpack();
  toast('⭐ ' + p.name + ' в основе!');
}

function renderArena() {
  ensureLineup();
  const stats = teamStats(state.starters);
  const f = FORMATIONS[state.formation];
  $('#arena-ms-info').innerHTML = 'Мой рейтинг: <b>' + Math.round(stats.overall) + '</b> • Атака ' + Math.round(stats.attack) + ' • Защита ' + Math.round(stats.defense) + '<br>Формация: ' + f.name;
  renderOpponentsList();
}

function renderOpponentsList() {
  const stats = teamStats(state.starters);
  let html = '';
  for (const o of OPPONENTS) {
    const beaten = state.beatenOpponents.includes(o.id);
    const chance = winChance(stats.overall, o.avg);
    html += `<div class="opp-card" data-opp="${o.id}">
      <div>
        <div class="opp-name">${o.emoji} ${o.name}</div>
        <div class="opp-meta">Средний рейтинг ${o.avg} • Ваши шансы ${chance}%</div>
      </div>
      <div class="opp-reward">${beaten ? '✅ Побеждён' : '+ ' + o.fansWin + ' 👥'}</div>
    </div>`;
  }
  $('#opponents-list').innerHTML = html;
  $$('#opponents-list [data-opp]').forEach(c => c.onclick = () => startMatch(c.dataset.opp));
}

function arenaTab(tab) {
  $('#arena-tab-bot').classList.toggle('active', tab === 'bot');
  $('#arena-tab-pvp').classList.toggle('active', tab === 'pvp');
  $('#arena-bots').classList.toggle('hidden', tab !== 'bot');
  $('#arena-pvp').classList.toggle('hidden', tab !== 'pvp');
  if (tab === 'bot') renderOpponentsList();
  else renderPvpStatus();
}

function renderPvpStatus() {
  const el = $('#arena-pvp-status');
  if (!el) return;
  if (state.pvpQueued) el.textContent = '⏳ Ждём соперника... Другой игрок тоже должен нажать «Играть»';
  else el.textContent = 'Побед в PvP: ' + (state.pvpWins || 0);
  $('#pvp-join').style.display = state.pvpQueued ? 'none' : '';
  $('#pvp-leave').style.display = state.pvpQueued ? '' : 'none';
}

function pvpJoin() {
  ensureLineup();
  if (state.starters.length < 11) { toast('Сначала собери состав (на своём поле)'); return; }
  if (!server.online) { toast('Сервер недоступен — соперника не найти'); return; }
  state.pvpQueued = true;
  save();
  renderPvpStatus();
  toast('⚔ В очереди на арену. Ждём второго игрока...');
}

function pvpLeave() {
  state.pvpQueued = false;
  save();
  renderPvpStatus();
  toast('Ожидание отменено');
}

function checkPvpQueue() {
  if (!state || !state.pvpQueued) return;
  const queued = server.players.filter(p => p.pvp);
  if (queued.length >= 1) {
    state.pvpQueued = false;
    save();
    startPvpMatch(queued[0].nick);
  }
}

function closeScreen() {
  showScreen('world');
  updateHeldHud();
}

function buyUpgrade(id) {
  const u = UPGRADES.find(x => x.id === id);
  const lvl = state.upgrades[id] || 0;
  if (lvl >= u.maxLevel) { toast('Максимум!'); return; }
  const cost = upgradeCost(u, lvl);
  if (state.coins < cost) { toast('Не хватает монет!'); return; }
  state.coins -= cost;
  state.upgrades[id] = lvl + 1;
  save(); renderTop();
  if (activeScreen === 'luck') renderLuckUpgrades();
  else if (activeScreen === 'fieldupg') renderFieldUpg();
  toast(u.icon + ' ' + u.name + ' → ур. ' + (lvl + 1));
}

function buySignUpgrade(o) {
  const ids = o.type === 'luck' ? ['luck'] : ['income', 'possession'];
  const u = UPGRADES.find(x => ids.includes(x.id) && (state.upgrades[x.id] || 0) < x.maxLevel);
  if (!u) { toast('Все улучшения прокачаны до максимума!'); return; }
  const lvl = state.upgrades[u.id] || 0;
  const cost = upgradeCost(u, lvl);
  if (state.coins < cost) { toast('Не хватает монет — нужно ' + cost + ' 💰'); return; }
  state.coins -= cost;
  state.upgrades[u.id] = lvl + 1;
  save(); renderTop();
  toast(u.icon + ' ' + u.name + ' → ур. ' + (lvl + 1) + ' (−' + cost + ' 💰)');
}

function formationBarHTML() {
  let html = '<div class="formation-bar">';
  for (const key of Object.keys(FORMATIONS)) {
    html += `<span class="formation-chip ${key === state.formation ? 'active' : ''}" data-form="${key}">${FORMATIONS[key].name}</span>`;
  }
  return html + '</div>';
}

function posName(pos) { return { GK: 'Вратарь', DF: 'Защита', MF: 'Полузащита', FW: 'Нападение' }[pos]; }

function dupeKey(p) { return `${p.name}|${p.rarity}|${p.rating}|${p.pos}`; }
function dupeCount() {
  const seen = {}; let n = 0;
  for (const p of state.players) { const k = dupeKey(p); if (seen[k]) n++; else seen[k] = 1; }
  return n;
}

function sellPlayer(id) {
  const p = getPlayer(id); if (!p) return;
  const price = sellPrice(p);
  state.coins += price;
  state.players = state.players.filter(x => x.id !== id);
  state.starters = state.starters.filter(x => x !== id);
  delete transient[id];
  if (p.key && !p.shadow) releaseRemote(p.key);
  save(); renderTop();
  toast(`${p.name} продан за ${price} 💰`);
  if (activeScreen === 'backpack') renderBackpack();
  else if (activeScreen === 'market') renderMarketTab('sell');
}

function sellDupes() {
  const seen = {}; let total = 0, n = 0;
  const kept = [];
  for (const p of state.players) {
    const k = dupeKey(p);
    if (seen[k]) { total += sellPrice(p); n++; }
    else { seen[k] = 1; kept.push(p); }
  }
  if (n === 0) { toast('Дублей нет'); return; }
  state.players = kept;
  state.starters = state.starters.filter(id => state.players.some(p => p.id === id));
  state.coins += total;
  save(); renderTop();
  toast(`Продано дублей: ${n} шт, +${total} 💰`);
  if (activeScreen === 'backpack') renderBackpack();
  else if (activeScreen === 'market') renderMarketTab('sell');
}

// ---------- Шансы / Спиннер ----------
function effectiveChances() {
  const w = {}; let total = 0;
  for (const r of SPIN_RARITY_KEYS) {
    let c = RARITIES[r].chance;
    for (const b of BUFFS) {
      if (b.chanceBonus && b.chanceBonus[r] && (state.buffs[b.id] || 0) > 0) c += b.chanceBonus[r] * state.buffs[b.id];
    }
    w[r] = c; total += c;
  }
  const luck = state.upgrades.luck || 0;
  w.gold += luck * 0.001;
  w.diamond += luck * 0.0005;
  w.secret += luck * 0.0002;
  const lb = activeLuckBoost();
  if (lb) {
    w.gold += lb.gold;
    w.diamond += lb.diamond;
    w.secret += lb.secret;
  }
  total = w.gold + w.diamond + w.secret + w.bronze + w.silver;
  return { w, total };
}

function renderOdds() {
  const { w, total } = effectiveChances();
  let html = '';
  for (const r of SPIN_RARITY_KEYS) {
    const pct = (w[r] / total * 100).toFixed(1);
    html += `<span class="odds-chip">${RARITIES[r].emoji} ${RARITIES[r].name} <b>${pct}%</b></span>`;
  }
  $('#odds-bar').innerHTML = html;
}

function addToCollection(p) {
  state.players.push(p);
  ensureLineup();
  save();
}

async function spin() {
  if (spinning) return;
  if (state.coins < SPIN_COST) {
    toast('Не хватает монет! Заработай доходом 💰');
    flashBtn($('#spin-btn'));
    return;
  }
  state.coins -= SPIN_COST;
  spinning = true;
  $('#spin-result').classList.add('hidden');
  renderTop();

  const rarity = pickRarity();
  const player = generatePlayer(rarity, pick(POS_ORDER), undefined, false);

  const track = $('#roulette-track');
  const N = 300;
  const resultIdx = rnd(200, 260);
  const cardW = 104, gap = 8, step = cardW + gap;
  let html = '';
  for (let i = 0; i < N; i++) {
    html += (i === resultIdx)
      ? miniCardHTML(player)
      : miniCardHTML(generateFakePlayer(pickRarity(), pick(POS_ORDER)));
  }
  track.innerHTML = html;

  const container = track.parentElement;
  const center = container.clientWidth / 2 - cardW / 2;
  const target = -(resultIdx * step) + center;
  const start = target - rnd(2500, 4200);
  track.style.transition = 'none';
  track.style.transform = `translateX(${start}px)`;

  requestAnimationFrame(() => {
    const dur = 3400;
    const t0 = performance.now();
    function frame(now) {
      const t = clamp((now - t0) / dur, 0, 1);
      const e = 1 - Math.pow(1 - t, 5);
      track.style.transform = `translateX(${start + (target - start) * e}px)`;
      if (t < 1) requestAnimationFrame(frame);
      else onSpinLand(player);
    }
    requestAnimationFrame(frame);
  });
}

function onSpinLand(p) {
  spinning = false;
  const titles = {
    bronze: 'Обычная карточка',
    silver: '🎉 Редкая карточка!',
    gold: '🔥 ЭПИК!',
    diamond: '💎 ЛЕГЕНДА!',
    secret: '👑 СЕКРЕТ!!!',
    bingi: '🌈 БИНГИ!!! 1 ИЗ 1000!!!',
  };
  const box = $('#spin-result');
  const price = buyPrice(p);
  const afford = state.coins >= price;
  box.innerHTML = `
    <div class="result-title">${titles[p.rarity]}</div>
    ${cardHTML(p)}
    <div class="result-price">Выкуп карточки: <b>${price} 💰</b>${afford ? '' : '<br>Не хватает монет!'}</div>
    <div class="result-actions">
      <button class="btn btn-primary" id="take-btn" ${afford ? '' : 'disabled'}>${afford ? '🤚 Забрать за ' + price + ' 💰' : 'Не хватает 💰'}</button>
    </div>`;
  box.classList.remove('hidden');
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('#take-btn').onclick = async () => {
    if (state.coins < price) {
      toast('Не хватает монет на выкуп! Нужно ' + price + ' 💰');
      flashBtn($('#take-btn'));
      return;
    }
    claimLocal(player);
    const res = await claimRemote(player);
    if (res === 'TAKEN') {
      toast('❌ Эту карточку только что забрали — попробуй ещё раз');
      delete claimedKeys[player.key];
      renderSpinnerPanel();
      return;
    }
    state.coins -= price;
    save();
    renderTop();
    setHeld(player);
    closeScreen();
    updateHeldHud();
    toast('Выкуплено за ' + price + ' 💰. Нажми E — на поле, или B — в рюкзак');
  };
}

function setHeld(p) {
  if (state.held && state.held.id !== p.id) state.held = null;
  state.held = p;
  const top = $('#held-card');
  if (top) top.innerHTML = '🤚 В руках: ' + miniCardHTML(p);
  save();
}

