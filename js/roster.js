// ============ РЕЕСТР УНИКАЛЬНЫХ КАРТОЧЕК И РЫНОК (Supabase) ============
// Каждый реальный футболист — один экземпляр на весь мир.
// Владелец и цена лота хранятся в таблице cards (Supabase).

async function syncRegistry() {
  if (SB_READY && currentUser) {
    try {
      const { data, error } = await sb.from('cards').select('*');
      if (error) return false;
      REGISTRY = {}; claimedKeys = {}; myKeys = {};
      for (const c of data || []) {
        healPlayer(c);
        REGISTRY[c.name] = {
          name: c.name, flag: c.flag, pos: c.pos, rating: c.rating, rarity: c.rarity,
          owner: c.owner, list_price: c.list_price, listed_by: c.listed_by, mut: c.mut || null,
        };
        if (c.owner) claimedKeys[c.name] = true;
        if (c.owner === currentUser) myKeys[c.name] = true;
      }
      REGISTRY_LOADED = true;
      healAllCards();
      return true;
    } catch (e) { return false; }
  }
  try {
    const s = localStorage.getItem(REG_KEY);
    const reg = s ? JSON.parse(s) : {};
    REGISTRY = reg; claimedKeys = {}; myKeys = {};
    for (const k of Object.keys(reg)) {
      const c = reg[k];
      healPlayer(c);
      if (c.owner) claimedKeys[k] = true;
      if (c.owner === currentUser) myKeys[k] = true;
    }
    REGISTRY_LOADED = true;
    healAllCards();
  } catch (e) {}
  return true;
}

async function claimRemote(p) {
  if (!p || p.shadow) return 'OK';
  claimLocal(p);
  if (!SB_READY) return 'OK';
  try {
    const { data, error } = await sb.rpc('claim_card', {
      _name: p.key, _owner: currentUser, _flag: p.flag, _pos: p.pos, _rating: p.rating, _rarity: p.rarity,
    });
    if (error) return 'ERR';
    return data === 'OK' ? 'OK' : data;
  } catch (e) { return 'ERR'; }
}

// При входе/регистрации отправляем локально занятые карточки на сервер
async function flushClaims() {
  if (!SB_READY || !state) return;
  const cards = [...state.players, state.held].filter(Boolean);
  const need = cards.filter(p => p.key && !p.shadow && (!REGISTRY[p.key] || !REGISTRY[p.key].owner));
  for (const p of need) {
    const res = await claimRemote(p);
    if (res === 'TAKEN') removeCardFromState(p.id);
  }
  await syncRegistry();
}

function removeCardFromState(id) {
  if (!state) return;
  state.players = state.players.filter(x => x.id !== id);
  state.starters = state.starters.filter(x => x !== id);
  if (state.held && state.held.id === id) state.held = null;
  delete transient[id];
  save();
  if (typeof renderTop === 'function') renderTop();
}

// Убираем из стейта карточки, которые больше не мои (проданы/выкуплены)
function reconcileOwned() {
  if (!state || !REGISTRY_LOADED) return;
  let changed = false, sold = false;
  const kept = state.players.filter(p => {
    if (!p.key || p.shadow) return true;
    const c = REGISTRY[p.key];
    if (!c) return true;
    if (c.owner && c.owner !== currentUser) {
      changed = true;
      if (c.listed_by === currentUser || myKeys[p.key] !== true) sold = true;
      return false;
    }
    return true;
  });
  if (changed) {
    state.players = kept;
    state.starters = state.starters.filter(id => state.players.some(p => p.id === id));
    topUpRoster();
    save(); renderTop();
    if (sold) { toast('Карточка продана на рынке — монеты уже у тебя 💰'); pullCoinsFromServer(); }
    else toast('Одна из карточек больше не твоя');
  }
}

// Доводим состав минимум до 11, если карточки кто-то забрал раньше
function topUpRoster() {
  if (!state) return;
  let guard = 0;
  while (state.players.length < 11 && guard++ < 30) {
    const p = generatePlayer('bronze', pick(POS_ORDER));
    if (p.shadow) break;
    state.players.push(p);
    if (state.starters.length < 11) state.starters.push(p.id);
  }
  ensureLineup();
}

