// ===================== ФУТБОЛЬНЫЕ КАРТОЧКИ 3D =====================
'use strict';

// ---------- Хелперы ----------
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

let idCounter = 0;
let transient = {};
let currentUser = null;
let activeScreen = 'login';
let currentField = 0;
let spinning = false;
let match = null;
let rounds = [];
let isAdmin = false;

const ADMIN_NICK = 'Artikart';
const ADMIN_PASS = 'ArtikartLuk0509';

const ACCOUNTS_KEY = 'fc_accounts';
const CUR_KEY = 'fc_current_user';
const SAVE_PREFIX = 'fc_save_';

function getPlayer(id) { return state.players.find(p => p.id === id) || transient[id] || null; }

function generatePlayer(rarityId, pos, forcedRating) {
  const r = RARITIES[rarityId];
  const rating = forcedRating != null ? forcedRating : rnd(r.rating[0], r.rating[1]);
  const flag = pick(Object.keys(NATIONS));
  const name = rarityId === 'bingi' ? 'Бинги' : pick(NATIONS[flag]);
  return {
    id: idCounter++,
    name, pos, rating, rarity: rarityId, flag,
  };
}

// ---------- Логин / регистрация ----------
function hashPass(p) { let h = 5381; for (let i = 0; i < p.length; i++) h = ((h << 5) + h + p.charCodeAt(i)) | 0; return 'h' + (h >>> 0).toString(16); }
function getAccounts() { try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '{}'); } catch (e) { return {}; } }
function setAccounts(a) { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(a)); }

function loginError(msg) { $('#login-error').textContent = msg; }

function createLocalAccountState(nick) {
  currentUser = nick;
  idCounter = 0;
  state = defaultState();
  save();
  return state;
}

async function register() {
  const nick = $('#login-nick').value.trim();
  const pass = $('#login-pass').value;
  if (!nick || !pass) return loginError('Введи никнейм и пароль');
  if (nick === ADMIN_NICK) return loginError('Этот ник зарезервирован для админа');
  const accs = getAccounts();
  if (accs[nick]) return loginError('Такой никнейм уже занят');
  try {
    const r = await fetch('/api/account', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'register', nick, pass: hashPass(pass) }),
    });
    const d = r && r.ok ? await r.json() : { ok: false };
    if (!d.ok) return loginError(d.err || 'Не удалось зарегистрироваться');
    accs[nick] = hashPass(pass); setAccounts(accs);
  } catch (e) {
    accs[nick] = hashPass(pass); setAccounts(accs);
  }
  currentUser = nick;
  localStorage.setItem(CUR_KEY, nick);
  createLocalAccountState(nick);
  enterWorld();
}

async function login() {
  const nick = $('#login-nick').value.trim();
  const pass = $('#login-pass').value;
  if (!nick || !pass) return loginError('Введи никнейм и пароль');
  if (nick === ADMIN_NICK) {
    if (pass !== ADMIN_PASS) return loginError('Неверный пароль админа');
    isAdmin = true;
    currentUser = nick;
    localStorage.setItem(CUR_KEY, nick);
    state = await load() || defaultState();
    idCounter = state.nextId || 0;
    applyOfflineIncome();
    enterWorld();
    return;
  }
  const accs = getAccounts();
  let ok = !!accs[nick] && accs[nick] === hashPass(pass);
  try {
    const r = await fetch('/api/account', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', nick, pass: hashPass(pass) }),
    });
    const d = r && r.ok ? await r.json() : null;
    if (d && !d.ok) return loginError(d.err || 'Неверный пароль');
    if (d && d.ok) ok = true;
  } catch (e) {
    if (!ok) return loginError('Сервер недоступен. Никнейм не найден на этом устройстве');
  }
  if (!ok) return loginError('Никнейм не найден. Зарегистрируйся');
  if (!accs[nick]) { accs[nick] = hashPass(pass); setAccounts(accs); }
  isAdmin = false;
  currentUser = nick;
  localStorage.setItem(CUR_KEY, nick);
  state = await load() || defaultState();
  idCounter = state.nextId || 0;
  applyOfflineIncome();
  enterWorld();
}

function logout() {
  if (currentUser && state && navigator.sendBeacon) {
    navigator.sendBeacon('/api/save', JSON.stringify({ nick: currentUser, state }));
  }
  currentUser = null;
  isAdmin = false;
  localStorage.removeItem(CUR_KEY);
  $('#topbar').classList.add('hidden');
  showScreen('login');
}

function enterWorld() {
  $('#topbar').classList.remove('hidden');
  $('#admin-btn').classList.toggle('hidden', !isAdmin);
  refreshMyFieldOwner();
  updateHeldHud();
  renderTop();
  showScreen('world');
}

// ---------- Состояние ----------
let state = null;

function defaultState() {
  const players = [];
  const starters = [];
  const make = pos => { const p = generatePlayer('bronze', pos, rnd(62, 71)); players.push(p); starters.push(p.id); return p; };
  make('GK');
  for (let i = 0; i < 4; i++) make('DF');
  for (let i = 0; i < 3; i++) make('MF');
  for (let i = 0; i < 3; i++) make('FW');
  return {
    coins: START_COINS, fans: 0,
    players, starters, formation: '4-3-3',
    buffs: {}, cups: [], upgrades: { possession: 0, income: 0 },
    nextId: idCounter,
    beatenOpponents: [], matchesWon: 0, pvpWins: 0,
    held: null,
    world: { ...PLAYER_SPAWN },
    luckBoost: null,
    nextMutationAt: Date.now() + MUTATION_INTERVAL,
    lastTick: Date.now(),
  };
}

// ---------- Владельцы полей ----------
function homeFieldIndex() {
  let h = 0; const n = currentUser || '';
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  return h % BASES.length;
}

let FIELD_OWNERS = null;
function makeOwnerCards() {
  const cards = [];
  const make = pos => { const p = generatePlayer(pickRarity(), pos); cards.push(p); return p; };
  make('GK');
  for (let i = 0; i < 4; i++) make('DF');
  for (let i = 0; i < 3; i++) make('MF');
  for (let i = 0; i < 3; i++) make('FW');
  return cards;
}
function initFieldOwners() {
  FIELD_OWNERS = BASES.map(() => null);
}
function refreshMyFieldOwner() {
  if (!FIELD_OWNERS) initFieldOwners();
  const home = homeFieldIndex();
  FIELD_OWNERS[home] = {
    nick: currentUser,
    color: playerColor(currentUser),
    cards: state.starters.map(getPlayer).filter(Boolean),
  };
}
function fieldOwnerCards(i) {
  if (server.owners && server.owners[i]) return server.owners[i];
  return FIELD_OWNERS ? FIELD_OWNERS[i] : null;
}

let cloudSaveTimer = null;
function scheduleCloudSave() {
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(() => {
    if (!currentUser || !state) return;
    fetch('/api/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nick: currentUser, state }),
    }).catch(() => {});
  }, 700);
}

function save() {
  if (!currentUser || !state) return;
  state.nextId = idCounter;
  localStorage.setItem(SAVE_PREFIX + currentUser, JSON.stringify(state));
  scheduleCloudSave();
}

function normalizeState(st) {
  if (!st) return null;
  st.beatenOpponents = st.beatenOpponents || [];
  st.world = st.world || { ...PLAYER_SPAWN };
  st.luckBoost = st.luckBoost || null;
  st.nextMutationAt = st.nextMutationAt || (Date.now() + MUTATION_INTERVAL);
  if (worldCollides(st.world.x, st.world.z)) st.world = { ...PLAYER_SPAWN };
  return st;
}

function loadLocal() {
  if (!currentUser) return null;
  try {
    const s = localStorage.getItem(SAVE_PREFIX + currentUser);
    if (!s) return null;
    return JSON.parse(s);
  } catch (e) { return null; }
}

async function loadServerSave() {
  if (!currentUser) return null;
  try {
    const r = await fetch('/api/save?nick=' + encodeURIComponent(currentUser));
    if (r && r.ok) {
      const d = await r.json();
      if (d && d.ok && d.save) return d.save;
    }
  } catch (e) {}
  return null;
}

async function load() {
  const serverSave = await loadServerSave();
  const st = normalizeState(serverSave) || normalizeState(loadLocal());
  if (st && !serverSave) scheduleCloudSave();
  return st;
}

// ---------- Экономика ----------
function getCup(id) { return CUPS.find(c => c.id === id); }

function playerIncome(p) {
  const r = RARITIES[p.rarity];
  let buff = 1 + (state.buffs.all_income || 0) * 0.25;
  const rb = BUFFS.find(b => b.id === p.rarity + '_income');
  if (rb) buff += (state.buffs[rb.id] || 0) * rb.incMult;
  const upg = 1 + state.upgrades.income * 0.10;
  const cups = 1 + state.cups.reduce((s, c) => s + getCup(c).incMult, 0);
  let mut = 1;
  if (p.mut) { const m = MUTATIONS.find(x => x.id === p.mut.id); if (m) mut = p.mut.mult || m.base; }
  if (p.kind) mut *= loveBuff();
  return p.rating * r.incomeMult * buff * upg * cups * mut * 0.05;
}

function incomePerSec() { return state ? state.players.reduce((s, p) => s + playerIncome(p), 0) : 0; }
function sellPrice(p) { return Math.round(p.rating * RARITIES[p.rarity].sellMult * 1.6); }
function buyPrice(p) { return Math.round(sellPrice(p) * 1.25); }
function upgradeCost(u, lvl) { return Math.round(u.cost * Math.pow(u.costStep, lvl)); }
function buffCost(b, lvl) { return Math.round(b.cost * Math.pow(b.costStep, lvl)); }

