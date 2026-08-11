// ============ МУЛЬТИПЛЕЕР И СЕРВЕР: сеть, рассылки, подарки ============
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
  if (SB_READY) {
    try {
      const p = state.world;
      const { error } = await sb.from('positions').upsert({
        nick: currentUser,
        x: +p.x.toFixed(2), z: +p.z.toFixed(2), yaw: +p.yaw.toFixed(3),
        facing: +(p.facing || p.yaw).toFixed(3),
        color: playerColor(currentUser),
        pvp: state.pvpQueued ? 1 : 0,
        field: serverPayload().field,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'nick' });
      server.online = !error;
      return;
    } catch (e) { server.online = false; return; }
  }
  try {
    const r = await fetch('/api/pos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(serverPayload()) });
    if (r && r.ok) { server.online = true; return; }
  } catch (e) {}
  server.online = false;
}

async function serverPoll() {
  if (SB_READY) {
    try {
      const since = new Date(Date.now() - 10000).toISOString();
      const { data, error } = await sb.from('positions').select('*').gte('updated_at', since);
      if (!error && data) {
        const players = data.filter(p => p && p.nick && p.nick !== currentUser)
          .map(p => ({ nick: p.nick, x: p.x, z: p.z, yaw: p.yaw || 0, color: p.color || '#ffffff', pvp: !!p.pvp }));
        const owners = {};
        for (const p of data) if (p.field && p.field.idx != null) owners[p.field.idx] = p.field;
        applyServerPlayers({ players, owners });
        server.online = true;
      } else { server.online = false; }
      checkPvpQueue(); claimGifts(); checkBroadcasts();
      return;
    } catch (e) { server.online = false; return; }
  }
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
    if (SB_READY) {
      const { data, error } = await sb.from('broadcasts').select('id,msg,from_nick').gt('id', lastBroadcastId).order('id', { ascending: true });
      if (error) return;
      for (const b of data || []) { lastBroadcastId = b.id; broadcastQueue.push({ id: b.id, msg: b.msg, from: b.from_nick }); }
    } else {
      const r = await fetch('/api/broadcasts');
      if (!r || !r.ok) return;
      const d = await r.json();
      if (!d || !d.ok || !d.list) return;
      for (const b of d.list) {
        if (b.id > lastBroadcastId) { lastBroadcastId = b.id; broadcastQueue.push(b); }
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
    if (SB_READY) {
      const { data, error } = await sb.from('broadcasts').insert({ msg, from_nick: currentUser }).select('id').single();
      if (error) { toast('❌ ' + error.message); return; }
      const id = data ? data.id : Date.now();
      lastBroadcastId = id;
      localStorage.setItem('fc_bc_id', String(lastBroadcastId));
      broadcastQueue.push({ id, msg, from: currentUser });
      pumpBroadcast();
      toast('📢 Сообщение отправлено');
      return;
    }
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

function processGifts(list) {
  if (!list || !list.length) return 0;
  let got = 0; let mutMsg = null;
  for (const g of list) {
    const kind = g.type;
    if (kind === 'player' && g.player) {
      const p = g.player;
      const card = { id: idCounter++, key: p.key || p.name, name: p.name, pos: p.pos, rating: +p.rating, rarity: p.rarity, flag: p.flag };
      state.players.push(card);
      claimRemote(card);
      got++;
    } else if (kind === 'coins') { state.coins += (g.n || 0); got++; }
    else if (kind === 'fans') { state.fans += (g.n || 0); got++; }
    else if (kind === 'mutation' && g.mutation) {
      if (state.players.length) {
        const pool = state.players.filter(p => !p.mut);
        const chosen = pool.length ? pick(pool) : pick(state.players);
        const m = MUTATIONS.find(x => x.id === g.mutation.id);
        chosen.mut = { id: g.mutation.id, mult: g.mutation.mult || (m ? m.base : 1) };
        mutMsg = `🧬 Мутация «${m ? m.name : '?'}» ×${chosen.mut.mult} на ${chosen.name}!`;
        got++;
      }
    }
    else if (kind === 'parent' && (g.kind === 'mom' || g.kind === 'dad')) {
      const pp = makeParent(g.kind);
      state.players.push(pp);
      mutMsg = `${pp.flag} ${pp.name} пришла в команду! Поставь её на базу клавишей E.`;
      got++;
    }
    else if (kind === 'boost') {
      const bt = LUCK_BOOSTS.find(t => t.id === g.tier) || LUCK_BOOSTS[0];
      const minutes = Math.max(1, Math.min(60, +(g.minutes || 1)));
      state.luckBoost = { tier: bt.id, until: Date.now() + minutes * 60000 };
      mutMsg = `${bt.icon} Админ включил тебе удачу «${bt.name}» на ${minutes} мин!`;
      got++;
    }
  }
  if (got) { save(); renderTop(); toast(mutMsg || '📦 Подарок от админа!'); }
  return got;
}

async function claimGifts() {
  if (!currentUser || !state) return;
  try {
    if (SB_READY) {
      const { data, error } = await sb.rpc('claim_gifts', { _nick: currentUser });
      if (error || !data) return;
      const list = (Array.isArray(data) ? data : (data && data.value) ? data.value : []).map(g => {
        const d = g.data || {};
        return { type: g.type, from: g.from, player: d.player, n: d.n, mutation: d.mutation, kind: d.kind, tier: d.tier, minutes: d.minutes };
      });
      processGifts(list);
      return;
    }
    const r = await fetch('/api/gifts?nick=' + encodeURIComponent(currentUser));
    if (!r || !r.ok) return;
    const d = await r.json();
    if (!d || !d.ok || !d.gifts || !d.gifts.length) return;
    processGifts(d.gifts);
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

