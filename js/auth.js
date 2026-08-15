// ============ АВТОРИЗАЦИЯ: вход / регистрация ============
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
  if (SB_READY) {
    try {
      const { data, error } = await sb.rpc('register_player', { _nick: nick, _pass: hashPass(pass) });
      if (error) return loginError(error.message || 'Ошибка регистрации');
      if (data === 'EXISTS') return loginError('Такой никнейм уже занят');
    } catch (e) { return loginError('Сервер недоступен. Попробуй ещё раз'); }
    accs[nick] = hashPass(pass); setAccounts(accs);
    currentUser = nick;
    localStorage.setItem(CUR_KEY, nick);
    createLocalAccountState(nick);
    enterWorld();
    return;
  }
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
  if (SB_READY) {
    try {
      const { data, error } = await sb.rpc('login_player', { _nick: nick, _pass: hashPass(pass) });
      if (error) return loginError(error.message || 'Ошибка входа');
      if (!data) return loginError('Никнейм не найден. Зарегистрируйся');
    } catch (e) { return loginError('Сервер недоступен. Попробуй ещё раз'); }
    const accs = getAccounts();
    accs[nick] = hashPass(pass); setAccounts(accs);
    isAdmin = false;
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

async function logout() {
  if (currentUser && state) {
    if (SB_READY) {
      try {
        const { error } = await sb.from('saves').upsert({ nick: currentUser, state, updated_at: new Date().toISOString() }, { onConflict: 'nick' });
        if (error) console.warn('cloud save:', error.message);
      } catch (e) { console.warn('cloud save error:', e); }
    } else if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/save', JSON.stringify({ nick: currentUser, state }));
    }
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
  applyTouchMode();
  refreshMyFieldOwner();
  updateHeldHud();
  renderTop();
  showScreen('world');
  syncRegistry().then(() => { flushClaims().then(() => reconcileOwned()); });
}