function activeLuckBoost() {
  const lb = state.luckBoost;
  if (!lb || !lb.tier || lb.until <= Date.now()) return null;
  return LUCK_BOOSTS.find(t => t.id === lb.tier) || null;
}

function pickRarity() {
  const w = {}; let total = 0;
  for (const r of RARITY_KEYS) {
    let c = RARITIES[r].chance;
    for (const b of BUFFS) {
      if (b.chanceBonus && b.chanceBonus[r] && (state.buffs[b.id] || 0) > 0) c += b.chanceBonus[r] * state.buffs[b.id];
    }
    const lb = activeLuckBoost();
    if (lb) {
      if (r === 'gold') c += lb.gold;
      else if (r === 'diamond') c += lb.diamond;
      else if (r === 'secret') c += lb.secret;
    }
    w[r] = c; total += c;
  }
  let x = Math.random() * total;
  for (const r of RARITY_KEYS) { x -= w[r]; if (x <= 0) return r; }
  return 'bronze';
}

// ---------- Состав ----------
function formationCounts() {
  const f = FORMATIONS[state.formation];
  return { GK: 1, DF: f.df, MF: f.mf, FW: f.fw };
}

function ensureLineup() {
  const counts = formationCounts();
  const starters = state.starters.map(getPlayer).filter(Boolean);
  const used = [];
  for (const pos of POS_ORDER) {
    const inPos = starters.filter(p => p.pos === pos);
    for (const p of inPos.slice(0, counts[pos])) used.push(p.id);
  }
  const pool = state.players.filter(p => !used.includes(p.id)).sort((a, b) => b.rating - a.rating);
  const final = [...used];
  for (const pos of POS_ORDER) {
    let need = counts[pos] - final.filter(id => getPlayer(id) && getPlayer(id).pos === pos).length;
    let i = 0;
    while (need > 0 && i < pool.length) {
      if (pool[i].pos === pos) { final.push(pool[i].id); pool.splice(i, 1); need--; }
      else i++;
    }
  }
  state.starters = final;
}

function lineupGroups() {
  const g = { GK: [], DF: [], MF: [], FW: [] };
  for (const id of state.starters) { const p = getPlayer(id); if (p) g[p.pos].push(id); }
  return g;
}

function autofill() {
  const counts = formationCounts();
  const sorted = [...state.players].sort((a, b) => b.rating - a.rating);
  const pickBy = { GK: [], DF: [], MF: [], FW: [] };
  for (const p of sorted) if (pickBy[p.pos].length < counts[p.pos]) pickBy[p.pos].push(p.id);
  state.starters = POS_ORDER.flatMap(pos => pickBy[pos]);
  save(); refreshMyFieldOwner();
  if (activeScreen === 'field') renderFieldScreen(currentField);
  else if (activeScreen === 'backpack') renderBackpack();
}

function teamStats(lineup) {
  const ps = lineup.map(getPlayer).filter(Boolean);
  const sum = arr => arr.reduce((s, v) => s + v, 0);
  const avg = arr => arr.length ? sum(arr) / arr.length : 0;
  const gk = ps.filter(p => p.pos === 'GK').map(p => p.rating);
  const df = ps.filter(p => p.pos === 'DF').map(p => p.rating);
  const mf = ps.filter(p => p.pos === 'MF').map(p => p.rating);
  const fw = ps.filter(p => p.pos === 'FW').map(p => p.rating);
  return {
    overall: avg(ps.map(p => p.rating)),
    attack: avg([...mf, ...fw]),
    defense: avg([...gk, ...df]),
  };
}

// ---------- Карточки (HTML) ----------
function mutationOf(p) {
  if (!p || !p.mut) return null;
  const m = MUTATIONS.find(x => x.id === p.mut.id);
  return m ? { icon: m.icon, name: m.name, mult: p.mut.mult || m.base, color: m.color || '#ffd54a' } : null;
}

function parentOf(p) {
  if (!p || !p.kind) return null;
  if (p.kind === 'mom') return { icon: '👩', name: 'Мама', color: '#ff7bac' };
  if (p.kind === 'dad') return { icon: '👨', name: 'Папа', color: '#7bb8ff' };
  return null;
}

function makeParent(kind) {
  return {
    id: idCounter++,
    name: kind === 'mom' ? 'Мама' : 'Папа',
    pos: 'MF',
    rating: 99,
    rarity: 'secret',
    flag: kind === 'mom' ? '👩' : '👨',
    kind,
  };
}

function loveBuff() {
  if (!state) return 1;
  const inTeam = state.starters.map(getPlayer).filter(Boolean);
  return inTeam.some(p => p.kind === 'mom') && inTeam.some(p => p.kind === 'dad') ? 2 : 1;
}

function faceExtra(p) {
  const mu = mutationOf(p);
  if (mu) return { icon: mu.icon, mult: mu.mult, label: '', color: '#ffe66b' };
  const pr = parentOf(p);
  if (pr) {
    const love = loveBuff();
    if (love > 1) return { icon: '💞', mult: null, label: ' Любовь', color: '#ff9dc5' };
    return { icon: pr.icon, mult: null, label: '', color: '#fff' };
  }
  return null;
}

function cardHTML(p) {
  const r = RARITIES[p.rarity];
  const mu = mutationOf(p);
  const pr = parentOf(p);
  const love = pr && loveBuff() > 1;
  return `<div class="pcard rarity-${p.rarity}">
    <div class="pc-flag">${p.flag}</div>
    <div class="pc-rating">${p.rating}</div>
    <div class="pc-pos">${POS_LABEL[p.pos]}</div>
    <div class="pc-name">${p.name}</div>
    <div class="pc-rname">${r.emoji} ${r.name}${pr ? ' ' + pr.icon : ''}</div>
    <div class="pc-income">+${playerIncome(p).toFixed(1)}/сек${mu ? ` <span class="pc-mut" title="Мутация: ${mu.name}">${mu.icon}×${mu.mult}</span>` : ''}${love ? ' <span class="pc-love" title="💞 Любовь Мамы и Папы: доход ×2">💞</span>' : ''}</div>
  </div>`;
}

function miniCardHTML(p) {
  const r = RARITIES[p.rarity];
  const mu = mutationOf(p);
  const pr = parentOf(p);
  const love = pr && loveBuff() > 1;
  return `<div class="pcard-mini rarity-${p.rarity}">
    <div class="pc-flag">${p.flag}</div>
    <div class="pc-rating">${p.rating}</div>
    <div class="pc-pos">${POS_LABEL[p.pos]}</div>
    <div class="pc-name">${p.name}</div>
    <div class="pc-rname">${r.emoji} ${r.name}${pr ? ' ' + pr.icon : ''}${mu ? ` ${mu.icon}×${mu.mult}` : ''}${love ? ' 💞' : ''}</div>
  </div>`;
}

// ---------- Топбар ----------
function renderTop() {
  if (!state) return;
  $('#coins-display').textContent = '💰 ' + Math.floor(state.coins);
  $('#income-display').textContent = '+' + incomePerSec().toFixed(1) + '/сек';
  $('#fans-display').textContent = '👥 ' + Math.floor(state.fans);
  $('#user-display').textContent = '👤 ' + currentUser;
}

function renderBoostAdmin() {
  const min = Math.max(1, Math.min(60, Math.floor(+$('#adm-boost-min').value || 1)));
  $('#adm-boost-tier').innerHTML = LUCK_BOOSTS.map(t =>
    `<option value="${t.id}">${t.icon} ${t.name} — ${t.desc}</option>`).join('');
  const status = $('#adm-boost-status');
  const lb = activeLuckBoost();
  if (lb && state.luckBoost) {
    const secs = Math.max(0, Math.floor((state.luckBoost.until - Date.now()) / 1000));
    status.textContent = `Сейчас активна: ${lb.icon} ${lb.name}, осталось ${Math.floor(secs / 60)}:${('0' + (secs % 60)).slice(-2)}`;
  } else {
    status.textContent = 'Удача выключена. Длительность × цена: ' + LUCK_BOOSTS.map(t => `${t.icon} ${t.costPerMin * min}💰`).join(' · ');
  }
}

function adminGiveBoost() {
  const tierId = $('#adm-boost-tier').value;
  const tier = LUCK_BOOSTS.find(t => t.id === tierId);
  if (!tier) return;
  const min = Math.max(1, Math.min(60, Math.floor(+$('#adm-boost-min').value || 1)));
  const target = adminTargetNick();
  if (!target) {
    state.luckBoost = { tier: tier.id, until: Date.now() + min * 60000 };
    save(); renderTop(); renderBoostAdmin();
    toast(`${tier.icon} Удача «${tier.name}» включена на ${min} мин!`);
    return;
  }
  adminRemoteGive('boost', { tier: tier.id, minutes: min });
}

