// ============ УТИЛИТЫ: хелперы и глобальные переменные ============
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
const APP_VERSION = 'v36';
const VER_KEY = 'fc_ver';
const CLOUD_RESET_KEY = 'fc_reset_cloud';

function checkAppVersion() {
  try {
    const prev = localStorage.getItem(VER_KEY);
    if (prev !== APP_VERSION) {
      localStorage.removeItem(REG_KEY);
      localStorage.removeItem('fc_bc_id');
      localStorage.removeItem(VER_KEY);
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.indexOf(SAVE_PREFIX) === 0) localStorage.removeItem(k);
        }
      } catch (e) {}
      try { localStorage.setItem(CLOUD_RESET_KEY, '1'); } catch (e) {}
    }
    localStorage.setItem(VER_KEY, APP_VERSION);
  } catch (e) {}
}

function cloudResetIfNeeded() {
  if (localStorage.getItem(CLOUD_RESET_KEY) !== '1') return Promise.resolve();
  try { localStorage.removeItem(CLOUD_RESET_KEY); } catch (e) {}
  if (!currentUser || !SB_READY) return Promise.resolve();
  const jobs = [
    sb.from('saves').delete().eq('nick', currentUser),
    sb.from('positions').delete().eq('nick', currentUser),
    sb.from('cards').delete().eq('owner', currentUser),
  ];
  return Promise.all(jobs.map(j => Promise.resolve(j).catch(() => {}))).then(() => {});
}

function getPlayer(id) { return state.players.find(p => p.id === id) || transient[id] || null; }

// Редкость по рейтингу (для реальных игроков)
function rarityForRating(r) {
  if (r <= 71) return 'bronze';
  if (r <= 79) return 'silver';
  if (r <= 86) return 'gold';
  if (r <= 92) return 'diamond';
  if (r <= 100) return 'secret';
  return 'bingi';
}

// ---------- ГЛОБАЛЬНЫЙ РЕЕСТР УНИКАЛЬНЫХ КАРТОЧЕК ----------
// Каждый реальный футболист существует в одном экземпляре на весь мир.
let REGISTRY = {};        // key -> {name, flag, pos, rating, rarity, owner, list_price, listed_by}
let claimedKeys = {};     // key -> true если карточка кем-то занята
let myKeys = {};          // key -> true если карточка принадлежит мне
let REGISTRY_LOADED = false;
const REG_KEY = 'fc_registry';

function registryAll() { return REGISTRY; }

function generatePlayer(rarityId, pos, forcedRating, claimIt) {
  const doClaim = claimIt !== false;
  if (rarityId === 'bingi') {
    const pool = REAL_PLAYERS.filter(x => !claimedKeys[x.name] && x.rating >= 101 && x.rating <= 110 && (!pos || x.pos === pos));
    const src = pool.length ? pick(pool) : null;
    if (src) {
      const p = { id: idCounter++, key: src.name, name: src.name, pos: src.pos, rating: src.rating, rarity: 'bingi', flag: src.flag };
      if (doClaim) { claimedKeys[p.key] = true; claimRemote(p); }
      return p;
    }
    const p = { id: idCounter++, key: 'Бинги', name: 'Бинги', pos, rating: 110, rarity: 'bingi', flag: '🌈' };
    if (doClaim) { claimedKeys[p.key] = true; claimRemote(p); }
    return p;
  }
  // Принудительный рейтинг (админ/тесты): реальный игрок ровно с этим рейтингом, иначе запасной
  if (forcedRating != null) {
    let pool = REAL_PLAYERS.filter(x => !claimedKeys[x.name] && x.rating === forcedRating && (!pos || x.pos === pos));
    if (!pool.length) pool = REAL_PLAYERS.filter(x => !claimedKeys[x.name] && x.rating === forcedRating);
    if (pool.length) {
      const src = pick(pool);
      const p = { id: idCounter++, key: src.name, name: src.name, pos: src.pos, rating: src.rating, rarity: rarityForRating(src.rating), flag: src.flag };
      if (doClaim) { claimedKeys[src.name] = true; claimRemote(p); }
      return p;
    }
    return genShadow(rarityId, pos, forcedRating);
  }
  // Обычное выпадение: реальный игрок сохраняет СВОЙ рейтинг и редкость.
  // Сначала своя редкость, потом ниже, потом выше. Никогда не подменяем рейтинг.
  const TIERS = ['bronze', 'silver', 'gold', 'diamond', 'secret'];
  const self = TIERS.indexOf(rarityId);
  const order = [rarityId, ...TIERS.slice(0, self), ...TIERS.slice(self + 1)];
  for (const rid of order) {
    const range = RARITIES[rid].rating;
    const pool = REAL_PLAYERS.filter(x =>
      !claimedKeys[x.name] &&
      x.rating >= range[0] && x.rating <= range[1] &&
      (!pos || x.pos === pos));
    if (pool.length) {
      const src = pick(pool);
      const p = { id: idCounter++, key: src.name, name: src.name, pos: src.pos, rating: src.rating, rarity: rarityForRating(src.rating), flag: src.flag };
      if (doClaim) { claimedKeys[src.name] = true; claimRemote(p); }
      return p;
    }
  }
  return genShadow(rarityId, pos, forcedRating);
}

