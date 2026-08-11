// ============ КАРТОЧКИ: рендер HTML, мутации, родители ============
// ---------- Карточки (HTML) ----------
function mutationOf(p) {
  if (!p || !p.mut) return null;
  const m = MUTATIONS.find(x => x.id === p.mut.id);
  return m ? { icon: m.icon, name: m.name, mult: p.mut.mult || m.base, color: m.color || '#ffd54a' } : null;
}

function parentOf(p) {
  if (!p || !p.kind) return null;
  if (p.kind === 'mom') return { icon: '👩', name: 'Мама', color: '#ff7bac' };
  if (p.kind === 'dad') return { icon: '👨', name: 'Папа', color: '#7bb8ff' };
  return null;
}

function makeParent(kind) {
  return {
    id: idCounter++,
    name: kind === 'mom' ? 'Мама' : 'Папа',
    pos: 'MF',
    rating: 99,
    rarity: 'secret',
    flag: kind === 'mom' ? '👩' : '👨',
    kind,
  };
}

function loveBuff() {
  if (!state) return 1;
  const inTeam = state.starters.map(getPlayer).filter(Boolean);
  return inTeam.some(p => p.kind === 'mom') && inTeam.some(p => p.kind === 'dad') ? 2 : 1;
}

function faceExtra(p) {
  const mu = mutationOf(p);
  if (mu) return { icon: mu.icon, mult: mu.mult, label: '', color: '#ffe66b' };
  const pr = parentOf(p);
  if (pr) {
    const love = loveBuff();
    if (love > 1) return { icon: '💞', mult: null, label: ' Любовь', color: '#ff9dc5' };
    return { icon: pr.icon, mult: null, label: '', color: '#fff' };
  }
  return null;
}

function cardHTML(p) {
  const r = RARITIES[p.rarity];
  const mu = mutationOf(p);
  const pr = parentOf(p);
  const love = pr && loveBuff() > 1;
  return `<div class="pcard rarity-${p.rarity}">
    <div class="pc-flag">${p.flag}</div>
    <div class="pc-rating">${p.rating}</div>
    <div class="pc-pos">${POS_LABEL[p.pos]}</div>
    <div class="pc-name">${p.name}</div>
    <div class="pc-rname">${r.emoji} ${r.name}${pr ? ' ' + pr.icon : ''}</div>
    <div class="pc-income">+${playerIncome(p).toFixed(1)}/сек${mu ? ` <span class="pc-mut" title="Мутация: ${mu.name}">${mu.icon}×${mu.mult}</span>` : ''}${love ? ' <span class="pc-love" title="💞 Любовь Мамы и Папы: доход ×2">💞</span>' : ''}</div>
  </div>`;
}

function miniCardHTML(p) {
  const r = RARITIES[p.rarity];
  const mu = mutationOf(p);
  const pr = parentOf(p);
  const love = pr && loveBuff() > 1;
  return `<div class="pcard-mini rarity-${p.rarity}">
    <div class="pc-flag">${p.flag}</div>
    <div class="pc-rating">${p.rating}</div>
    <div class="pc-pos">${POS_LABEL[p.pos]}</div>
    <div class="pc-name">${p.name}</div>
    <div class="pc-rname">${r.emoji} ${r.name}${pr ? ' ' + pr.icon : ''}${mu ? ` ${mu.icon}×${mu.mult}` : ''}${love ? ' 💞' : ''}</div>
  </div>`;
}