// ---------- Навигация ----------
function showScreen(name) {
  activeScreen = name;
  $$('.screen').forEach(s => s.classList.remove('active'));
  const el = $('#screen-' + name);
  el.classList.add('active');
  const scroll = (name === 'spinner' || name === 'field' || name === 'backpack' || name === 'arena' || name === 'market' || name === 'match' || name === 'admin' || name === 'luck' || name === 'fieldupg');
  if (scroll) el.classList.add('scroll-screen'); else el.classList.remove('scroll-screen');
  if (name === 'spinner') renderSpinnerPanel();
  else if (name === 'field') renderFieldScreen(currentField);
  else if (name === 'backpack') renderBackpack();
  else if (name === 'arena') renderArena();
  else if (name === 'market') renderMarket();
  else if (name === 'luck') renderLuckUpgrades();
  else if (name === 'fieldupg') renderFieldUpg();
  else if (name === 'admin') renderAdmin();
  else if (name === 'match') { resizeMatch(); if (match) renderMatchScreen(); }
  else if (name === 'world') resizeWorld();
  window.scrollTo(0, 0);
}

// ===================== 3D МИР =====================
// Размеры поля и спиннера у каждой базы в 3D-мире
const FIELD_W = 34, FIELD_D = 26, FIELD_GAP = 12, SPIN_OFFSET = 22;

function fieldRectFor(base) { return { x0: base.x - FIELD_W / 2, x1: base.x + FIELD_W / 2, z0: base.z + FIELD_GAP, z1: base.z + FIELD_GAP + FIELD_D }; }
function spinnerPosFor(base) { return { x: base.x + SPIN_OFFSET, z: base.z + FIELD_GAP + FIELD_D / 2 }; }

// Интерактивные объекты: 8 спиннеров, 8 полей, табло удачи, табло прокачки полей, арена в центре, магазины
const SPINNERS = BASES.map((b, i) => ({ type: 'spinner', idx: i, name: '🎡 Спиннер', x: b.x + SPIN_OFFSET, z: b.z + FIELD_GAP + FIELD_D / 2, w: 4, d: 4, solid: false }));
const FIELDS = BASES.map((b, i) => ({ type: 'field', idx: i, name: b.name, x: b.x, z: b.z + FIELD_GAP + FIELD_D / 2, w: FIELD_W, d: FIELD_D, solid: false }));
const LUCK_SIGNS = BASES.map((b, i) => {
  const sp = spinnerPosFor(b);
  return { type: 'luck', idx: i, name: '🍀 Табло удачи', x: sp.x + 6, z: sp.z, w: 4, d: 2, solid: false };
});
const FIELDUPG_SIGNS = BASES.map((b, i) => {
  return { type: 'fieldupg', idx: i, name: '⚽ Табло поля', x: b.x - FIELD_W / 2 - 8, z: b.z + FIELD_GAP + FIELD_D / 2, w: 4, d: 2, solid: false };
});
const ARENA_OBJ = { type: 'arena', name: ARENA.name, x: ARENA.x, z: ARENA.z, w: ARENA.size, d: ARENA.size, solid: false };
const MARKET_OBJ = { type: 'market', name: MARKET.name, color: MARKET.color, x: MARKET.x, z: MARKET.z, w: 16, d: 16, solid: true };
const INTERACTIVES = [...SPINNERS, ...FIELDS, ...LUCK_SIGNS, ...FIELDUPG_SIGNS, ARENA_OBJ, MARKET_OBJ];
const SOLID_OBJECTS = INTERACTIVES.filter(o => o.solid);

function activeInteractives() {
  const my = homeFieldIndex();
  return INTERACTIVES.filter(o => o.type !== 'field' || o.idx === my);
}

function inFieldArea(x, z) {
  for (const b of BASES) {
    if (Math.abs(x - b.x) < FIELD_W / 2 + 3 && Math.abs(z - (b.z + FIELD_GAP + FIELD_D / 2)) < FIELD_D / 2 + 3) return true;
    const sp = { x: b.x + SPIN_OFFSET, z: b.z + FIELD_GAP + FIELD_D / 2 };
    if (Math.hypot(x - sp.x, z - sp.z) < 6) return true;
    const ls = { x: sp.x + 6, z: sp.z };
    if (Math.hypot(x - ls.x, z - ls.z) < 4) return true;
    const fs = { x: b.x - FIELD_W / 2 - 8, z: sp.z };
    if (Math.hypot(x - fs.x, z - fs.z) < 4) return true;
  }
  if (Math.abs(x - ARENA.x) < ARENA.size / 2 + 3 && Math.abs(z - ARENA.z) < ARENA.size / 2 + 3) return true;
  return false;
}

const POND = { x: 155, z: 22, s: 16 };

function genTrees() {
  const trees = [];
  let tries = 0;
  while (trees.length < 70 && tries < 6000) {
    tries++;
    const x = 4 + Math.random() * (WORLD_SIZE - 8);
    const z = 4 + Math.random() * (WORLD_SIZE - 8);
    let ok = true;
    for (const o of SOLID_OBJECTS) {
      if (Math.abs(x - o.x) < o.w / 2 + 2.5 && Math.abs(z - o.z) < o.d / 2 + 2.5) { ok = false; break; }
    }
    if (Math.abs(x - POND.x) < POND.s / 2 + 2 && Math.abs(z - POND.z) < POND.s / 2 + 2) ok = false;
    if (ok) trees.push({ x, z, s: 0.8 + Math.random() * 0.7 });
  }
  return trees.filter(t => !inFieldArea(t.x, t.z));
}

function genGrass() {
  const grass = [];
  let tries = 0;
  while (grass.length < 520 && tries < 8000) {
    tries++;
    const x = 4 + Math.random() * (WORLD_SIZE - 8);
    const z = 4 + Math.random() * (WORLD_SIZE - 8);
    let ok = true;
    for (const o of SOLID_OBJECTS) {
      if (Math.abs(x - o.x) < o.w / 2 + 1.5 && Math.abs(z - o.z) < o.d / 2 + 1.5) { ok = false; break; }
    }
    if (Math.abs(x - POND.x) < POND.s / 2 + 1 && Math.abs(z - POND.z) < POND.s / 2 + 1) ok = false;
    if (ok) grass.push({ x, z, h: 0.35 + Math.random() * 0.45, ph: Math.random() * Math.PI * 2, c: 0.75 + Math.random() * 0.25 });
  }
  return grass.filter(g => !inFieldArea(g.x, g.z));
}
const TREES = genTrees();
const GRASS = genGrass();
const GROUND_DOTS = genGroundDots();

// Дорожки между зонами (дорога от магазинов к арене и через центр)
const ROADS = [
  { x0: 71, x1: 79, z0: 62, z1: 176 },
  { x0: 16, x1: 134, z0: 71, z1: 79 },
  { x0: 71, x1: 79, z0: 10, z1: 48 },
  { x0: 30, x1: 38, z0: 62, z1: 176 },
  { x0: 112, x1: 120, z0: 62, z1: 176 },
];

const CLOUDS = [];
for (let i = 0; i < 9; i++) CLOUDS.push({ nx: Math.random(), ny: 0.08 + Math.random() * 0.28, s: 0.5 + Math.random() * 0.8 });

const keys = {};
document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (activeScreen === 'world') {
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') e.preventDefault();
    if (e.code === 'KeyE') tryEnter();
    if (e.code === 'KeyB') { if (state.held) keepHeld(); else openBackpack(); }
  }
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

const wcanvas = $('#world-canvas');
const wc = wcanvas.getContext('2d');
let W = 800, H = 600;

// Поворот камеры правой кнопкой мыши (перетаскивание)
let camDrag = false, camDragX = 0;
wcanvas.addEventListener('contextmenu', e => e.preventDefault());
wcanvas.addEventListener('mousedown', e => { if (e.button === 2) { camDrag = true; camDragX = e.clientX; } });
window.addEventListener('mousemove', e => {
  if (!camDrag || activeScreen !== 'world' || !state) return;
  state.world.yaw += (e.clientX - camDragX) * 0.005;
  camDragX = e.clientX;
});
window.addEventListener('mouseup', e => { if (e.button === 2) camDrag = false; });
wcanvas.addEventListener('click', e => {
  if (e.button === 0 && activeScreen === 'world' && state && nearestInteractive()) {
    const o = nearestInteractive();
    if (o.type === 'luck' || o.type === 'fieldupg') buySignUpgrade(o);
    else tryEnter();
  }
});
function resizeWorld() {
  W = wcanvas.width = window.innerWidth;
  H = wcanvas.height = window.innerHeight;
}
window.addEventListener('resize', () => { if (activeScreen === 'world') resizeWorld(); });

const EYE = 3.6, FOV = 1.05;

function camTransform() {
  const p = state.world;
  return { x: p.x, y: EYE, z: p.z, cos: Math.cos(p.yaw), sin: Math.sin(p.yaw) };
}

function project(cam, wx, wy, wz) {
  const dx = wx - cam.x, dy = wy - cam.y, dz = wz - cam.z;
  const xr = dx * cam.cos - dz * cam.sin;
  const zr = dx * cam.sin + dz * cam.cos;
  if (zr < 0.15) return null;
  const focal = (H / 2) / Math.tan(FOV / 2);
  const scale = focal / zr;
  return { x: W / 2 + xr * scale, y: H / 2 - dy * scale, z: zr, scale };
}

