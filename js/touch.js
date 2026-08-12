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
    ? 'Слева — джойстик движения, справа — свайп для поворота камеры, как в Roblox.'
    : 'Управление обычное: клавиатура и мышь.';
  $$('.device-btn[data-device]').forEach(b => b.classList.toggle('active', b.dataset.device === getDevice()));
}

// ---------- Виртуальный джойстик (как в Roblox) ----------
let joy = null;      // { id, zone, ox, oy, cx, cy } текущая активная зона
const JOY_R = 42;    // радиус стика в пикселях

function joyActive() { return !!joy; }

function moveVecFromJoy() {
  if (!joy) return { fwd: 0, strafe: 0, yaw: 0 };
  let fwd = 0, strafe = 0, yaw = 0;
  if (joy.zone === 'move') {
    const dx = joy.cx - joy.ox, dy = joy.cy - joy.oy;
    const len = Math.hypot(dx, dy);
    if (len > 4) {
      const nx = dx / len, ny = dy / len;
      const k = Math.min(1, len / JOY_R);
      fwd = -ny * k;      // вверх по экрану = вперёд
      strafe = nx * k;    // вправо по экрану = вправо
    }
  } else {
    yaw = (joy.cx - joy.ox) * 0.005;
  }
  return { fwd, strafe, yaw };
}

function bindTouchControls() {
  const moveZone = $('#tc-move-zone');
  const camZone = $('#tc-cam-zone');
  const moveKnob = $('#tc-move-knob');
  const moveStick = $('#tc-move-stick');

  if (moveZone && moveKnob && moveStick) {
    moveZone.addEventListener('pointerdown', ev => {
      if (joy) return;
      ev.preventDefault();
      try { moveZone.setPointerCapture(ev.pointerId); } catch (e) {}
      const r = moveStick.getBoundingClientRect();
      joy = { id: ev.pointerId, zone: 'move', ox: r.left + r.width / 2, oy: r.top + r.height / 2, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
      moveKnob.classList.add('active');
      updateMoveKnob(moveKnob);
    });
    moveZone.addEventListener('pointermove', ev => {
      if (!joy || joy.zone !== 'move' || ev.pointerId !== joy.id) return;
      ev.preventDefault();
      joy.cx = ev.clientX; joy.cy = ev.clientY;
      updateMoveKnob(moveKnob);
    });
    const endMove = ev => {
      if (!joy || joy.zone !== 'move' || ev.pointerId !== joy.id) return;
      joy = null;
      if (moveKnob) { moveKnob.classList.remove('active'); updateMoveKnob(moveKnob); }
    };
    moveZone.addEventListener('pointerup', endMove);
    moveZone.addEventListener('pointercancel', endMove);
  }

  function updateMoveKnob(knob) {
    if (!joy || joy.zone !== 'move') { knob.style.transform = 'translate(0,0)'; return; }
    const dx = joy.cx - joy.ox, dy = joy.cy - joy.oy;
    const len = Math.hypot(dx, dy);
    const cl = Math.min(len, JOY_R);
    const kx = len > 0 ? (dx / len) * cl : 0;
    const ky = len > 0 ? (dy / len) * cl : 0;
    knob.style.transform = `translate(${kx}px, ${ky}px)`;
  }

  if (camZone) {
    camZone.addEventListener('pointerdown', ev => {
      if (joy) return;
      ev.preventDefault();
      try { camZone.setPointerCapture(ev.pointerId); } catch (e) {}
      joy = { id: ev.pointerId, zone: 'cam', ox: ev.clientX, oy: ev.clientY, cx: ev.clientX, cy: ev.clientY };
    });
    camZone.addEventListener('pointermove', ev => {
      if (!joy || joy.zone !== 'cam' || ev.pointerId !== joy.id) return;
      ev.preventDefault();
      joy.cx = ev.clientX; joy.cy = ev.clientY;
    });
    const endCam = ev => {
      if (!joy || joy.zone !== 'cam' || ev.pointerId !== joy.id) return;
      joy = null;
    };
    camZone.addEventListener('pointerup', endCam);
    camZone.addEventListener('pointercancel', endCam);
  }

  const eBtn = $('#tc-e');
  if (eBtn) eBtn.addEventListener('pointerup', ev => { ev.preventDefault(); if (activeScreen === 'world') tryEnter(); });

  const bBtn = $('#tc-b');
  if (bBtn) bBtn.addEventListener('pointerup', ev => {
    ev.preventDefault();
    if (activeScreen === 'world' && state) { if (state.held) keepHeld(); else openBackpack(); }
  });
}