async function pullCoinsFromServer() {
  if (!SB_READY || !currentUser) return;
  try {
    const { data, error } = await sb.from('saves').select('state').eq('nick', currentUser).maybeSingle();
    if (!error && data && data.state && typeof data.state.coins === 'number') {
      state.coins = data.state.coins;
      renderTop();
    }
  } catch (e) {}
}

async function releaseRemote(key) {
  releaseLocal(key);
  if (!SB_READY) return 'OK';
  try {
    const { data, error } = await sb.rpc('release_card', { _name: key, _owner: currentUser });
    if (error) return 'ERR';
    return data === 'OK' ? 'OK' : data;
  } catch (e) { return 'ERR'; }
}

async function listCardOnMarket(key, price) {
  price = Math.max(1, Math.floor(price));
  if (SB_READY) {
    try {
      const { data, error } = await sb.rpc('list_card', { _name: key, _seller: currentUser, _price: price });
      if (error) return { ok: false, msg: error.message };
      if (data === 'OK') {
        if (REGISTRY[key]) { REGISTRY[key].list_price = price; REGISTRY[key].listed_by = currentUser; }
        return { ok: true, msg: 'OK' };
      }
      return { ok: false, msg: data };
    } catch (e) { return { ok: false, msg: 'Сервер недоступен' }; }
  }
  const c = REGISTRY[key];
  if (c && c.owner === currentUser) { c.list_price = price; c.listed_by = currentUser; saveLocalRegistry(); return { ok: true, msg: 'OK' }; }
  return { ok: false, msg: 'NOT_OWNED' };
}

async function unlistCardOnMarket(key) {
  if (SB_READY) {
    try {
      const { data, error } = await sb.rpc('unlist_card', { _name: key, _seller: currentUser });
      if (error) return { ok: false, msg: error.message };
      if (data === 'OK' && REGISTRY[key]) { REGISTRY[key].list_price = null; REGISTRY[key].listed_by = null; }
      return { ok: data === 'OK', msg: data };
    } catch (e) { return { ok: false, msg: 'Сервер недоступен' }; }
  }
  const c = REGISTRY[key];
  if (c && c.listed_by === currentUser) { c.list_price = null; c.listed_by = null; saveLocalRegistry(); return { ok: true, msg: 'OK' }; }
  return { ok: false, msg: 'NOT_LISTED' };
}

function cardsForSale() {
  return Object.keys(REGISTRY).map(k => REGISTRY[k]).filter(c => c.list_price != null && c.owner && c.owner !== currentUser);
}

function listedByMe() {
  return Object.keys(REGISTRY).map(k => REGISTRY[k]).filter(c => c.listed_by === currentUser && c.owner === currentUser);
}

async function buyCardOnMarket(key) {
  const c = REGISTRY[key];
  if (!c || c.list_price == null) return { ok: false, msg: 'Карточка уже продана' };
  const price = c.list_price;
  if (SB_READY) {
    try {
      const { data, error } = await sb.rpc('buy_card', { _name: key, _buyer: currentUser });
      if (error) return { ok: false, msg: error.message };
      if (data !== 'OK') {
        if (data === 'NO_COINS') return { ok: false, msg: 'Не хватает монет' };
        if (data === 'NOT_LISTED') return { ok: false, msg: 'Карточка уже продана' };
        return { ok: false, msg: data };
      }
    } catch (e) { return { ok: false, msg: 'Сервер недоступен' }; }
    state.coins = Math.max(0, state.coins - price);
  } else {
    if (state.coins < price) return { ok: false, msg: 'Не хватает монет' };
    state.coins -= price;
    claimedKeys[key] = true; myKeys[key] = true;
    c.owner = currentUser; c.list_price = null; c.listed_by = null;
    saveLocalRegistry();
  }
  const card = {
    id: idCounter++, key: c.name, name: c.name, pos: c.pos, rating: c.rating, rarity: c.rarity, flag: c.flag,
  };
  if (c.mut) card.mut = c.mut;
  state.players.push(card);
  if (REGISTRY[key]) { REGISTRY[key].owner = currentUser; REGISTRY[key].list_price = null; REGISTRY[key].listed_by = null; }
  myKeys[key] = true;
  save(); renderTop();
  toast('✅ Куплено: ' + c.name + ' за ' + price + ' 💰');
  return { ok: true, msg: 'OK' };
}