function projectPoly(cam, wp) {
  const near = 0.15;
  const focal = (H / 2) / Math.tan(FOV / 2);
  const clip = [];
  for (let i = 0; i < wp.length; i++) {
    const a = wp[i], b = wp[(i + 1) % wp.length];
    const azr = (a[0] - cam.x) * cam.sin + (a[2] - cam.z) * cam.cos;
    const bzr = (b[0] - cam.x) * cam.sin + (b[2] - cam.z) * cam.cos;
    const aIn = azr >= near, bIn = bzr >= near;
    if (aIn && bIn) clip.push(b);
    else if (aIn && !bIn) {
      const t = (near - azr) / (bzr - azr);
      clip.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    } else if (!aIn && bIn) {
      const t = (near - azr) / (bzr - azr);
      clip.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
      clip.push(b);
    }
  }
  if (clip.length < 3) return null;
  const out = [];
  for (const p of clip) {
    const dx = p[0] - cam.x, dy = p[1] - cam.y, dz = p[2] - cam.z;
    const xr = dx * cam.cos - dz * cam.sin;
    const zr = dx * cam.sin + dz * cam.cos;
    if (zr < near) continue;
    out.push({ x: W / 2 + xr * (focal / zr), y: H / 2 - dy * (focal / zr), z: zr });
  }
  return out.length >= 3 ? out : null;
}

function worldCollides(x, z) {
  if (x < 2 || x > WORLD_SIZE - 2 || z < 2 || z > WORLD_SIZE - 2) return true;
  for (const o of SOLID_OBJECTS) {
    const rx = clamp(x, o.x - o.w / 2, o.x + o.w / 2);
    const rz = clamp(z, o.z - o.d / 2, o.z + o.d / 2);
    const dx = x - rx, dz = z - rz;
    if (dx * dx + dz * dz < 2.2) return true;
  }
  return false;
}

function updateWorld(dt) {
  const p = state.world;
  const sp = 9;
  let mx = 0, mz = 0;
  if (keys.KeyW) { mx += Math.sin(p.yaw); mz += Math.cos(p.yaw); }
  if (keys.KeyS) { mx -= Math.sin(p.yaw); mz -= Math.cos(p.yaw); }
  if (keys.KeyA) { mx -= Math.cos(p.yaw); mz += Math.sin(p.yaw); }
  if (keys.KeyD) { mx += Math.cos(p.yaw); mz -= Math.sin(p.yaw); }
  if (keys.ArrowLeft) p.yaw -= 1.7 * dt;
  if (keys.ArrowRight) p.yaw += 1.7 * dt;
  const len = Math.hypot(mx, mz);
  if (len > 0) {
    p.facing = Math.atan2(mx, mz);
    const nx = p.x + (mx / len) * sp * dt;
    const nz = p.z + (mz / len) * sp * dt;
    if (!worldCollides(nx, nz)) { p.x = nx; p.z = nz; }
  }
}

function nearestInteractive() {
  const p = state.world;
  let best = null, bd = 8;
  for (const o of activeInteractives()) {
    const rx = clamp(p.x, o.x - o.w / 2, o.x + o.w / 2);
    const rz = clamp(p.z, o.z - o.d / 2, o.z + o.d / 2);
    const d = Math.hypot(p.x - rx, p.z - rz);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

function tryEnter() {
  const o = nearestInteractive();
  if (!o) return;
  if (o.type === 'spinner') { renderSpinnerPanel(); showScreen('spinner'); }
  else if (o.type === 'field') {
    if (o.idx !== homeFieldIndex()) { toast('Это чужое поле — трогать нельзя!'); return; }
    if (state.held) placeHeld();
    else { renderFieldScreen(o.idx); showScreen('field'); }
  }
  else if (o.type === 'arena') { renderArena(); showScreen('arena'); }
  else if (o.type === 'market') { showScreen('market'); }
  else if (o.type === 'luck') { renderLuckUpgrades(); showScreen('luck'); }
  else if (o.type === 'fieldupg') { renderFieldUpg(); showScreen('fieldupg'); }
}

// ---------- Игрок в руках / рюкзак ----------
function keepHeld() {
  if (!state.held) return;
  state.players.push(state.held);
  state.held = null;
  save();
  toast('Карточка в рюкзаке 🎒');
}

function placeHeld() {
  if (!state.held) return;
  const p = state.held;
  state.players.push(p);
  if (state.starters.length < 11) {
    state.starters.push(p.id);
  } else {
    const weakest = state.starters.map(getPlayer).filter(Boolean).sort((a, b) => a.rating - b.rating)[0];
    if (weakest) state.starters = state.starters.map(id => id === weakest.id ? p.id : id);
  }
  state.held = null;
  ensureLineup();
  save();
  refreshMyFieldOwner();
  toast('⭐ ' + p.name + ' вышел на поле!');
  if (p.kind && loveBuff() > 1) toast('💞 Любовь! Мама и Папа вместе на базе — их доход ×2!');
}

function openBackpack() {
  if (!state) return;
  renderBackpack();
  showScreen('backpack');
}

function hexRgb(hex) { return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]; }
function shade(hex, f) {
  const [r, g, b] = hexRgb(hex);
  return `rgb(${Math.min(255, Math.round(r * f))},${Math.min(255, Math.round(g * f))},${Math.min(255, Math.round(b * f))})`;
}

function drawPoly(poly) {
  if (poly.pts.length < 3) return;
  wc.beginPath();
  wc.moveTo(poly.pts[0].x, poly.pts[0].y);
  for (let i = 1; i < poly.pts.length; i++) wc.lineTo(poly.pts[i].x, poly.pts[i].y);
  wc.closePath();
  wc.fillStyle = poly.color;
  wc.fill();
  if (poly.line) { wc.strokeStyle = 'rgba(0,0,0,0.25)'; wc.lineWidth = 1; wc.stroke(); }
}

function boxPolys(o, cam) {
  const x0 = o.x - o.w / 2, x1 = o.x + o.w / 2, z0 = o.z - o.d / 2, z1 = o.z + o.d / 2, y0 = 0, y1 = o.h;
  const defs = [
    { pts: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], n: { x: 0, y: 1, z: 0 }, br: 1.18 },
    { pts: [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], n: { x: 1, y: 0, z: 0 }, br: 0.95 },
    { pts: [[x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1]], n: { x: -1, y: 0, z: 0 }, br: 0.7 },
    { pts: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], n: { x: 0, y: 0, z: 1 }, br: 0.9 },
    { pts: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], n: { x: 0, y: 0, z: -1 }, br: 0.62 },
  ];
  const light = { x: -0.4, y: 0.85, z: -0.3 };
  const ll = Math.hypot(light.x, light.y, light.z);
  const lx = light.x / ll, ly = light.y / ll, lz = light.z / ll;
  const polys = [];
  for (const d of defs) {
    const cx = (d.pts[0][0] + d.pts[2][0]) / 2;
    const cy = (d.pts[0][1] + d.pts[2][1]) / 2;
    const cz = (d.pts[0][2] + d.pts[2][2]) / 2;
    if (d.n.x * (cam.x - cx) + d.n.y * (cam.y - cy) + d.n.z * (cam.z - cz) <= 0) continue;
    const ld = Math.max(0, d.n.x * lx + d.n.y * ly + d.n.z * lz);
    const f = d.br * (0.6 + 0.4 * ld);
    const proj = d.pts.map(p => project(cam, p[0], p[1], p[2])).filter(Boolean);
    if (proj.length >= 3) {
      const depth = proj.reduce((s, p) => s + p.z, 0) / proj.length;
      polys.push({ pts: proj.map(p => ({ x: p.x, y: p.y })), color: shade(o.color, f), depth, line: false });
    }
  }
  return polys;
}

function treePolys(t, cam) {
  const polys = [];
  const rx = Math.cos(state.world.yaw), rz = -Math.sin(state.world.yaw);
  const tpts = [
    [t.x + rx * 0.3, 2.4 * t.s, t.z + rz * 0.3],
    [t.x - rx * 0.3, 2.4 * t.s, t.z - rz * 0.3],
    [t.x - rx * 0.3, 0, t.z - rz * 0.3],
    [t.x + rx * 0.3, 0, t.z + rz * 0.3],
  ];
  const tp = tpts.map(p => project(cam, p[0], p[1], p[2])).filter(Boolean);
  if (tp.length >= 3) {
    const depth = tp.reduce((s, p) => s + p.z, 0) / tp.length;
    polys.push({ pts: tp.map(p => ({ x: p.x, y: p.y })), color: '#7a4a2b', depth, line: false });
  }
  return polys;
}

function treeCanopy(t, cam) {
  const sw = 1 + 0.07 * Math.sin(Date.now() / 900 + t.x * 0.6);
  const r = t.s * 2.0 * sw;
  const y = 4.6 * t.s;
  drawDisc(cam, t.x, y, t.z, r, shade('#2f9e44', t.s));
  drawDisc(cam, t.x - r * 0.22, y + r * 0.18, t.z, r * 0.62, '#45c459');
  drawDisc(cam, t.x + r * 0.28, y - r * 0.1, t.z, r * 0.34, '#247a33');
}

function drawLabels(cam) {
  const ni = nearestInteractive();
  for (const o of INTERACTIVES) {
    if (o.type === 'spinner' || o.type === 'luck' || o.type === 'fieldupg') continue;
    const ly = o.type === 'market' ? 7.5 : 6;
    const p = project(cam, o.x, ly, o.z);
    if (!p) continue;
    const near = ni === o;
    wc.font = 'bold 14px sans-serif';
    wc.textAlign = 'center'; wc.textBaseline = 'middle';
    wc.fillStyle = 'rgba(0,0,0,0.55)';
    wc.fillText(o.name, p.x + 1, p.y + 1);
    wc.fillStyle = near ? '#ffffff' : 'rgba(255,255,255,0.85)';
    wc.fillText(o.name, p.x, p.y);
    wc.fillStyle = o.color || '#ffffff';
    wc.beginPath();
    wc.moveTo(p.x, p.y + 15);
    wc.lineTo(p.x - 6, p.y + 27);
    wc.lineTo(p.x + 6, p.y + 27);
    wc.closePath(); wc.fill();
  }
}

