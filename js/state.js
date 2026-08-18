// ============ СОСТОЯНИЕ: сохранение, загрузка, владельцы полей ============
// ---------- Состояние ----------
let state = null;

function defaultState() {
  const players = [];
  const starters = [];
  const make = pos => { const p = generatePlayer('bronze', pos); players.push(p); starters.push(p.id); return p; };
  make('GK');
  for (let i = 0; i < 4; i++) make('DF');
  for (let i = 0; i < 3; i++) make('MF');
  for (let i = 0; i < 3; i++) make('FW');
  return {
    coins: START_COINS, fans: 0, gems: 0,
    players, starters, formation: '4-3-3',
    buffs: {}, cups: [], upgrades: { possession: 0, income: 0 },
    nextId: idCounter,
    beatenOpponents: [], matchesWon: 0, pvpWins: 0,
    questsDone: [], spinsTotal: 0, questCaseCount: 0,
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
  const make = pos => { const p = generateFakePlayer(pickRarity(), pos); cards.push(p); return p; };
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
    if (SB_READY) {
      try {
        sb.from('saves').upsert({ nick: currentUser, state, updated_at: new Date().toISOString() }, { onConflict: 'nick' }).then(() => {});
      } catch (e) {}
      return;
    }
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
  if (localStorage.getItem(FORCE_SPAWN_KEY)) {
    try { localStorage.removeItem(FORCE_SPAWN_KEY); } catch (e) {}
    st.world = { ...PLAYER_SPAWN };
  } else if (worldCollides(st.world.x, st.world.z)) st.world = { ...PLAYER_SPAWN };
  st.luckBoost = st.luckBoost || null;
  st.nextMutationAt = st.nextMutationAt || (Date.now() + MUTATION_INTERVAL);
  if (typeof st.gems !== 'number') st.gems = 0;
  if (!Array.isArray(st.questsDone)) st.questsDone = [];
  if (typeof st.spinsTotal !== 'number') st.spinsTotal = 0;
  if (typeof st.questCaseCount !== 'number') st.questCaseCount = 0;
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
  if (SB_READY) {
    try {
      const { data, error } = await sb.from('saves').select('state').eq('nick', currentUser).maybeSingle();
      if (!error && data && data.state) return data.state;
    } catch (e) {}
    return null;
  }
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

