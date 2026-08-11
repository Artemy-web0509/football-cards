// ============ МАГАЗИН: продажа, баффы, кубки ============
// ===================== МАГАЗИН =====================
function renderMarket() {
  const active = $$('#screen-market .tab-btn.active')[0];
  renderMarketTab(active ? active.dataset.tab : 'sell');
}

function renderMarketTab(tab) {
  $$('#screen-market .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $$('#screen-market .tab-page').forEach(p => p.classList.remove('active'));
  $('#shop-' + tab).classList.add('active');
  if (tab === 'sell') renderSellShop();
  else if (tab === 'buffs') renderBuffsShop();
  else renderCupsShop();
}

function renderSellShop() {
  const ps = [...state.players].sort((a, b) => b.rating - a.rating);
  let html = '<div class="shop-note">Продай карточку магазину за монеты, либо выставь её на рынок другим игрокам.</div>';
  if (ps.length === 0) html += '<div class="shop-note">У тебя пока нет карточек.</div>';
  for (const p of ps) {
    const price = sellPrice(p);
    html += `<div class="item-row">
      <div class="item-name">${RARITIES[p.rarity].emoji} ${p.rating} • ${p.name} <span class="item-meta">(${POS_LABEL[p.pos]})</span></div>
      <div class="mkt-actions">
        <input type="number" class="mkt-price" data-mprice="${p.id}" placeholder="Цена" min="1" value="${price}">
        <button class="btn" data-mlist="${p.id}">🏪 На рынок</button>
        <button class="btn" data-ssell="${p.id}">${price} 💰</button>
      </div>
    </div>`;
  }
  $('#shop-sell').innerHTML = html;
  $$('#shop-sell [data-ssell]').forEach(b => b.onclick = () => sellPlayer(+b.dataset.ssell));
  $$('#shop-sell [data-mlist]').forEach(b => b.onclick = () => {
    const id = +b.dataset.mlist;
    const p = getPlayer(id); if (!p) return;
    const el = document.querySelector('#shop-sell [data-mprice="' + id + '"]');
    const price = el ? Math.floor(+el.value || sellPrice(p)) : sellPrice(p);
    listCardClick(p, price);
  });
}

async function listCardClick(p, price) {
  if (!p.key || p.shadow) { toast('Эту карточку нельзя выставить'); return; }
  const res = await listCardOnMarket(p.key, price);
  if (res.ok) { toast('🏪 «' + p.name + '» выставлен на рынок за ' + Math.floor(price) + ' 💰'); renderMarketTab('sell'); }
  else toast('❌ ' + res.msg);
}

async function buyCardClick(key) {
  const res = await buyCardOnMarket(key);
  if (res.ok) renderMarketBoard();
  else toast('❌ ' + res.msg);
}

async function renderMarketplace() {
  $('#shop-market').classList.add('active');
  renderMarketBoard();
}

async function renderMarketBoard() {
  await syncRegistry();
  reconcileOwned();
  const listed = cardsForSale().sort((a, b) => b.rating - a.rating || (b.list_price - a.list_price));
  const mine = listedByMe().sort((a, b) => b.rating - a.rating);
  let html = '<div class="shop-note">Уникальные игроки: каждый существует в одном экземпляре. Если кто-то забрал Роналду — единственный способ заполучить его это купить здесь.</div>';
  if (mine.length) {
    html += '<div class="shop-note" style="color:var(--accent2);">Мои лоты (снял с рынка — карточка вернётся к тебе):</div>';
    for (const c of mine) {
      html += `<div class="item-row">
        <div class="item-name">${RARITIES[c.rarity].emoji} ${c.rating} • ${c.name} <span class="item-meta">(${POS_LABEL[c.pos]})</span></div>
        <button class="btn" data-unlist="${c.name}">${c.list_price} 💰 · Снять</button>
      </div>`;
    }
  }
  html += '<div class="shop-note">Сейчас продаётся:</div>';
  if (!listed.length) html += '<div class="shop-note">Пока пусто — выставь свою карточку во вкладке «Продать»!</div>';
  for (const c of listed) {
    html += `<div class="item-row">
      <div class="item-name">${RARITIES[c.rarity].emoji} ${c.rating} • ${c.name} <span class="item-meta">(${POS_LABEL[c.pos]}) · продаёт ${c.listed_by}</span></div>
      <button class="btn" data-buy="${c.name}">Купить за ${c.list_price} 💰</button>
    </div>`;
  }
  $('#shop-market').innerHTML = html;
  $$('#shop-market [data-buy]').forEach(b => b.onclick = () => buyCardClick(b.dataset.buy));
  $$('#shop-market [data-unlist]').forEach(b => b.onclick = async () => {
    const res = await unlistCardOnMarket(b.dataset.unlist);
    if (res.ok) toast('Лот снят — карточка снова твоя');
    else toast('❌ ' + res.msg);
    renderMarketBoard();
  });
}

function renderBuffsShop() {
  let html = '<div class="shop-note">Постоянные баффы за фанатов 👥. Каждая покупка сильнее, но дороже.</div>';
  for (const b of BUFFS) {
    const lvl = state.buffs[b.id] || 0;
    const maxed = lvl >= b.maxLevel;
    const cost = buffCost(b, lvl);
    const pct = b.incMult ? Math.round(lvl * b.incMult * 100) + '%' : lvl + '';
    html += `<div class="item-row">
      <div><div class="item-name">${b.icon} ${b.name} <span class="item-meta">ур. ${lvl} (эффект ${pct})</span></div>
        <div class="item-desc">${b.desc}</div></div>
      ${maxed ? '<div class="item-meta">МАКС</div>' : `<button class="btn" data-bbuy="${b.id}">${cost} 👥</button>`}
    </div>`;
  }
  $('#shop-buffs').innerHTML = html;
  $$('#shop-buffs [data-bbuy]').forEach(btn => btn.onclick = () => buyBuff(btn.dataset.bbuy));
}

function buyBuff(id) {
  const b = BUFFS.find(x => x.id === id);
  const lvl = state.buffs[id] || 0;
  if (lvl >= b.maxLevel) { toast('Максимум!'); return; }
  const cost = buffCost(b, lvl);
  if (state.fans < cost) { toast('Не хватает фанатов! Побеждай в матчах 👥'); return; }
  state.fans -= cost;
  state.buffs[id] = lvl + 1;
  save(); renderTop(); renderBuffsShop(); renderOdds();
}

function renderCupsShop() {
  let html = '<div class="shop-note">Кубки дают постоянный множитель дохода. Покупаются за фанатов 👥.</div>';
  for (const c of CUPS) {
    const owned = state.cups.includes(c.id);
    html += `<div class="item-row">
      <div><div class="item-name">🏆 ${c.name} <span class="item-meta">+${Math.round(c.incMult * 100)}% дохода</span></div></div>
      ${owned ? '<div class="item-meta">Куплено ✅</div>' : `<button class="btn" data-cbuy="${c.id}">${c.cost} 👥</button>`}
    </div>`;
  }
  $('#shop-cups').innerHTML = html;
  $$('#shop-cups [data-cbuy]').forEach(btn => btn.onclick = () => buyCup(btn.dataset.cbuy));
}

function buyCup(id) {
  const c = getCup(id);
  if (state.cups.includes(id)) { toast('Уже куплено'); return; }
  if (state.fans < c.cost) { toast('Не хватает фанатов! Побеждай в матчах 👥'); return; }
  state.fans -= c.cost;
  state.cups.push(id);
  save(); renderTop(); renderCupsShop();
  toast('🏆 ' + c.name + ' куплен! Доход вырос');
}

// ============ ИНДЕКС ВСЕХ ИГРОКОВ ============
let indexFilter = 'all';
function renderPlayerIndex() {
  const FILTERS = [
    ['all', 'Все'], ['GK', 'Вратари'], ['DF', 'Защитники'], ['MF', 'Полузащитники'], ['FW', 'Нападающие'],
    ['owned', 'Мои'], ['missing', 'Свободные'],
  ];
  $('#index-filters').innerHTML = FILTERS.map(([k, t]) =>
    `<button class="tab-btn ${indexFilter === k ? 'active' : ''}" data-idxf="${k}">${t}</button>`).join('');
  $$('#index-filters [data-idxf]').forEach(b => b.onclick = () => { indexFilter = b.dataset.idxf; renderPlayerIndex(); });

  const mine = new Set(state.players.filter(p => p.key && !p.shadow).map(p => p.key));
  const claimed = new Set(Object.keys(REGISTRY).filter(k => REGISTRY[k].owner));
  let list = REAL_PLAYERS.map(r => ({ ...r, owned: mine.has(r.name), claimed: claimed.has(r.name) }));
  if (indexFilter === 'GK' || indexFilter === 'DF' || indexFilter === 'MF' || indexFilter === 'FW') list = list.filter(x => x.pos === indexFilter);
  else if (indexFilter === 'owned') list = list.filter(x => x.owned);
  else if (indexFilter === 'missing') list = list.filter(x => !x.owned);
  list.sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));

  if (!list.length) { $('#player-index').innerHTML = '<div class="shop-note">Никого не найдено.</div>'; return; }
  const counts = { all: REAL_PLAYERS.length, owned: list.length };
  $('#player-index').innerHTML =
    `<div class="shop-note">Всего в базе: ${REAL_PLAYERS.length} игроков. У тебя: ${mine.size}. Свободно: ${REAL_PLAYERS.length - claimed.size}.</div>` +
    list.map(r => `
      <div class="item-row idx-row">
        <div class="item-name">${RARITIES[rarityForRating(r.rating)].emoji} ${r.rating} • ${r.flag} ${r.name} <span class="item-meta">${POS_LABEL[r.pos]}</span></div>
        <div class="item-meta">${r.owned ? '<span style="color:var(--accent);font-weight:800;">У тебя ✅</span>' : (r.claimed ? 'Занята' : 'Свободна 🆓')}</div>
      </div>`).join('');
}

