/* ═══════════════════════════════════════════════════════
   MAN360 — Funções de Banco de Dados
   ═══════════════════════════════════════════════════════ */

let _sb = null;

function getDB() {
  if (!_sb) {
    if (typeof supabase === 'undefined') throw new Error('Supabase não carregado');
    _sb = supabase.createClient(MAN360_CONFIG.supabase.url, MAN360_CONFIG.supabase.key);
  }
  return _sb;
}

async function dbUpsert(tabela, registros, onConflict) {
  if (!registros.length) return { count: 0, error: null };
  const db = getDB();
  const BATCH = 100;
  let total = 0;
  for (let i = 0; i < registros.length; i += BATCH) {
    const lote = registros.slice(i, i + BATCH);
    const opts = onConflict
      ? { onConflict: onConflict, ignoreDuplicates: false }
      : { ignoreDuplicates: true };
    const { error } = await db.from(tabela).upsert(lote, opts);
    if (error) return { count: total, error };
    total += lote.length;
  }
  return { count: total, error: null };
}

async function dbSelect(tabela, options) {
  options = options || {};
  const db = getDB();
  let q = db.from(tabela).select(options.select || '*');
  if (options.filters) options.filters.forEach(([col, op, val]) => { q = q.filter(col, op, val); });
  if (options.order)   q = q.order(options.order.col, { ascending: options.order.asc !== false });
  if (options.limit)   q = q.limit(options.limit);
  return q;
}

async function dbCount(tabela, filters) {
  filters = filters || [];
  const db = getDB();
  let q = db.from(tabela).select('*', { count: 'exact', head: true });
  filters.forEach(([col, op, val]) => { q = q.filter(col, op, val); });
  const { count, error } = await q;
  return { count: count || 0, error };
}

async function dbDelete(tabela, filters) {
  const db = getDB();
  let q = db.from(tabela).delete();
  filters.forEach(([col, val]) => { q = q.eq(col, val); });
  return q;
}
