// ============ SUPABASE: подключение ============
// Вставь сюда URL проекта и anon-ключ (Supabase → Project Settings → API):
const SUPABASE_URL = 'https://slakvnvrlpzgqwglxgld.supabase.co';
const SUPABASE_ANON = 'sb_publishable_S435Y8f0M-djMgeALHL2Eg_hwQTr8up';

let sb = null;
let SB_READY = false;
if (SUPABASE_URL && SUPABASE_ANON && typeof supabase !== 'undefined') {
  try {
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    SB_READY = !!sb;
  } catch (e) {
    sb = null;
    SB_READY = false;
  }
}
