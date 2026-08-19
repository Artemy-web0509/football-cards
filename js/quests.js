// ============ КВЕСТЫ: 4 полосы по 5 заданий. Приз за полосу, кейс с 🔮 после всех 4 ============

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

const Q_ICON = {
  wins: '⚽', spins: '🎡', income: '💰', coins: '💰', fans: '👥',
  players: '🎴', gold: '🥇', diamond: '💎', secret: '👑', mutation: '🧬',
  cups: '🏆', upgrades: '🛠', beats: '🤺', pvp: '⚔️',
};

function rowDoneCount(r) { return QUESTS.slice(r * 5, r * 5 + 5).filter(questDone).length; }

// Случайный игрок за полосу: редкость из пула ROW_PRIZES[row], позиция случайная
function rollRowPlayer(row) {
  const rp = ROW_PRIZES[row];
  const pool = [];
  rp.pool.forEach((t, i) => {
    const w = i === rp.pool.length - 1 ? 3 : 1;
    for (let k = 0; k < w; k++) pool.push(t);
  });
  const pos = pick(['GK', 'DF', 'MF', 'FW']);
  return generatePlayer(pick(pool), pos);
}

function renderQuests() {
  const done = state.questsDone || [];
  const allDone = done.length >= QUESTS.length;
  let html = '<div class="qgrid">';
  for (let r = 0; r < 4; r++) {
    const rowQs = QUESTS.slice(r * 5, r * 5 + 5);
    const rd = rowDoneCount(r);
    html += `<div class="qrow ${rd >= 5 ? 'qrow-done' : ''}">`;
    rowQs.forEach((q, k) => {
      const isDone = questDone(q);
      const unlocked = questUnlocked(q);
      const claimable = unlocked && !isDone && questProgress(q) >= q.target;
      const cls = isDone ? 'qcell-done' : (claimable ? 'qcell-claim' : (unlocked ? 'qcell-act' : 'qcell-lock'));
      const emoji = isDone ? '✅' : (unlocked ? (Q_ICON[q.type] || '❓') : '🔒');
      html += `<div class="qcell ${cls}" data-qid="${q.id}">
        <div class="qc-num">${r * 5 + k + 1}</div>
        <div class="qc-ico">${emoji}</div>
        ${claimable ? '<div class="qc-badge">!</div>' : ''}
      </div>`;
    });
    html += '</div>';
  }
  html += '</div>';
  html += '<div class="qprizes">';
  ROW_PRIZES.forEach((rp, r) => {
    const rd = rowDoneCount(r);
    const emojis = rp.pool.map(t => RARITIES[t].emoji).join(' ');
    html += `<div class="qprize ${rd >= 5 ? 'qprize-done' : ''}">
      <div class="qprize-label">Полоса ${r + 1}</div>
      <div class="qprize-val">${rp.label}</div>
      <div class="qprize-reward">${emojis} случайный</div>
      <div class="qprize-state">${rd >= 5 ? '✅' : ''}</div>
    </div>`;
  });
  html += '</div>';
  html += '<div class="qdetail" id="quest-detail"></div>';
  $('#quests-list').innerHTML = html;
  $$('#quests-list .qcell').forEach(c => c.onclick = () => renderQuestDetail(c.dataset.qid));
  const cur = QUESTS.find(q => !questDone(q));
  renderQuestDetail(cur ? cur.id : QUESTS[QUESTS.length - 1].id);
  $('#quests-case').innerHTML = `Кейсов 🔮 открыто: ${state.questCaseCount || 0} • Квестов: ${done.length}/${QUESTS.length}` +
    (allDone
      ? `<br>🏆 Все 4 полосы пройдены! Ты — легенда!<br><button class="btn btn-primary" data-qreset="1">🔁 Начать полосу заново</button>`
      : `<br><span class="quest-hint">🎁 После всех 4 полос — кейс с 🔮: обычно немного, а редко — до 1000!</span>`);
  const rb = $('#quests-case [data-qreset]');
  if (rb) rb.onclick = () => questReset();
}

function renderQuestDetail(qid) {
  const q = QUESTS.find(x => x.id === qid);
  if (!q) return;
  const isDone = questDone(q);
  const unlocked = questUnlocked(q);
  const p = isDone ? q.target : questProgress(q);
  const pct = q.target ? Math.round(p / q.target * 100) : 0;
  const rp = ROW_PRIZES[Math.floor(QUESTS.indexOf(q) / 5)];
  let inner;
  if (isDone) {
    inner = `<div class="qd-title">✅ ${q.title}</div>
      <div class="qd-done">Приз получен · Задание ${QUESTS.indexOf(q) + 1}/20</div>`;
  } else if (unlocked) {
    inner = `<div class="qd-title">▶ ${q.title}</div>
      <div class="qd-desc">${q.desc}</div>
      <div class="quest-bar"><div class="quest-fill" style="width:${pct}%"></div></div>
      <div class="quest-meta">${p}/${q.target}</div>
      ${p >= q.target
        ? `<button class="btn btn-primary" data-qclaim="${q.id}">Забрать приз</button>`
        : '<div class="quest-progress-note">Идёт выполнение...</div>'}`;
  } else {
    inner = `<div class="qd-title">🔒 ${q.title}</div>
      <div class="qd-desc">${q.desc}</div>
      <div class="quest-progress-note">Открывается после предыдущего</div>`;
  }
  inner += `<div class="qd-row">Приз полосы: ${rp.label} · ${rp.pool.map(t => RARITIES[t].emoji).join(' ')}</div>`;
  $('#quest-detail').innerHTML = inner;
  const b = $('#quest-detail [data-qclaim]');
  if (b) b.onclick = () => claimQuest(b.dataset.qclaim);
}

function claimQuest(id) {
  const q = QUESTS.find(x => x.id === id);
  if (!q || questDone(q) || !questUnlocked(q)) return;
  const p = questProgress(q);
  if (p < q.target) { toast('Квест ещё не выполнен'); return; }
  const row = Math.floor(QUESTS.indexOf(q) / 5);
  state.questsDone.push(q.id);
  let msg = `✅ Квест «${q.title}» выполнен!`;
  if (state.questsDone.length % 5 === 0) {
    const pl = rollRowPlayer(row);
    state.players.push(pl);
    if (state.starters.length < 11) state.starters.push(pl.id);
    const rname = RARITIES[pl.rarity].name;
    const remoji = RARITIES[pl.rarity].emoji;
    msg += ` | 🎁 Приз полосы ${row + 1}: ${remoji} ${pl.name} (${pl.rating}, ${rname})!`;
    if (state.questsDone.length === QUESTS.length) {
      const gems = rollGemsCase();
      state.gems += gems;
      state.questCaseCount = (state.questCaseCount || 0) + 1;
      msg += ` | 🎁 КЕЙС за все полосы: +${gems} ${GEM_EMOJI}`;
    }
  }
  save(); renderTop(); renderQuests();
  toast(msg);
}

function questReset() {
  if (!confirm('Начать полосу заново? Полученные призы и 🔮 останутся, но все задания обнулятся.')) return;
  state.questsDone = [];
  save(); renderTop(); renderQuests();
  toast('🔁 Полоса квестов начата заново');
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
