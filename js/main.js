// ============ ГЛАВНЫЙ ФАЙЛ: привязки, цикл, запуск ============
// ---------- Привязки ----------
function bindGlobal() {
  $$('[data-nav]').forEach(b => b.onclick = () => showScreen(b.dataset.nav));
  $$('.tab-btn[data-scr="market"]').forEach(b => b.onclick = () => renderMarketTab(b.dataset.tab));
  $('#login-btn').onclick = login;
  $('#reg-btn').onclick = register;
  $('#reset-btn').onclick = () => {
    try {
      const a = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '{}');
      for (const n of Object.keys(a)) localStorage.removeItem(SAVE_PREFIX + n);
      localStorage.removeItem(REG_KEY);
      localStorage.removeItem(CUR_KEY);
      localStorage.removeItem('fc_bc_id');
      location.reload();
    } catch (e) { location.reload(); }
  };
  $('#logout-btn').onclick = logout;
  $('#backpack-btn').onclick = openBackpack;
  $('#marketplace-btn').onclick = () => showScreen('marketplace');
  $('#quest-btn').onclick = () => showScreen('quests');
  $('#donat-btn').onclick = () => showScreen('donat');
  $('#index-btn').onclick = () => showScreen('index');
  $('#admin-btn').onclick = () => showScreen('admin');
  $('#adm-give-coins').onclick = () => adminGiveCoins(Math.max(0, Math.floor(+$('#adm-amount').value || 0)));
  $('#adm-give-fans').onclick = () => adminGiveFans(Math.max(0, Math.floor(+$('#adm-amount').value || 0)));
  $('#adm-give-gems').onclick = () => adminGiveGems(Math.max(0, Math.floor(+$('#adm-amount').value || 0)));
  $('#adm-give-player').onclick = adminGivePlayer;
  $('#adm-give-mut').onclick = adminGiveMut;
  $('#adm-give-mom').onclick = () => adminGiveParent('mom');
  $('#adm-give-dad').onclick = () => adminGiveParent('dad');
  $('#adm-give-boost').onclick = adminGiveBoost;
  $('#adm-boost-min').oninput = renderBoostAdmin;
  $('#adm-broadcast-btn').onclick = adminBroadcast;
  $('#tunnel-status-btn').onclick = tunnelStatus;
  $('#tunnel-restart-btn').onclick = tunnelRestart;
  $('#adm-restart-btn').onclick = adminFullRestart;
  $('#arena-tab-bot').onclick = () => arenaTab('bot');
  $('#arena-tab-pvp').onclick = () => arenaTab('pvp');
  $('#pvp-join').onclick = pvpJoin;
  $('#pvp-leave').onclick = pvpLeave;
  $('#spin-btn').onclick = spin;
  $('#login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
  $$('.device-btn[data-device]').forEach(b => b.onclick = () => setDevice(b.dataset.device));
  bindTouchControls();
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
  if (now - (gameLoop._reg || 0) > 8000) {
    gameLoop._reg = now;
    if (currentUser && state) syncRegistry().then(() => reconcileOwned());
  }
  requestAnimationFrame(gameLoop);
}

// ---------- Инициализация ----------
function init() {
  resizeWorld();
  bindGlobal();
  applyTouchMode();
  checkAppVersion();
  const saved = localStorage.getItem(CUR_KEY);
  if (saved && (getAccounts()[saved] || saved === ADMIN_NICK)) {
    currentUser = saved;
    isAdmin = saved === ADMIN_NICK;
    cloudResetIfNeeded().then(() => load()).then(st => {
      state = st || defaultState();
      idCounter = state.nextId || 0;
      applyOfflineIncome();
      healAllCards();
      renderTop();
      $('#topbar').classList.remove('hidden');
      $('#admin-btn').classList.toggle('hidden', !isAdmin);
      showScreen('world');
      syncRegistry().then(() => { flushClaims().then(() => reconcileOwned()); });
    });
  } else {
    showScreen('login');
  }
  requestAnimationFrame(gameLoop);
  setInterval(tick, 1000);
}

init();
