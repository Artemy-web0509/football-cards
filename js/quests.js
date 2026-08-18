// ============ КВЕСТЫ: длинная полоса, приз за каждый, кейс с 🔮 за каждые 5 ============

function questProgress(q) {
  let cur = 0;
  const c = (k) => {
    const m = state.players.filter(p => !p.shadow && (p.rarity === k || ['gold', 'diamond', 'secret', 'bingi'].indexOf(p.rarity) >= ['gold', 'diamond', 'secret', 'bingi'].indexOf(k))).length;
    return m;
  };
  switch (q.type) {
    case 'wins': cur = state.matchesWon || 0; break;
    case 'spins': cur = state.spinsTotal || 0; break;
    case 'income': cur = Math.floor(incomePerSec()); break;
    case 'coins': cur = Math.floor(state.coins); break;
    case 'fans': cur = Math.floor(state.fans); break;
    case 'players': cur = state.players.length; break;
    case 'gold': cur = c('gold'); break;
    case 'diamond': cur = c('diamond'); break;
    case 'secret': cur = c('secret'); break;
    case 'mutation': cur = state.players.filter(p => p.mut).length; break;
    case 'pvp': cur = state.pvpWins || 0; break;
    case 'cups': cur = state.cups.length; break;
    case 'upgrades': cur = Object.values(state.upgrades).reduce((s, v) => s + (v || 0), 0); break;
    case 'beats': cur = (state.beatenOpponents || []).length; break;
  }
  return Math.min(cur, q.target);
}

function questDone(q) { return (state.questsDone || []).includes(q.id); }
function questUnlocked(q) {
  const idx = QUESTS.indexOf(q);
  if (idx <= 0) return true;
  return questDone(QUESTS[idx - 1]);
}

function renderQuests() {
  const done = state.questsDone || [];
  let html = '';
  let curIdx = -1;
  QUESTS.forEach((q, i) => { if (!questDone(q) && curIdx < 0) curIdx = i; });
  const nextQ = curIdx >= 0 ? QUESTS[curIdx] : null;
  for (let i = 0; i < QUESTS.length; i++) {
    const q = QUESTS[i];
    const isDone = questDone(q);
    const unlocked = questUnlocked(q);
    const p = isDone ? q.target : questProgress(q);
    const pct = q.target ? Math.round(p / q.target * 100) : 0;
    const box = i + 1;
    const caseMark = (box % 5 === 0) ? `<div class="quest-case">🎁 КЕЙС +${GEMS_PER_CASE} ${GEM_EMOJI}</div>` : '';
    html += `<div class="quest-row ${isDone ? 'quest-done' : ''} ${!unlocked ? 'quest-locked' : ''}">
      <div class="quest-head">
        <div class="quest-title">${isDone ? '✅' : (unlocked ? '▶' : '🔒')} ${q.title}</div>
        <div class="quest-num">${box}/${QUESTS.length}</div>
      </div>
      <div class="quest-desc">${q.desc}</div>
      <div class="quest-bar"><div class="quest-fill" style="width:${pct}%"></div></div>
      <div class="quest-meta">${p}/${q.target}${caseMark}</div>
      ${!isDone && unlocked
        ? (p >= q.target
          ? `<button class="btn btn-primary" data-qclaim="${q.id}">Забрать приз: ${q.coins} 💰 + ${q.fans} 👥</button>`
          : `<div class="quest-progress-note">Идёт выполнение...</div>`)
        : (isDone ? `<div class="quest-rewarded">Приз получен${q.gems ? ' · кейс открыт 🎁' : ''}</div>` : `<div class="quest-progress-note">Открывается после предыдущего</div>`)}
    </div>`;
  }
  $('#quests-list').innerHTML = html;
  $$('#quests-list [data-qclaim]').forEach(b => b.onclick = () => claimQuest(b.dataset.qclaim));
  const totalCases = Math.floor(done.length / 5);
  $('#quests-case').innerHTML = `Кейсов открыто: ${state.questCaseCount || 0} • Выполнено квестов: ${done.length}` +
    (nextQ ? '' : '<br>🏆 Все квесты пройдены! Ты — легенда!');
}

function claimQuest(id) {
  const q = QUESTS.find(x => x.id === id);
  if (!q || questDone(q) || !questUnlocked(q)) return;
  const p = questProgress(q);
  if (p < q.target) { toast('Квест ещё не выполнен'); return; }
  state.questsDone.push(q.id);
  state.coins += q.coins;
  state.fans += q.fans;
  const caseNo = state.questsDone.length;
  let gems = 0;
  if (caseNo % 5 === 0) {
    gems = q.gems || GEMS_PER_CASE;
    state.gems += gems;
    state.questCaseCount = (state.questCaseCount || 0) + 1;
  }
  save(); renderTop(); renderQuests();
  if (gems) toast(`🎉 Квест «${q.title}» выполнен! +${q.coins} 💰 +${q.fans} 👥 и КЕЙС открыт: +${gems} ${GEM_EMOJI}!`);
  else toast(`✅ Квест «${q.title}» выполнен! +${q.coins} 💰 +${q.fans} 👥`);
}

// ============ ДОНАТ-МАГАЗИН ============
function renderDonatShop() {
  const mine = new Set(state.players.filter(p => p.key && !p.shadow).map(p => p.key));
  let html = `<div class="shop-note">Кристаллов: <b style="color:var(--accent2);">${Math.floor(state.gems)} ${GEM_EMOJI}</b></div>`;
  for (const it of DONAT_PLAYERS) {
    const real = REAL_PLAYERS.find(r => r.name === it.name);
    if (!real) continue;
    const have = mine.has(real.name);
    html += `<div class="donat-row">
      <div class="donat-info">
        <div class="item-name">${RARITIES[rarityForRating(real.rating)].emoji} ${real.rating} • ${real.flag} ${real.name} <span class="item-meta">(${POS_LABEL[real.pos]})</span></div>
        <div class="item-desc">Сразу в команду. Один экземпляр на весь мир.</div>
      </div>
      ${have ? '<div class="item-meta">У тебя ✅</div>'
        : `<button class="btn btn-primary" data-dbuy="${real.name}" ${state.gems < it.price ? 'disabled' : ''}>${it.price} ${GEM_EMOJI}</button>`}
    </div>`;
  }
  $('#donat-list').innerHTML = html;
  $$('#donat-list [data-dbuy]').forEach(b => b.onclick = () => buyDonatPlayer(b.dataset.dbuy));
}

async function buyDonatPlayer(name) {
  const it = DONAT_PLAYERS.find(x => x.name === name);
  const real = REAL_PLAYERS.find(r => r.name === name);
  if (!it || !real) return;
  if (state.gems < it.price) { toast('Не хватает кристаллов 🔮'); return; }
  if (claimedKeys[name]) { toast('Этот игрок уже занят кем-то другим'); return; }
  const card = {
    id: idCounter++,
    key: real.name, name: real.name, pos: real.pos, rating: real.rating,
    rarity: rarityForRating(real.rating), flag: real.flag,
  };
  const res = await claimRemote(card);
  if (res === 'TAKEN') { toast('❌ Этого игрока только что забрали'); return; }
  state.gems -= it.price;
  state.players.push(card);
  if (state.starters.length < 11) state.starters.push(card.id);
  claimedKeys[name] = true; myKeys[name] = true;
  ensureLineup(); save(); renderTop(); renderDonatShop();
  toast(`🎉 ${real.flag} ${real.name} (${real.rating}) куплен за ${it.price} ${GEM_EMOJI}!`);
}
