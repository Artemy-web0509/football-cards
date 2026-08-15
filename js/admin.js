// ============ АДМИН-ПАНЕЛЬ ============
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
    if (SB_READY) {
      const gd = Object.assign({}, data);
      if (type === 'mutation' && gd.mutation) gd.mutation = { id: gd.mutation.id, mult: gd.mutation.mult };
      const { error } = await sb.from('gifts').insert({ to_nick: target, from_nick: currentUser, type, data: gd });
      if (error) { toast('❌ ' + error.message); return 'fail'; }
      toast('✅ Отправлено игроку «' + target + '»');
      return 'sent';
    }
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
  adminRemoteGive('player', { player: { key: p.key, name: p.name, pos, rating: p.rating, rarity, flag: p.flag } });
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

// ============ ПОЛНЫЙ РЕСТАРТ ИГРЫ ============
function restApi(path, opts) {
  const headers = Object.assign({
    'apikey': SUPABASE_ANON,
    'Authorization': 'Bearer ' + SUPABASE_ANON,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
  }, (opts && opts.headers) || {});
  return fetch(SUPABASE_URL + path, Object.assign({ headers }, opts)).then(r => {
    if (!r.ok) return Promise.reject('HTTP ' + r.status);
    return r;
  });
}

async function adminFullRestart() {
  const btn = $('#adm-restart-btn');
  const st = $('#adm-restart-status');
  if (!confirm('Полный рестарт игры?\nСервер будет очищен: все сохранения, аккаунты, позиции и карточки игроков. Игра перезагрузится у всех. Продолжить?')) return;
  if (btn) btn.disabled = true;
  st.textContent = '⏳ Очищаю сервер (REST)...';
  const paths = [
    '/rest/v1/saves?nick=neq.__none__',
    '/rest/v1/positions?nick=neq.__none__',
    '/rest/v1/players?nick=neq.__none__',
    '/rest/v1/cards?owner=neq.null',
  ];
  const jobs = paths.map(p => restApi(p, { method: 'DELETE' }).then(() => 'OK').catch(e => 'ERR ' + e));
  if (!SB_READY) jobs.push(fetch('/api/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(r => r.ok ? 'OK' : 'ERR /api/reset').catch(e => 'ERR /api/reset'));
  const results = await Promise.all(jobs);
  const errs = results.filter(r => r !== 'OK');
  st.innerHTML = '✅ Сервер очищен' + (errs.length ? ' (ошибки: ' + errs.join(', ') + ')' : '') + '. Сбрасываю игру...';
  try {
    const a = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '{}');
    for (const n of Object.keys(a)) localStorage.removeItem(SAVE_PREFIX + n);
  } catch (e) {}
  localStorage.removeItem(REG_KEY);
  localStorage.removeItem(CUR_KEY);
  localStorage.removeItem('fc_bc_id');
  setTimeout(() => location.reload(), 400);
}

