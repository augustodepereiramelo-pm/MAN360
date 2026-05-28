/* ═══════════════════════════════════════════════════════════════
   MAN360 — Módulo Apontamentos  v3
   Usa exclusivamente classes e variáveis CSS do index.html
   ═══════════════════════════════════════════════════════════════ */
(() => {

/* ── Config ─────────────────────────────────────────────────── */
const SB_URL = MAN360_CONFIG.supabase.url;
const SB_KEY = MAN360_CONFIG.supabase.key;
const META   = 0.75;   // meta de aderência diária
const HH_DIA = 8;      // horas esperadas por dia trabalhado

// Semana 9 ancora em 25/05/2026
const SEM_ANCORA   = 9;
const DATA_ANCORA  = '2026-05-25';
const SAFRA_ATUAL  = '2025/26';
const SAFRAS       = ['2023/24','2024/25','2025/26','2026/27'];
const MODALIDADES  = ['MEC','CAL','ELE','CIV','INS','AUT','ISP'];
const ESCALAS      = ['5x1','6x1','ADM'];
const TURNOS       = ['ADM','A','B','C'];
const ORDEM_TURNO  = {ADM:0, A:1, B:2, C:3};

/* ── Helpers de data ────────────────────────────────────────── */
function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0,10);
}
const hoje     = () => new Date().toISOString().slice(0,10);
const fmtDD_MM = iso => { const [,m,d]=iso.split('-'); return `${d}/${m}`; };
const fmtFull  = iso => { const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}`; };
const diaSem   = iso => ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][new Date(iso+'T00:00:00').getDay()];
function diasEntre(a,b){ const r=[]; let c=a; while(c<=b){r.push(c);c=addDays(c,1);} return r; }
function semParaDatas(s){ const i=addDays(DATA_ANCORA,(s-SEM_ANCORA)*7); return {ini:i,fim:addDays(i,6)}; }
function semanaAtual(){
  const ms0=new Date(DATA_ANCORA+'T00:00:00').getTime();
  const ms1=new Date(hoje()+'T00:00:00').getTime();
  return SEM_ANCORA + Math.floor((ms1-ms0)/604800000);
}
function gerarFolgas(escala, pf, ate){
  if(!escala||escala==='ADM'||!pf) return new Set();
  const ciclo = escala==='5x1' ? 6 : 7;
  const s=new Set(); let c=pf;
  while(c<=ate){s.add(c); c=addDays(c,ciclo);}
  return s;
}

/* ── Supabase ───────────────────────────────────────────────── */
async function sb(path, opts={}){
  const pref = opts.prefer || (opts.method==='DELETE'?'return=minimal':'return=representation');
  const res = await fetch(`${SB_URL}/rest/v1/${path}`,{
    headers:{'apikey':SB_KEY,'Authorization':`Bearer ${SB_KEY}`,'Content-Type':'application/json','Prefer':pref,...(opts.headers||{})},
    ...opts
  });
  if(!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.status===204?[]:res.json();
}

/* ── Estado ─────────────────────────────────────────────────── */
const semI = semanaAtual();
const {ini:dI, fim:dF} = semParaDatas(semI);
const S = {
  safra: SAFRA_ATUAL,
  semana: semI,
  periodoTipo: 'semana',
  dataIni: dI, dataFim: dF,
  modalidades: [...MODALIDADES],   // todas abertas por padrão
  colabChapa: null,
  apontamentos: [], colaboradores: [], especialidades: [],
  justificativas: [], ferias: [],
  hmPag: 0,
  aba: 'principal', cadAba: 'colab',
};

/* ═══════════════════════════════════════════════════════════════
   RENDER RAIZ
   ═══════════════════════════════════════════════════════════════ */
function render(){
  const c = document.getElementById('module-container');
  c.innerHTML = `
    <div id="apt-root">
      <div style="display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:16px">
        <div id="apt-tab-p" class="apt-tab on"><i class="ti ti-clock-record"></i> Apontamentos</div>
        <div id="apt-tab-c" class="apt-tab"><i class="ti ti-users"></i> Cadastro e Gestão</div>
      </div>
      <div id="apt-content"></div>
    </div>
    <style>
      #apt-root { font-family:var(--font); }
      .apt-tab { padding:8px 16px;font-size:12px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;color:var(--text-muted);transition:all .15s;display:inline-flex;align-items:center;gap:6px;letter-spacing:.02em; }
      .apt-tab.on { color:var(--yellow);border-bottom-color:var(--yellow); }
      .apt-tab i { font-size:14px; }
      .apt-hm-cell { height:26px;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:600;cursor:pointer;transition:opacity .1s; }
      .apt-hm-cell:hover { opacity:.75; }
      .apt-turno-header { font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text-muted);padding:12px 0 4px;display:flex;align-items:center;gap:6px; }
      .apt-turno-header::after { content:'';flex:1;height:1px;background:var(--border); }
      .apt-attn-row { display:flex;align-items:flex-start;gap:8px;padding:7px 0;border-bottom:1px solid #f9fafb;font-size:12px; }
      .apt-attn-row:last-child { border-bottom:none; }
    </style>`;
  document.getElementById('apt-tab-p').onclick = () => setAba('principal');
  document.getElementById('apt-tab-c').onclick = () => setAba('cadastro');
  renderContent();
}

function setAba(aba){
  S.aba = aba;
  document.getElementById('apt-tab-p').className = 'apt-tab'+(aba==='principal'?' on':'');
  document.getElementById('apt-tab-c').className = 'apt-tab'+(aba==='cadastro'?' on':'');
  renderContent();
}

function renderContent(){
  const el = document.getElementById('apt-content');
  if(S.aba==='principal'){
    el.innerHTML = htmlFiltros() + htmlSkeleton();
    bindFiltros();
    carregarColabs().then(() => carregarDados());
  } else {
    el.innerHTML = htmlCadastro();
    bindCadastro();
    carregarCadastro();
  }
}

/* ═══════════════════════════════════════════════════════════════
   FILTROS — usa classes nativas do index.html
   ═══════════════════════════════════════════════════════════════ */
function htmlFiltros(){
  // semanas: da 1 até semana atual + 8
  const semFim = semanaAtual() + 8;
  const semOpts = [];
  for(let s=1; s<=semFim; s++){
    const {ini,fim} = semParaDatas(s);
    const label = s===semanaAtual() ? `Sem ${s} (atual) · ${fmtDD_MM(ini)}–${fmtDD_MM(fim)}` : `Sem ${s} · ${fmtDD_MM(ini)}–${fmtDD_MM(fim)}`;
    semOpts.push(`<div class="dd-item" data-val="${s}"><input type="radio" name="apt-sem" value="${s}" ${S.semana===s?'checked':''}> ${label}</div>`);
  }
  const modItems = MODALIDADES.map(m =>
    `<div class="dd-item" data-val="${m}"><input type="checkbox" class="apt-mod-cb" value="${m}" ${S.modalidades.includes(m)?'checked':''}> ${m}</div>`
  ).join('');
  const semLabel = `Sem ${S.semana} · ${fmtDD_MM(semParaDatas(S.semana).ini)}–${fmtDD_MM(semParaDatas(S.semana).fim)}`;
  const modLabel = S.modalidades.length===MODALIDADES.length ? 'Todas' : S.modalidades.length===0 ? 'Nenhuma' : S.modalidades.join(', ');

  return `
  <div class="filters-bar" style="margin-bottom:16px">
    <!-- Safra -->
    <span class="filter-label">Safra</span>
    <div class="dd-wrap">
      <button class="dd-btn" onclick="toggleDD('dd-safra')" id="dd-safra-btn">
        <i class="ti ti-calendar"></i>
        <span class="dd-label" id="dd-safra-label">${S.safra}</span>
        <i class="ti ti-chevron-down dd-arrow"></i>
      </button>
      <div class="dd-panel" id="dd-safra">
        ${SAFRAS.map(s=>`<div class="dd-item apt-safra-item" data-val="${s}">${s===S.safra?'<i class="ti ti-check" style="color:var(--yellow)"></i>':''} ${s}</div>`).join('')}
      </div>
    </div>

    <!-- Período -->
    <span class="filter-label">Período</span>
    <div style="display:flex;align-items:center;gap:6px">
      <label style="font-size:11px;color:#374151;cursor:pointer;display:flex;align-items:center;gap:4px">
        <input type="radio" name="apt-ptipo" value="semana" ${S.periodoTipo==='semana'?'checked':''}> Semana
      </label>
      <label style="font-size:11px;color:#374151;cursor:pointer;display:flex;align-items:center;gap:4px">
        <input type="radio" name="apt-ptipo" value="intervalo" ${S.periodoTipo==='intervalo'?'checked':''}> Intervalo
      </label>
    </div>
    <div id="apt-per-sem" style="display:${S.periodoTipo==='semana'?'block':'none'}">
      <div class="dd-wrap">
        <button class="dd-btn" onclick="toggleDD('dd-sem')" style="min-width:200px">
          <i class="ti ti-calendar-week"></i>
          <span class="dd-label" id="dd-sem-label">${semLabel}</span>
          <i class="ti ti-chevron-down dd-arrow"></i>
        </button>
        <div class="dd-panel" id="dd-sem" style="max-height:220px;overflow-y:auto;min-width:240px">
          ${semOpts.join('')}
        </div>
      </div>
    </div>
    <div id="apt-per-int" style="display:${S.periodoTipo==='intervalo'?'flex':'none'};gap:6px;align-items:center">
      <input type="date" id="apt-di" value="${S.dataIni}" class="dd-btn" style="cursor:text;font-family:var(--font)">
      <span style="color:var(--text-muted);font-size:12px">até</span>
      <input type="date" id="apt-df" value="${S.dataFim}" class="dd-btn" style="cursor:text;font-family:var(--font)">
    </div>

    <!-- Modalidade -->
    <span class="filter-label">Modalidade</span>
    <div class="dd-wrap">
      <button class="dd-btn" onclick="toggleDD('dd-mod')" style="min-width:120px">
        <i class="ti ti-tag"></i>
        <span class="dd-label" id="dd-mod-label">${modLabel}</span>
        <i class="ti ti-chevron-down dd-arrow"></i>
      </button>
      <div class="dd-panel" id="dd-mod">
        <div class="dd-actions">
          <button class="dd-action-btn primary" id="apt-mod-todas">Todas</button>
          <button class="dd-action-btn secondary" id="apt-mod-nenhuma">Nenhuma</button>
        </div>
        ${modItems}
      </div>
    </div>

    <!-- Colaborador -->
    <span class="filter-label">Colaborador</span>
    <div style="position:relative">
      <div class="dd-btn" style="cursor:text;min-width:180px;padding:0">
        <i class="ti ti-search" style="margin-left:10px;color:var(--text-muted)"></i>
        <input type="text" id="apt-colab" placeholder="Nome ou crachá…"
          style="border:none;background:transparent;outline:none;font-family:var(--font);font-size:11px;color:#374151;flex:1;padding:0 8px;height:30px">
      </div>
      <div id="apt-colab-drop" style="display:none;position:absolute;top:calc(100% + 4px);left:0;min-width:240px;background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow-md);z-index:200;max-height:180px;overflow-y:auto"></div>
    </div>

    <button id="apt-btn-filtrar" class="dd-action-btn primary" style="height:30px;padding:0 14px;font-family:var(--font)">
      <i class="ti ti-search"></i> Filtrar
    </button>
    <button id="apt-btn-limpar" class="dd-action-btn secondary" style="height:30px;padding:0 12px;font-family:var(--font)">
      Limpar
    </button>
  </div>`;
}

function bindFiltros(){
  // Tipo período
  document.querySelectorAll('input[name="apt-ptipo"]').forEach(r => r.addEventListener('change', () => {
    S.periodoTipo = r.value;
    document.getElementById('apt-per-sem').style.display = r.value==='semana'?'block':'none';
    document.getElementById('apt-per-int').style.display = r.value==='intervalo'?'flex':'none';
  }));

  // Safra
  document.querySelectorAll('.apt-safra-item').forEach(el => el.addEventListener('click', () => {
    S.safra = el.dataset.val;
    document.getElementById('dd-safra-label').textContent = S.safra;
    document.getElementById('dd-safra').classList.remove('show');
  }));

  // Semana (radio dentro do dropdown)
  document.getElementById('dd-sem').addEventListener('change', e => {
    if(e.target.name==='apt-sem'){
      S.semana = parseInt(e.target.value);
      const {ini,fim} = semParaDatas(S.semana);
      S.dataIni=ini; S.dataFim=fim;
      const lbl = S.semana===semanaAtual()?`Sem ${S.semana} (atual) · ${fmtDD_MM(ini)}–${fmtDD_MM(fim)}`:`Sem ${S.semana} · ${fmtDD_MM(ini)}–${fmtDD_MM(fim)}`;
      document.getElementById('dd-sem-label').textContent = lbl;
      document.getElementById('dd-sem').classList.remove('show');
    }
  });

  // Datas
  document.getElementById('apt-di')?.addEventListener('change', e => S.dataIni=e.target.value);
  document.getElementById('apt-df')?.addEventListener('change', e => S.dataFim=e.target.value);

  // Modalidade — checkboxes + todas/nenhuma
  document.getElementById('apt-mod-todas').addEventListener('click', () => {
    S.modalidades = [...MODALIDADES];
    document.querySelectorAll('.apt-mod-cb').forEach(cb => cb.checked=true);
    document.getElementById('dd-mod-label').textContent = 'Todas';
  });
  document.getElementById('apt-mod-nenhuma').addEventListener('click', () => {
    S.modalidades = [];
    document.querySelectorAll('.apt-mod-cb').forEach(cb => cb.checked=false);
    document.getElementById('dd-mod-label').textContent = 'Nenhuma';
  });
  document.getElementById('dd-mod').addEventListener('change', e => {
    if(e.target.classList.contains('apt-mod-cb')){
      if(e.target.checked) S.modalidades.push(e.target.value);
      else S.modalidades = S.modalidades.filter(m => m!==e.target.value);
      const lbl = S.modalidades.length===MODALIDADES.length?'Todas':S.modalidades.length===0?'Nenhuma':S.modalidades.join(', ');
      document.getElementById('dd-mod-label').textContent = lbl;
    }
  });

  // Colaborador busca
  const inp  = document.getElementById('apt-colab');
  const drop = document.getElementById('apt-colab-drop');
  inp.addEventListener('input', () => {
    const q = inp.value.trim().toLowerCase();
    if(!q){ drop.style.display='none'; return; }
    const hits = S.colaboradores.filter(c => c.nome.toLowerCase().includes(q)||String(c.cracha).includes(q)).slice(0,12);
    if(!hits.length){ drop.style.display='none'; return; }
    drop.style.display='block';
    drop.innerHTML = hits.map(c=>`
      <div class="dd-item" data-ch="${c.cracha}" style="cursor:pointer">
        <span style="color:var(--text-muted);font-size:10px;min-width:44px">${c.cracha}</span>
        <span style="flex:1">${c.nome}</span>
        <span style="font-size:10px;background:#eff6ff;color:#1d4ed8;padding:1px 6px;border-radius:10px">${c.modalidade||'—'}</span>
      </div>`).join('');
    drop.querySelectorAll('[data-ch]').forEach(el => el.addEventListener('click', () => {
      const c = S.colaboradores.find(x=>String(x.cracha)===el.dataset.ch);
      S.colabChapa = c.cracha;
      inp.value = `${c.cracha} — ${c.nome}`;
      if(c.modalidade) S.modalidades = [c.modalidade];
      drop.style.display='none';
    }));
  });
  document.addEventListener('click', e => { if(!drop.contains(e.target)&&e.target!==inp) drop.style.display='none'; });

  // Filtrar
  document.getElementById('apt-btn-filtrar').addEventListener('click', () => {
    if(S.periodoTipo==='semana'){ const {ini,fim}=semParaDatas(S.semana); S.dataIni=ini; S.dataFim=fim; }
    S.hmPag=0;
    carregarDados();
  });

  // Limpar colaborador
  document.getElementById('apt-btn-limpar').addEventListener('click', () => {
    S.colabChapa=null; S.modalidades=[...MODALIDADES];
    inp.value='';
    document.querySelectorAll('.apt-mod-cb').forEach(cb=>cb.checked=true);
    document.getElementById('dd-mod-label').textContent='Todas';
    S.hmPag=0; carregarDados();
  });
}

/* ── Skeleton de carregamento ── */
function htmlSkeleton(){
  return `<div id="apt-dados">
    <div class="metrics-row" id="apt-metricas">
      ${[1,2,3,4].map(()=>`<div class="metric"><div style="height:10px;background:#f3f4f6;border-radius:4px;width:60%;margin-bottom:10px"></div><div style="height:24px;background:#f3f4f6;border-radius:4px;width:40%"></div></div>`).join('')}
    </div>
    <div class="card" id="apt-pontos" style="margin-bottom:12px"><div style="height:60px;background:#f9fafb;border-radius:6px"></div></div>
    <div class="card" id="apt-heatmap" style="margin-bottom:12px"><div style="height:140px;background:#f9fafb;border-radius:6px"></div></div>
    <div class="card" id="apt-tabela" style="margin-bottom:12px"><div style="height:100px;background:#f9fafb;border-radius:6px"></div></div>
    <div id="apt-importar">${htmlImportador()}</div>
  </div>`;
}

/* ═══════════════════════════════════════════════════════════════
   CARREGAR
   ═══════════════════════════════════════════════════════════════ */
async function carregarColabs(){
  try { S.colaboradores = await sb('apt_colaboradores?order=nome.asc'); } catch(e){ S.colaboradores=[]; }
}

async function carregarDados(){
  try {
    let cf = S.colaboradores;
    if(S.colabChapa) cf = cf.filter(c=>String(c.cracha)===String(S.colabChapa));
    else if(S.modalidades.length) cf = cf.filter(c=>S.modalidades.includes(c.modalidade));

    if(!cf.length){
      document.getElementById('apt-dados').innerHTML = `
        <div class="card" style="text-align:center;padding:48px;color:var(--text-muted)">
          <i class="ti ti-user-off" style="font-size:36px;display:block;margin-bottom:8px;color:var(--border)"></i>
          <p style="margin:0;font-size:12px">Nenhum colaborador cadastrado para os filtros.<br>
          <span style="color:var(--blue);cursor:pointer;text-decoration:underline" id="apt-ir-cad">Ir para Cadastro</span></p>
        </div>${htmlImportador()}`;
      document.getElementById('apt-ir-cad')?.addEventListener('click',()=>setAba('cadastro'));
      return;
    }

    // Chapas entre aspas para Supabase tratar como TEXT
    const cQ = cf.map(c=>`"${c.cracha}"`).join(',');
    const [apts, justs, fer] = await Promise.all([
      sb(`apontamentos?data_apontamento=gte.${S.dataIni}&data_apontamento=lte.${S.dataFim}&chapa=in.(${cQ})&order=data_apontamento.asc,chapa.asc`),
      sb(`apt_justificativas?data_inicio=lte.${S.dataFim}&data_fim=gte.${S.dataIni}&chapa=in.(${cQ})`).catch(()=>[]),
      sb(`apt_ferias?data_inicio=lte.${S.dataFim}&data_fim=gte.${S.dataIni}&chapa=in.(${cQ})`).catch(()=>[]),
    ]);
    S.apontamentos=apts; S.justificativas=justs; S.ferias=fer;
    renderDados(cf);
  } catch(e){
    console.error(e);
    showToast('Erro ao carregar dados: '+e.message,'erro');
  }
}

/* ═══════════════════════════════════════════════════════════════
   RENDER DADOS
   ═══════════════════════════════════════════════════════════════ */
function renderDados(cf){
  const hj    = hoje();
  const dias  = diasEntre(S.dataIni, S.dataFim);

  const hhDia = (ch,dia) => S.apontamentos
    .filter(a=>String(a.chapa)===String(ch)&&a.data_apontamento===dia)
    .reduce((s,a)=>s+parseFloat(String(a.hh_total||0).replace(',','.'))||0, 0);

  const ehFolga = (c,dia) => {
    if(!c.escala||c.escala==='ADM'){
      if(!c.turno||c.turno==='ADM'){ const dw=new Date(dia+'T00:00:00').getDay(); return dw===0||dw===6; }
      return false;
    }
    return gerarFolgas(c.escala, c.primeira_folga, S.dataFim).has(dia);
  };
  const deFerias = (ch,dia) => S.ferias.some(f=>String(f.chapa)===String(ch)&&f.data_inicio<=dia&&f.data_fim>=dia);
  const getJust  = (ch,dia) => S.justificativas.find(j=>String(j.chapa)===String(ch)&&j.data_inicio<=dia&&j.data_fim>=dia)||null;

  // Métricas — só dias passados/hoje
  let totPrev=0, totApt=0, ausencias=[], baixos=[];
  cf.forEach(c => {
    dias.forEach(dia => {
      if(dia>hj) return;
      if(ehFolga(c,dia)||deFerias(c.cracha,dia)||getJust(c.cracha,dia)) return;
      totPrev += HH_DIA;
      const hh = hhDia(c.cracha, dia);
      totApt  += hh;
      if(hh===0) ausencias.push({colab:c,dia});
      else if(hh<HH_DIA*META) baixos.push({colab:c,dia,hh});
    });
  });
  const ader = totPrev>0 ? Math.round(totApt/totPrev*100) : 0;
  const corAder = ader>=75?'var(--green)':'var(--red)';

  document.getElementById('apt-metricas').innerHTML = [
    {l:'H-H previsto',             v:totPrev+'h',  s:'Baseado na escala cadastrada',          c:'var(--yellow)'},
    {l:'Aderência ao apontamento', v:ader+'%',     s:'H-H apontado / H-H disponível',         c:corAder},
    {l:'Ausência de apontamento',  v:ausencias.length, s:'Dias sem registro (sem justificativa)',c:ausencias.length>0?'var(--red)':'#374151'},
    {l:'Baixo apontamento',        v:baixos.length,s:`Dias abaixo de ${Math.round(META*100)}% do previsto`,c:baixos.length>0?'var(--amber)':'#374151'},
  ].map(({l,v,s,c})=>`
    <div class="metric">
      <div class="m-label">${l}</div>
      <div class="m-val" style="color:${c}">${v}</div>
      <div class="m-sub">${s}</div>
    </div>`).join('');

  // Pontos de atenção
  const ausMap={};
  ausencias.forEach(({colab,dia})=>{ const k=colab.cracha; if(!ausMap[k]) ausMap[k]={colab,dias:[]}; ausMap[k].dias.push(dia); });

  const pontosHtml = ausencias.length===0&&baixos.length===0
    ? `<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:12px"><i class="ti ti-circle-check" style="color:var(--green);font-size:20px;margin-right:6px"></i>Nenhum ponto de atenção.</div>`
    : `<div style="display:flex;gap:24px;flex-wrap:wrap">
        ${ausencias.length?`<div style="flex:1;min-width:200px">
          <div class="card-title" style="display:flex;align-items:center;gap:6px">
            <span style="width:7px;height:7px;border-radius:50%;background:var(--red);display:inline-block"></span>AUSÊNCIA DE APONTAMENTO
          </div>
          ${Object.values(ausMap).map(({colab,dias})=>`
            <div class="apt-attn-row">
              <span style="width:7px;height:7px;border-radius:50%;background:var(--red);display:inline-block;flex-shrink:0;margin-top:4px"></span>
              <div style="flex:1"><strong>${colab.nome.split(' ').slice(0,2).join(' ')}</strong> — ${dias.map(fmtDD_MM).join(', ')}</div>
              <button class="dd-action-btn secondary apt-btn-just" data-ch="${colab.cracha}" data-nome="${colab.nome}" data-dias="${dias.join(',')}"
                style="height:24px;padding:0 8px;font-size:10px;font-family:var(--font)"><i class="ti ti-pencil"></i></button>
            </div>`).join('')}
          <div style="font-size:10px;color:var(--text-muted);margin-top:6px;background:var(--bg);padding:5px 8px;border-radius:var(--radius-sm)">Tratativa: Treinamento ou Serviço externo</div>
        </div>`:``}
        ${baixos.length?`<div style="flex:1;min-width:200px">
          <div class="card-title" style="display:flex;align-items:center;gap:6px">
            <span style="width:7px;height:7px;border-radius:50%;background:var(--amber);display:inline-block"></span>
            BAIXO APONTAMENTO <span style="background:var(--amber-l);color:var(--amber);font-size:9px;padding:1px 6px;border-radius:10px">meta ${Math.round(META*100)}%</span>
          </div>
          ${baixos.map(({colab,dia,hh})=>`
            <div class="apt-attn-row">
              <span style="width:7px;height:7px;border-radius:50%;background:var(--amber);display:inline-block;flex-shrink:0;margin-top:4px"></span>
              <div><strong>${colab.nome.split(' ')[0]}</strong> — ${fmtDD_MM(dia)} · ${hh.toFixed(1)}h (${Math.round(hh/HH_DIA*100)}%)</div>
            </div>`).join('')}
          <div style="font-size:10px;color:var(--text-muted);margin-top:6px;background:var(--bg);padding:5px 8px;border-radius:var(--radius-sm)">Tratativa disponível em breve.</div>
        </div>`:``}
      </div>`;

  document.getElementById('apt-pontos').innerHTML = `
    <div class="card-title"><i class="ti ti-alert-triangle" style="color:var(--amber)"></i> PONTOS DE ATENÇÃO</div>
    ${pontosHtml}`;
  document.querySelectorAll('.apt-btn-just').forEach(btn =>
    btn.addEventListener('click',()=>modalJustif(btn.dataset.ch, btn.dataset.nome, btn.dataset.dias.split(',')))
  );

  renderHeatmap(cf, dias, hhDia, ehFolga, deFerias, getJust, hj);
  renderTabela();
  document.getElementById('apt-importar').innerHTML = htmlImportador();
  bindImportador();
}