function drawGroundGrid(cam) {
  const c = state.world;
  const step = 6, range = 7;
  wc.lineWidth = 1;
  wc.strokeStyle = 'rgba(255,255,255,0.13)';
  for (let i = -range; i <= range; i++) {
    const z = c.z + i * step;
    const p1 = project(cam, c.x - range * step * 1.6, 0, z);
    const p2 = project(cam, c.x + range * step * 1.6, 0, z);
    if (p1 && p2) { wc.beginPath(); wc.moveTo(p1.x, p1.y); wc.lineTo(p2.x, p2.y); wc.stroke(); }
  }
  for (let i = -range; i <= range; i++) {
    const x = c.x + i * step;
    const p1 = project(cam, x, 0, c.z - range * step * 1.6);
    const p2 = project(cam, x, 0, c.z + range * step * 1.6);
    if (p1 && p2) { wc.beginPath(); wc.moveTo(p1.x, p1.y); wc.lineTo(p2.x, p2.y); wc.stroke(); }
  }
}

function renderWorld() {
  const cam = camTransform();
  const grad = wc.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#55b3f2');
  grad.addColorStop(0.42, '#c9ecff');
  grad.addColorStop(0.46, '#a9e075');
  grad.addColorStop(0.53, '#55b347');
  grad.addColorStop(1, '#46a23a');
  wc.fillStyle = grad;
  wc.fillRect(0, 0, W, H);
  drawClouds(cam);
  drawSun(cam);
  const polys = [];
  rounds = [];
  drawGroundChecker(cam, polys);
  for (const r of ROADS) polys.push(...roadPolys(r, cam));
  polys.push(...marketPolys(cam));
  polys.push(...arenaPolys(cam));
  const labels = [];
  const nearBases = [];
  const myHome = homeFieldIndex();
  BASES.forEach((base, i) => {
    nearBases.push(base);
    polys.push(...fieldPolys(base, cam, i === myHome));
    pushRound(distToCam(base.x, base.z), () => fieldCenterRing(base, cam));
    polys.push(...fieldOwnerPolys(base, i, cam, labels));    polys.push(...spinnerPolys(base, cam));
    if (i === myHome) polys.push(...homeFlagPolys(base, cam, labels));
    const ls = LUCK_SIGNS[i], fs = FIELDUPG_SIGNS[i];
    polys.push(...signPolys(ls, '🍀 Удача', '#ffd23d', cam, labels));
    polys.push(...signPolys(fs, '⚽ Владение · 💰 Доход', '#39c98a', cam, labels));
  });
  polys.push(...heldCardPolys(cam, labels));
  pushRound(0.1, () => drawFigures(cam, labels));
  polys.sort((a, b) => b.depth - a.depth);
  for (const poly of polys) drawPoly(poly);
  rounds.sort((a, b) => b.depth - a.depth);
  for (const rd of rounds) rd.draw();
  drawFog(cam);
  for (const base of nearBases) drawWorldRoulette(cam, base);
  drawDecorLabels(cam, labels);
  drawMinimap();
  const ni = nearestInteractive();
  const prompt = $('#interact-prompt');
  if (ni) { prompt.textContent = promptText(ni); prompt.classList.remove('hidden'); }
  else prompt.classList.add('hidden');
  updateHeldHud();
}

function promptText(o) {
  if (o.type === 'spinner') return '🎡 Спиннер — нажми E или кликни';
  if (o.type === 'luck') return '🍀 Табло удачи — нажми E или кликни';
  if (o.type === 'fieldupg') return '⚽ Табло поля (владение · доход) — нажми E или кликни';
  if (o.type === 'field') return state.held ? '⭐ Поставить ' + state.held.name + ' — E' : '🏟️ ' + o.name + ' — нажми E (смотреть)';
  if (o.type === 'arena') return '⚔ Арена (матчи 1×1) — нажми E или кликни';
  return '🏪 ' + MARKET.name + ' — нажми E или кликни';
}

