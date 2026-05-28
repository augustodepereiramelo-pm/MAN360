/* ═══════════════════════════════════════════════════════════════
   MAN360 — Módulo Apontamentos  (v2)
   ═══════════════════════════════════════════════════════════════ */
(() => {

/* ── Constantes ─────────────────────────────────────────────── */
const SUPABASE_URL     = MAN360_CONFIG.supabase.url;
const SUPABASE_KEY     = MAN360_CONFIG.supabase.key;
const META_APONTAMENTO = 0.75;
const HH_DIA           = 8;
// Âncora: semana 9 começa 25/05/2026
const SEMANA_ANCORA    = 9;
const DATA_ANCORA_ISO  = '2026-05-25';
const SEMANAS_JANELA   = 8;

/* ── CSS vars do padrão MAN360 ──────────────────────────────── */
const C = {
  yellow:  '#F8C100',
  dark1:   '#1a1a1a',
  dark2:   '#242424',
  border:  '#e5e7eb',
  bg:      '#f9fafb',
  text:    '#1f2937',
  textSub: '#6b7280',
  textMut: '#9ca3af',
  red:     '#C8102E',
  green:   '#16a34a',
  amber:   '#d97706',
  blue:    '#2563eb',
  card:    '#ffffff',
};

/* ── Helpers de data ────────────────────────────────────────── */
function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function hojeIso()        { return new Date().toISOString().slice(0, 10); }
function fmtDate(iso)     { const [,m,d]=iso.split('-'); return `${d}/${m}`; }
function fmtDateFull(iso) { const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}`; }
function diaSemAbrev(iso) { return ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][new Date(iso+'T00:00:00').getDay()]; }
function diasEntre(a,b)   { const r=[]; let c=a; while(c<=b){r.push(c);c=addDays(c,1);} return r; }
function semParaDatas(s)  { const i=addDays(DATA_ANCORA_ISO,(s-SEMANA_ANCORA)*7); return {inicio:i,fim:addDays(i,6)}; }

function gerarFolgas(escala, primeiraFolga, ate) {
  if (!escala || escala==='ADM' || !primeiraFolga) return new Set();
  const ciclo = escala==='5x1' ? 6 : 7;
  const set = new Set();
  let cur = primeiraFolga;
  while (cur <= ate) { set.add(cur); cur = addDays(cur, ciclo); }
  return set;
}

/* ── Supabase ───────────────────────────────────────────────── */
async function sb(path, opts={}) {
  const prefer = opts.prefer || (opts.method==='DELETE' ? 'return=minimal' : 'return=representation');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': prefer,
      ...(opts.headers||{}),
    },
    ...opts,
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.status===204 ? [] : res.json();
}

/* ── Estado ─────────────────────────────────────────────────── */
const S = {
  safra: '2025/26',
  periodoTipo: 'semana',
  semana: SEMANA_ANCORA,
  dataInicio: semParaDatas(SEMANA_ANCORA).inicio,
  dataFim:    semParaDatas(SEMANA_ANCORA).fim,
  modalidades: [],
  colaboradorChapa: null,
  apontamentos: [],
  colaboradores: [],
  especialidades: [],
  justificativas: [],
  ferias: [],
  hmPag: 0,
  aba: 'principal',
  cadAba: 'colab',
};

const MODALIDADES  = ['MEC','CAL','ELE','CIV','INS','AUT','ISP'];
const SAFRAS       = ['2024/25','2025/26','2026/27'];
const ESCALAS      = ['5x1','6x1','ADM'];
const TIPOS_JUST   = ['Ausência de apontamento','Troca de folga'];
const TRAT_AUSENC  = ['Treinamento','Serviço externo'];

/* ═══════════════════════════════════════════════════════════════
   ESTILOS INLINE (padrão MAN360)
   ═══════════════════════════════════════════════════════════════ */
function css() {
  if (document.getElementById('apt-styles')) return;
  const s = document.createElement('style');
  s.id = 'apt-styles';
  s.textContent = `
    #apt-root { font-family: 'Inter', -apple-system, sans-serif; color: ${C.text}; font-size:13px; }
    #apt-root * { box-sizing: border-box; }
    .apt-card { background:${C.card}; border:1px solid ${C.border}; border-radius:10px; padding:16px; }
    .apt-label { font-size:10px; font-weight:600; color:${C.textSub}; text-transform:uppercase; letter-spacing:.07em; display:block; margin-bottom:5px; }
    .apt-select { height:32px; border:1px solid #d1d5db; border-radius:6px; background:#fff; padding:0 8px; font-size:12px; color:${C.text}; font-family:inherit; outline:none; transition:border-color .15s; }
    .apt-select:focus { border-color:${C.yellow}; box-shadow:0 0 0 2px ${C.yellow}33; }
    .apt-input { height:32px; border:1px solid #d1d5db; border-radius:6px; background:#fff; padding:0 8px; font-size:12px; color:${C.text}; font-family:inherit; outline:none; width:100%; transition:border-color .15s; }
    .apt-input:focus { border-color:${C.yellow}; box-shadow:0 0 0 2px ${C.yellow}33; }
    .apt-btn { height:32px; padding:0 14px; border-radius:6px; font-size:12px; font-weight:500; cursor:pointer; display:inline-flex; align-items:center; gap:5px; border:none; font-family:inherit; transition:opacity .15s; }
    .apt-btn:hover { opacity:.85; }
    .apt-btn-primary { background:${C.yellow}; color:${C.dark1}; }
    .apt-btn-ghost { background:#fff; color:${C.text}; border:1px solid #d1d5db !important; }
    .apt-btn-icon { width:30px; height:30px; padding:0; background:#fff; border:1px solid #e5e7eb !important; border-radius:6px; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; color:${C.textSub}; font-size:14px; transition:background .15s; }
    .apt-btn-icon:hover { background:${C.bg}; }
    .apt-btn-xs { height:26px; padding:0 8px; font-size:11px; }
    .apt-tab { padding:8px 16px; font-size:12px; font-weight:500; cursor:pointer; border-bottom:2px solid transparent; color:${C.textSub}; transition:all .15s; white-space:nowrap; }
    .apt-tab.on { color:${C.yellow}; border-bottom-color:${C.yellow}; }
    .apt-metric-card { background:${C.card}; border:1px solid ${C.border}; border-radius:10px; padding:16px; }
    .apt-metric-label { font-size:10px; font-weight:500; color:${C.textSub}; text-transform:uppercase; letter-spacing:.07em; }
    .apt-metric-val { font-size:26px; font-weight:600; margin:4px 0 2px; line-height:1; }
    .apt-metric-sub { font-size:10px; color:${C.textMut}; }
    .apt-badge { display:inline-flex; align-items:center; gap:3px; font-size:10px; font-weight:500; padding:2px 8px; border-radius:20px; }
    .apt-section-title { font-size:10px; font-weight:600; color:${C.textSub}; text-transform:uppercase; letter-spacing:.08em; margin-bottom:10px; display:flex; align-items:center; gap:6px; }
    .apt-row { display:flex; gap:8px; align-items:flex-end; flex-wrap:wrap; }
    .apt-table { width:100%; border-collapse:collapse; font-size:12px; }
    .apt-table th { text-align:left; padding:6px 10px; border-bottom:1px solid ${C.border}; font-size:10px; font-weight:600; color:${C.textSub}; text-transform:uppercase; letter-spacing:.06em; white-space:nowrap; }
    .apt-table td { padding:7px 10px; border-bottom:1px solid #f3f4f6; vertical-align:middle; }
    .apt-table tr:last-child td { border-bottom:none; }
    .apt-table tr:hover td { background:#fafafa; }
    .apt-note { font-size:11px; color:${C.textSub}; background:${C.bg}; border-radius:6px; padding:7px 10px; display:flex; gap:7px; align-items:flex-start; line-height:1.5; }
    .apt-attn-row { display:flex; align-items:flex-start; gap:8px; padding:7px 0; border-bottom:1px solid #f9fafb; font-size:12px; }
    .apt-attn-row:last-child { border-bottom:none; }
    .apt-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; margin-top:5px; display:inline-block; }
    .apt-colab-drop { position:absolute; z-index:200; background:#fff; border:1px solid ${C.border}; border-radius:8px; max-height:180px; overflow-y:auto; min-width:240px; box-shadow:0 6px 20px rgba(0,0,0,.1); }
    .apt-colab-drop-item { padding:8px 12px; font-size:12px; cursor:pointer; display:flex; gap:8px; align-items:center; border-bottom:1px solid #f9fafb; }
    .apt-colab-drop-item:last-child { border-bottom:none; }
    .apt-colab-drop-item:hover { background:${C.bg}; }
    .apt-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:1000; display:flex; align-items:center; justify-content:center; padding:16px; }
    .apt-modal { background:#fff; border-radius:12px; padding:24px; width:100%; max-width:500px; max-height:90vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,.2); }
    .apt-modal-title { font-size:15px; font-weight:600; color:${C.text}; margin-bottom:18px; display:flex; justify-content:space-between; align-items:center; }
    .apt-field { display:flex; flex-direction:column; gap:4px; flex:1; min-width:120px; }
    .apt-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:48px 16px; gap:12px; color:${C.textMut}; text-align:center; }
    .apt-empty i { font-size:40px; color:#e5e7eb; }
    .apt-empty p { font-size:12px; max-width:280px; line-height:1.6; margin:0; }
    .apt-hm-cell { height:26px; border-radius:3px; display:flex; align-items:center; justify-content:center; font-size:9px; font-weight:600; cursor:pointer; transition:opacity .1s; }
    .apt-hm-cell:hover { opacity:.8; }
    .apt-drop-zone { border:2px dashed #d1d5db; border-radius:8px; padding:24px; text-align:center; cursor:pointer; transition:border-color .2s; position:relative; }
    .apt-drop-zone:hover { border-color:${C.yellow}; }
    @keyframes apt-pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
    .apt-skeleton { animation:apt-pulse 1.5s infinite; }
  `;
  document.head.appendChild(s);
}

/* ═══════════════════════════════════════════════════════════════
   RENDER RAIZ
   ═══════════════════════════════════════════════════════════════ */
function render() {
  css();
  const container = document.getElementById('module-container');
  container.innerHTML = `
    <div id="apt-root" style="padding:20px;max-width:1400px;margin:0 auto">
      <!-- Título da página -->
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">
        <i class="ti ti-clock-record" style="font-size:22px;color:${C.yellow}" aria-hidden="true"></i>
        <div>
          <h1 style="font-size:18px;font-weight:700;color:${C.text};margin:0;line-height:1.2">Apontamentos</h1>
          <p style="font-size:11px;color:${C.textMut};margin:0">Controle de horas por colaborador</p>
        </div>
      </div>
      <!-- Tabs -->
      <div style="display:flex;gap:0;border-bottom:1px solid ${C.border};margin-bottom:20px">
        <div id="apt-tab-p" class="apt-tab ${S.aba==='principal'?'on':''}"><i class="ti ti-clock-record" aria-hidden="true"></i> Apontamentos</div>
        <div id="apt-tab-c" class="apt-tab ${S.aba==='cadastro'?'on':''}"><i class="ti ti-users" aria-hidden="true"></i> Cadastro e Gestão</div>
      </div>
      <div id="apt-content"></div>
    </div>
  `;
  document.getElementById('apt-tab-p').onclick = () => { S.aba='principal'; renderContent(); };
  document.getElementById('apt-tab-c').onclick = () => { S.aba='cadastro';  renderContent(); };
  renderContent();
}

function renderContent() {
  // Atualizar tabs
  document.querySelectorAll('.apt-tab').forEach(t => t.classList.remove('on'));
  document.getElementById(S.aba==='principal'?'apt-tab-p':'apt-tab-c').classList.add('on');
  const content = document.getElementById('apt-content');
  if (S.aba==='principal') {
    content.innerHTML = htmlFiltros() + htmlPrincipal();
    bindFiltros();
    if (S.modalidades.length>0 || S.colaboradorChapa) carregarDados();
  } else {
    content.innerHTML = htmlCadastro();
    bindCadastro();
    carregarCadastro();
  }
}

/* ═══════════════════════════════════════════════════════════════
   FILTROS
   ═══════════════════════════════════════════════════════════════ */
function htmlFiltros() {
  const semanas = [];
  for (let s=SEMANA_ANCORA-SEMANAS_JANELA; s<=SEMANA_ANCORA+SEMANAS_JANELA; s++) {
    const {inicio,fim} = semParaDatas(s);
    semanas.push({s,inicio,fim});
  }
  const semOpts = semanas.map(({s,inicio,fim}) =>
    `<option value="${s}" ${S.semana===s?'selected':''}>${s===SEMANA_ANCORA?'Sem '+s+' (atual)':'Sem '+s} · ${fmtDate(inicio)}–${fmtDate(fim)}</option>`
  ).join('');
  const modOpts = MODALIDADES.map(m =>
    `<option value="${m}" ${S.modalidades.includes(m)?'selected':''}>${m}</option>`
  ).join('');
  return `
  <div class="apt-card" style="margin-bottom:16px">
    <div class="apt-row" style="gap:14px">

      <div class="apt-field" style="min-width:90px;max-width:110px">
        <label class="apt-label">Safra</label>
        <select id="f-safra" class="apt-select">
          ${SAFRAS.map(s=>`<option ${s===S.safra?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>

      <div class="apt-field" style="flex:2;min-width:220px">
        <label class="apt-label">
          Período
          <span style="text-transform:none;font-weight:400;font-size:11px;margin-left:8px">
            <label style="cursor:pointer;display:inline-flex;align-items:center;gap:3px"><input type="radio" name="f-ptipo" value="semana" ${S.periodoTipo==='semana'?'checked':''}> Semana</label>
            &nbsp;
            <label style="cursor:pointer;display:inline-flex;align-items:center;gap:3px"><input type="radio" name="f-ptipo" value="intervalo" ${S.periodoTipo==='intervalo'?'checked':''}> Intervalo</label>
          </span>
        </label>
        <div id="f-sem-wrap" style="display:${S.periodoTipo==='semana'?'block':'none'}">
          <select id="f-semana" class="apt-select" style="width:100%;max-width:280px">${semOpts}</select>
        </div>
        <div id="f-int-wrap" style="display:${S.periodoTipo==='intervalo'?'flex':'none'};gap:6px;align-items:center">
          <input type="date" id="f-di" value="${S.dataInicio}" class="apt-input" style="width:140px">
          <span style="color:${C.textMut};font-size:12px">até</span>
          <input type="date" id="f-df" value="${S.dataFim}" class="apt-input" style="width:140px">
        </div>
      </div>

      <div class="apt-field" style="min-width:140px;max-width:180px">
        <label class="apt-label">Modalidade <span style="text-transform:none;font-weight:400">(múltipla)</span></label>
        <select id="f-mod" multiple class="apt-select" style="height:66px;padding:4px">
          ${modOpts}
        </select>
        <span style="font-size:9px;color:${C.textMut}">Ctrl/Cmd para selecionar múltiplos</span>
      </div>

      <div class="apt-field" style="min-width:180px;max-width:220px;position:relative">
        <label class="apt-label">Colaborador</label>
        <div style="position:relative">
          <i class="ti ti-search" style="position:absolute;left:8px;top:50%;transform:translateY(-50%);color:${C.textMut};font-size:13px;pointer-events:none" aria-hidden="true"></i>
          <input type="text" id="f-colab" class="apt-input" placeholder="Nome ou crachá…" style="padding-left:28px" autocomplete="off">
        </div>
        <div id="f-colab-drop" class="apt-colab-drop" style="display:none"></div>
        <span style="font-size:9px;color:${C.textMut}">Busca parcial por nome ou crachá</span>
      </div>

      <div style="display:flex;gap:6px;align-items:flex-end;padding-bottom:18px">
        <button id="f-btn-ok" class="apt-btn apt-btn-primary"><i class="ti ti-search" aria-hidden="true"></i> Filtrar</button>
        <button id="f-btn-limpar" class="apt-btn apt-btn-ghost"><i class="ti ti-x" aria-hidden="true"></i> Limpar</button>
      </div>
    </div>
    <div class="apt-note" style="margin-top:10px">
      <i class="ti ti-info-circle" style="font-size:13px;flex-shrink:0;margin-top:1px" aria-hidden="true"></i>
      Safra e período são obrigatórios. Selecione ao menos <strong>modalidade</strong> ou <strong>colaborador</strong> para visualizar dados. Ao selecionar colaborador, a modalidade é inferida do cadastro.
    </div>
  </div>`;
}

function bindFiltros() {
  // Tipo período
  document.querySelectorAll('input[name="f-ptipo"]').forEach(r => r.addEventListener('change', () => {
    S.periodoTipo = r.value;
    document.getElementById('f-sem-wrap').style.display = r.value==='semana'    ? 'block' : 'none';
    document.getElementById('f-int-wrap').style.display = r.value==='intervalo' ? 'flex'  : 'none';
  }));
  document.getElementById('f-safra').addEventListener('change', e => S.safra = e.target.value);
  document.getElementById('f-semana').addEventListener('change', e => {
    S.semana = parseInt(e.target.value);
    const {inicio,fim} = semParaDatas(S.semana);
    S.dataInicio=inicio; S.dataFim=fim;
  });
  document.getElementById('f-di').addEventListener('change', e => S.dataInicio=e.target.value);
  document.getElementById('f-df').addEventListener('change', e => S.dataFim=e.target.value);
  document.getElementById('f-mod').addEventListener('change', e =>
    S.modalidades = Array.from(e.target.selectedOptions).map(o=>o.value)
  );

  // Busca colaborador
  const inp = document.getElementById('f-colab');
  const drop = document.getElementById('f-colab-drop');
  inp.addEventListener('input', () => {
    const q = inp.value.trim().toLowerCase();
    if (!q) { drop.style.display='none'; return; }
    const hits = S.colaboradores.filter(c =>
      c.nome.toLowerCase().includes(q) || String(c.cracha).includes(q)
    ).slice(0, 12);
    if (!hits.length) { drop.style.display='none'; return; }
    drop.style.display = 'block';
    drop.innerHTML = hits.map(c => `
      <div class="apt-colab-drop-item" data-ch="${c.cracha}">
        <span style="color:${C.textMut};font-size:10px;min-width:40px">${c.cracha}</span>
        <span style="flex:1">${c.nome}</span>
        <span style="font-size:10px;background:#eff6ff;color:#1d4ed8;padding:1px 6px;border-radius:10px">${c.modalidade||'—'}</span>
      </div>`).join('');
    drop.querySelectorAll('[data-ch]').forEach(el => el.addEventListener('click', () => {
      const c = S.colaboradores.find(x => String(x.cracha)===el.dataset.ch);
      S.colaboradorChapa = c.cracha;
      inp.value = `${c.cracha} — ${c.nome}`;
      if (c.modalidade) S.modalidades = [c.modalidade];
      drop.style.display = 'none';
    }));
  });
  document.addEventListener('click', e => { if (!drop.contains(e.target) && e.target!==inp) drop.style.display='none'; });

  document.getElementById('f-btn-ok').addEventListener('click', () => {
    if (S.periodoTipo==='semana') { const {inicio,fim}=semParaDatas(S.semana); S.dataInicio=inicio; S.dataFim=fim; }
    if (!S.modalidades.length && !S.colaboradorChapa) { alert('Selecione ao menos uma modalidade ou colaborador.'); return; }
    S.hmPag=0;
    carregarDados();
  });
  document.getElementById('f-btn-limpar').addEventListener('click', () => {
    S.modalidades=[]; S.colaboradorChapa=null;
    document.getElementById('f-colab').value='';
    document.getElementById('f-mod').querySelectorAll('option').forEach(o=>o.selected=false);
    renderContent();
  });
}

/* ═══════════════════════════════════════════════════════════════
   ABA PRINCIPAL
   ═══════════════════════════════════════════════════════════════ */
function htmlPrincipal() {
  if (!S.modalidades.length && !S.colaboradorChapa) {
    return `<div class="apt-empty"><i class="ti ti-users" aria-hidden="true"></i>
      <p>Selecione uma <strong>modalidade</strong> ou busque um <strong>colaborador</strong> para visualizar os apontamentos do período.</p>
    </div>`;
  }
  // Skeleton de carregamento
  const sk = `<div class="apt-skeleton" style="height:14px;background:#f3f4f6;border-radius:4px;margin-bottom:8px"></div>`;
  return `
    <div id="apt-metricas" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px">
      ${[1,2,3,4].map(()=>`<div class="apt-metric-card apt-skeleton">${sk}${sk}</div>`).join('')}
    </div>
    <div id="apt-pontos" class="apt-card" style="margin-bottom:16px">${sk+sk}</div>
    <div id="apt-heatmap" class="apt-card" style="margin-bottom:16px">${sk+sk+sk}</div>
    <div id="apt-tabela" class="apt-card" style="margin-bottom:16px">${sk+sk}</div>
    <div id="apt-importar">${htmlImportador()}</div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   CARREGAR DADOS
   ═══════════════════════════════════════════════════════════════ */
async function carregarDados() {
  try {
    let cf = S.colaboradores;
    if (S.colaboradorChapa) cf = cf.filter(c=>String(c.cracha)===String(S.colaboradorChapa));
    else if (S.modalidades.length) cf = cf.filter(c=>S.modalidades.includes(c.modalidade));

    if (!cf.length) {
      document.getElementById('apt-content').innerHTML = `
        <div class="apt-empty"><i class="ti ti-user-off" aria-hidden="true"></i>
          <p>Nenhum colaborador cadastrado para os filtros selecionados.<br>
          <span style="color:${C.blue};cursor:pointer;text-decoration:underline" id="apt-ir-cad">Ir para Cadastro</span></p>
        </div>` + htmlImportador();
      document.getElementById('apt-ir-cad')?.addEventListener('click', ()=>{ S.aba='cadastro'; renderContent(); });
      return;
    }

    // Chapas como texto entre aspas para o Supabase tratar como TEXT
    const chapasQ = cf.map(c=>`"${c.cracha}"`).join(',');

    const [apts, justs, fer] = await Promise.all([
      sb(`apontamentos?data_apontamento=gte.${S.dataInicio}&data_apontamento=lte.${S.dataFim}&chapa=in.(${chapasQ})&order=data_apontamento.asc,chapa.asc`),
      sb(`apt_justificativas?data_inicio=lte.${S.dataFim}&data_fim=gte.${S.dataInicio}&chapa=in.(${chapasQ})`).catch(()=>[]),
      sb(`apt_ferias?data_inicio=lte.${S.dataFim}&data_fim=gte.${S.dataInicio}&chapa=in.(${chapasQ})`).catch(()=>[]),
    ]);
    S.apontamentos = apts;
    S.justificativas = justs;
    S.ferias = fer;
    renderDados(cf);
  } catch(e) {
    console.error(e);
    const el = document.getElementById('apt-dados') || document.getElementById('apt-content');
    if (el) el.innerHTML = `<div class="apt-empty"><i class="ti ti-alert-circle" aria-hidden="true"></i><p>Erro: ${e.message}</p></div>`;
  }
}

/* ═══════════════════════════════════════════════════════════════
   RENDER DADOS
   ═══════════════════════════════════════════════════════════════ */
function renderDados(cf) {
  const hoje  = hojeIso();
  const dias  = diasEntre(S.dataInicio, S.dataFim);

  function hhDia(cracha, dia) {
    return S.apontamentos
      .filter(a=>String(a.chapa)===String(cracha) && a.data_apontamento===dia)
      .reduce((s,a)=>s+parseFloat(String(a.hh_total||0).replace(',','.'))||0, 0);
  }
  function ehFolga(c, dia) {
    if (!c.escala || c.escala==='ADM') {
      const dw = new Date(dia+'T00:00:00').getDay();
      return dw===0||dw===6;
    }
    return gerarFolgas(c.escala, c.primeira_folga, S.dataFim).has(dia);
  }
  function deFerias(ch, dia) {
    return S.ferias.some(f=>String(f.chapa)===String(ch)&&f.data_inicio<=dia&&f.data_fim>=dia);
  }
  function getJust(ch, dia) {
    return S.justificativas.find(j=>String(j.chapa)===String(ch)&&j.data_inicio<=dia&&j.data_fim>=dia)||null;
  }

  // Métricas — considerar só dias passados/hoje para contagem
  let totPrev=0, totApt=0, ausencias=[], baixos=[];
  cf.forEach(c => {
    dias.forEach(dia => {
      if (dia>hoje) return; // dias futuros não contam
      const folga=ehFolga(c,dia), ferias=deFerias(c.cracha,dia), just=getJust(c.cracha,dia);
      if (folga||ferias||just) return;
      totPrev += HH_DIA;
      const hh = hhDia(c.cracha, dia);
      totApt  += hh;
      if (hh===0) ausencias.push({colab:c,dia});
      else if (hh < HH_DIA*META_APONTAMENTO) baixos.push({colab:c,dia,hh});
    });
  });
  const ader = totPrev>0 ? Math.round(totApt/totPrev*100) : 0;

  // ── Métricas ──
  const corAder = ader>=75 ? C.green : C.red;
  document.getElementById('apt-metricas').innerHTML = [
    {l:'H-H previsto',          v:totPrev.toFixed(0)+' h', s:'Baseado na escala cadastrada',          c:C.text},
    {l:'Aderência ao apontamento', v:ader+'%',               s:'H-H apontado / H-H disponível',        c:corAder},
    {l:'Ausência de apontamento',  v:ausencias.length,       s:'Dias sem registro (sem justificativa)', c:ausencias.length>0?C.red:C.text},
    {l:'Baixo apontamento',        v:baixos.length,          s:`Dias abaixo de ${Math.round(META_APONTAMENTO*100)}% do previsto`, c:baixos.length>0?C.amber:C.text},
  ].map(({l,v,s,c})=>`
    <div class="apt-metric-card">
      <div class="apt-metric-label">${l}</div>
      <div class="apt-metric-val" style="color:${c}">${v}</div>
      <div class="apt-metric-sub">${s}</div>
    </div>`).join('');

  // ── Pontos de atenção ──
  const ausMap = {};
  ausencias.forEach(({colab,dia})=>{ const k=colab.cracha; if(!ausMap[k]) ausMap[k]={colab,dias:[]}; ausMap[k].dias.push(dia); });
  const pontosHtml = ausencias.length===0&&baixos.length===0
    ? `<div style="text-align:center;padding:16px;color:${C.textMut};font-size:12px"><i class="ti ti-circle-check" style="color:#22c55e;font-size:20px;margin-right:6px" aria-hidden="true"></i>Nenhum ponto de atenção no período.</div>`
    : `<div style="display:flex;gap:20px;flex-wrap:wrap">
        ${ausencias.length?`<div style="flex:1;min-width:200px">
          <div class="apt-section-title"><span class="apt-dot" style="background:${C.red}"></span>Ausência de apontamento</div>
          ${Object.values(ausMap).map(({colab,dias})=>`
            <div class="apt-attn-row">
              <span class="apt-dot" style="background:${C.red}"></span>
              <div style="flex:1"><strong>${colab.nome.split(' ')[0]} ${colab.nome.split(' ').slice(-1)[0]}</strong> — ${dias.map(fmtDate).join(', ')}</div>
              <button class="apt-btn-icon apt-btn-justificar" data-ch="${colab.cracha}" data-nome="${colab.nome}" data-dias="${dias.join(',')}" title="Lançar tratativa"><i class="ti ti-pencil" aria-hidden="true"></i></button>
            </div>`).join('')}
          <div class="apt-note" style="margin-top:6px;font-size:10px"><i class="ti ti-info-circle" aria-hidden="true"></i> Tratativa: Treinamento ou Serviço externo</div>
        </div>`:``}
        ${baixos.length?`<div style="flex:1;min-width:200px">
          <div class="apt-section-title"><span class="apt-dot" style="background:${C.amber}"></span>Baixo apontamento
            <span class="apt-badge" style="background:#fef3c7;color:#92400e">meta ${Math.round(META_APONTAMENTO*100)}%</span>
          </div>
          ${baixos.map(({colab,dia,hh})=>`
            <div class="apt-attn-row">
              <span class="apt-dot" style="background:${C.amber}"></span>
              <div><strong>${colab.nome.split(' ')[0]}</strong> — ${fmtDate(dia)} · ${hh.toFixed(1)}h (${Math.round(hh/HH_DIA*100)}%)</div>
            </div>`).join('')}
          <div class="apt-note" style="margin-top:6px;font-size:10px"><i class="ti ti-info-circle" aria-hidden="true"></i> Tratativa de baixo apontamento disponível em breve.</div>
        </div>`:``}
      </div>`;

  document.getElementById('apt-pontos').innerHTML = `
    <div class="apt-section-title" style="margin-bottom:12px">
      <i class="ti ti-alert-triangle" style="color:${C.amber}" aria-hidden="true"></i> Pontos de atenção
    </div>${pontosHtml}`;
  document.querySelectorAll('.apt-btn-justificar').forEach(btn=>
    btn.addEventListener('click',()=>modalJustif(btn.dataset.ch, btn.dataset.nome, btn.dataset.dias.split(',')))
  );

  // ── Heatmap ──
  renderHeatmap(cf, dias, hhDia, ehFolga, deFerias, getJust, hoje);

  // ── Tabela ──
  renderTabela();

  // ── Importador ──
  document.getElementById('apt-importar').innerHTML = htmlImportador();
  bindImportador();
}

/* ═══════════════════════════════════════════════════════════════
   HEATMAP
   ═══════════════════════════════════════════════════════════════ */
function renderHeatmap(cf, todosDias, hhDia, ehFolga, deFerias, getJust, hoje) {
  const PPG  = 14;
  const pags = Math.ceil(todosDias.length / PPG);
  const pag  = Math.min(S.hmPag, pags-1);
  const dias = todosDias.slice(pag*PPG, (pag+1)*PPG);

  function cellColor(c, dia) {
    // Futuro → azul claro "disponível"
    if (dia > hoje) return ['#dbeafe','#1e40af',''];
    if (deFerias(c.cracha,dia))  return ['#bfdbfe','#1e40af','F'];
    const just = getJust(c.cracha,dia);
    if (just) return ['#fef3c7','#92400e', just.tratativa?.substring(0,1)||'J'];
    if (ehFolga(c,dia)) return ['#e5e7eb','#9ca3af',''];
    const hh = hhDia(c.cracha,dia);
    if (hh===0) return ['#fee2e2','#b91c1c',''];
    if (hh >= HH_DIA*0.9) return ['#166534','#bbf7d0', hh.toFixed(0)+'h'];
    if (hh >= HH_DIA*META_APONTAMENTO) return ['#16a34a','#dcfce7', hh.toFixed(0)+'h'];
    return ['#fde68a','#92400e', hh.toFixed(0)+'h'];
  }

  const legenda = [
    ['#166534','Alto >6h'],['#16a34a','Médio 4–6h'],['#fde68a','Baixo <4h'],
    ['#fee2e2','Sem registro'],['#e5e7eb','Folga'],['#dbeafe','Disponível'],
    ['#fef3c7','Justificado'],['#bfdbfe','Férias'],
  ];

  document.getElementById('apt-heatmap').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:12px">
      <div class="apt-section-title" style="margin:0">
        <i class="ti ti-layout-grid" aria-hidden="true"></i> Presença por colaborador
        <span style="font-size:10px;font-weight:400;color:${C.textMut}">${fmtDateFull(dias[0])} – ${fmtDateFull(dias[dias.length-1])}</span>
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${legenda.map(([bg,label])=>`<span style="display:flex;align-items:center;gap:4px;font-size:10px;color:${C.textSub}">
            <span style="width:10px;height:10px;border-radius:2px;background:${bg};display:inline-block;border:1px solid rgba(0,0,0,.05)"></span>${label}
          </span>`).join('')}
        </div>
        <div style="display:flex;gap:4px;align-items:center">
          <button id="hm-prev" class="apt-btn apt-btn-ghost apt-btn-xs" ${pag===0?'disabled':''}><i class="ti ti-chevron-left" aria-hidden="true"></i></button>
          <span style="font-size:11px;color:${C.textSub};padding:0 4px">${pag+1}/${pags}</span>
          <button id="hm-next" class="apt-btn apt-btn-ghost apt-btn-xs" ${pag>=pags-1?'disabled':''}><i class="ti ti-chevron-right" aria-hidden="true"></i></button>
        </div>
      </div>
    </div>
    <div style="overflow-x:auto">
      <div style="display:grid;grid-template-columns:72px repeat(${dias.length},minmax(30px,1fr));gap:3px;min-width:${72+dias.length*32}px">
        <div></div>
        ${dias.map(d=>`<div style="text-align:center;font-size:9px;color:${C.textMut};line-height:1.3;padding-bottom:2px">
          <div style="font-weight:500">${diaSemAbrev(d)}</div><div>${fmtDate(d)}</div>
        </div>`).join('')}
        ${cf.map(c=>`
          <div style="font-size:11px;color:${C.text};display:flex;align-items:center;height:26px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:6px;font-weight:500" title="${c.nome}">
            ${c.nome.split(' ')[0]}
          </div>
          ${dias.map(dia=>{
            const [bg,fg,lbl]=cellColor(c,dia);
            const title = dia>hoje ? `${c.nome} · ${fmtDate(dia)} · Disponível`
              : `${c.nome} · ${fmtDate(dia)}`;
            return `<div class="apt-hm-cell" data-ch="${c.cracha}" data-dia="${dia}"
              style="background:${bg};color:${fg}" title="${title}">${lbl}</div>`;
          }).join('')}
        `).join('')}
      </div>
    </div>
  `;

  document.getElementById('hm-prev')?.addEventListener('click',()=>{ S.hmPag--; renderHeatmap(cf,todosDias,hhDia,ehFolga,deFerias,getJust,hoje); });
  document.getElementById('hm-next')?.addEventListener('click',()=>{ S.hmPag++; renderHeatmap(cf,todosDias,hhDia,ehFolga,deFerias,getJust,hoje); });
  document.querySelectorAll('.apt-hm-cell').forEach(cel=>cel.addEventListener('click',()=>{
    const c = cf.find(x=>String(x.cracha)===cel.dataset.ch);
    if (c) detalheHmCell(c, cel.dataset.dia);
  }));
}

function detalheHmCell(c, dia) {
  const hoje = hojeIso();
  if (dia > hoje) { abrirModal('Dia disponível', `<p style="font-size:12px;color:${C.textSub}">${fmtDateFull(dia)} ainda não chegou.</p>`); return; }
  const apts = S.apontamentos.filter(a=>String(a.chapa)===String(c.cracha)&&a.data_apontamento===dia);
  const tot  = apts.reduce((s,a)=>s+parseFloat(String(a.hh_total||0).replace(',','.'))||0,0);
  abrirModal(`${c.nome.split(' ')[0]} · ${fmtDateFull(dia)}`, apts.length===0
    ? `<p style="font-size:12px;color:${C.textMut};text-align:center;padding:16px">Nenhum apontamento neste dia.</p>`
    : `<table class="apt-table">
        <thead><tr>${['OS','Descrição','Início','Fim','H-H'].map(h=>`<th>${h}</th>`).join('')}</tr></thead>
        <tbody>
          ${apts.map(a=>`<tr>
            <td style="font-family:monospace">${a.os}</td>
            <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${a.desc_servico||''}">${a.desc_servico||'—'}</td>
            <td>${a.hora_inicio}</td><td>${a.hora_fim}</td>
            <td style="font-weight:600">${parseFloat(String(a.hh_total||0).replace(',','.'))||0..toFixed(1)}h</td>
          </tr>`).join('')}
          <tr style="background:#f9fafb"><td colspan="4" style="font-weight:600;font-size:11px">Total</td>
          <td style="font-weight:700;color:${C.green}">${tot.toFixed(1)}h</td></tr>
        </tbody>
      </table>`);
}

/* ═══════════════════════════════════════════════════════════════
   TABELA
   ═══════════════════════════════════════════════════════════════ */
function renderTabela() {
  const hoje = hojeIso();
  const apts = [...S.apontamentos]
    .filter(a => a.data_apontamento <= hoje)
    .sort((a,b)=> a.data_apontamento<b.data_apontamento?-1:a.data_apontamento>b.data_apontamento?1:(a.nome||'')<(b.nome||'')?-1:1);
  document.getElementById('apt-tabela').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div class="apt-section-title" style="margin:0"><i class="ti ti-list-details" aria-hidden="true"></i> Detalhamento de apontamentos</div>
      <span style="font-size:11px;color:${C.textMut}">${apts.length} registros</span>
    </div>
    <div style="overflow-x:auto;max-height:340px;overflow-y:auto">
      <table class="apt-table">
        <thead><tr>${['Data','Colaborador','OS','Descrição','Início','Fim','H-H'].map(h=>`<th>${h}</th>`).join('')}</tr></thead>
        <tbody>
          ${apts.length===0
            ? `<tr><td colspan="7" style="text-align:center;padding:24px;color:${C.textMut}">Nenhum apontamento no período.</td></tr>`
            : apts.map(a=>`<tr>
                <td style="white-space:nowrap">${fmtDate(a.data_apontamento)}</td>
                <td style="white-space:nowrap">${(a.nome||'').split(' ').slice(0,2).join(' ')}</td>
                <td style="font-family:monospace;font-size:11px">${a.os}</td>
                <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${a.desc_servico||''}">${a.desc_servico||'—'}</td>
                <td>${a.hora_inicio}</td><td>${a.hora_fim}</td>
                <td style="font-weight:600">${(parseFloat(String(a.hh_total||0).replace(',','.'))||0).toFixed(1)}h</td>
              </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

/* ═══════════════════════════════════════════════════════════════
   IMPORTADOR
   ═══════════════════════════════════════════════════════════════ */
function htmlImportador() {
  return `
    <div class="apt-card" style="margin-bottom:16px">
      <div class="apt-section-title" style="margin-bottom:12px"><i class="ti ti-upload" aria-hidden="true"></i> Importar apontamentos</div>
      <div class="apt-drop-zone" id="apt-drop">
        <input type="file" id="apt-file" accept=".xls,.xlsx" style="position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%">
        <i class="ti ti-file-spreadsheet" style="font-size:28px;color:${C.textMut};display:block;margin-bottom:6px" aria-hidden="true"></i>
        <div style="font-size:12px;font-weight:500;color:${C.text}">Arraste o arquivo ou clique para selecionar</div>
        <div style="font-size:11px;color:${C.textMut};margin-top:3px">Relatório "Apontamento de Mão-de-Obra por Funcionário" (.xls/.xlsx)</div>
      </div>
      <div id="apt-imp-status" style="display:none;margin-top:10px;font-size:11px;padding:8px 12px;border-radius:6px"></div>
      <div id="apt-imp-prog" style="display:none;margin-top:8px">
        <div style="height:4px;background:#f3f4f6;border-radius:2px;overflow:hidden">
          <div id="apt-imp-bar" style="height:100%;background:${C.yellow};border-radius:2px;width:0%;transition:width .3s"></div>
        </div>
        <div id="apt-imp-msg" style="font-size:10px;color:${C.textSub};margin-top:3px"></div>
      </div>
    </div>`;
}

function bindImportador() {
  const inp  = document.getElementById('apt-file');
  const zona = document.getElementById('apt-drop');
  if (!inp||!zona) return;
  zona.addEventListener('dragover', e=>{ e.preventDefault(); zona.style.borderColor=C.yellow; });
  zona.addEventListener('dragleave', ()=>{ zona.style.borderColor='#d1d5db'; });
  zona.addEventListener('drop', e=>{ e.preventDefault(); zona.style.borderColor='#d1d5db'; if(e.dataTransfer.files[0]) processarImport(e.dataTransfer.files[0]); });
  inp.addEventListener('change', ()=>{ if(inp.files[0]) processarImport(inp.files[0]); });
}

async function processarImport(file) {
  const status = document.getElementById('apt-imp-status');
  const prog   = document.getElementById('apt-imp-prog');
  const bar    = document.getElementById('apt-imp-bar');
  const msg    = document.getElementById('apt-imp-msg');
  function setS(txt,t){ status.style.display='block'; status.style.background=t==='ok'?'#f0fdf4':t==='err'?'#fef2f2':'#eff6ff'; status.style.color=t==='ok'?'#15803d':t==='err'?'#b91c1c':'#1d4ed8'; status.innerHTML=txt; }
  function setP(pct,txt){ prog.style.display='block'; bar.style.width=pct+'%'; msg.textContent=txt; }
  try {
    setS('<i class="ti ti-loader" aria-hidden="true"></i> Lendo arquivo…','info'); setP(5,'Lendo planilha…');
    const XLSX = await loadXLSX();
    const buf  = await file.arrayBuffer();
    const wb   = XLSX.read(buf,{type:'array',cellDates:true});
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const raw  = XLSX.utils.sheet_to_json(ws,{header:1,defval:null});
    setP(20,'Parseando…');
    const records=[]; let curCh=null,curNome=null;
    const reCr=/^(\d{3,8})\s*-\s*(.+)/; const reData=/^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
    for (let i=0;i<raw.length;i++) {
      const row=raw[i];
      const v0=row[0]!=null?String(row[0]).trim():'';
      const v1=row[1]!=null?String(row[1]).trim():'';
      if (v0==='Funcionário:') { const m=reCr.exec(v1); if(m){curCh=m[1].replace(/^0+/,'')||'0';curNome=m[2].trim();} continue; }
      let dataIso=null;
      if (row[0] instanceof Date) dataIso=row[0].toISOString().slice(0,10);
      else if (reData.test(v0)) { const[d,m,y]=v0.split('/'); dataIso=`${y.length===2?'20'+y:y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`; }
      if (!dataIso||!curCh) continue;
      const nxt=raw[i+1]||[]; const os=nxt[0]!=null?String(nxt[0]).trim():''; const desc=nxt[1]!=null?String(nxt[1]).trim().replace(/^\d+-/,''):'';
      const hi=row[2]!=null?String(row[2]).trim():''; const hf=row[3]!=null?String(row[3]).trim():'';
      const ht=parseFloat(String(row[4]||0).replace(',','.')) || 0;
      if (!os||!hi) continue;
      records.push({data_apontamento:dataIso,os,desc_servico:desc,tipo_atividade:v1,hora_inicio:hi,hora_fim:hf,hh_total:ht,chapa:curCh,nome:curNome});
    }
    if (!records.length) { setS('Nenhum registro encontrado.','err'); prog.style.display='none'; return; }
    setP(35,`${records.length} apontamentos identificados. Enviando…`);
    const LOTE=200;
    for (let i=0;i<records.length;i+=LOTE) {
      await sb('apontamentos',{
        method:'POST',
        prefer:'resolution=merge-duplicates,return=minimal',
        headers:{'Prefer':'resolution=merge-duplicates,return=minimal'},
        body:JSON.stringify(records.slice(i,i+LOTE)),
      });
      setP(35+Math.round((i/records.length)*60),`Enviando… ${Math.min(i+LOTE,records.length)}/${records.length}`);
    }
    setP(100,'Concluído!');
    setS(`<i class="ti ti-circle-check" aria-hidden="true"></i> <strong>${records.length}</strong> registros processados.`,'ok');
    setTimeout(()=>carregarDados(),800);
  } catch(e) { setS(`<i class="ti ti-alert-circle" aria-hidden="true"></i> Erro: ${e.message}`,'err'); prog.style.display='none'; console.error(e); }
}
async function loadXLSX() {
  if (window.XLSX) return window.XLSX;
  return new Promise((res,rej)=>{ const s=document.createElement('script'); s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload=()=>res(window.XLSX); s.onerror=()=>rej(new Error('Falha XLSX')); document.head.appendChild(s); });
}

/* ═══════════════════════════════════════════════════════════════
   MODAL JUSTIFICATIVA
   ═══════════════════════════════════════════════════════════════ */
function modalJustif(cracha, nome, dias) {
  abrirModal('Lançar justificativa', `
    <div style="display:flex;flex-direction:column;gap:14px">
      <div style="font-size:12px;color:${C.textSub};background:${C.bg};border-radius:6px;padding:8px 10px">
        <strong style="color:${C.text}">${nome}</strong> — ${dias.map(fmtDate).join(', ')}
      </div>
      <div class="apt-field"><label class="apt-label">Tipo</label>
        <select id="jt-tipo" class="apt-select" style="width:100%">${TIPOS_JUST.map(t=>`<option>${t}</option>`).join('')}</select>
      </div>
      <div style="display:flex;gap:8px">
        <div class="apt-field"><label class="apt-label">Data início</label><input type="date" id="jt-di" value="${dias[0]}" class="apt-input"></div>
        <div class="apt-field"><label class="apt-label">Data fim</label><input type="date" id="jt-df" value="${dias[dias.length-1]}" class="apt-input"></div>
      </div>
      <div class="apt-field" id="jt-trat-wrap"><label class="apt-label">Tratativa</label>
        <select id="jt-trat" class="apt-select" style="width:100%">${TRAT_AUSENC.map(t=>`<option>${t}</option>`).join('')}</select>
      </div>
      <div class="apt-field"><label class="apt-label">Obs. (opcional)</label><input type="text" id="jt-obs" class="apt-input" placeholder="Ex: NR-10 turma junho…"></div>
    </div>`,
    async () => {
      const tipo=document.getElementById('jt-tipo').value;
      const di=document.getElementById('jt-di').value;
      const df=document.getElementById('jt-df').value;
      const trat=document.getElementById('jt-trat').value;
      const obs=document.getElementById('jt-obs').value;
      await sb('apt_justificativas',{method:'POST',body:JSON.stringify({chapa:cracha,nome,tipo,tratativa:trat,data_inicio:di,data_fim:df,obs})});
      fecharModal(); carregarDados();
    },'Salvar');
}

/* ═══════════════════════════════════════════════════════════════
   ABA CADASTRO
   ═══════════════════════════════════════════════════════════════ */
function htmlCadastro() {
  return `
    <div class="apt-card">
      <div style="display:flex;gap:0;border-bottom:1px solid ${C.border};margin-bottom:16px">
        <div id="cad-tab-c" class="apt-tab ${S.cadAba==='colab'?'on':''}">Colaboradores</div>
        <div id="cad-tab-j" class="apt-tab ${S.cadAba==='justif'?'on':''}">Justificativas e Trocas de Folga</div>
      </div>
      <div id="cad-body"></div>
    </div>`;
}

function bindCadastro() {
  document.getElementById('cad-tab-c').onclick=()=>{ S.cadAba='colab';  renderCadBody(); };
  document.getElementById('cad-tab-j').onclick=()=>{ S.cadAba='justif'; renderCadBody(); };
}

async function carregarCadastro() {
  try {
    const [colabs,specs,justs] = await Promise.all([
      sb('apt_colaboradores?order=nome.asc'),
      sb('apt_especialidades?order=nome.asc').catch(()=>[]),
      sb('apt_justificativas?order=data_inicio.desc&limit=100').catch(()=>[]),
    ]);
    S.colaboradores  = colabs;
    S.especialidades = specs;
    S.justificativas = justs;
    renderCadBody();
  } catch(e) { document.getElementById('cad-body').innerHTML=`<p style="color:${C.red};font-size:12px">${e.message}</p>`; }
}

function renderCadBody() {
  // Atualizar tabs
  document.getElementById('cad-tab-c').className = `apt-tab ${S.cadAba==='colab'?'on':''}`;
  document.getElementById('cad-tab-j').className = `apt-tab ${S.cadAba==='justif'?'on':''}`;
  if (S.cadAba==='colab') renderCadColab(); else renderCadJustif();
}

function renderCadColab() {
  document.getElementById('cad-body').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div style="position:relative">
        <i class="ti ti-search" style="position:absolute;left:8px;top:50%;transform:translateY(-50%);color:${C.textMut};font-size:13px;pointer-events:none" aria-hidden="true"></i>
        <input id="cad-busca" class="apt-input" placeholder="Buscar colaborador…" style="padding-left:28px;width:220px">
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button id="cad-imp-base" class="apt-btn apt-btn-ghost"><i class="ti ti-download" aria-hidden="true"></i> Importar da base</button>
        <button id="cad-esp-btn" class="apt-btn apt-btn-ghost"><i class="ti ti-tag" aria-hidden="true"></i> Especialidades</button>
        <button id="cad-novo-btn" class="apt-btn apt-btn-primary"><i class="ti ti-plus" aria-hidden="true"></i> Novo colaborador</button>
      </div>
    </div>
    <div style="overflow-x:auto">
      <table class="apt-table">
        <thead><tr>${['Crachá','Nome','Modalidade','Especialidade','Escala','Ações'].map(h=>`<th>${h}</th>`).join('')}</tr></thead>
        <tbody id="cad-tbody">
          ${S.colaboradores.length===0
            ? `<tr><td colspan="6" style="text-align:center;padding:24px;color:${C.textMut}">Nenhum colaborador. <strong>Importe da base</strong> ou cadastre manualmente.</td></tr>`
            : S.colaboradores.map(c=>{
                const esp = S.especialidades.find(e=>e.id===c.especialidade_id);
                return `<tr data-ch="${c.cracha}">
                  <td style="color:${C.textSub};font-size:11px">${c.cracha}</td>
                  <td style="font-weight:500">${c.nome}</td>
                  <td>${c.modalidade?`<span class="apt-badge" style="background:#eff6ff;color:#1d4ed8">${c.modalidade}</span>`:'—'}</td>
                  <td style="font-size:11px;color:${C.textSub}">${esp?esp.nome:'—'}</td>
                  <td>${c.escala?`<span class="apt-badge" style="background:#f3f4f6;color:${C.text}">${c.escala}</span>`:'—'}</td>
                  <td>
                    <div style="display:flex;gap:4px">
                      <button class="apt-btn-icon cad-edit" title="Editar dados"><i class="ti ti-pencil" aria-hidden="true"></i></button>
                      <button class="apt-btn-icon cad-escala" title="Alterar escala"><i class="ti ti-calendar-event" aria-hidden="true"></i></button>
                      <button class="apt-btn-icon cad-justif" title="Justificativa"><i class="ti ti-notes" aria-hidden="true"></i></button>
                      <button class="apt-btn-icon cad-ferias" title="Lançar férias"><i class="ti ti-beach" aria-hidden="true"></i></button>
                    </div>
                  </td>
                </tr>`;}).join('')}
        </tbody>
      </table>
    </div>`;

  document.getElementById('cad-busca').addEventListener('input', e=>{
    const q=e.target.value.toLowerCase();
    document.querySelectorAll('#cad-tbody tr[data-ch]').forEach(tr=>{ tr.style.display=tr.textContent.toLowerCase().includes(q)?'':'none'; });
  });
  document.getElementById('cad-novo-btn').onclick  = ()=>modalColab();
  document.getElementById('cad-esp-btn').onclick   = ()=>modalEspecialidades();
  document.getElementById('cad-imp-base').onclick  = ()=>importarBase();
  document.querySelectorAll('.cad-edit').forEach((btn,i)=>{ const c=S.colaboradores[i]; btn.onclick=()=>modalColab(c); });
  document.querySelectorAll('.cad-escala').forEach((btn,i)=>{ const c=S.colaboradores[i]; btn.onclick=()=>modalEscala(c); });
  document.querySelectorAll('.cad-justif').forEach((btn,i)=>{ const c=S.colaboradores[i]; btn.onclick=()=>modalJustif(c.cracha,c.nome,[hojeIso()]); });
  document.querySelectorAll('.cad-ferias').forEach((btn,i)=>{ const c=S.colaboradores[i]; btn.onclick=()=>modalFerias(c); });
}

function renderCadJustif() {
  const todos = [...S.justificativas].sort((a,b)=>b.data_inicio<a.data_inicio?1:-1);
  document.getElementById('cad-body').innerHTML = `
    <div style="overflow-x:auto">
      <table class="apt-table">
        <thead><tr>${['Data','Colaborador','Tipo','Tratativa','Obs.','Registrado',''].map(h=>`<th>${h}</th>`).join('')}</tr></thead>
        <tbody>
          ${todos.length===0
            ? `<tr><td colspan="7" style="padding:24px;text-align:center;color:${C.textMut}">Nenhuma justificativa registrada.</td></tr>`
            : todos.map(j=>`<tr>
                <td style="white-space:nowrap">${fmtDate(j.data_inicio)}${j.data_fim!==j.data_inicio?' – '+fmtDate(j.data_fim):''}</td>
                <td>${j.nome||j.chapa}</td>
                <td><span class="apt-badge" style="background:${j.tipo.includes('Aus')?'#fef2f2':'#e1f5ee'};color:${j.tipo.includes('Aus')?'#b91c1c':'#0f6e56'}">${j.tipo}</span></td>
                <td style="font-size:11px">${j.tratativa||'—'}</td>
                <td style="font-size:11px;color:${C.textSub}">${j.obs||'—'}</td>
                <td style="font-size:10px;color:${C.textMut}">${j.created_by||'—'}</td>
                <td><button class="apt-btn-icon just-edit" data-id="${j.id}" title="Editar"><i class="ti ti-pencil" aria-hidden="true"></i></button></td>
              </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

/* ── Modal Colaborador ── */
function modalColab(c=null) {
  const edit=!!c;
  abrirModal(edit?'Editar colaborador':'Novo colaborador', `
    <div style="display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;gap:8px">
        <div class="apt-field" style="max-width:110px"><label class="apt-label">Crachá</label>
          <input id="nc-cr" class="apt-input" value="${c?.cracha||''}" ${edit?'readonly':''}></div>
        <div class="apt-field"><label class="apt-label">Nome completo</label>
          <input id="nc-nm" class="apt-input" value="${c?.nome||''}"></div>
      </div>
      <div style="display:flex;gap:8px">
        <div class="apt-field"><label class="apt-label">Modalidade</label>
          <select id="nc-mod" class="apt-select" style="width:100%">
            <option value="">Selecione…</option>
            ${MODALIDADES.map(m=>`<option value="${m}" ${c?.modalidade===m?'selected':''}>${m}</option>`).join('')}
          </select>
        </div>
        <div class="apt-field"><label class="apt-label">Especialidade</label>
          <select id="nc-esp" class="apt-select" style="width:100%">
            <option value="">Selecione…</option>
            ${S.especialidades.map(e=>`<option value="${e.id}" ${c?.especialidade_id===e.id?'selected':''}>${e.nome}</option>`).join('')}
          </select>
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <div class="apt-field"><label class="apt-label">Escala</label>
          <select id="nc-esc" class="apt-select" style="width:100%">
            <option value="">Selecione…</option>
            ${ESCALAS.map(e=>`<option value="${e}" ${c?.escala===e?'selected':''}>${e}</option>`).join('')}
          </select>
        </div>
        <div class="apt-field" id="nc-pfwrap"><label class="apt-label">1ª folga</label>
          <input type="date" id="nc-pf" class="apt-input" value="${c?.primeira_folga||''}"></div>
      </div>
    </div>`,
    async()=>{
      const dados={cracha:document.getElementById('nc-cr').value.trim(),nome:document.getElementById('nc-nm').value.trim(),
        modalidade:document.getElementById('nc-mod').value,especialidade_id:document.getElementById('nc-esp').value||null,
        escala:document.getElementById('nc-esc').value,primeira_folga:document.getElementById('nc-pf').value||null};
      if(!dados.cracha||!dados.nome){alert('Crachá e nome são obrigatórios.');return;}
      if(edit) await sb(`apt_colaboradores?cracha=eq.${c.cracha}`,{method:'PATCH',body:JSON.stringify(dados)});
      else     await sb('apt_colaboradores',{method:'POST',body:JSON.stringify(dados)});
      fecharModal(); carregarCadastro();
    },'Salvar');
  setTimeout(()=>{
    const esc=document.getElementById('nc-esc'), pfw=document.getElementById('nc-pfwrap');
    const tog=()=>{ pfw.style.display=esc.value==='ADM'?'none':'flex'; };
    esc.addEventListener('change',tog); tog();
  },50);
}

/* ── Modal Escala ── */
function modalEscala(c) {
  abrirModal('Alterar escala — '+c.nome.split(' ')[0], `
    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="apt-note"><i class="ti ti-info-circle" aria-hidden="true"></i>
        Escala atual: <strong>${c.escala||'—'}</strong>${c.primeira_folga?' · 1ª folga: '+fmtDateFull(c.primeira_folga):''}
      </div>
      <div style="display:flex;gap:8px">
        <div class="apt-field"><label class="apt-label">Nova escala</label>
          <select id="es-nova" class="apt-select" style="width:100%">${ESCALAS.map(e=>`<option>${e}</option>`).join('')}</select></div>
        <div class="apt-field"><label class="apt-label">Vigência a partir de</label>
          <input type="date" id="es-vig" value="${hojeIso()}" class="apt-input"></div>
      </div>
      <div style="display:flex;gap:8px">
        <div class="apt-field"><label class="apt-label">Folga de transição?</label>
          <select id="es-trans" class="apt-select" style="width:100%"><option value="">Não</option><option value="sim">Sim</option></select></div>
        <div class="apt-field" id="es-tdwrap" style="display:none"><label class="apt-label">Data transição</label>
          <input type="date" id="es-td" class="apt-input"></div>
      </div>
      <div class="apt-field" id="es-pfwrap"><label class="apt-label">1ª folga da nova escala</label>
        <input type="date" id="es-pf" class="apt-input"></div>
      <div id="es-preview" class="apt-note" style="display:none;color:${C.green}"></div>
    </div>`,
    async()=>{
      const nova=document.getElementById('es-nova').value, vig=document.getElementById('es-vig').value;
      const trans=document.getElementById('es-trans').value, td=document.getElementById('es-td').value;
      const pf=document.getElementById('es-pf').value;
      await sb('apt_historico_escalas',{method:'POST',body:JSON.stringify({chapa:c.cracha,escala_anterior:c.escala,escala_nova:nova,vigencia_inicio:vig,folga_transicao:trans==='sim'?td:null,primeira_folga_nova:pf||null})});
      await sb(`apt_colaboradores?cracha=eq.${c.cracha}`,{method:'PATCH',body:JSON.stringify({escala:nova,primeira_folga:pf||null})});
      fecharModal(); carregarCadastro();
    },'Salvar alteração');
  setTimeout(()=>{
    const trans=document.getElementById('es-trans'), tdw=document.getElementById('es-tdwrap');
    const nova=document.getElementById('es-nova'), pfw=document.getElementById('es-pfwrap');
    const pfinp=document.getElementById('es-pf'), prev=document.getElementById('es-preview');
    trans.addEventListener('change',()=>{ tdw.style.display=trans.value==='sim'?'flex':'none'; });
    nova.addEventListener('change',()=>{ pfw.style.display=nova.value==='ADM'?'none':'block'; atuPreview(); });
    pfinp.addEventListener('change',atuPreview);
    function atuPreview(){
      const esc=nova.value,pf=pfinp.value;
      if(!pf||esc==='ADM'){prev.style.display='none';return;}
      const folgas=[]; let cur=pf;
      for(let i=0;i<6;i++){folgas.push(fmtDateFull(cur));cur=addDays(cur,esc==='5x1'?6:7);}
      prev.style.display='flex';
      prev.innerHTML=`<i class="ti ti-calendar-check" aria-hidden="true"></i> Projeção: ${folgas.join(' · ')} · …`;
    }
  },50);
}

/* ── Modal Férias ── */
function modalFerias(c) {
  abrirModal('Lançar férias — '+c.nome.split(' ')[0], `
    <div style="display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;gap:8px">
        <div class="apt-field"><label class="apt-label">Início das férias</label><input type="date" id="fer-ini" value="${hojeIso()}" class="apt-input"></div>
        <div class="apt-field"><label class="apt-label">Duração (dias)</label><input type="number" id="fer-dias" value="30" min="1" max="90" class="apt-input"></div>
      </div>
      <div class="apt-field"><label class="apt-label">Venda de dias?</label>
        <select id="fer-venda" class="apt-select" style="width:100%">
          <option value="0">Não</option>
          <option value="10">Sim — vender 10 dias</option>
          <option value="custom">Sim — quantidade personalizada</option>
        </select>
      </div>
      <div class="apt-field" id="fer-vcwrap" style="display:none"><label class="apt-label">Dias a vender</label>
        <input type="number" id="fer-vc" value="10" min="1" max="30" class="apt-input" style="width:120px"></div>
      <div id="fer-prev" class="apt-note" style="color:${C.green};display:none"></div>
    </div>`,
    async()=>{
      const ini=document.getElementById('fer-ini').value, dias=parseInt(document.getElementById('fer-dias').value)||30;
      const vopt=document.getElementById('fer-venda').value;
      const vdias=vopt==='custom'?parseInt(document.getElementById('fer-vc').value)||0:parseInt(vopt)||0;
      const fim=addDays(ini,dias-1);
      await sb('apt_ferias',{method:'POST',body:JSON.stringify({chapa:c.cracha,nome:c.nome,data_inicio:ini,data_fim:fim,dias_totais:dias,dias_vendidos:vdias})});
      fecharModal(); carregarCadastro();
    },'Salvar férias');
  setTimeout(()=>{
    const ini=document.getElementById('fer-ini'), dias=document.getElementById('fer-dias');
    const vend=document.getElementById('fer-venda'), vcw=document.getElementById('fer-vcwrap');
    const prev=document.getElementById('fer-prev');
    vend.addEventListener('change',()=>{ vcw.style.display=vend.value==='custom'?'block':'none'; upPrev(); });
    ini.addEventListener('change',upPrev); dias.addEventListener('input',upPrev);
    function upPrev(){ const i=ini.value,d=parseInt(dias.value)||30; if(!i)return; prev.style.display='flex'; prev.innerHTML=`<i class="ti ti-calendar" aria-hidden="true"></i> ${fmtDateFull(i)} até ${fmtDateFull(addDays(i,d-1))} (${d} dias)`; }
    upPrev();
  },50);
}

/* ── Modal Especialidades (com edição inline) ── */
function modalEspecialidades() {
  function renderLista(specs) {
    return specs.length===0
      ? `<tr><td colspan="3" style="padding:16px;text-align:center;color:${C.textMut}">Nenhuma especialidade cadastrada.</td></tr>`
      : specs.map(e=>`<tr id="esp-row-${e.id}">
          <td id="esp-cell-${e.id}" style="padding:6px 8px">${e.nome}</td>
          <td style="padding:6px 4px;width:28px">
            <button class="apt-btn-icon esp-edit" data-id="${e.id}" data-nome="${e.nome}" title="Editar"><i class="ti ti-pencil" aria-hidden="true"></i></button>
          </td>
          <td style="padding:6px 4px;width:28px">
            <button class="apt-btn-icon esp-del" data-id="${e.id}" title="Excluir" style="color:#ef4444"><i class="ti ti-trash" aria-hidden="true"></i></button>
          </td>
        </tr>`).join('');
  }
  abrirModal('Gerenciar especialidades', `
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="overflow-x:auto;max-height:220px;border:1px solid ${C.border};border-radius:6px">
        <table class="apt-table"><thead><tr><th>Especialidade</th><th></th><th></th></tr></thead>
        <tbody id="esp-lista">${renderLista(S.especialidades)}</tbody></table>
      </div>
      <div style="display:flex;gap:8px">
        <input id="esp-nova" class="apt-input" placeholder="Nova especialidade…" style="flex:1">
        <button id="esp-add" class="apt-btn apt-btn-primary"><i class="ti ti-plus" aria-hidden="true"></i> Adicionar</button>
      </div>
    </div>`);
  function bindEsp() {
    document.getElementById('esp-add').onclick = async()=>{
      const nome=document.getElementById('esp-nova').value.trim(); if(!nome)return;
      await sb('apt_especialidades',{method:'POST',body:JSON.stringify({nome})});
      S.especialidades = await sb('apt_especialidades?order=nome.asc');
      document.getElementById('esp-lista').innerHTML=renderLista(S.especialidades);
      document.getElementById('esp-nova').value='';
      bindEsp();
    };
    document.querySelectorAll('.esp-edit').forEach(btn=>btn.addEventListener('click',()=>{
      const id=btn.dataset.id, nomeAtual=btn.dataset.nome;
      const cell=document.getElementById(`esp-cell-${id}`);
      cell.innerHTML=`<input id="esp-edit-inp-${id}" class="apt-input" value="${nomeAtual}" style="height:26px;font-size:11px">`;
      btn.innerHTML='<i class="ti ti-check" aria-hidden="true"></i>';
      btn.title='Salvar';
      btn.onclick=async()=>{
        const novoNome=document.getElementById(`esp-edit-inp-${id}`).value.trim(); if(!novoNome)return;
        await sb(`apt_especialidades?id=eq.${id}`,{method:'PATCH',body:JSON.stringify({nome:novoNome})});
        S.especialidades = await sb('apt_especialidades?order=nome.asc');
        document.getElementById('esp-lista').innerHTML=renderLista(S.especialidades);
        bindEsp();
      };
    }));
    document.querySelectorAll('.esp-del').forEach(btn=>btn.addEventListener('click',async()=>{
      if(!confirm('Remover especialidade?'))return;
      await sb(`apt_especialidades?id=eq.${btn.dataset.id}`,{method:'DELETE',prefer:'return=minimal'});
      S.especialidades = S.especialidades.filter(e=>String(e.id)!==btn.dataset.id);
      document.getElementById('esp-lista').innerHTML=renderLista(S.especialidades);
      bindEsp();
    }));
  }
  setTimeout(bindEsp,50);
}

async function importarBase() {
  try {
    const apts = await sb('apontamentos?select=chapa,nome&order=nome.asc');
    const mapa={};
    apts.forEach(a=>{ if(a.chapa&&!mapa[a.chapa]) mapa[a.chapa]=a.nome; });
    const novos=Object.entries(mapa).filter(([ch])=>!S.colaboradores.find(c=>String(c.cracha)===String(ch)));
    if(!novos.length){alert('Todos os colaboradores da base já estão cadastrados.');return;}
    if(!confirm(`Importar ${novos.length} colaboradores novos?`))return;
    await sb('apt_colaboradores',{method:'POST',body:JSON.stringify(novos.map(([ch,nome])=>({cracha:ch,nome})))});
    await carregarCadastro();
    alert(`${novos.length} importados. Complete modalidade e escala de cada um.`);
  } catch(e){alert('Erro: '+e.message);}
}

/* ═══════════════════════════════════════════════════════════════
   MODAL GENÉRICO
   ═══════════════════════════════════════════════════════════════ */
function abrirModal(titulo, html, onOk=null, btnLabel='Confirmar') {
  fecharModal();
  const ov=document.createElement('div'); ov.className='apt-modal-overlay'; ov.id='apt-modal-ov';
  ov.innerHTML=`
    <div class="apt-modal">
      <div class="apt-modal-title">${titulo}
        <button id="apt-modal-x" class="apt-btn-icon"><i class="ti ti-x" aria-hidden="true"></i></button>
      </div>
      <div id="apt-modal-body">${html}</div>
      ${onOk?`<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:20px;padding-top:14px;border-top:1px solid ${C.border}">
        <button id="apt-modal-cancel" class="apt-btn apt-btn-ghost">Cancelar</button>
        <button id="apt-modal-ok" class="apt-btn apt-btn-primary">${btnLabel}</button>
      </div>`:''}
    </div>`;
  document.body.appendChild(ov);
  document.getElementById('apt-modal-x').onclick    = fecharModal;
  document.getElementById('apt-modal-cancel')?.addEventListener('click',fecharModal);
  document.getElementById('apt-modal-ok')?.addEventListener('click',onOk);
  ov.addEventListener('click',e=>{ if(e.target===ov) fecharModal(); });
}
function fecharModal() { document.getElementById('apt-modal-ov')?.remove(); }

/* ═══════════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════════ */
async function init() {
  css();
  try { S.colaboradores = await sb('apt_colaboradores?order=nome.asc'); } catch(e) { S.colaboradores=[]; }
  render();
}

if (!window.Modulos) window.Modulos={};
window.Modulos['apontamentos']={init};
init();

})();
