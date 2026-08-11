// ============ UI: топбар, навигация по экранам ============
// ---------- Топбар ----------
function renderTop() {
  if (!state) return;
  $('#ver-display').textContent = '🛠 ' + APP_VERSION;
  $('#coins-display').textContent = '💰 ' + Math.floor(state.coins);
  $('#income-display').textContent = '+' + incomePerSec().toFixed(1) + '/сек';
  $('#fans-display').textContent = '👥 ' + Math.floor(state.fans);
  $('#user-display').textContent = '👤 ' + currentUser;
}
// ---------- Навигация ----------
function showScreen(name) {
  activeScreen = name;
  $$('.screen').forEach(s => s.classList.remove('active'));
  const el = $('#screen-' + name);
  el.classList.add('active');
  const scroll = (name === 'spinner' || name === 'field' || name === 'backpack' || name === 'arena' || name === 'market' || name === 'marketplace' || name === 'index' || name === 'match' || name === 'admin' || name === 'luck' || name === 'fieldupg');
  if (scroll) el.classList.add('scroll-screen'); else el.classList.remove('scroll-screen');
  if (name === 'spinner') renderSpinnerPanel();
  else if (name === 'field') renderFieldScreen(currentField);
  else if (name === 'backpack') renderBackpack();
  else if (name === 'arena') renderArena();
  else if (name === 'market') renderMarket();
  else if (name === 'marketplace') renderMarketplace();
  else if (name === 'index') renderPlayerIndex();
  else if (name === 'luck') renderLuckUpgrades();
  else if (name === 'fieldupg') renderFieldUpg();
  else if (name === 'admin') renderAdmin();
  else if (name === 'match') { resizeMatch(); if (match) renderMatchScreen(); }
  else if (name === 'world') resizeWorld();
  window.scrollTo(0, 0);
}

