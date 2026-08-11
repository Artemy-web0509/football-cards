// ============ УСТРОЙСТВО (компьютер / телефон) И СЕНСОРНОЕ УПРАВЛЕНИЕ ============
const DEVICE_KEY = 'fc_device';

function getDevice() {
  try {
    const d = localStorage.getItem(DEVICE_KEY);
    if (d === 'pc' || d === 'phone') return d;
  } catch (e) {}
  const touch = (typeof window !== 'undefined') && (('ontouchstart' in window) || ((navigator.maxTouchPoints || 0) > 0));
  return touch ? 'phone' : 'pc';
}

function setDevice(d) {
  if (d !== 'pc' && d !== 'phone') return;
  try { localStorage.setItem(DEVICE_KEY, d); } catch (e) {}
  applyTouchMode();
  toast(d === 'phone' ? '📱 Экранные кнопки включены' : '💻 Управление с клавиатуры и мыши');
}

function applyTouchMode() {
  const touch = getDevice() === 'phone';
  if (document.body) document.body.classList.toggle('touch-mode', touch);
  const tc = $('#touch-controls');
  if (tc) tc.classList.toggle('hidden', !touch);
  const hint = $('#device-hint');
  if (hint) hint.textContent = touch
    ? 'Добавлю экранные кнопки: движение, камера и действия.'
    : 'Управление обычное: клавиатура и мышь.';
  $$('.device-btn[data-device]').forEach(b => b.classList.toggle('active', b.dataset.device === getDevice()));
}

// ---------- Кнопки на экране (телефон) ----------
function holdKey(btn, key) {
  btn.addEventListener('pointerdown', ev => { ev.preventDefault(); keys[key] = true; });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(evName =>
    btn.addEventListener(evName, ev => { ev.preventDefault(); keys[key] = false; }));
}

let rotTimer = null;
function startRot(dir) {
  stopRot();
  rotTimer = setInterval(() => {
    if (state && activeScreen === 'world') state.world.yaw += dir * 2.4;
  }, 50);
}
function stopRot() { if (rotTimer) { clearInterval(rotTimer); rotTimer = null; } }

function bindTouchControls() {
  $$('.tc-btn[data-key]').forEach(b => holdKey(b, b.dataset.key));

  const rotL = $('#tc-rotl');
  if (rotL) {
    rotL.addEventListener('pointerdown', ev => { ev.preventDefault(); startRot(-1); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(n => rotL.addEventListener(n, stopRot));
  }
  const rotR = $('#tc-rotr');
  if (rotR) {
    rotR.addEventListener('pointerdown', ev => { ev.preventDefault(); startRot(1); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(n => rotR.addEventListener(n, stopRot));
  }

  const eBtn = $('#tc-e');
  if (eBtn) eBtn.addEventListener('pointerup', ev => { ev.preventDefault(); if (activeScreen === 'world') tryEnter(); });

  const bBtn = $('#tc-b');
  if (bBtn) bBtn.addEventListener('pointerup', ev => {
    ev.preventDefault();
    if (activeScreen === 'world' && state) { if (state.held) keepHeld(); else openBackpack(); }
  });
}
