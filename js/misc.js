// ============ ПРОЧЕЕ: тосты, тик, мутации ============
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