function updateHeldHud() {
  const el = $('#held-card');
  if (!el) return;
  if (state && state.held) {
    const r = RARITIES[state.held.rarity];
    el.innerHTML = '🤚 В руках: ' + r.emoji + ' ' + state.held.rating + ' ' + state.held.name + ' <span style="opacity:.7">— E: на поле • B: в рюкзак</span>';
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

// ===================== ЭКРАНЫ: СПИННЕР / ПОЛЕ / РЮКЗАК / АРЕНА =====================
function renderSpinnerPanel() {
  $('#spin-btn').textContent = 'Крутить (' + SPIN_COST + ' 💰)';
  renderOdds();
  if (!$('#roulette-track').children.length) {
    let html = '';
    for (let i = 0; i < 14; i++) html += miniCardHTML(generatePlayer(pickRarity(), pick(POS_ORDER)));
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
      html += p ? `<div class="slot">${cardHTML(p)}</div>` : `<div class="slot">+ пусто</div>`;
    }
    html += `</div></div>`;
  }
  $('#field-lineup').innerHTML = html;
  $('#autofill-btn').onclick = autofill;
  $$('#field-lineup [data-form]').forEach(c => c.onclick = () => { state.formation = c.dataset.form; save(); renderFieldScreen(idx); });
}

function renderBackpack() {
  const ps = [...state.players].sort((a, b) => b.rating - a.rating);
  let html = `<div class="shop-note">Всего игроков: ${ps.length} • В основе: ${state.starters.length}/11</div>`;
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
  const player = generatePlayer(rarity, pick(POS_ORDER));

  const track = $('#roulette-track');
  const N = 300;
  const resultIdx = rnd(200, 260);
  const cardW = 104, gap = 8, step = cardW + gap;
  let html = '';
  for (let i = 0; i < N; i++) {
    html += (i === resultIdx)
      ? miniCardHTML(player)
      : miniCardHTML(generatePlayer(pickRarity(), pick(POS_ORDER)));
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
  $('#take-btn').onclick = () => {
    if (state.coins < price) {
      toast('Не хватает монет на выкуп! Нужно ' + price + ' 💰');
      flashBtn($('#take-btn'));
      return;
    }
    state.coins -= price;
    save();
    renderTop();
    setHeld(p);
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
  let html = '<div class="shop-note">Продай любую карточку за монеты. Чем редче — тем дороже!</div>';
  if (ps.length === 0) html += '<div class="shop-note">У тебя пока нет карточек.</div>';
  for (const p of ps) {
    const price = sellPrice(p);
    html += `<div class="item-row">
      <div class="item-name">${RARITIES[p.rarity].emoji} ${p.rating} • ${p.name} <span class="item-meta">(${POS_LABEL[p.pos]})</span></div>
      <button class="btn" data-ssell="${p.id}">${price} 💰</button>
    </div>`;
  }
  $('#shop-sell').innerHTML = html;
  $$('#shop-sell [data-ssell]').forEach(b => b.onclick = () => sellPlayer(+b.dataset.ssell));
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

// ===================== МАТЧ =====================
function winChance(myAvg, botAvg) { return Math.round(clamp(50 + (myAvg - botAvg) * 6, 5, 95)); }

function makeBotSquad(avg) {
  const rar = avg >= 86 ? 'secret' : avg >= 79 ? 'gold' : avg >= 73 ? 'silver' : 'bronze';
  const make = pos => { const p = generatePlayer(rar, pos, rnd(avg - 6, avg + 4)); transient[p.id] = p; return p.id; };
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

function groundPoly(cam, x0, z0, x1, z1, y, color) {
  const pts = projectPoly(cam, [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]]);
  if (!pts) return null;
  const depth = pts.reduce((s, p) => s + p.z, 0) / pts.length;
  return { pts: pts.map(p => ({ x: p.x, y: p.y })), color, depth, line: false };
}

function drawGroundChecker(cam, polys) {
  const size = 6, near0 = 4, far = 30;
  const x0 = Math.floor((cam.x - far) / size) * size;
  const z0 = Math.floor((cam.z - far) / size) * size;
  for (let x = x0; x < cam.x + far; x += size) {
    for (let z = z0; z < cam.z + far; z += size) {
      const cx = x + size / 2, cz = z + size / 2;
      const d = Math.hypot(cx - cam.x, cz - cam.z);
      if (d < near0 || d > far) continue;
      const t = clamp(1 - (d - near0) / (far - near0), 0, 1);
      const a = t * t * 0.2;
      if (a <= 0.012) continue;
      const col = (((x / size) + (z / size)) % 2) ? 'rgba(62,158,53,' : 'rgba(73,166,60,';
      const g = groundPoly(cam, x, z, x + size, z + size, 0, col + a.toFixed(3) + ')');
      if (g) polys.push(g);
    }
  }
}

function fieldPolys(base, cam, isHome) {
  const f = fieldRectFor(base);
  const polys = [];
  const track = groundPoly(cam, f.x0 - 5, f.z0 - 4.5, f.x1 + 5, f.z1 + 4.5, 0.01, '#7cc350');
  if (track) polys.push(track);
  const trackIn = groundPoly(cam, f.x0 - 3.5, f.z0 - 3, f.x1 + 3.5, f.z1 + 3, 0.012, '#66b841');
  if (trackIn) polys.push(trackIn);
  const stripes = 8;
  for (let i = 0; i < stripes; i++) {
    const a = f.x0 + (f.x1 - f.x0) * i / stripes;
    const b = f.x0 + (f.x1 - f.x0) * (i + 1) / stripes;
    const g = groundPoly(cam, a, f.z0, b, f.z1, 0.02, i % 2 ? '#36b04f' : '#42bd59');
    if (g) polys.push(g);
  }
  const borderCol = isHome ? '#ffd23d' : '#ffffff';
  const line = (a, b, c, d, col) => { const g = groundPoly(cam, a, b, c, d, 0.03, col); if (g) polys.push(g); };
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

function fieldCenterRing(base, cam) {
  const f = fieldRectFor(base);
  const cx = f.x0 + FIELD_W / 2, cz = (f.z0 + f.z1) / 2;
  if (distToCam(cx, cz) > 150) return;
  drawRing(cam, cx, 0.05, cz, 4.6, 'rgba(255,255,255,0.85)', 1.5);
  drawDisc(cam, cx, 0.05, cz, 0.5, 'rgba(255,255,255,0.9)');
}

function homeFlagPolys(base, cam, labels) {
  const f = fieldRectFor(base);
  const fx = base.x, fz = f.z0 - 2.2;
  const pulse = 1 + 0.15 * Math.sin(Date.now() / 400);
  const polys = boxPolys({ x: fx, z: fz, w: 0.4, d: 0.4, h: 7, color: '#8a5a2b' }, cam);
  const pts = [[fx, 7, fz], [fx + 3.2, 6.2, fz], [fx, 5.4, fz]].map(p => project(cam, p[0], p[1], p[2])).filter(Boolean);
  if (pts.length >= 3) {
    const depth = pts.reduce((s, p) => s + p.z, 0) / pts.length;
    polys.push({ pts: pts.map(p => ({ x: p.x, y: p.y })), color: '#ffd23d', depth, line: false });
  }
  labels.push({ text: '🏠 Твоя база', wx: fx, wy: 8.4 * pulse, wz: fz, color: '#ffd23d', size: 15, mine: true });
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
  const pts = [
    [cx + rx * hw, cy + hh, cz + rz * hw],
    [cx - rx * hw, cy + hh, cz - rz * hw],
    [cx - rx * hw, cy - hh, cz - rz * hw],
    [cx + rx * hw, cy - hh, cz + rz * hw],
  ].map(p => project(cam, p[0], p[1], p[2])).filter(Boolean);
  if (pts.length < 3) return [];
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
  const rr = Math.max(1.5, r * p.scale);
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
  const rr = Math.max(1.5, r * p.scale);
  wc.fillStyle = color;
  wc.beginPath(); wc.arc(p.x, p.y, rr, 0, Math.PI * 2); wc.fill();
}
function drawRing(cam, x, y, z, r, color, width) {
  const p = project(cam, x, y, z);
  if (!p) return;
  const rr = Math.max(2, r * p.scale);
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
  const t = Date.now() / 950;
  for (let i = 0; i < 5; i++) {
    const off = (t + i * 0.2) % 1;
    const a = off * Math.PI * 2;
    const px = POND.x + Math.cos(a) * (R - 3.2);
    const pz = POND.z + Math.sin(a) * (R - 3.2);
    drawDisc(cam, px, 0.08, pz, 1.4, 'rgba(170,225,255,0.55)');
  }
  drawDisc(cam, POND.x, 0.08, POND.z, R * 0.7, 'rgba(255,255,255,0.08)');
}

function genGroundDots() {
  const dots = [];
  let tries = 0;
  while (dots.length < 900 && tries < 12000) {
    tries++;
    const x = 3 + Math.random() * (WORLD_SIZE - 6), z = 3 + Math.random() * (WORLD_SIZE - 6);
    let ok = true;
    for (const o of SOLID_OBJECTS) {
      if (Math.abs(x - o.x) < o.w / 2 + 1 && Math.abs(z - o.z) < o.d / 2 + 1) { ok = false; break; }
    }
    if (Math.abs(x - POND.x) < POND.s / 2 + 2 && Math.abs(z - POND.z) < POND.s / 2 + 2) ok = false;
    if (ok) {
      const c = Math.random();
      dots.push({
        x, z,
        r: 0.15 + Math.random() * 0.3,
        c: c < 0.4 ? 'rgba(18,96,32,0.5)' : c < 0.7 ? 'rgba(96,180,74,0.42)' : 'rgba(200,170,80,0.35)',
      });
    }
  }
  return dots.filter(d => !inFieldArea(d.x, d.z));
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
    const sw = 1 + 0.18 * Math.sin(Date.now() / 700 + g.ph);
    const p0 = project(cam, g.x, 0.02, g.z);
    const p1 = project(cam, g.x, g.h * sw, g.z);
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
  const stripe = (a, b, c, d) => { const g = groundPoly(cam, a, b, c, d, 0.018, 'rgba(255,235,180,0.45)'); if (g) polys.push(g); };
  if (r.x0 === r.x1) {
    for (let z = r.z0; z < r.z1; z += 8) stripe(r.x0 - 0.7, z, r.x1 + 0.7, z + 0.6);
  } else {
    for (let x = r.x0; x < r.x1; x += 8) stripe(x, r.z0 - 0.7, x + 0.6, r.z1 + 0.7);
  }
  return polys;
}

function drawFigures(cam, labels) {
  const skin = '#f2c99c';
  const drawOne = (px, pz, facing, c, nick, isMe) => {
    const bob = isMe ? 0.1 * Math.sin(Date.now() / 220) : 0.06 * Math.sin(Date.now() / 330 + px);
    const sh = project(cam, px, 0.02, pz);
    if (sh) {
      wc.fillStyle = 'rgba(0,0,0,0.25)';
      wc.beginPath();
      wc.ellipse(sh.x, sh.y, 1.5 * sh.scale, 0.5 * sh.scale, 0, 0, Math.PI * 2);
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
    const py = c.ny * H + Math.sin(Date.now() / 4000 + c.nx * 9) * 4;
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

function card3DPolys(cam, x, z, rc, flag, name, rating, facing, mut) {
  const w = 1.7, d = 0.4, h = 3.4;
  const y = 0.12, cy = y + h / 2;
  const polys = boxPolys({ x, z, w, d, h, color: rc }, cam);
  pushRound(distToCam(x, z), () => drawCardFaceText(cam, x, cy, z, w, h, rc, flag, name, rating, facing, mut));
  return polys;
}

function fieldCardsPolys(f, cards, color, cam, labels) {
  const polys = [];
  const fcx = f.x0 + FIELD_W / 2, fcz = (f.z0 + f.z1) / 2;
  if (distToCam(fcx, fcz) > 135) return polys;
  for (const s of slotPositions(cards)) {
    const x = f.x0 + s.x * FIELD_W;
    const z = f.z1 - s.z * FIELD_D;
    const p = s.p;
    polys.push(...card3DPolys(cam, x, z, rarityColor(p.rarity), p.flag, p.name, p.rating, 0, faceExtra(p)));
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
  const line = (a2, b2, c2, d2, col) => { const gg = groundPoly(cam, a2, b2, c2, d2, 0.3, col); if (gg) polys.push(gg); };
  line(x0 - 0.5, z0 - 0.5, x1 + 0.5, z0 + 0.5, '#ffffff');
  line(x0 - 0.5, z1 - 0.5, x1 + 0.5, z1 + 0.5, '#ffffff');
  line(x0 - 0.5, z0, x0 + 0.5, z1, '#ffffff');
  line(x1 - 0.5, z0, x1 + 0.5, z1, '#ffffff');
  line(x0, (z0 + z1) / 2 - 0.4, x1, (z0 + z1) / 2 + 0.4, 'rgba(255,255,255,0.7)');
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  polys.push(...drawArenaRing(cx, cz, cam));
  return polys;
}

function drawArenaRing(cx, cz, cam) {
  const polys = [];
  for (let i = 0; i < 20; i++) {
    const a = i / 20 * Math.PI * 2;
    const b = (i + 1) / 20 * Math.PI * 2;
    const r1 = 5.4, r2 = 6.6;
    const pts = [
      [cx + Math.cos(a) * r1, 0.22, cz + Math.sin(a) * r1],
      [cx + Math.cos(b) * r1, 0.22, cz + Math.sin(b) * r1],
      [cx + Math.cos(b) * r2, 0.24, cz + Math.sin(b) * r2],
      [cx + Math.cos(a) * r2, 0.24, cz + Math.sin(a) * r2],
    ].map(p => project(cam, p[0], p[1], p[2])).filter(Boolean);
    if (pts.length >= 4) {
      const depth = pts.reduce((s, p) => s + p.z, 0) / pts.length;
      polys.push({ pts: pts.map(p => ({ x: p.x, y: p.y })), color: i % 2 ? '#b3572e' : '#e8b464', depth, line: false });
    }
  }
  pushRound(distToCam(cx, cz), () => drawRing(cam, cx, 0.26, cz, 4.6, 'rgba(255,255,255,0.7)', 1.4));
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
  const x = p.x + fx * 2.2, z = p.z + fz * 2.2;
  const h = state.held;
  const polys = card3DPolys(cam, x, z, rarityColor(h.rarity), h.flag, h.name, h.rating, p.yaw, faceExtra(h));
  labels.push({ text: h.name + ' ' + h.rating, wx: x, wy: 4.9, wz: z, color: '#ffffff', size: 13, mine: true });
  return polys;
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

// ===================== МУЛЬТИПЛЕЕР (СЕРВЕР) =====================
let server = { online: false, players: [], owners: null, playerMap: {} };

function playerColor(nick) {
  let h = 0;
  for (let i = 0; i < nick.length; i++) h = (h * 31 + nick.charCodeAt(i)) >>> 0;
  return BASE_COLORS[h % BASE_COLORS.length];
}

function serverPayload() {
  const field = {
    idx: homeFieldIndex(),
    nick: currentUser,
    color: playerColor(currentUser),
    cards: state.starters.map(getPlayer).filter(Boolean).map(p => ({ name: p.name, rating: p.rating, rarity: p.rarity, pos: p.pos })),
  };
  return { nick: currentUser, x: state.world.x, z: state.world.z, yaw: state.world.yaw, color: playerColor(currentUser), pvp: state.pvpQueued ? 1 : 0, field };
}

function applyServerPlayers(data) {
  const t = Date.now();
  const list = (data.players || []).filter(p => p && p.nick && p.nick !== currentUser);
  const map = server.playerMap = server.playerMap || {};
  const seen = {};
  for (const p of list) {
    seen[p.nick] = 1;
    let e = map[p.nick];
    if (!e) {
      e = map[p.nick] = { nick: p.nick, cx: p.x, cz: p.z, cyaw: p.yaw || 0, tx: p.x, tz: p.z, tyaw: p.yaw || 0, ts: t };
    } else {
      const k = Math.min(1, (t - e.ts) / 350);
      e.cx = e.tx != null ? e.cx + (e.tx - e.cx) * k : e.tx;
      e.cz = e.tz != null ? e.cz + (e.tz - e.cz) * k : e.tz;
      e.cyaw = e.tyaw != null ? lerpAngle(e.cyaw, e.tyaw, k) : (e.tyaw || 0);
    }
    e.tx = p.x; e.tz = p.z; e.tyaw = p.yaw || 0; e.ts = t;
    e.color = p.color || '#ffffff'; e.pvp = !!p.pvp;
  }
  for (const k of Object.keys(map)) if (!seen[k] && t - map[k].ts > 9000) delete map[k];
  server.players = Object.keys(map).map(k => map[k]).filter(e => t - e.ts < 9000);
  if (data.owners) {
    server.owners = {};
    for (const k of Object.keys(data.owners)) {
      const v = data.owners[k];
      server.owners[+k] = { nick: v.nick, color: v.color, cards: (v.cards || []).map(c => ({ ...c })) };
    }
  }
}

function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function effectiveServerPlayers() {
  const t = Date.now();
  return server.players.map(e => {
    const k = Math.min(1, (t - e.ts) / 350);
    return {
      nick: e.nick, color: e.color, pvp: e.pvp,
      x: e.tx != null ? e.cx + (e.tx - e.cx) * k : e.tx,
      z: e.tz != null ? e.cz + (e.tz - e.cz) * k : e.tz,
      yaw: e.tyaw != null ? lerpAngle(e.cyaw, e.tyaw, k) : 0,
    };
  });
}

async function serverSend() {
  try {
    const r = await fetch('/api/pos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(serverPayload()) });
    if (r && r.ok) { server.online = true; return; }
  } catch (e) {}
  server.online = false;
}

async function serverPoll() {
  try {
    const r = await fetch('/api/players');
    if (r && r.ok) { applyServerPlayers(await r.json()); server.online = true; checkPvpQueue(); claimGifts(); checkBroadcasts(); return; }
  } catch (e) {}
  server.online = false;
}

let broadcastQueue = [];
let broadcastShowing = false;
let broadcastTimer = null;
let lastBroadcastId = (function () { try { return +(localStorage.getItem('fc_bc_id') || 0); } catch (e) { return 0; } })();

async function checkBroadcasts() {
  try {
    const r = await fetch('/api/broadcasts');
    if (!r || !r.ok) return;
    const d = await r.json();
    if (!d || !d.ok || !d.list) return;
    for (const b of d.list) {
      if (b.id > lastBroadcastId) {
        lastBroadcastId = b.id;
        broadcastQueue.push(b);
      }
    }
    localStorage.setItem('fc_bc_id', String(lastBroadcastId));
    pumpBroadcast();
  } catch (e) {}
}

function showBroadcastNow(b) {
  const el = $('#broadcast');
  if (!el) return;
  broadcastShowing = true;
  el.innerHTML = (b.msg || '').replace(/</g, '&lt;') + (b.from ? '<span class="bc-sub">📢 ' + b.from.replace(/</g, '&lt;') + '</span>' : '');
  el.classList.remove('hidden');
  clearTimeout(broadcastTimer);
  broadcastTimer = setTimeout(() => {
    el.classList.add('hidden');
    broadcastShowing = false;
    setTimeout(pumpBroadcast, 350);
  }, 5200);
}

function pumpBroadcast() {
  if (broadcastShowing || !broadcastQueue.length) return;
  showBroadcastNow(broadcastQueue.shift());
}

async function adminBroadcast() {
  const msg = ($('#adm-broadcast').value || '').trim();
  if (!msg) { toast('Введи текст сообщения'); return; }
  $('#adm-broadcast').value = '';
  try {
    const r = await fetch('/api/broadcast', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: currentUser, msg }),
    });
    const d = r && r.ok ? await r.json() : { ok: false };
    if (d.ok) {
      lastBroadcastId = d.id || lastBroadcastId;
      localStorage.setItem('fc_bc_id', String(lastBroadcastId));
      broadcastQueue.push({ id: d.id, msg, from: currentUser });
      pumpBroadcast();
      toast('📢 Сообщение отправлено');
    } else toast('❌ ' + (d.err || 'ошибка'));
  } catch (e) { toast('❌ Сервер недоступен'); }
}

async function claimGifts() {
  if (!currentUser || !state) return;
  try {
    const r = await fetch('/api/gifts?nick=' + encodeURIComponent(currentUser));
    if (!r || !r.ok) return;
    const d = await r.json();
    if (!d || !d.ok || !d.gifts || !d.gifts.length) return;
    let got = 0; let mutMsg = null;
    for (const g of d.gifts) {
      if (g.type === 'player' && g.player) {
        const p = g.player;
        state.players.push({ id: idCounter++, name: p.name, pos: p.pos, rating: +p.rating, rarity: p.rarity, flag: p.flag });
        got++;
      } else if (g.type === 'coins') { state.coins += (g.n || 0); got++; }
      else if (g.type === 'fans') { state.fans += (g.n || 0); got++; }
      else if (g.type === 'mutation' && g.mutation) {
        if (state.players.length) {
          const pool = state.players.filter(p => !p.mut);
          const chosen = pool.length ? pick(pool) : pick(state.players);
          const m = MUTATIONS.find(x => x.id === g.mutation.id);
          chosen.mut = { id: g.mutation.id, mult: g.mutation.mult || (m ? m.base : 1) };
          mutMsg = `🧬 Мутация «${m ? m.name : '?'}» ×${chosen.mut.mult} на ${chosen.name}!`;
          got++;
        }
      }
      else if (g.type === 'parent' && (g.kind === 'mom' || g.kind === 'dad')) {
        const pp = makeParent(g.kind);
        state.players.push(pp);
        mutMsg = `${pp.flag} ${pp.name} пришла в команду! Поставь её на базу клавишей E.`;
        got++;
      }
      else if (g.type === 'boost') {
        const bt = LUCK_BOOSTS.find(t => t.id === g.tier) || LUCK_BOOSTS[0];
        const minutes = Math.max(1, Math.min(60, +(g.minutes || 1)));
        state.luckBoost = { tier: bt.id, until: Date.now() + minutes * 60000 };
        mutMsg = `${bt.icon} Админ включил тебе удачу «${bt.name}» на ${minutes} мин!`;
        got++;
      }
    }
    if (got) { save(); renderTop(); toast(mutMsg || '📦 Подарок от админа!'); }
  } catch (e) {}
}

function updateNetDisplay() {
  const el = $('#net-display');
  if (!el) return;
  if (server.online) {
    el.classList.remove('hidden');
    el.textContent = '🖥 Онлайн (' + server.players.length + ')';
  } else {
    el.classList.add('hidden');
  }
}

// ===================== АДМИН-ПАНЕЛЬ =====================
function renderAdmin() {
  $('#adm-rarity').innerHTML = RARITY_KEYS.map(k => `<option value="${k}">${RARITIES[k].emoji} ${RARITIES[k].name}</option>`).join('');
  $('#adm-pos').innerHTML = POS_ORDER.map(p => `<option value="${p}">${POS_LABEL[p]}</option>`).join('');
  $('#adm-mut').innerHTML = MUTATIONS.map(m => `<option value="${m.id}">${m.icon} ${m.name} ×${m.base}</option>`).join('');
  renderBoostAdmin();
  let html = '';
  for (const o of OPPONENTS) {
    const beaten = state.beatenOpponents.includes(o.id);
    html += `<div class="item-row"><div><div class="item-name">${o.emoji} ${o.name}</div>
      <div class="item-desc">Средний рейтинг ${o.avg} • награда ${o.fansWin} 👥</div></div>
      <button class="btn" data-awin="${o.id}">${beaten ? '✅ Снова' : '🏆 Победить'}</button></div>`;
  }
  $('#adm-opps').innerHTML = html;
  $$('#adm-opps [data-awin]').forEach(b => b.onclick = () => adminWin(b.dataset.awin));
}

function adminTargetNick() {
  const t = ($('#adm-target').value || '').trim();
  if (!t) return null;
  if (t === currentUser) return null;
  return t;
}

async function adminRemoteGive(type, data) {
  const target = adminTargetNick();
  if (!target) return null;
  toast('📤 Отправляю «' + target + '»…');
  try {
    const r = await fetch('/api/gift', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: currentUser, target, type, ...data }),
    });
    const d = r && r.ok ? await r.json() : { ok: false };
    if (d.ok) { toast('✅ Отправлено игроку «' + target + '»'); return 'sent'; }
    toast('❌ Не удалось: ' + (d.err || 'ошибка'));
    return 'fail';
  } catch (e) { toast('❌ Сервер недоступен'); return 'fail'; }
}

function adminGiveCoins(n) {
  const target = adminTargetNick();
  if (!target) { state.coins += n; save(); renderTop(); toast('+' + n + ' 💰'); return; }
  adminRemoteGive('coins', { n });
}
function adminGiveFans(n) {
  const target = adminTargetNick();
  if (!target) { state.fans += n; save(); renderTop(); toast('+' + n + ' 👥'); return; }
  adminRemoteGive('fans', { n });
}

function adminGivePlayer() {
  const target = adminTargetNick();
  const rarity = $('#adm-rarity').value;
  const pos = $('#adm-pos').value;
  const rt = $('#adm-rating').value.trim();
  const p = generatePlayer(rarity, pos, rt ? clamp(+rt, 1, 110) : undefined);
  if (!target) {
    setHeld(p);
    closeScreen();
    toast('Выдан в руки: ' + p.name + ' ' + p.rating + ' ' + RARITIES[rarity].emoji);
    return;
  }
  adminRemoteGive('player', { player: { name: p.name, pos, rating: p.rating, rarity, flag: p.flag } });
}

function adminGiveMut() {
  const mutId = $('#adm-mut').value;
  const m = MUTATIONS.find(x => x.id === mutId);
  if (!m) return;
  const multRaw = $('#adm-mut-mult').value.trim();
  const mult = multRaw ? Math.max(0.1, +multRaw) : m.base;
  const target = adminTargetNick();
  if (!target) {
    applyMutationSelf(m.id, mult);
    return;
  }
  adminRemoteGive('mutation', { mutation: { id: m.id, mult } });
}

function adminGiveParent(kind) {
  const target = adminTargetNick();
  const p = makeParent(kind);
  if (!target) {
    setHeld(p);
    closeScreen();
    toast('Выдан в руки: ' + p.name + ' ' + p.flag + ' — поставь на поле клавишей E!');
    return;
  }
  adminRemoteGive('parent', { kind });
}

function applyMutationSelf(id, mult) {
  if (!state.players.length) { toast('Нет карточек'); return; }
  const pool = state.players.filter(p => !p.mut);
  const chosen = pool.length ? pick(pool) : pick(state.players);
  const m = MUTATIONS.find(x => x.id === id);
  chosen.mut = { id, mult };
  save(); renderTop();
  toast(`${m.icon} Мутация «${m.name}» ×${mult} на ${chosen.name}!`);
}

function adminWin(oppId) {
  const o = OPPONENTS.find(x => x.id === oppId); if (!o) return;
  state.fans += o.fansWin;
  state.matchesWon = (state.matchesWon || 0) + 1;
  if (!state.beatenOpponents.includes(o.id)) state.beatenOpponents.push(o.id);
  save(); renderTop();
  toast('🏆 Победа над «' + o.name + '»! +' + o.fansWin + ' 👥');
}

function tunnelCall(cmd) {
  const res = $('#tunnel-result');
  if (!res) return;
  res.textContent = cmd === 'restart' ? '⏳ Перезапускаю туннель… (до 40 сек)' : '⏳ Проверяю…';
  fetch('/api/tunnel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cmd }),
  }).then(r => r.json()).then(d => {
    if (d.ok && d.url) {
      res.innerHTML = '✅ Ссылка для друга:<br><b>' + d.url + '</b>';
      if (navigator.clipboard) navigator.clipboard.writeText(d.url).catch(() => {});
    } else {
      res.textContent = cmd === 'restart'
        ? '❌ Не удалось перезапустить. Скажи ассистенту «перезапусти туннель».'
        : '🔇 Туннель сейчас не запущен. Нажми «Перезапустить 🔄».';
    }
  }).catch(() => {
    res.textContent = '❌ Ошибка соединения с сервером.';
  });
}

function tunnelStatus() { tunnelCall('status'); }
function tunnelRestart() { tunnelCall('restart'); }

// ---------- Прочее ----------
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), 2200);
}

function flashBtn(btn) {
  btn.classList.add('flash-neg');
  setTimeout(() => btn.classList.remove('flash-neg'), 500);
}

function tick() {
  if (!state) return;
  const inc = incomePerSec();
  state.coins += inc;
  state.lastTick = Date.now();
  applyHourlyMutation(false);
  save();
  renderTop();
}

function applyOfflineIncome() {
  const last = state.lastTick || Date.now();
  const secs = Math.min((Date.now() - last) / 1000, 3600);
  if (secs > 5) {
    const gained = incomePerSec() * secs;
    state.coins += gained;
    toast(`Пока тебя не было, команда заработала +${Math.floor(gained)} 💰`);
  }
  state.lastTick = Date.now();
  applyHourlyMutation(true);
  save();
}

function applyHourlyMutation(catchUp) {
  if (!state) return;
  const now = Date.now();
  if (!state.nextMutationAt) state.nextMutationAt = now + MUTATION_INTERVAL;
  if (now < state.nextMutationAt) return;
  let overdue = 1;
  if (catchUp) overdue = Math.min(3, Math.floor((now - state.nextMutationAt) / MUTATION_INTERVAL) + 1);
  let applied = 0;
  for (let k = 0; k < overdue; k++) {
    if (!state.players.length) break;
    const pool = state.players.filter(p => !p.mut);
    const chosen = pool.length ? pick(pool) : pick(state.players);
    const m = pick(MUTATIONS);
    chosen.mut = { id: m.id, mult: m.base };
    toast(`${m.icon} Мутация: «${m.name}» ×${m.base} на карточке ${chosen.name}!`);
    applied++;
  }
  if (applied) { save(); renderTop(); }
  state.nextMutationAt = now + MUTATION_INTERVAL;
}

// ---------- Привязки ----------
function bindGlobal() {
  $$('[data-nav]').forEach(b => b.onclick = () => showScreen(b.dataset.nav));
  $$('.tab-btn[data-scr="market"]').forEach(b => b.onclick = () => renderMarketTab(b.dataset.tab));
  $('#login-btn').onclick = login;
  $('#reg-btn').onclick = register;
  $('#logout-btn').onclick = logout;
  $('#backpack-btn').onclick = openBackpack;
  $('#admin-btn').onclick = () => showScreen('admin');
  $('#adm-give-coins').onclick = () => adminGiveCoins(Math.max(0, Math.floor(+$('#adm-amount').value || 0)));
  $('#adm-give-fans').onclick = () => adminGiveFans(Math.max(0, Math.floor(+$('#adm-amount').value || 0)));
  $('#adm-give-player').onclick = adminGivePlayer;
  $('#adm-give-mut').onclick = adminGiveMut;
  $('#adm-give-mom').onclick = () => adminGiveParent('mom');
  $('#adm-give-dad').onclick = () => adminGiveParent('dad');
  $('#adm-give-boost').onclick = adminGiveBoost;
  $('#adm-boost-min').oninput = renderBoostAdmin;
  $('#adm-broadcast-btn').onclick = adminBroadcast;
  $('#tunnel-status-btn').onclick = tunnelStatus;
  $('#tunnel-restart-btn').onclick = tunnelRestart;
  $('#arena-tab-bot').onclick = () => arenaTab('bot');
  $('#arena-tab-pvp').onclick = () => arenaTab('pvp');
  $('#pvp-join').onclick = pvpJoin;
  $('#pvp-leave').onclick = pvpLeave;
  $('#spin-btn').onclick = spin;
  $('#login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
  bindMatchControls();
}

// ---------- Главный цикл ----------
let lastFrame = performance.now();
function gameLoop(now) {
  const dt = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  if (activeScreen === 'world' && state) { updateWorld(dt); renderWorld(); }
  else if (activeScreen === 'match' && match) { updateMatchVisual(dt); renderMatchCanvas(); }
  if (activeScreen === 'world' && state && now - (gameLoop._ls || 0) > 180) {
    gameLoop._ls = now;
    serverSend();
    serverPoll();
  }
  if (now - (gameLoop._net || 0) > 1200) {
    gameLoop._net = now;
    updateNetDisplay();
  }
  requestAnimationFrame(gameLoop);
}

// ---------- Инициализация ----------
function init() {
  resizeWorld();
  bindGlobal();
  const saved = localStorage.getItem(CUR_KEY);
  if (saved && (getAccounts()[saved] || saved === ADMIN_NICK)) {
    currentUser = saved;
    isAdmin = saved === ADMIN_NICK;
    load().then(st => {
      state = st || defaultState();
      idCounter = state.nextId || 0;
      applyOfflineIncome();
      renderTop();
      $('#topbar').classList.remove('hidden');
      $('#admin-btn').classList.toggle('hidden', !isAdmin);
      showScreen('world');
    });
  } else {
    showScreen('login');
  }
  requestAnimationFrame(gameLoop);
  setInterval(tick, 1000);
}

init();