// Чинит старые карточки: реальный игрок всегда со своим настоящим рейтингом и редкостью
function healPlayer(p) {
  if (!p || p.shadow || p.fake) return;
  const real = REAL_PLAYERS.find(x => x.name === (p.key || p.name));
  if (!real) return;
  p.name = real.name; p.flag = real.flag; p.pos = real.pos;
  p.rating = real.rating; p.rarity = rarityForRating(real.rating);
  if (!p.key) p.key = real.name;
}
function healAllCards() {
  if (!state) return;
  let changed = false;
  for (const p of state.players) {
    const before = p.rating + '|' + p.rarity;
    healPlayer(p);
    if (before !== p.rating + '|' + p.rarity) changed = true;
  }
  if (state.held) healPlayer(state.held);
  if (changed) { save(); if (typeof renderTop === 'function') renderTop(); }
}

let shadowN = 0;
function genShadow(rarityId, pos, forcedRating) {
  const r = RARITIES[rarityId];
  shadowN++;
  return {
    id: idCounter++,
    key: 'shadow_' + shadowN,
    name: 'Запасной #' + shadowN,
    pos, rating: forcedRating != null ? forcedRating : rnd(r.rating[0], r.rating[1]),
    rarity: rarityId, flag: '🏳️', shadow: true,
  };
}

// Визуальная генерация (боты, рулетка, чужие поля) — НЕ занимает реального игрока
function generateFakePlayer(rarityId, pos, forcedRating) {
  if (rarityId === 'bingi') {
    const pool = REAL_PLAYERS.filter(x => x.rating >= 101 && x.rating <= 110 && (!pos || x.pos === pos));
    const src = pool.length ? pick(pool) : null;
    return { id: idCounter++, key: src ? src.name : 'Бинги', name: src ? src.name : 'Бинги', pos, rating: src ? src.rating : 110, rarity: 'bingi', flag: src ? src.flag : '🌈', fake: true };
  }
  const range = RARITIES[rarityId].rating;
  let pool = REAL_PLAYERS.filter(x =>
    x.rating >= range[0] && x.rating <= range[1] &&
    (!pos || x.pos === pos));
  if (!pool.length) pool = REAL_PLAYERS.filter(x => x.rating >= range[0] && x.rating <= range[1]);
  const src = pool.length ? pick(pool) : null;
  return {
    id: idCounter++,
    key: src ? src.name : 'shadow_' + (++shadowN),
    name: src ? src.name : 'Запасной',
    pos: src ? src.pos : pos,
    rating: forcedRating != null ? forcedRating : (src ? src.rating : rnd(range[0], range[1])),
    rarity: rarityId,
    flag: src ? src.flag : '🏳️',
    fake: true,
  };
}

// Локальная пометка занятости (для мгновенного ответа офлайн)
function claimLocal(p) {
  if (!p || !p.key || p.shadow) return;
  claimedKeys[p.key] = true;
  REGISTRY[p.key] = REGISTRY[p.key] || {
    name: p.key, flag: p.flag, pos: p.pos, rating: p.rating, rarity: p.rarity,
    owner: currentUser, list_price: null, listed_by: null,
  };
  myKeys[p.key] = true;
  saveLocalRegistry();
}
function releaseLocal(key) {
  if (!key) return;
  delete claimedKeys[key];
  delete myKeys[key];
  if (REGISTRY[key]) { REGISTRY[key].owner = null; REGISTRY[key].list_price = null; REGISTRY[key].listed_by = null; }
  saveLocalRegistry();
}
function saveLocalRegistry() {
  try { localStorage.setItem(REG_KEY, JSON.stringify(REGISTRY)); } catch (e) {}
}
