// ============ ЭКОНОМИКА: доход, шансы, состав ============
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
  return p.rating * r.incomeMult * buff * upg * cups * mut * 0.5;
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