/* ═══════════════════════════════════════════════════════════════
   HEATMAP — separado por turno, ordem ADM → A → B → C
   ═══════════════════════════════════════════════════════════════ */
function renderHeatmap(cf, todosDias, hhDia, ehFolga, deFerias, getJust, hj){
  const PPG  = 14;
  const pags = Math.ceil(todosDias.length/PPG);
  const pag  = Math.min(S.hmPag, pags-1);
  const dias = todosDias.slice(pag*PPG, (pag+1)*PPG);

  function cellBg(c,dia){
    if(dia>hj)                      return ['#dbeafe','#1e40af',''];
    if(deFerias(c.cracha,dia))      return ['#bfdbfe','#1e40af','F'];
    const just=getJust(c.cracha,dia);
    if(just)                        return ['var(--amber-l)','var(--amber)', just.tratativa?.substring(0,1)||'J'];
    if(ehFolga(c,dia))              return ['#e5e7eb','#9ca3af',''];
    const hh=hhDia(c.cracha,dia);
    if(hh===0)                      return ['var(--red-l)','var(--red)',''];
    if(hh>=HH_DIA*0.9)             return ['#166534','#bbf7d0', hh.toFixed(0)+'h'];
    if(hh>=HH_DIA*META)            return ['var(--green)','var(--green-l)', hh.toFixed(0)+'h'];
    return ['#fde68a','#92400e', hh.toFixed(0)+'h'];
  }

  // Agrupar por turno, ordem definida
  const porTurno = {};
  TURNOS.forEach(t => porTurno[t]=[]);
  cf.forEach(c => {
    const t = c.turno && TURNOS.includes(c.turno) ? c.turno : 'ADM';
    porTurno[t].push(c);
  });

  const gridCols = `70px repeat(${dias.length}, minmax(28px,1fr))`;
  let linhas = '';
  TURNOS.forEach(turno => {
    const colabs = porTurno[turno].sort((a,b)=>a.nome.localeCompare(b.nome));
    if(!colabs.length) return;
    // Separador de turno
    linhas += `
      <div class="apt-turno-header" style="grid-column:1/-1">Turno ${turno}</div>`;
    colabs.forEach(c => {
      linhas += `
        <div style="font-size:11px;color:#374151;display:flex;align-items:center;height:26px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:4px;font-weight:500" title="${c.nome}">${c.nome.split(' ')[0]}</div>
        ${dias.map(dia=>{
          const [bg,fg,lbl]=cellBg(c,dia);
          return `<div class="apt-hm-cell" data-ch="${c.cracha}" data-dia="${dia}" style="background:${bg};color:${fg}" title="${c.nome} · ${fmtDD_MM(dia)}">${lbl}</div>`;
        }).join('')}`;
    });
  });

  const legenda = [
    ['#166534','Alto >6h'],['var(--green)','Médio 4–6h'],['#fde68a','Baixo <4h'],
    ['var(--red-l)','Sem registro'],['#e5e7eb','Folga'],['#dbeafe','Disponível'],
    ['var(--amber-l)','Justificado'],['#bfdbfe','Férias'],
  ];

  document.getElementById('apt-heatmap').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:12px">
      <div class="card-title" style="margin:0"><i class="ti ti-layout-grid"></i> PRESENÇA POR COLABORADOR
        <span style="font-weight:400;text-transform:none;font-size:10px;color:var(--text-muted);margin-left:6px">${fmtFull(dias[0])} – ${fmtFull(dias[dias.length-1])}</span>
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${legenda.map(([bg,lbl])=>`<span style="display:flex;align-items:center;gap:4px;font-size:10px;color:#6b7280">
            <span style="width:10px;height:10px;border-radius:2px;background:${bg};display:inline-block;border:1px solid rgba(0,0,0,.06)"></span>${lbl}
          </span>`).join('')}
        </div>
        <div style="display:flex;gap:4px;align-items:center">
          <button id="hm-prev" class="dd-action-btn secondary" style="height:26px;width:26px;padding:0;font-family:var(--font)" ${pag===0?'disabled':''}><i class="ti ti-chevron-left"></i></button>
          <span style="font-size:11px;color:var(--text-muted);padding:0 4px">${pag+1}/${pags}</span>
          <button id="hm-next" class="dd-action-btn secondary" style="height:26px;width:26px;padding:0;font-family:var(--font)" ${pag>=pags-1?'disabled':''}><i class="ti ti-chevron-right"></i></button>
        </div>
      </div>
    </div>
    <div style="overflow-x:auto">
      <div style="display:grid;grid-template-columns:${gridCols};gap:3px;min-width:${70+dias.length*30}px">
        <div></div>
        ${dias.map(d=>`<div style="text-align:center;font-size:9px;color:var(--text-muted);line-height:1.3;padding-bottom:2px">
          <div style="font-weight:600">${diaSem(d)}</div><div>${fmtDD_MM(d)}</div>
        </div>`).join('')}
        ${linhas}
      </div>
    </div>`;

  document.getElementById('hm-prev')?.addEventListener('click',()=>{ S.hmPag--; renderHeatmap(cf,todosDias,hhDia,ehFolga,deFerias,getJust,hj); });
  document.getElementById('hm-next')?.addEventListener('click',()=>{ S.hmPag++; renderHeatmap(cf,todosDias,hhDia,ehFolga,deFerias,getJust,hj); });
  document.querySelectorAll('.apt-hm-cell').forEach(cel=>cel.addEventListener('click',()=>{
    const c=cf.find(x=>String(x.cracha)===cel.dataset.ch);
    if(c) detalheCell(c, cel.dataset.dia, hhDia, hj);
  }));
}

function detalheCell(c, dia, hhDia, hj){
  if(dia>hj){ abrirModal('Dia disponível',`<p style="font-size:12px;color:var(--text-muted)">${fmtFull(dia)} ainda não chegou.</p>`); return; }
  const apts = S.apontamentos.filter(a=>String(a.chapa)===String(c.cracha)&&a.data_apontamento===dia);
  const tot  = apts.reduce((s,a)=>s+parseFloat(String(a.hh_total||0).replace(',','.'))||0, 0);
  abrirModal(`${c.nome.split(' ')[0]} · ${fmtFull(dia)}`,
    apts.length===0
      ? `<p style="font-size:12px;color:var(--text-muted);text-align:center;padding:16px">Nenhum apontamento neste dia.</p>`
      : `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr>${['OS','Descrição','Início','Fim','H-H'].map(h=>`<th style="text-align:left;padding:5px 8px;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#9ca3af">${h}</th>`).join('')}</tr></thead>
          <tbody>
            ${apts.map(a=>`<tr style="border-bottom:1px solid #f9fafb">
              <td style="padding:5px 8px;font-family:monospace">${a.os}</td>
              <td style="padding:5px 8px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${a.desc_servico||''}">${a.desc_servico||'—'}</td>
              <td style="padding:5px 8px">${a.hora_inicio}</td>
              <td style="padding:5px 8px">${a.hora_fim}</td>
              <td style="padding:5px 8px;font-weight:600">${(parseFloat(String(a.hh_total||0).replace(',','.'))||0).toFixed(1)}h</td>
            </tr>`).join('')}
            <tr style="background:var(--bg)"><td colspan="4" style="padding:5px 8px;font-weight:700;font-size:11px;color:#374151">Total</td>
            <td style="padding:5px 8px;font-weight:700;color:var(--green)">${tot.toFixed(1)}h</td></tr>
          </tbody>
        </table></div>`);
}

/* ═══════════════════════════════════════════════════════════════
   TABELA
   ═══════════════════════════════════════════════════════════════ */
function renderTabela(){
  const hj   = hoje();
  const apts = [...S.apontamentos].filter(a=>a.data_apontamento<=hj)
    .sort((a,b)=>a.data_apontamento<b.data_apontamento?-1:a.data_apontamento>b.data_apontamento?1:(a.nome||'')<(b.nome||'')?-1:1);
  document.getElementById('apt-tabela').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div class="card-title" style="margin:0"><i class="ti ti-list-details"></i> DETALHAMENTO DE APONTAMENTOS</div>
      <span style="font-size:11px;color:var(--text-muted)">${apts.length} registros</span>
    </div>
    <div style="overflow-x:auto;max-height:320px;overflow-y:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead style="position:sticky;top:0;background:var(--card-bg);z-index:1">
          <tr>${['Data','Colaborador','OS','Descrição','Início','Fim','H-H'].map(h=>`<th style="text-align:left;padding:5px 8px;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#9ca3af;white-space:nowrap">${h}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${apts.length===0
            ? `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted)">Nenhum apontamento no período.</td></tr>`
            : apts.map(a=>`<tr style="border-bottom:1px solid #f9fafb">
                <td style="padding:5px 8px;white-space:nowrap">${fmtDD_MM(a.data_apontamento)}</td>
                <td style="padding:5px 8px;white-space:nowrap">${(a.nome||'').split(' ').slice(0,2).join(' ')}</td>
                <td style="padding:5px 8px;font-family:monospace;font-size:11px">${a.os}</td>
                <td style="padding:5px 8px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${a.desc_servico||''}">${a.desc_servico||'—'}</td>
                <td style="padding:5px 8px">${a.hora_inicio}</td>
                <td style="padding:5px 8px">${a.hora_fim}</td>
                <td style="padding:5px 8px;font-weight:600">${(parseFloat(String(a.hh_total||0).replace(',','.'))||0).toFixed(1)}h</td>
              </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

/* ═══════════════════════════════════════════════════════════════
   IMPORTADOR — corrigido: sem cellDates, parser robusto
   ═══════════════════════════════════════════════════════════════ */
function htmlImportador(){
  return `
    <div class="card import-section">
      <div class="card-title"><i class="ti ti-upload"></i> IMPORTAR APONTAMENTOS</div>
      <div class="dropzone" id="apt-drop" style="position:relative">
        <input type="file" id="apt-file" accept=".xls,.xlsx" style="position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%">
        <i class="ti ti-file-spreadsheet"></i>
        <p><strong>Arraste o arquivo aqui</strong><br>ou clique para selecionar</p>
        <div class="file-types">
          <div class="file-type"><i class="ti ti-file-spreadsheet" style="color:var(--green)"></i><span class="ext">.xlsx</span></div>
          <div class="file-type"><i class="ti ti-file-spreadsheet" style="color:var(--amber)"></i><span class="ext">.xls</span></div>
        </div>
      </div>
      <div id="apt-imp-prog" style="display:none;margin-top:10px">
        <div style="height:4px;background:var(--border);border-radius:2px;overflow:hidden">
          <div id="apt-imp-bar" style="height:100%;background:var(--yellow);border-radius:2px;width:0%;transition:width .3s"></div>
        </div>
        <div id="apt-imp-msg" style="font-size:10px;color:var(--text-muted);margin-top:4px"></div>
      </div>
    </div>`;
}

function bindImportador(){
  const inp  = document.getElementById('apt-file');
  const zona = document.getElementById('apt-drop');
  if(!inp||!zona) return;
  zona.addEventListener('dragover',e=>{e.preventDefault();zona.classList.add('over');});
  zona.addEventListener('dragleave',()=>zona.classList.remove('over'));
  zona.addEventListener('drop',e=>{e.preventDefault();zona.classList.remove('over');if(e.dataTransfer.files[0])processarImport(e.dataTransfer.files[0]);});
  inp.addEventListener('change',()=>{if(inp.files[0])processarImport(inp.files[0]);});
}

async function processarImport(file){
  const prog = document.getElementById('apt-imp-prog');
  const bar  = document.getElementById('apt-imp-bar');
  const msg  = document.getElementById('apt-imp-msg');
  function setP(pct,txt){ prog.style.display='block'; bar.style.width=pct+'%'; msg.textContent=txt; }

  try {
    setP(5,'Lendo arquivo…');
    showToast('Importando…','info',60000);
    const XLSX = await loadXLSX();
    const buf  = await file.arrayBuffer();
    // SEM cellDates para evitar conversão errada no .xls
    const wb   = XLSX.read(buf,{type:'array'});
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const raw  = XLSX.utils.sheet_to_json(ws,{header:1,defval:null,raw:true});
    setP(15,'Parseando apontamentos…');

    const records=[]; let curCh=null, curNome=null;
    const reCracha = /^(\d{3,8})\s*-\s*(.+)/;
    const reData   = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
    // Número serial do Excel: 1 = 01/01/1900
    function serialToIso(n){
      const d = new Date(Date.UTC(1900,0,1)+(n-2)*86400000);
      return d.toISOString().slice(0,10);
    }
    function parseData(v){
      if(!v && v!==0) return null;
      if(typeof v==='number' && v>10000) return serialToIso(v);
      const s = String(v).trim();
      if(reData.test(s)){ const[d,m,y]=s.split('/'); return `${y.length===2?'20'+y:y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`; }
      return null;
    }
    function parseHora(v){
      if(!v && v!==0) return '';
      if(typeof v==='number'){ // fração de dia Excel
        const totalMin = Math.round(v*24*60);
        const h=Math.floor(totalMin/60), min=totalMin%60;
        return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
      }
      return String(v).trim();
    }
    function parseHH(v){
      if(!v && v!==0) return 0;
      if(typeof v==='number' && v<1) return parseFloat((v*24).toFixed(2)); // fração de dia
      return parseFloat(String(v).replace(',','.'))||0;
    }

    for(let i=0; i<raw.length; i++){
      const row=raw[i];
      const v0=row[0]!=null?String(row[0]).trim():'';
      const v1=row[1]!=null?String(row[1]).trim():'';
      if(v0==='Funcionário:'){ const m=reCracha.exec(v1); if(m){curCh=m[1].replace(/^0+/,'')||'0';curNome=m[2].trim();} continue; }
      const dataIso = parseData(row[0]);
      if(!dataIso||!curCh) continue;
      const nxt  = raw[i+1]||[];
      const os   = nxt[0]!=null?String(nxt[0]).trim():'';
      const desc = nxt[1]!=null?String(nxt[1]).trim().replace(/^\d+-\s*/,''):'';
      const ta   = v1;
      const hi   = parseHora(row[2]);
      const hf   = parseHora(row[3]);
      const ht   = parseHH(row[4]);
      if(!os||!hi) continue;
      records.push({data_apontamento:dataIso,os,desc_servico:desc||null,tipo_atividade:ta,hora_inicio:hi,hora_fim:hf,hh_total:ht,chapa:curCh,nome:curNome});
    }

    if(!records.length){ showToast('Nenhum registro encontrado. Verifique o arquivo.','erro'); prog.style.display='none'; return; }
    setP(30,`${records.length} apontamentos identificados. Enviando…`);

    const LOTE=200;
    for(let i=0;i<records.length;i+=LOTE){
      await sb('apontamentos',{
        method:'POST',
        prefer:'resolution=merge-duplicates,return=minimal',
        headers:{'Prefer':'resolution=merge-duplicates,return=minimal'},
        body:JSON.stringify(records.slice(i,i+LOTE)),
      });
      setP(30+Math.round((i/records.length)*65),`Enviando… ${Math.min(i+LOTE,records.length)}/${records.length}`);
    }
    setP(100,'Concluído!');
    showToast(`${records.length} apontamentos importados com sucesso.`,'ok');
    setTimeout(()=>carregarDados(), 800);
  } catch(e){
    showToast('Erro na importação: '+e.message,'erro');
    prog.style.display='none';
    console.error(e);
  }
}

async function loadXLSX(){
  if(window.XLSX) return window.XLSX;
  return new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload=()=>res(window.XLSX); s.onerror=()=>rej(new Error('Falha XLSX'));
    document.head.appendChild(s);
  });
}

/* ═══════════════════════════════════════════════════════════════
   MODAL JUSTIFICATIVA
   ═══════════════════════════════════════════════════════════════ */
function modalJustif(ch, nome, dias){
  abrirModal('Lançar justificativa',`
    <div style="display:flex;flex-direction:column;gap:14px">
      <div style="font-size:12px;background:var(--bg);border-radius:var(--radius-sm);padding:8px 10px"><strong>${nome}</strong> — ${dias.map(fmtDD_MM).join(', ')}</div>
      <div><label style="font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#9ca3af;display:block;margin-bottom:4px">Tipo</label>
        <select id="jt-tipo" style="width:100%;height:32px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card-bg);padding:0 8px;font-family:var(--font);font-size:12px">
          <option>Ausência de apontamento</option><option>Troca de folga</option>
        </select>
      </div>
      <div style="display:flex;gap:8px">
        <div style="flex:1"><label style="font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#9ca3af;display:block;margin-bottom:4px">Data início</label>
          <input type="date" id="jt-di" value="${dias[0]}" style="width:100%;height:32px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card-bg);padding:0 8px;font-family:var(--font);font-size:12px"></div>
        <div style="flex:1"><label style="font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#9ca3af;display:block;margin-bottom:4px">Data fim</label>
          <input type="date" id="jt-df" value="${dias[dias.length-1]}" style="width:100%;height:32px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card-bg);padding:0 8px;font-family:var(--font);font-size:12px"></div>
      </div>
      <div><label style="font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#9ca3af;display:block;margin-bottom:4px">Tratativa</label>
        <select id="jt-trat" style="width:100%;height:32px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card-bg);padding:0 8px;font-family:var(--font);font-size:12px">
          <option>Treinamento</option><option>Serviço externo</option>
        </select>
      </div>
      <div><label style="font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#9ca3af;display:block;margin-bottom:4px">Obs. (opcional)</label>
        <input type="text" id="jt-obs" placeholder="Ex: NR-10 turma junho…" style="width:100%;height:32px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card-bg);padding:0 8px;font-family:var(--font);font-size:12px">
      </div>
    </div>`,
    async()=>{
      await sb('apt_justificativas',{method:'POST',body:JSON.stringify({
        chapa:ch,nome,tipo:document.getElementById('jt-tipo').value,
        tratativa:document.getElementById('jt-trat').value,
        data_inicio:document.getElementById('jt-di').value,
        data_fim:document.getElementById('jt-df').value,
        obs:document.getElementById('jt-obs').value
      })});
      fecharModal(); showToast('Justificativa registrada.','ok'); carregarDados();
    },'Salvar');
}

/* ═══════════════════════════════════════════════════════════════
   ABA CADASTRO
   ═══════════════════════════════════════════════════════════════ */
function htmlCadastro(){
  return `
    <div class="card">
      <div style="display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:16px">
        <div id="cad-tab-c" class="apt-tab ${S.cadAba==='colab'?'on':''}">Colaboradores</div>
        <div id="cad-tab-j" class="apt-tab ${S.cadAba==='justif'?'on':''}">Justificativas e Trocas de Folga</div>
      </div>
      <div id="cad-body"></div>
    </div>`;
}
function bindCadastro(){
  document.getElementById('cad-tab-c').onclick=()=>{S.cadAba='colab'; renderCadBody();};
  document.getElementById('cad-tab-j').onclick=()=>{S.cadAba='justif'; renderCadBody();};
}
async function carregarCadastro(){
  try {
    const [cols,esp,jus] = await Promise.all([
      sb('apt_colaboradores?order=nome.asc'),
      sb('apt_especialidades?order=nome.asc').catch(()=>[]),
      sb('apt_justificativas?order=data_inicio.desc&limit=100').catch(()=>[]),
    ]);
    S.colaboradores=cols; S.especialidades=esp; S.justificativas=jus;
    renderCadBody();
  } catch(e){ document.getElementById('cad-body').innerHTML=`<p style="color:var(--red);font-size:12px">${e.message}</p>`; }
}
function renderCadBody(){
  document.getElementById('cad-tab-c').className='apt-tab'+(S.cadAba==='colab'?' on':'');
  document.getElementById('cad-tab-j').className='apt-tab'+(S.cadAba==='justif'?' on':'');
  if(S.cadAba==='colab') renderCadColab(); else renderCadJustif();
}

const lbl = txt => `<label style="font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#9ca3af;display:block;margin-bottom:4px">${txt}</label>`;
const sel  = (id,opts,val) => `<select id="${id}" style="width:100%;height:32px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card-bg);padding:0 8px;font-family:var(--font);font-size:12px">${opts.map(o=>`<option value="${o}" ${o===val?'selected':''}>${o||'Selecione…'}</option>`).join('')}</select>`;
const inp  = (id,val,ph,extra='') => `<input id="${id}" type="text" value="${val||''}" placeholder="${ph||''}" ${extra} style="width:100%;height:32px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card-bg);padding:0 8px;font-family:var(--font);font-size:12px">`;
const inpDate = (id,val) => `<input id="${id}" type="date" value="${val||''}" style="width:100%;height:32px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card-bg);padding:0 8px;font-family:var(--font);font-size:12px">`;

function renderCadColab(){
  document.getElementById('cad-body').innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div class="dd-btn" style="cursor:text;width:220px;padding:0">
        <i class="ti ti-search" style="margin-left:10px;color:var(--text-muted)"></i>
        <input id="cad-busca" type="text" placeholder="Buscar…" style="border:none;background:transparent;outline:none;font-family:var(--font);font-size:11px;flex:1;padding:0 8px;height:30px">
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button id="cad-imp" class="dd-action-btn secondary" style="height:30px;padding:0 12px;font-family:var(--font)"><i class="ti ti-download"></i> Importar da base</button>
        <button id="cad-esp-btn" class="dd-action-btn secondary" style="height:30px;padding:0 12px;font-family:var(--font)"><i class="ti ti-tag"></i> Especialidades</button>
        <button id="cad-novo" class="dd-action-btn primary" style="height:30px;padding:0 14px;font-family:var(--font)"><i class="ti ti-plus"></i> Novo colaborador</button>
      </div>
    </div>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr>${['Crachá','Nome','Modalidade','Especialidade','Escala','Turno','Ações'].map(h=>`<th style="text-align:left;padding:6px 10px;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#9ca3af;white-space:nowrap">${h}</th>`).join('')}</tr></thead>
        <tbody id="cad-tbody">
          ${S.colaboradores.length===0
            ? `<tr><td colspan="7" style="padding:24px;text-align:center;color:var(--text-muted)">Nenhum colaborador. Clique em <strong>Importar da base</strong>.</td></tr>`
            : S.colaboradores.map((c,i)=>{
                const esp=S.especialidades.find(e=>e.id===c.especialidade_id);
                return `<tr style="border-bottom:1px solid #f9fafb" data-i="${i}">
                  <td style="padding:6px 10px;color:var(--text-muted);font-size:11px">${c.cracha}</td>
                  <td style="padding:6px 10px;font-weight:500">${c.nome}</td>
                  <td style="padding:6px 10px">${c.modalidade?`<span style="background:#eff6ff;color:#1d4ed8;font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px">${c.modalidade}</span>`:'—'}</td>
                  <td style="padding:6px 10px;font-size:11px;color:var(--text-muted)">${esp?esp.nome:'—'}</td>
                  <td style="padding:6px 10px">${c.escala?`<span style="background:var(--bg);border:1px solid var(--border);font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px">${c.escala}</span>`:'—'}</td>
                  <td style="padding:6px 10px">${c.turno?`<span style="background:var(--bg);border:1px solid var(--border);font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px">${c.turno}</span>`:'—'}</td>
                  <td style="padding:6px 10px">
                    <div style="display:flex;gap:4px">
                      <button class="dd-action-btn secondary cad-edit" data-i="${i}" style="height:26px;width:26px;padding:0;font-family:var(--font)" title="Editar dados"><i class="ti ti-pencil"></i></button>
                      <button class="dd-action-btn secondary cad-escala" data-i="${i}" style="height:26px;width:26px;padding:0;font-family:var(--font)" title="Alterar escala"><i class="ti ti-calendar-event"></i></button>
                      <button class="dd-action-btn secondary cad-turno" data-i="${i}" style="height:26px;width:26px;padding:0;font-family:var(--font)" title="Alterar turno"><i class="ti ti-users-group"></i></button>
                      <button class="dd-action-btn secondary cad-justif" data-i="${i}" style="height:26px;width:26px;padding:0;font-family:var(--font)" title="Justificativa"><i class="ti ti-notes"></i></button>
                      <button class="dd-action-btn secondary cad-ferias" data-i="${i}" style="height:26px;width:26px;padding:0;font-family:var(--font)" title="Férias"><i class="ti ti-beach"></i></button>
                    </div>
                  </td>
                </tr>`;}).join('')}
        </tbody>
      </table>
    </div>`;

  document.getElementById('cad-busca').addEventListener('input',e=>{
    const q=e.target.value.toLowerCase();
    document.querySelectorAll('#cad-tbody tr[data-i]').forEach(tr=>{tr.style.display=tr.textContent.toLowerCase().includes(q)?'':'none';});
  });
  document.getElementById('cad-novo').onclick   = ()=>modalColab();
  document.getElementById('cad-esp-btn').onclick = ()=>modalEspecialidades();
  document.getElementById('cad-imp').onclick     = ()=>importarBase();
  document.querySelectorAll('.cad-edit').forEach(btn=>{  const c=S.colaboradores[+btn.dataset.i]; btn.onclick=()=>modalColab(c); });
  document.querySelectorAll('.cad-escala').forEach(btn=>{ const c=S.colaboradores[+btn.dataset.i]; btn.onclick=()=>modalEscala(c); });
  document.querySelectorAll('.cad-turno').forEach(btn=>{  const c=S.colaboradores[+btn.dataset.i]; btn.onclick=()=>modalTurno(c); });
  document.querySelectorAll('.cad-justif').forEach(btn=>{ const c=S.colaboradores[+btn.dataset.i]; btn.onclick=()=>modalJustif(c.cracha,c.nome,[hoje()]); });
  document.querySelectorAll('.cad-ferias').forEach(btn=>{ const c=S.colaboradores[+btn.dataset.i]; btn.onclick=()=>modalFerias(c); });
}

function renderCadJustif(){
  const todos=[...S.justificativas].sort((a,b)=>b.data_inicio<a.data_inicio?1:-1);
  document.getElementById('cad-body').innerHTML=`
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr>${['Data','Colaborador','Tipo','Tratativa','Obs.','Ações'].map(h=>`<th style="text-align:left;padding:6px 10px;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#9ca3af">${h}</th>`).join('')}</tr></thead>
        <tbody>
          ${todos.length===0?`<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--text-muted)">Nenhuma justificativa.</td></tr>`
          :todos.map(j=>`<tr style="border-bottom:1px solid #f9fafb">
              <td style="padding:6px 10px;white-space:nowrap">${fmtDD_MM(j.data_inicio)}${j.data_fim!==j.data_inicio?' – '+fmtDD_MM(j.data_fim):''}</td>
              <td style="padding:6px 10px">${j.nome||j.chapa}</td>
              <td style="padding:6px 10px"><span style="background:${j.tipo.includes('Aus')?'var(--red-l)':'var(--green-l)'};color:${j.tipo.includes('Aus')?'var(--red)':'var(--green)'};font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px">${j.tipo}</span></td>
              <td style="padding:6px 10px;font-size:11px">${j.tratativa||'—'}</td>
              <td style="padding:6px 10px;font-size:11px;color:var(--text-muted)">${j.obs||'—'}</td>
              <td style="padding:6px 10px"><button class="dd-action-btn secondary" style="height:26px;width:26px;padding:0;font-family:var(--font)"><i class="ti ti-pencil"></i></button></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

/* ── Modal Colaborador ── */
function modalColab(c=null){
  const edit=!!c;
  const espOpts=[{id:'',nome:'Selecione…'},...S.especialidades];
  abrirModal(edit?'Editar colaborador':'Novo colaborador',`
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;gap:8px">
        <div style="max-width:110px"><div>${lbl('Crachá')}</div>${inp('nc-cr',c?.cracha,'',edit?'readonly':'')}</div>
        <div style="flex:1"><div>${lbl('Nome completo')}</div>${inp('nc-nm',c?.nome,'Nome')}</div>
      </div>
      <div style="display:flex;gap:8px">
        <div style="flex:1"><div>${lbl('Modalidade')}</div>${sel('nc-mod',['','...MODALIDADES...'],c?.modalidade)}</div>
        <div style="flex:1"><div>${lbl('Especialidade')}</div>
          <select id="nc-esp" style="width:100%;height:32px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card-bg);padding:0 8px;font-family:var(--font);font-size:12px">
            ${espOpts.map(e=>`<option value="${e.id||''}" ${c?.especialidade_id===e.id?'selected':''}>${e.nome}</option>`).join('')}
          </select>
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <div style="flex:1"><div>${lbl('Escala')}</div>${sel('nc-esc',['',...ESCALAS],c?.escala)}</div>
        <div style="flex:1"><div>${lbl('Turno')}</div>${sel('nc-tur',['',...TURNOS],c?.turno)}</div>
        <div style="flex:1" id="nc-pfwrap"><div>${lbl('1ª folga')}</div>${inpDate('nc-pf',c?.primeira_folga)}</div>
      </div>
    </div>`,
    async()=>{
      const dados={cracha:document.getElementById('nc-cr').value.trim(),nome:document.getElementById('nc-nm').value.trim(),
        modalidade:document.getElementById('nc-mod').value||null,
        especialidade_id:document.getElementById('nc-esp').value||null,
        escala:document.getElementById('nc-esc').value||null,
        turno:document.getElementById('nc-tur').value||null,
        primeira_folga:document.getElementById('nc-pf').value||null};
      if(!dados.cracha||!dados.nome){showToast('Crachá e nome são obrigatórios.','erro');return;}
      if(edit) await sb(`apt_colaboradores?cracha=eq.${c.cracha}`,{method:'PATCH',body:JSON.stringify(dados)});
      else     await sb('apt_colaboradores',{method:'POST',body:JSON.stringify(dados)});
      fecharModal(); showToast('Salvo!','ok'); carregarCadastro();
    },'Salvar');
  // Preencher select de modalidade
  const modSel=document.getElementById('nc-mod');
  modSel.innerHTML=`<option value="">Selecione…</option>`+MODALIDADES.map(m=>`<option value="${m}" ${c?.modalidade===m?'selected':''}>${m}</option>`).join('');
  // Toggle 1ª folga se ADM
  setTimeout(()=>{
    const esc=document.getElementById('nc-esc'), pfw=document.getElementById('nc-pfwrap');
    const tog=()=>{pfw.style.display=esc.value==='ADM'?'none':'block';};
    esc.addEventListener('change',tog); tog();
  },50);
}

/* ── Modal Escala ── */
function modalEscala(c){
  abrirModal('Alterar escala — '+c.nome.split(' ')[0],`
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="font-size:11px;background:var(--bg);border-radius:var(--radius-sm);padding:8px 10px;color:var(--text-muted)">
        Escala atual: <strong style="color:#374151">${c.escala||'—'}</strong>${c.primeira_folga?' · 1ª folga: '+fmtFull(c.primeira_folga):''}
      </div>
      <div style="display:flex;gap:8px">
        <div style="flex:1"><div>${lbl('Nova escala')}</div>${sel('es-nova',ESCALAS,c.escala)}</div>
        <div style="flex:1"><div>${lbl('Vigência a partir de')}</div>${inpDate('es-vig',hoje())}</div>
      </div>
      <div style="display:flex;gap:8px">
        <div style="flex:1"><div>${lbl('Folga de transição?')}</div>
          <select id="es-trans" style="width:100%;height:32px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card-bg);padding:0 8px;font-family:var(--font);font-size:12px">
            <option value="">Não</option><option value="sim">Sim</option>
          </select>
        </div>
        <div style="flex:1" id="es-tdwrap" style="display:none"><div>${lbl('Data transição')}</div>${inpDate('es-td','')}</div>
      </div>
      <div id="es-pfwrap"><div>${lbl('1ª folga nova escala')}</div>${inpDate('es-pf','')}</div>
      <div id="es-prev" style="display:none;font-size:10px;color:var(--green);background:var(--green-l);border-radius:var(--radius-sm);padding:6px 10px"></div>
    </div>`,
    async()=>{
      const nova=document.getElementById('es-nova').value, vig=document.getElementById('es-vig').value;
      const trans=document.getElementById('es-trans').value, td=document.getElementById('es-td').value;
      const pf=document.getElementById('es-pf').value;
      await sb('apt_historico_escalas',{method:'POST',body:JSON.stringify({chapa:c.cracha,escala_anterior:c.escala,escala_nova:nova,vigencia_inicio:vig,folga_transicao:trans==='sim'?td:null,primeira_folga_nova:pf||null})});
      await sb(`apt_colaboradores?cracha=eq.${c.cracha}`,{method:'PATCH',body:JSON.stringify({escala:nova,primeira_folga:pf||null})});
      fecharModal(); showToast('Escala atualizada!','ok'); carregarCadastro();
    },'Salvar alteração');
  setTimeout(()=>{
    const trans=document.getElementById('es-trans'), tdw=document.getElementById('es-tdwrap');
    const nova=document.getElementById('es-nova'), pfw=document.getElementById('es-pfwrap');
    const pfinp=document.getElementById('es-pf'), prev=document.getElementById('es-prev');
    trans.addEventListener('change',()=>{tdw.style.display=trans.value==='sim'?'block':'none';});
    nova.addEventListener('change',()=>{pfw.style.display=nova.value==='ADM'?'none':'block'; upPrev();});
    pfinp.addEventListener('change',upPrev);
    function upPrev(){
      const e=nova.value,p=pfinp.value;
      if(!p||e==='ADM'){prev.style.display='none';return;}
      const f=[]; let cur=p;
      for(let i=0;i<6;i++){f.push(fmtFull(cur));cur=addDays(cur,e==='5x1'?6:7);}
      prev.style.display='block'; prev.textContent='Projeção: '+f.join(' · ')+' · …';
    }
  },50);
}

/* ── Modal Turno ── */
function modalTurno(c){
  abrirModal('Alterar turno — '+c.nome.split(' ')[0],`
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="font-size:11px;background:var(--bg);border-radius:var(--radius-sm);padding:8px 10px;color:var(--text-muted)">
        Turno atual: <strong style="color:#374151">${c.turno||'—'}</strong>
      </div>
      <div style="display:flex;gap:8px">
        <div style="flex:1"><div>${lbl('Novo turno')}</div>${sel('tur-novo',TURNOS,c.turno)}</div>
        <div style="flex:1"><div>${lbl('Vigência a partir de')}</div>${inpDate('tur-vig',hoje())}</div>
      </div>
      <div><div>${lbl('Obs. (opcional)')}</div>${inp('tur-obs','','Ex: transferido do turno A…')}</div>
    </div>`,
    async()=>{
      const novo=document.getElementById('tur-novo').value, vig=document.getElementById('tur-vig').value;
      const obs=document.getElementById('tur-obs').value;
      await sb('apt_historico_turnos',{method:'POST',body:JSON.stringify({chapa:c.cracha,turno_anterior:c.turno,turno_novo:novo,vigencia_inicio:vig,obs:obs||null})});
      await sb(`apt_colaboradores?cracha=eq.${c.cracha}`,{method:'PATCH',body:JSON.stringify({turno:novo})});
      fecharModal(); showToast('Turno atualizado!','ok'); carregarCadastro();
    },'Salvar alteração');
}

/* ── Modal Férias ── */
function modalFerias(c){
  abrirModal('Lançar férias — '+c.nome.split(' ')[0],`
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;gap:8px">
        <div style="flex:1"><div>${lbl('Início')}</div>${inpDate('fer-ini',hoje())}</div>
        <div style="flex:1"><div>${lbl('Duração (dias)')}</div><input id="fer-dias" type="number" value="30" min="1" max="90" style="width:100%;height:32px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card-bg);padding:0 8px;font-family:var(--font);font-size:12px"></div>
      </div>
      <div><div>${lbl('Venda de dias?')}</div>
        <select id="fer-venda" style="width:100%;height:32px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card-bg);padding:0 8px;font-family:var(--font);font-size:12px">
          <option value="0">Não</option><option value="10">Sim — 10 dias</option><option value="custom">Personalizado</option>
        </select>
      </div>
      <div id="fer-vcw" style="display:none"><div>${lbl('Dias a vender')}</div><input id="fer-vc" type="number" value="10" min="1" max="30" style="width:120px;height:32px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card-bg);padding:0 8px;font-family:var(--font);font-size:12px"></div>
      <div id="fer-prev" style="font-size:11px;color:var(--green);background:var(--green-l);border-radius:var(--radius-sm);padding:6px 10px;display:none"></div>
    </div>`,
    async()=>{
      const ini=document.getElementById('fer-ini').value, dias=parseInt(document.getElementById('fer-dias').value)||30;
      const vo=document.getElementById('fer-venda').value, vd=vo==='custom'?parseInt(document.getElementById('fer-vc').value)||0:parseInt(vo)||0;
      await sb('apt_ferias',{method:'POST',body:JSON.stringify({chapa:c.cracha,nome:c.nome,data_inicio:ini,data_fim:addDays(ini,dias-1),dias_totais:dias,dias_vendidos:vd})});
      fecharModal(); showToast('Férias registradas!','ok'); carregarCadastro();
    },'Salvar férias');
  setTimeout(()=>{
    const ini=document.getElementById('fer-ini'),dias=document.getElementById('fer-dias');
    const vend=document.getElementById('fer-venda'),vcw=document.getElementById('fer-vcw'),prev=document.getElementById('fer-prev');
    vend.addEventListener('change',()=>{vcw.style.display=vend.value==='custom'?'block':'none';upP();});
    ini.addEventListener('change',upP); dias.addEventListener('input',upP);
    function upP(){const i=ini.value,d=parseInt(dias.value)||30;if(!i)return;prev.style.display='block';prev.textContent=`${fmtFull(i)} até ${fmtFull(addDays(i,d-1))} (${d} dias)`;}
    upP();
  },50);
}

/* ── Modal Especialidades ── */
function modalEspecialidades(){
  function lista(specs){
    return specs.length===0
      ? `<tr><td colspan="3" style="padding:12px;text-align:center;color:var(--text-muted);font-size:11px">Nenhuma especialidade.</td></tr>`
      : specs.map(e=>`<tr style="border-bottom:1px solid #f9fafb" id="esp-r-${e.id}">
          <td id="esp-cell-${e.id}" style="padding:5px 8px;font-size:12px">${e.nome}</td>
          <td style="padding:5px 4px;width:28px"><button class="dd-action-btn secondary esp-ed" data-id="${e.id}" data-nome="${e.nome}" style="height:26px;width:26px;padding:0;font-family:var(--font)"><i class="ti ti-pencil"></i></button></td>
          <td style="padding:5px 4px;width:28px"><button class="dd-action-btn secondary esp-del" data-id="${e.id}" style="height:26px;width:26px;padding:0;font-family:var(--font);color:var(--red)"><i class="ti ti-trash"></i></button></td>
        </tr>`).join('');
  }
  abrirModal('Gerenciar especialidades',`
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="overflow-y:auto;max-height:200px;border:1px solid var(--border);border-radius:var(--radius-sm)">
        <table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:5px 8px;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#9ca3af">Especialidade</th><th></th><th></th></tr></thead>
        <tbody id="esp-lista">${lista(S.especialidades)}</tbody></table>
      </div>
      <div style="display:flex;gap:8px">
        <input id="esp-nova" type="text" placeholder="Nova especialidade…" style="flex:1;height:32px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card-bg);padding:0 8px;font-family:var(--font);font-size:12px">
        <button id="esp-add" class="dd-action-btn primary" style="height:32px;padding:0 14px;font-family:var(--font)"><i class="ti ti-plus"></i> Adicionar</button>
      </div>
    </div>`);
  function bindEsp(){
    document.getElementById('esp-add').onclick=async()=>{
      const n=document.getElementById('esp-nova').value.trim(); if(!n)return;
      await sb('apt_especialidades',{method:'POST',body:JSON.stringify({nome:n})});
      S.especialidades=await sb('apt_especialidades?order=nome.asc');
      document.getElementById('esp-lista').innerHTML=lista(S.especialidades);
      document.getElementById('esp-nova').value=''; bindEsp();
    };
    document.querySelectorAll('.esp-ed').forEach(btn=>btn.addEventListener('click',()=>{
      const id=btn.dataset.id, cel=document.getElementById(`esp-cell-${id}`);
      cel.innerHTML=`<input id="esp-ei-${id}" style="width:100%;height:26px;border:1px solid var(--border);border-radius:var(--radius-sm);padding:0 6px;font-family:var(--font);font-size:11px" value="${btn.dataset.nome}">`;
      btn.innerHTML='<i class="ti ti-check"></i>';
      btn.onclick=async()=>{
        const nn=document.getElementById(`esp-ei-${id}`).value.trim(); if(!nn)return;
        await sb(`apt_especialidades?id=eq.${id}`,{method:'PATCH',body:JSON.stringify({nome:nn})});
        S.especialidades=await sb('apt_especialidades?order=nome.asc');
        document.getElementById('esp-lista').innerHTML=lista(S.especialidades); bindEsp();
      };
    }));
    document.querySelectorAll('.esp-del').forEach(btn=>btn.addEventListener('click',async()=>{
      if(!confirm('Remover especialidade?'))return;
      await sb(`apt_especialidades?id=eq.${btn.dataset.id}`,{method:'DELETE'});
      S.especialidades=S.especialidades.filter(e=>String(e.id)!==btn.dataset.id);
      document.getElementById('esp-lista').innerHTML=lista(S.especialidades); bindEsp();
    }));
  }
  setTimeout(bindEsp,50);
}

async function importarBase(){
  try {
    const apts=await sb('apontamentos?select=chapa,nome&order=nome.asc');
    const mapa={}; apts.forEach(a=>{if(a.chapa&&!mapa[a.chapa])mapa[a.chapa]=a.nome;});
    const novos=Object.entries(mapa).filter(([ch])=>!S.colaboradores.find(c=>String(c.cracha)===String(ch)));
    if(!novos.length){showToast('Todos os colaboradores já estão cadastrados.','info');return;}
    if(!confirm(`Importar ${novos.length} colaboradores novos?`))return;
    await sb('apt_colaboradores',{method:'POST',body:JSON.stringify(novos.map(([ch,nome])=>({cracha:ch,nome})))});
    showToast(`${novos.length} importados. Complete modalidade, escala e turno.`,'ok');
    await carregarCadastro();
  } catch(e){showToast('Erro: '+e.message,'erro');}
}

/* ═══════════════════════════════════════════════════════════════
   MODAL GENÉRICO
   ═══════════════════════════════════════════════════════════════ */
function abrirModal(titulo, html, onOk=null, btnLabel='Confirmar'){
  fecharModal();
  const ov=document.createElement('div');
  ov.id='apt-modal-ov';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px';
  ov.innerHTML=`
    <div style="background:var(--card-bg);border-radius:var(--radius);padding:24px;width:100%;max-width:500px;max-height:90vh;overflow-y:auto;box-shadow:var(--shadow-md);font-family:var(--font)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
        <div style="font-size:14px;font-weight:700;color:#111">${titulo}</div>
        <button id="apt-modal-x" class="dd-action-btn secondary" style="height:28px;width:28px;padding:0;font-family:var(--font)"><i class="ti ti-x"></i></button>
      </div>
      <div id="apt-modal-body">${html}</div>
      ${onOk?`<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:20px;padding-top:14px;border-top:1px solid var(--border)">
        <button id="apt-modal-cancel" class="dd-action-btn secondary" style="height:30px;padding:0 14px;font-family:var(--font)">Cancelar</button>
        <button id="apt-modal-ok" class="dd-action-btn primary" style="height:30px;padding:0 16px;font-family:var(--font)">${btnLabel}</button>
      </div>`:''}
    </div>`;
  document.body.appendChild(ov);
  document.getElementById('apt-modal-x').onclick=fecharModal;
  document.getElementById('apt-modal-cancel')?.addEventListener('click',fecharModal);
  document.getElementById('apt-modal-ok')?.addEventListener('click',onOk);
  ov.addEventListener('click',e=>{if(e.target===ov)fecharModal();});
}
function fecharModal(){ document.getElementById('apt-modal-ov')?.remove(); }

/* ═══════════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════════ */
async function init(){
  await carregarColabs();
  render();
}
if(!window.Modulos) window.Modulos={};
window.Modulos['apontamentos']={init};
init();

})();
