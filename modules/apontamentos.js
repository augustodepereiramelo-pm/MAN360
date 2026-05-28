/* ═══════════════════════════════════════════════════════════════
   MAN360 — Módulo Apontamentos  v5
   ═══════════════════════════════════════════════════════════════ */
(() => {

/* ── Config — lido de forma lazy para garantir que MAN360_CONFIG existe ── */
const SB_URL = () => MAN360_CONFIG.supabase.url;
const SB_KEY = () => MAN360_CONFIG.supabase.key;
const META   = 0.75;  // 75% meta de aderência

const SEM_ANCORA  = 9;
const DATA_ANCORA = '2026-05-25';
const SAFRA_ATUAL = '2026/27';
const SAFRAS      = ['2024/25','2025/26','2026/27'];
const MODALIDADES = ['MEC','CAL','ELE','CIV','INS','AUT','ISP'];

/* ── Helpers de data ────────────────────────────────────────── */
function addDays(iso,n){ const d=new Date(iso+'T00:00:00'); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }
const hoje    = () => new Date().toISOString().slice(0,10);
const amanha  = () => addDays(hoje(),1);
const fmtDM   = iso => { const[,m,d]=iso.split('-'); return `${d}/${m}`; };
const fmtFull = iso => { const[y,m,d]=iso.split('-'); return `${d}/${m}/${y}`; };
const diaSem  = iso => ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][new Date(iso+'T00:00:00').getDay()];
const diaSemN = iso => new Date(iso+'T00:00:00').getDay();
function diasEntre(a,b){ const r=[]; let c=a; while(c<=b){r.push(c);c=addDays(c,1);} return r; }
function semParaDatas(s){ const i=addDays(DATA_ANCORA,(s-SEM_ANCORA)*7); return {ini:i,fim:addDays(i,6)}; }
function semAtual(){ const ms0=new Date(DATA_ANCORA+'T00:00:00').getTime(),ms1=new Date(hoje()+'T00:00:00').getTime(); return SEM_ANCORA+Math.floor((ms1-ms0)/604800000); }

/* ── HH esperado pelo turno e dia ── */
function calcHH(entrada,saida,intervalo){
  const [eh,em]=entrada.split(':').map(Number);
  const [sh,sm]=saida.split(':').map(Number);
  let mins=(sh*60+sm)-(eh*60+em);
  if(mins<=0) mins+=1440; // turno C cruza meia-noite
  return Math.round((mins-intervalo)/60*100)/100;
}
function hhTurno(turno,iso){
  if(!turno) return 8;
  if(turno.nome==='ADM'){
    const dw=diaSemN(iso);
    if(dw===0||dw===6) return 0;
    if(dw===5&&turno.saida_sexta) return calcHH(turno.hora_entrada,turno.saida_sexta,turno.intervalo_min);
    return calcHH(turno.hora_entrada,turno.hora_saida,turno.intervalo_min);
  }
  return calcHH(turno.hora_entrada,turno.hora_saida,turno.intervalo_min);
}

/* ── Folgas (baseado na escala = ciclo) ── */
function gerarFolgas(escala,turno,pf,refPassada,dataIni,dataFim){
  if(!escala) return new Set();
  if(escala.tipo_ciclo==='ADM'||turno?.nome==='ADM'){
    const s=new Set(); let c=dataIni;
    while(c<=dataFim){ const dw=diaSemN(c); if(dw===0||dw===6) s.add(c); c=addDays(c,1); }
    return s;
  }
  if(!pf&&!refPassada) return new Set();
  const ciclo=(escala.dias_trabalho||5)+1;
  const ancora=refPassada||pf;
  const s=new Set();
  let c=ancora;
  while(c<=dataFim){ s.add(c); c=addDays(c,ciclo); }
  c=addDays(ancora,-ciclo);
  while(c>=dataIni){ s.add(c); c=addDays(c,-ciclo); }
  return s;
}

/* ── Supabase ───────────────────────────────────────────────── */
async function sb(path,opts={}){
  const url=SB_URL(), key=SB_KEY();
  const pref=opts.prefer||(opts.method==='DELETE'?'return=minimal':'return=representation');
  const res=await fetch(`${url}/rest/v1/${path}`,{
    headers:{'apikey':key,'Authorization':`Bearer ${key}`,'Content-Type':'application/json','Prefer':pref,...(opts.headers||{})},
    ...opts
  });
  if(!res.ok) throw new Error(`SB ${res.status}: ${await res.text()}`);
  return res.status===204?[]:res.json();
}

/* ── Estado ─────────────────────────────────────────────────── */
const semI=semAtual();
const semAnterior=semI-1;
const {ini:dI,fim:dF}=(() => {
  const ini=semParaDatas(semAnterior).ini;
  const fim=semParaDatas(semI).fim;
  return {ini,fim};
})();

const S={
  safra:SAFRA_ATUAL,
  semanas:[semAnterior,semI],  // múltiplas semanas
  periodoTipo:'semana',
  dataIni:dI, dataFim:dF,
  modalidades:[...MODALIDADES], colabChapa:null,
  apontamentos:[], colaboradores:[], escalas:[], turnos:[],
  especialidades:[], justificativas:[], ferias:[],
  hmPag:0, tabelaAberta:false, pontosAberto:false,
  aba:'principal', cadAba:'colab',
};

/* ═══════════════════════════════════════════════════════════════
   CSS
   ═══════════════════════════════════════════════════════════════ */
function injetarCSS(){
  if(document.getElementById('apt-css')) return;
  const s=document.createElement('style'); s.id='apt-css';
  s.textContent=`
    .apt-tab{padding:8px 16px;font-size:12px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;color:#6b7280;transition:all .15s;display:inline-flex;align-items:center;gap:6px;letter-spacing:.02em;white-space:nowrap}
    .apt-tab.on{color:var(--yellow);border-bottom-color:var(--yellow)}
    .apt-hm-cell{height:26px;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;cursor:pointer;transition:opacity .1s;border:1px solid rgba(0,0,0,.07)}
    .apt-hm-cell:hover{opacity:.8;transform:scale(1.08)}
    .apt-turno-hdr{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#4b5563;padding:10px 0 4px;display:flex;align-items:center;gap:8px;grid-column:1/-1}
    .apt-turno-hdr::after{content:'';flex:1;height:1px;background:var(--border)}
    .apt-incompleto{font-size:9px;font-weight:700;background:#fef3c7;color:#92400e;padding:2px 7px;border-radius:10px;letter-spacing:.04em}
    .apt-attn-row{display:flex;align-items:flex-start;gap:8px;padding:7px 0;border-bottom:1px solid #f3f4f6;font-size:12px}
    .apt-attn-row:last-child{border-bottom:none}
    .apt-input{width:100%;height:32px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card-bg);padding:0 10px;font-family:var(--font);font-size:12px;outline:none;transition:border-color .15s}
    .apt-input:focus{border-color:var(--yellow);box-shadow:0 0 0 2px rgba(248,193,0,.15)}
    .apt-select{width:100%;height:32px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card-bg);padding:0 8px;font-family:var(--font);font-size:12px;outline:none;cursor:pointer}
    .apt-select:focus{border-color:var(--yellow)}
    .apt-field{display:flex;flex-direction:column;gap:4px;flex:1;min-width:100px}
    .apt-row{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px}
    .apt-icon-btn{height:26px;width:26px;padding:0;font-family:var(--font);border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card-bg);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;color:#6b7280;font-size:13px;transition:background .15s}
    .apt-icon-btn:hover{background:var(--bg)}
    .apt-sem-cb:checked+label{background:#fffbeb;border-color:var(--yellow);color:#92400e;font-weight:600}
    @media(max-width:768px){
      .apt-filters-grid{flex-direction:column!important}
      .metrics-row{grid-template-columns:1fr 1fr!important}
      .apt-hm-cell{height:22px;font-size:8px}
    }
  `;
  document.head.appendChild(s);
}

/* ═══════════════════════════════════════════════════════════════
   RENDER RAIZ
   ═══════════════════════════════════════════════════════════════ */
function render(){
  injetarCSS();
  document.getElementById('module-container').innerHTML=`
    <div id="apt-root">
      <div style="display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:16px;overflow-x:auto">
        <div id="apt-tab-p" class="apt-tab on"><i class="ti ti-clock-record"></i> Apontamentos</div>
        <div id="apt-tab-c" class="apt-tab"><i class="ti ti-users"></i> Cadastro e Gestão</div>
      </div>
      <div id="apt-content"></div>
    </div>`;
  document.getElementById('apt-tab-p').onclick=()=>setAba('principal');
  document.getElementById('apt-tab-c').onclick=()=>setAba('cadastro');
  renderContent(); // async — bind acontece dentro após HTML montado
}

function setAba(a){
  S.aba=a;
  document.getElementById('apt-tab-p').className='apt-tab'+(a==='principal'?' on':'');
  document.getElementById('apt-tab-c').className='apt-tab'+(a==='cadastro'?' on':'');
  renderContent();
}

async function renderContent(){
  const el=document.getElementById('apt-content');
  if(!el) return;
  if(S.aba==='principal'){
    // 1. Montar HTML imediatamente — sem await para não bloquear
    el.innerHTML=htmlFiltros()+`
      <div id="apt-metricas" class="metrics-row" style="margin-bottom:12px"></div>
      <div id="apt-quadro" style="margin-bottom:12px"></div>
      <div id="apt-pontos" style="margin-bottom:12px"></div>
      <div id="apt-heatmap" class="card" style="margin-bottom:12px;display:none"></div>
      <div id="apt-tabela" class="card" style="margin-bottom:12px;display:none"></div>
      <div id="apt-importar">${htmlImportador()}</div>`;
    // 2. Bind imediatamente — DOM já existe
    bindFiltros();
    bindImportador();
    // 3. Carregar dados em background
    Promise.all([carregarColabs(),carregarEscalas(),carregarTurnos()]).then(()=>carregarDados());
  } else {
    await Promise.all([carregarColabs(),carregarEscalas(),carregarTurnos()]);
    el.innerHTML=htmlCadastro();
    bindCadastro();
    carregarCadastro();
  }
}

/* ═══════════════════════════════════════════════════════════════
   FILTROS
   ═══════════════════════════════════════════════════════════════ */
function recalcPeriodo(){
  if(S.semanas.length===0) return;
  const sorted=[...S.semanas].sort((a,b)=>a-b);
  S.dataIni=semParaDatas(sorted[0]).ini;
  S.dataFim=semParaDatas(sorted[sorted.length-1]).fim;
}

function htmlFiltros(){
  const semFim=semAtual()+8;
  let semItems='';
  for(let s=Math.max(1,semAtual()-7);s<=semFim;s++){
    const {ini,fim}=semParaDatas(s);
    const isAt=s===semAtual(),isSel=S.semanas.includes(s);
    semItems+=`<div class="dd-item"><label style="display:flex;align-items:center;gap:8px;cursor:pointer;width:100%">
      <input type="checkbox" class="apt-sem-cb" value="${s}" ${isSel?'checked':''} style="accent-color:var(--yellow)">
      ${isAt?'<strong>':''}Sem ${s}${isAt?' ★':''} · ${fmtDM(ini)}–${fmtDM(fim)}${isAt?'</strong>':''}
    </label></div>`;
  }
  function semLbl(){
    if(!S.semanas.length) return 'Nenhuma';
    const sorted=[...S.semanas].sort((a,b)=>a-b);
    if(sorted.length===1){const{ini,fim}=semParaDatas(sorted[0]);return `Sem ${sorted[0]} · ${fmtDM(ini)}–${fmtDM(fim)}`;}
    return `Sem ${sorted[0]}–${sorted[sorted.length-1]} (${sorted.length})`;
  }
  const modLbl=S.modalidades.length===MODALIDADES.length?'Todas':S.modalidades.length===0?'Nenhuma':S.modalidades.join(', ');

  return `
  <div class="filters-bar" style="margin-bottom:16px">
    <span class="filter-label">Safra</span>
    <div class="dd-wrap">
      <button class="dd-btn" onclick="toggleDD('dd-safra')">
        <i class="ti ti-calendar"></i>
        <span class="dd-label" id="lbl-safra">${S.safra}</span>
        <i class="ti ti-chevron-down dd-arrow"></i>
      </button>
      <div class="dd-panel" id="dd-safra">
        ${SAFRAS.map(s=>`<div class="dd-item apt-safra-item" data-val="${s}">${s===S.safra?'<i class="ti ti-check" style="color:var(--yellow)"></i>':''} ${s}</div>`).join('')}
      </div>
    </div>

    <span class="filter-label">Semanas</span>
    <div class="dd-wrap">
      <button class="dd-btn" onclick="toggleDD('dd-sem')" style="min-width:180px">
        <i class="ti ti-calendar-week"></i>
        <span class="dd-label" id="lbl-sem">${semLbl()}</span>
        <i class="ti ti-chevron-down dd-arrow"></i>
      </button>
      <div class="dd-panel" id="dd-sem" style="max-height:280px;overflow-y:auto;min-width:240px">
        <div class="dd-actions">
          <button class="dd-action-btn primary" id="apt-sem-ultimas">Últimas 2</button>
          <button class="dd-action-btn secondary" id="apt-sem-limpar">Limpar</button>
        </div>
        ${semItems}
      </div>
    </div>

    <span class="filter-label">ou</span>
    <input type="date" id="apt-di" value="${S.dataIni}" class="dd-btn" style="cursor:text;font-family:var(--font);font-size:11px;width:120px">
    <span style="color:var(--text-muted);font-size:12px">→</span>
    <input type="date" id="apt-df" value="${S.dataFim}" class="dd-btn" style="cursor:text;font-family:var(--font);font-size:11px;width:120px">

    <span class="filter-label">Modalidade</span>
    <div class="dd-wrap">
      <button class="dd-btn" onclick="toggleDD('dd-mod')" style="min-width:100px">
        <i class="ti ti-tag"></i>
        <span class="dd-label" id="lbl-mod">${modLbl}</span>
        <i class="ti ti-chevron-down dd-arrow"></i>
      </button>
      <div class="dd-panel" id="dd-mod">
        <div class="dd-actions">
          <button class="dd-action-btn primary" id="apt-mod-todas">Todas</button>
          <button class="dd-action-btn secondary" id="apt-mod-nenhuma">Nenhuma</button>
        </div>
        ${MODALIDADES.map(m=>`<div class="dd-item"><label style="display:flex;align-items:center;gap:8px;cursor:pointer;width:100%">
          <input type="checkbox" class="apt-mod-cb" value="${m}" ${S.modalidades.includes(m)?'checked':''} style="accent-color:var(--yellow)"> ${m}
        </label></div>`).join('')}
      </div>
    </div>

    <span class="filter-label">Colaborador</span>
    <div style="position:relative">
      <div class="dd-btn" style="cursor:text;min-width:200px;padding:0;gap:0">
        <i class="ti ti-search" style="padding:0 8px;color:var(--text-muted)"></i>
        <input type="text" id="apt-colab" placeholder="Nome ou crachá…"
          style="border:none;background:transparent;outline:none;font-family:var(--font);font-size:11px;color:#374151;flex:1;height:30px;padding-right:8px">
      </div>
      <div id="apt-colab-drop" style="display:none;position:absolute;top:calc(100% + 4px);left:0;min-width:280px;background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow-md);z-index:300;max-height:200px;overflow-y:auto"></div>
    </div>

    <button id="apt-btn-filtrar" class="topbar-btn" style="background:var(--yellow);color:var(--dark1);border:none;height:30px;padding:0 12px;font-family:var(--font);font-size:11px;font-weight:600;border-radius:var(--radius-sm);cursor:pointer;display:inline-flex;align-items:center;gap:5px">
      <i class="ti ti-search"></i> Filtrar
    </button>
    <button id="apt-btn-limpar" class="topbar-btn" style="height:30px;padding:0 10px;font-family:var(--font);font-size:11px;border-radius:var(--radius-sm);cursor:pointer;display:inline-flex;align-items:center;gap:4px;background:transparent;border:1px solid var(--border);color:var(--text)">
      <i class="ti ti-x"></i> Limpar
    </button>
  </div>`;}


function atualizarLblSem(){
  const el=document.getElementById('lbl-sem'); if(!el) return;
  if(!S.semanas.length){el.textContent='Nenhuma';return;}
  const sorted=[...S.semanas].sort((a,b)=>a-b);
  if(sorted.length===1){const{ini,fim}=semParaDatas(sorted[0]);el.textContent=`Sem ${sorted[0]} · ${fmtDM(ini)}–${fmtDM(fim)}`;return;}
  el.textContent=`Sem ${sorted[0]}–${sorted[sorted.length-1]} (${sorted.length} semanas)`;
}

function bindFiltros(){
  // Safra
  document.querySelectorAll('.apt-safra-item').forEach(el=>el.addEventListener('click',()=>{
    S.safra=el.dataset.val;
    document.getElementById('lbl-safra').textContent=S.safra;
    document.getElementById('dd-safra').classList.remove('show');
  }));

  // Semanas — dropdown com checkboxes
  document.getElementById('dd-sem').addEventListener('change',e=>{
    if(!e.target.classList.contains('apt-sem-cb')) return;
    const s=parseInt(e.target.value);
    if(e.target.checked){ if(!S.semanas.includes(s)) S.semanas.push(s); }
    else S.semanas=S.semanas.filter(x=>x!==s);
    recalcPeriodo(); atualizarLblSem();
  });
  document.getElementById('apt-sem-ultimas').addEventListener('click',()=>{
    const s1=semAtual()-1, s2=semAtual();
    S.semanas=[s1,s2]; recalcPeriodo();
    document.querySelectorAll('.apt-sem-cb').forEach(cb=>{
      const v=parseInt(cb.value); cb.checked=v===s1||v===s2;
    });
    atualizarLblSem();
    document.getElementById('dd-sem').classList.remove('show');
  });
  document.getElementById('apt-sem-limpar').addEventListener('click',()=>{
    S.semanas=[]; recalcPeriodo();
    document.querySelectorAll('.apt-sem-cb').forEach(cb=>cb.checked=false);
    atualizarLblSem();
  });

  // Modalidade
  document.getElementById('apt-mod-todas').addEventListener('click',()=>{
    S.modalidades=[...MODALIDADES];
    document.querySelectorAll('.apt-mod-cb').forEach(cb=>cb.checked=true);
    document.getElementById('lbl-mod').textContent='Todas';
  });
  document.getElementById('apt-mod-nenhuma').addEventListener('click',()=>{
    S.modalidades=[];
    document.querySelectorAll('.apt-mod-cb').forEach(cb=>cb.checked=false);
    document.getElementById('lbl-mod').textContent='Nenhuma';
  });
  document.getElementById('dd-mod').addEventListener('change',e=>{
    if(!e.target.classList.contains('apt-mod-cb')) return;
    if(e.target.checked) S.modalidades.push(e.target.value);
    else S.modalidades=S.modalidades.filter(m=>m!==e.target.value);
    const l=S.modalidades.length===MODALIDADES.length?'Todas':S.modalidades.length===0?'Nenhuma':S.modalidades.join(', ');
    document.getElementById('lbl-mod').textContent=l;
  });

  // Colaborador busca
  const inp=document.getElementById('apt-colab'), drop=document.getElementById('apt-colab-drop');
  inp.addEventListener('input',()=>{
    const q=inp.value.trim().toLowerCase();
    if(!q){drop.style.display='none';return;}
    const hits=S.colaboradores.filter(c=>completo(c)&&(c.nome.toLowerCase().includes(q)||String(c.cracha).includes(q))).slice(0,12);
    if(!hits.length){drop.style.display='none';return;}
    drop.style.display='block';
    drop.innerHTML=hits.map(c=>`<div class="dd-item" data-ch="${c.cracha}" style="cursor:pointer">
      <span style="color:#9ca3af;font-size:10px;min-width:44px">${c.cracha}</span>
      <span style="flex:1">${c.nome}</span>
      <span style="font-size:10px;background:#eff6ff;color:#1d4ed8;padding:1px 6px;border-radius:10px">${c.modalidade||'—'}</span>
    </div>`).join('');
    drop.querySelectorAll('[data-ch]').forEach(el=>el.addEventListener('click',()=>{
      const c=S.colaboradores.find(x=>String(x.cracha)===el.dataset.ch);
      S.colabChapa=c.cracha; inp.value=`${c.cracha} — ${c.nome}`;
      if(c.modalidade) S.modalidades=[c.modalidade];
      drop.style.display='none';
    }));
  });
  document.addEventListener('click',e=>{if(!drop.contains(e.target)&&e.target!==inp) drop.style.display='none';});

  // Intervalo de datas
  document.getElementById('apt-di')?.addEventListener('change',e=>{
    S.dataIni=e.target.value;
    // Desmarcar semanas quando usa intervalo livre
    S.semanas=[];
    document.querySelectorAll('.apt-sem-cb').forEach(cb=>cb.checked=false);
    atualizarLblSem();
  });
  document.getElementById('apt-df')?.addEventListener('change',e=>{
    S.dataFim=e.target.value;
    S.semanas=[];
    document.querySelectorAll('.apt-sem-cb').forEach(cb=>cb.checked=false);
    atualizarLblSem();
  });

  document.getElementById('apt-btn-filtrar').addEventListener('click',()=>{ S.hmPag=0; carregarDados(); });
  document.getElementById('apt-btn-limpar').addEventListener('click',()=>{
    S.colabChapa=null; S.modalidades=[...MODALIDADES];
    inp.value='';
    document.querySelectorAll('.apt-mod-cb').forEach(cb=>cb.checked=true);
    document.getElementById('lbl-mod').textContent='Todas';
    S.hmPag=0; carregarDados();
  });
}

/* ── Colaborador completo ── */
function completo(c){ return !!(c.modalidade&&c.turno_id&&c.escala_id); }
function turnoDe(c){ return S.turnos.find(t=>t.id===c.turno_id)||null; }
function escalaDe(c){ return S.escalas.find(e=>e.id===c.escala_id)||null; }

/* ═══════════════════════════════════════════════════════════════
   CARREGAR
   ═══════════════════════════════════════════════════════════════ */
async function carregarColabs(){ try{ S.colaboradores=await sb('apt_colaboradores?order=nome.asc'); }catch(e){ S.colaboradores=[]; } }
async function carregarEscalas(){ try{ S.escalas=await sb('apt_escalas?order=nome.asc'); }catch(e){ S.escalas=[]; } }
async function carregarTurnos(){ try{ S.turnos=await sb('apt_turnos?order=nome.asc'); }catch(e){ S.turnos=[]; } }

async function carregarDados(){
  const elM=document.getElementById('apt-metricas');
  const elQ=document.getElementById('apt-quadro');
  const elP=document.getElementById('apt-pontos');
  const elH=document.getElementById('apt-heatmap');
  const elT=document.getElementById('apt-tabela');
  if(!elM) return;

  if(!S.semanas.length){
    elM.innerHTML=`<div class="card" style="grid-column:1/-1;text-align:center;padding:24px;color:#9ca3af;font-size:12px">Selecione ao menos uma semana.</div>`;
    [elQ,elP,elH,elT].forEach(el=>{if(el){el.style.display='none';el.innerHTML='';}});
    return;
  }

  elM.innerHTML=[1,2,3,4].map(()=>`<div class="metric"><div style="height:10px;background:#f3f4f6;border-radius:4px;width:60%;margin-bottom:10px"></div><div style="height:24px;background:#f3f4f6;border-radius:4px;width:40%"></div></div>`).join('');

  try {
    let cf=S.colaboradores.filter(completo);
    if(S.colabChapa) cf=cf.filter(c=>String(c.cracha)===String(S.colabChapa));
    else if(S.modalidades.length) cf=cf.filter(c=>S.modalidades.includes(c.modalidade));

    if(!cf.length){
      elM.innerHTML=`<div class="card" style="grid-column:1/-1;text-align:center;padding:40px;color:#9ca3af">
        <i class="ti ti-user-off" style="font-size:32px;display:block;margin-bottom:8px;color:#e5e7eb"></i>
        <p style="margin:0;font-size:12px">Nenhum colaborador configurado. <span style="color:var(--blue);cursor:pointer;text-decoration:underline" id="apt-ir-cad">Ir para Cadastro</span></p>
      </div>`;
      [elQ,elP,elH,elT].forEach(el=>{if(el){el.style.display='none';el.innerHTML='';}});
      document.getElementById('apt-ir-cad')?.addEventListener('click',()=>setAba('cadastro'));
      return;
    }

    const cQ=cf.map(c=>`"${c.cracha}"`).join(',');
    const [apts,justs,fer]=await Promise.all([
      sb(`apontamentos?data_apontamento=gte.${S.dataIni}&data_apontamento=lte.${S.dataFim}&chapa=in.(${cQ})&order=data_apontamento.desc,hora_inicio.desc`),
      sb(`apt_justificativas?data_inicio=lte.${S.dataFim}&data_fim=gte.${S.dataIni}&chapa=in.(${cQ})`).catch(()=>[]),
      sb(`apt_ferias?data_inicio=lte.${S.dataFim}&data_fim=gte.${S.dataIni}&chapa=in.(${cQ})`).catch(()=>[]),
    ]);
    S.apontamentos=apts; S.justificativas=justs; S.ferias=fer;
    renderDados(cf);
  } catch(e){
    console.error(e);
    showToast('Erro ao carregar: '+e.message,'erro');
    [elQ,elP,elH,elT].forEach(el=>{if(el){el.style.display='none';el.innerHTML='';}});
  }
}

/* ═══════════════════════════════════════════════════════════════
   RENDER DADOS
   ═══════════════════════════════════════════════════════════════ */
function renderDados(cf){
  const hj=hoje(), am=amanha();
  const dias=diasEntre(S.dataIni,S.dataFim);

  const hhDia=(ch,dia)=>S.apontamentos.filter(a=>String(a.chapa)===String(ch)&&a.data_apontamento===dia).reduce((s,a)=>s+parseFloat(String(a.hh_total||0).replace(',','.'))||0,0);
  const ehFolga=(c,dia)=>gerarFolgas(escalaDe(c),turnoDe(c),c.primeira_folga,c.data_ref_folga,S.dataIni,S.dataFim).has(dia);
  const deFerias=(ch,dia)=>S.ferias.some(f=>String(f.chapa)===String(ch)&&f.data_inicio<=dia&&f.data_fim>=dia);
  const getJust=(ch,dia)=>S.justificativas.find(j=>String(j.chapa)===String(ch)&&j.data_inicio<=dia&&j.data_fim>=dia)||null;
  const hhEsp=(c,dia)=>hhTurno(turnoDe(c),dia);

  // Métricas
  let totPrev=0,totApt=0,ausencias=[],baixos=[];
  cf.forEach(c=>{
    dias.forEach(dia=>{
      if(dia>hj) return;
      const esp=hhEsp(c,dia);
      if(esp===0||ehFolga(c,dia)||deFerias(c.cracha,dia)||getJust(c.cracha,dia)) return;
      totPrev+=esp; const hh=hhDia(c.cracha,dia); totApt+=hh;
      if(hh===0) ausencias.push({colab:c,dia});
      else if(hh/esp<0.50) baixos.push({colab:c,dia,hh,esp,pct:Math.round(hh/esp*100)});
    });
  });
  const ader=totPrev>0?Math.round(totApt/totPrev*100):0;
  const corAder=ader>=75?'var(--green)':ader>=50?'var(--amber)':'var(--red)';

  document.getElementById('apt-metricas').innerHTML=[
    {l:'H-H previsto',             v:totPrev.toFixed(1)+'h', s:'Baseado no turno cadastrado',    c:'var(--yellow)'},
    {l:'Aderência ao apontamento', v:ader+'%',               s:'H-H apontado / H-H disponível',  c:corAder},
    {l:'Ausência de apontamento',  v:ausencias.length,       s:'Dias sem registro',               c:ausencias.length>0?'var(--red)':'#374151'},
    {l:'Baixo apontamento',        v:baixos.length,          s:'Dias abaixo de 50% do esperado',  c:baixos.length>0?'var(--amber)':'#374151'},
  ].map(({l,v,s,c})=>`<div class="metric"><div class="m-label">${l}</div><div class="m-val" style="color:${c}">${v}</div><div class="m-sub">${s}</div></div>`).join('');

  // Quadro do dia
  renderQuadro(cf,ehFolga,deFerias,hj,am);

  // Pontos de atenção — retrátil, fechado por padrão
  const totalPontos=ausencias.length+baixos.length;
  const ausMap={};
  ausencias.forEach(({colab,dia})=>{const k=colab.cracha;if(!ausMap[k])ausMap[k]={colab,dias:[]};ausMap[k].dias.push(dia);});

  const elP=document.getElementById('apt-pontos');
  if(elP){
    elP.innerHTML=`
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div class="card-title" style="margin:0"><i class="ti ti-alert-triangle" style="color:var(--amber)"></i> PONTOS DE ATENÇÃO</div>
          <div style="display:flex;align-items:center;gap:8px">
            ${totalPontos>0?`<span style="background:${totalPontos>0?'var(--red-l)':'var(--green-l)'};color:${totalPontos>0?'var(--red)':'var(--green)'};font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px">${totalPontos} ponto${totalPontos>1?'s':''}</span>`:''}
            <button id="apt-pontos-toggle" class="apt-icon-btn" title="${S.pontosAberto?'Recolher':'Expandir'}">
              <i class="ti ti-chevron-${S.pontosAberto?'up':'down'}"></i>
            </button>
          </div>
        </div>
        <div id="apt-pontos-body" style="display:${S.pontosAberto?'block':'none'};margin-top:12px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
            <div>
              <div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#4b5563;margin-bottom:8px;display:flex;align-items:center;gap:5px">
                <span style="width:7px;height:7px;border-radius:50%;background:var(--red);display:inline-block"></span>Ausência
              </div>
              ${ausencias.length===0
                ?`<p style="font-size:11px;color:#9ca3af"><i class="ti ti-circle-check" style="color:var(--green)"></i> Nenhuma ausência.</p>`
                :Object.values(ausMap).map(({colab,dias})=>`
                  <div class="apt-attn-row">
                    <span style="width:6px;height:6px;border-radius:50%;background:var(--red);flex-shrink:0;margin-top:5px;display:inline-block"></span>
                    <div style="flex:1"><strong>${colab.nome.split(' ').slice(0,2).join(' ')}</strong> — ${dias.map(fmtDM).join(', ')}</div>
                    <button class="apt-icon-btn apt-btn-just" data-ch="${colab.cracha}" data-nome="${colab.nome}" data-dias="${dias.join(',')}" title="Justificar"><i class="ti ti-pencil"></i></button>
                  </div>`).join('')}
              <div style="font-size:10px;color:#9ca3af;margin-top:5px;background:var(--bg);padding:4px 8px;border-radius:var(--radius-sm)">Tratativa: Treinamento ou Serviço externo</div>
            </div>
            <div>
              <div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#4b5563;margin-bottom:8px;display:flex;align-items:center;gap:5px">
                <span style="width:7px;height:7px;border-radius:50%;background:#fb923c;display:inline-block"></span>Baixo apontamento
                <span style="background:#ffedd5;color:#c2410c;font-size:9px;padding:1px 5px;border-radius:10px">< 50%</span>
              </div>
              ${baixos.length===0
                ?`<p style="font-size:11px;color:#9ca3af"><i class="ti ti-circle-check" style="color:var(--green)"></i> Nenhum baixo apontamento.</p>`
                :baixos.map(({colab,dia,hh,esp,pct})=>`
                  <div class="apt-attn-row">
                    <span style="width:6px;height:6px;border-radius:50%;background:#fb923c;flex-shrink:0;margin-top:5px;display:inline-block"></span>
                    <div><strong>${colab.nome.split(' ')[0]}</strong> — ${fmtDM(dia)} · ${hh.toFixed(1)}h/${esp.toFixed(1)}h (${pct}%)</div>
                  </div>`).join('')}
              <div style="font-size:10px;color:#9ca3af;margin-top:5px;background:var(--bg);padding:4px 8px;border-radius:var(--radius-sm)">Tratativa disponível em breve.</div>
            </div>
          </div>
        </div>
      </div>`;
    document.getElementById('apt-pontos-toggle').addEventListener('click',()=>{
      S.pontosAberto=!S.pontosAberto;
      document.getElementById('apt-pontos-body').style.display=S.pontosAberto?'block':'none';
      document.getElementById('apt-pontos-toggle').innerHTML=`<i class="ti ti-chevron-${S.pontosAberto?'up':'down'}"></i>`;
      document.getElementById('apt-pontos-toggle').title=S.pontosAberto?'Recolher':'Expandir';
    });
    document.querySelectorAll('.apt-btn-just').forEach(btn=>btn.addEventListener('click',()=>modalJustif(btn.dataset.ch,btn.dataset.nome,btn.dataset.dias.split(','))));
  }

  renderHeatmap(cf,dias,hhDia,ehFolga,deFerias,getJust,hhEsp,hj);
  renderTabela();
}

/* ── Quadro do dia ── */
function renderQuadro(cf,ehFolga,deFerias,hj,am){
  const el=document.getElementById('apt-quadro');
  if(!el) return;

  function situacaoDia(c,dia){
    if(deFerias(c.cracha,dia)) return 'ferias';
    if(ehFolga(c,dia)) return 'folga';
    return 'trabalho';
  }

  const folgandoHoje=cf.filter(c=>situacaoDia(c,hj)==='folga');
  const folgandoAmanha=cf.filter(c=>situacaoDia(c,am)==='folga');
  const feriasHoje=cf.filter(c=>situacaoDia(c,hj)==='ferias');

  // Agrupar por turno
  function agruparPorTurno(colabs){
    const g={};
    colabs.forEach(c=>{
      const t=S.turnos.find(x=>x.id===c.turno_id);
      const tn=t?t.nome:'Sem turno';
      if(!g[tn]) g[tn]=[];
      g[tn].push(c.nome.split(' ')[0]);
    });
    return g;
  }

  function renderGrupo(mapa){
    if(!Object.keys(mapa).length) return `<span style="font-size:11px;color:#9ca3af">Nenhum</span>`;
    return Object.entries(mapa).map(([turno,nomes])=>
      `<span style="font-size:11px"><strong>${turno}:</strong> ${nomes.join(', ')}</span>`
    ).join('<br>');
  }

  el.innerHTML=`
    <div class="card" style="padding:12px 16px">
      <div class="card-title" style="margin-bottom:10px"><i class="ti ti-calendar-today" style="color:var(--blue)"></i> QUADRO DO DIA — ${diaSem(hj)} ${fmtFull(hj)}</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
        <div style="background:var(--bg);border-radius:var(--radius-sm);padding:10px">
          <div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;margin-bottom:6px;display:flex;align-items:center;gap:5px">
            <span style="width:8px;height:8px;border-radius:50%;background:#9ca3af;display:inline-block"></span>Folgando hoje
            <span style="background:#f3f4f6;color:#374151;font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px;margin-left:auto">${folgandoHoje.length}</span>
          </div>
          ${renderGrupo(agruparPorTurno(folgandoHoje))}
        </div>
        <div style="background:var(--bg);border-radius:var(--radius-sm);padding:10px">
          <div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;margin-bottom:6px;display:flex;align-items:center;gap:5px">
            <span style="width:8px;height:8px;border-radius:50%;background:var(--amber);display:inline-block"></span>Folgando amanhã
            <span style="background:var(--amber-l);color:var(--amber);font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px;margin-left:auto">${folgandoAmanha.length}</span>
          </div>
          ${renderGrupo(agruparPorTurno(folgandoAmanha))}
        </div>
        <div style="background:var(--bg);border-radius:var(--radius-sm);padding:10px">
          <div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;margin-bottom:6px;display:flex;align-items:center;gap:5px">
            <span style="width:8px;height:8px;border-radius:50%;background:#60a5fa;display:inline-block"></span>De férias
            <span style="background:#dbeafe;color:#1d4ed8;font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px;margin-left:auto">${feriasHoje.length}</span>
          </div>
          ${renderGrupo(agruparPorTurno(feriasHoje))}
        </div>
      </div>
    </div>`;
}

/* ═══════════════════════════════════════════════════════════════
   HEATMAP
   ═══════════════════════════════════════════════════════════════ */
function renderHeatmap(cf,todosDias,hhDia,ehFolga,deFerias,getJust,hhEsp,hj){
  const el=document.getElementById('apt-heatmap');
  if(!el) return;
  const PPG=14,pags=Math.ceil(todosDias.length/PPG),pag=Math.min(S.hmPag,pags-1);
  const dias=todosDias.slice(pag*PPG,(pag+1)*PPG);

  function cellBg(c,dia){
    if(dia>hj)                return {bg:'#93c5fd',fg:'#1e3a8a',lbl:''};
    if(deFerias(c.cracha,dia)) return {bg:'#60a5fa',fg:'#1e3a8a',lbl:'F'};
    const just=getJust(c.cracha,dia);
    if(just)                   return {bg:'#fbbf24',fg:'#78350f',lbl:just.tratativa?.substring(0,1)||'J'};
    if(ehFolga(c,dia))         return {bg:'#9ca3af',fg:'#f9fafb',lbl:''};
    const hh=hhDia(c.cracha,dia),esp=hhEsp(c,dia);
    if(esp===0)  return {bg:'#e5e7eb',fg:'#6b7280',lbl:''};
    if(hh===0)   return {bg:'#f87171',fg:'#7f1d1d',lbl:''};
    const pct=hh/esp;
    if(pct>=META)   return {bg:'#16a34a',fg:'#dcfce7',lbl:hh.toFixed(1)+'h'};
    if(pct>=0.50)   return {bg:'#facc15',fg:'#78350f',lbl:hh.toFixed(1)+'h'};
    return {bg:'#fb923c',fg:'#7c2d12',lbl:hh.toFixed(1)+'h'};
  }

  // Agrupar por turno (nome do turno)
  const porTurno={};
  S.turnos.forEach(t=>porTurno[t.nome]=[]);
  porTurno['Não configurado']=[];
  cf.forEach(c=>{
    const t=S.turnos.find(x=>x.id===c.turno_id);
    const k=t?t.nome:'Não configurado';
    if(!porTurno[k]) porTurno[k]=[];
    porTurno[k].push(c);
  });

  let linhas='';
  [...S.turnos.map(t=>t.nome),'Não configurado'].forEach(turno=>{
    const colabs=(porTurno[turno]||[]).sort((a,b)=>a.nome.localeCompare(b.nome));
    if(!colabs.length) return;
    linhas+=`<div class="apt-turno-hdr">${turno==='Não configurado'?'⚠ NÃO CONFIGURADO':turno.toUpperCase()}</div>`;
    colabs.forEach(c=>{
      linhas+=`<div style="font-size:11px;color:#374151;display:flex;align-items:center;height:26px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:4px;font-weight:600" title="${c.nome}">${c.nome.split(' ')[0]}</div>
      ${dias.map(dia=>{const{bg,fg,lbl}=cellBg(c,dia);return `<div class="apt-hm-cell" data-ch="${c.cracha}" data-dia="${dia}" style="background:${bg};color:${fg}" title="${c.nome} · ${diaSem(dia)} ${fmtDM(dia)}">${lbl}</div>`;}).join('')}`;
    });
  });

  const legenda=[
    {bg:'#16a34a',txt:`≥ ${Math.round(META*100)}%`},
    {bg:'#facc15',txt:'≥50% <75%'},
    {bg:'#fb923c',txt:'>0% <50%'},
    {bg:'#f87171',txt:'Sem registro'},
    {bg:'#9ca3af',txt:'Folga'},
    {bg:'#93c5fd',txt:'Disponível'},
    {bg:'#fbbf24',txt:'Justificado'},
    {bg:'#60a5fa',txt:'Férias'},
  ];

  el.style.display='block';
  el.innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:12px">
      <div class="card-title" style="margin:0"><i class="ti ti-layout-grid"></i> PRESENÇA POR COLABORADOR
        <span style="font-weight:400;text-transform:none;font-size:10px;color:#6b7280;margin-left:6px">${fmtFull(dias[0])} – ${fmtFull(dias[dias.length-1])}</span>
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <div style="display:flex;gap:7px;flex-wrap:wrap">
          ${legenda.map(({bg,txt})=>`<span style="display:flex;align-items:center;gap:3px;font-size:10px;color:#4b5563;font-weight:500">
            <span style="width:10px;height:10px;border-radius:2px;background:${bg};display:inline-block;border:1px solid rgba(0,0,0,.08)"></span>${txt}
          </span>`).join('')}
        </div>
        <div style="display:flex;gap:4px;align-items:center">
          <button id="hm-prev" class="apt-icon-btn" ${pag===0?'disabled':''}><i class="ti ti-chevron-left"></i></button>
          <span style="font-size:11px;color:#4b5563;font-weight:500;padding:0 4px">${pag+1}/${pags}</span>
          <button id="hm-next" class="apt-icon-btn" ${pag>=pags-1?'disabled':''}><i class="ti ti-chevron-right"></i></button>
        </div>
      </div>
    </div>
    <div style="overflow-x:auto">
      <div style="display:grid;grid-template-columns:70px repeat(${dias.length},minmax(28px,1fr));gap:3px;min-width:${70+dias.length*30}px">
        <div></div>
        ${dias.map(d=>`<div style="text-align:center;font-size:9px;color:#4b5563;font-weight:600;line-height:1.3;padding-bottom:2px">
          <div>${diaSem(d)}</div><div>${fmtDM(d)}</div>
        </div>`).join('')}
        ${linhas}
      </div>
    </div>
    <div style="margin-top:8px;font-size:10px;color:#6b7280;background:var(--bg);padding:5px 10px;border-radius:var(--radius-sm)">
      <i class="ti ti-info-circle"></i> Cores por % do H-H esperado no turno · ≥75% verde · ≥50% amarelo · <50% laranja · 0% vermelho
    </div>`;

  document.getElementById('hm-prev')?.addEventListener('click',()=>{S.hmPag--;renderHeatmap(cf,todosDias,hhDia,ehFolga,deFerias,getJust,hhEsp,hj);});
  document.getElementById('hm-next')?.addEventListener('click',()=>{S.hmPag++;renderHeatmap(cf,todosDias,hhDia,ehFolga,deFerias,getJust,hhEsp,hj);});
  document.querySelectorAll('.apt-hm-cell').forEach(cel=>cel.addEventListener('click',()=>{
    const c=cf.find(x=>String(x.cracha)===cel.dataset.ch);
    if(c) detalheCell(c,cel.dataset.dia,hhDia,hhEsp,hj);
  }));
}

function detalheCell(c,dia,hhDia,hhEsp,hj){
  if(dia>hj){abrirModal('Dia disponível',`<p style="font-size:12px;color:#9ca3af;text-align:center;padding:16px">${fmtFull(dia)} ainda não chegou.</p>`);return;}
  const apts=S.apontamentos.filter(a=>String(a.chapa)===String(c.cracha)&&a.data_apontamento===dia);
  const tot=apts.reduce((s,a)=>s+parseFloat(String(a.hh_total||0).replace(',','.'))||0,0);
  const esp=hhEsp(c,dia),pct=esp>0?Math.round(tot/esp*100):0;
  const cor=pct>=75?'var(--green)':pct>=50?'var(--amber)':'var(--red)';
  abrirModal(`${c.nome.split(' ').slice(0,2).join(' ')} · ${diaSem(dia)} ${fmtFull(dia)}`,
    `<div style="font-size:11px;color:#6b7280;margin-bottom:12px;background:var(--bg);padding:8px 10px;border-radius:var(--radius-sm)">
      Esperado: <strong>${esp.toFixed(1)}h</strong> · Apontado: <strong style="color:${cor}">${tot.toFixed(1)}h</strong> · <strong style="color:${cor}">${pct}%</strong>
    </div>`+
    (apts.length===0
      ?`<p style="font-size:12px;color:#9ca3af;text-align:center;padding:16px">Nenhum apontamento neste dia.</p>`
      :`<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr>${['OS','Descrição','Início','Fim','H-H'].map(h=>`<th style="text-align:left;padding:5px 8px;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#6b7280">${h}</th>`).join('')}</tr></thead>
          <tbody>${apts.map(a=>`<tr style="border-bottom:1px solid #f3f4f6">
            <td style="padding:5px 8px;font-family:monospace">${a.os}</td>
            <td style="padding:5px 8px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${a.desc_servico||''}">${a.desc_servico||'—'}</td>
            <td style="padding:5px 8px">${a.hora_inicio}</td>
            <td style="padding:5px 8px">${a.hora_fim}</td>
            <td style="padding:5px 8px;font-weight:600">${(parseFloat(String(a.hh_total||0).replace(',','.'))||0).toFixed(1)}h</td>
          </tr>`).join('')}
          <tr style="background:var(--bg)"><td colspan="4" style="padding:5px 8px;font-weight:700;font-size:11px">Total</td>
          <td style="padding:5px 8px;font-weight:700;color:${cor}">${tot.toFixed(1)}h</td></tr>
          </tbody></table></div>`));
}

/* ═══════════════════════════════════════════════════════════════
   TABELA
   ═══════════════════════════════════════════════════════════════ */
function renderTabela(){
  const el=document.getElementById('apt-tabela');
  if(!el) return;
  const hj=hoje();
  const apts=[...S.apontamentos].filter(a=>a.data_apontamento<=hj)
    .sort((a,b)=>a.data_apontamento!==b.data_apontamento?a.data_apontamento>b.data_apontamento?-1:1:(a.hora_inicio||'')>(b.hora_inicio||'')?-1:1);
  el.style.display='block';
  el.innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div class="card-title" style="margin:0"><i class="ti ti-list-details"></i> DETALHAMENTO DE APONTAMENTOS</div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:11px;color:#6b7280">${apts.length} registros</span>
        <button id="apt-tbl-toggle" class="apt-icon-btn" title="${S.tabelaAberta?'Recolher':'Expandir'}">
          <i class="ti ti-chevron-${S.tabelaAberta?'up':'down'}"></i>
        </button>
      </div>
    </div>
    <div id="apt-tbl-body" style="display:${S.tabelaAberta?'block':'none'};margin-top:12px">
      <div style="overflow-x:auto;max-height:360px;overflow-y:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead style="position:sticky;top:0;background:var(--card-bg);z-index:1">
            <tr>${['Data','Colaborador','OS','Descrição','Início','Fim','H-H'].map(h=>`<th style="text-align:left;padding:6px 10px;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#6b7280;white-space:nowrap">${h}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${apts.length===0
              ?`<tr><td colspan="7" style="text-align:center;padding:24px;color:#9ca3af">Nenhum apontamento no período.</td></tr>`
              :apts.map(a=>`<tr style="border-bottom:1px solid #f9fafb">
                  <td style="padding:5px 10px;white-space:nowrap;font-size:11px">${fmtDM(a.data_apontamento)}</td>
                  <td style="padding:5px 10px;white-space:nowrap">${(a.nome||'').split(' ').slice(0,2).join(' ')}</td>
                  <td style="padding:5px 10px;font-family:monospace;font-size:11px">${a.os}</td>
                  <td style="padding:5px 10px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${a.desc_servico||''}">${a.desc_servico||'—'}</td>
                  <td style="padding:5px 10px;white-space:nowrap">${a.hora_inicio}</td>
                  <td style="padding:5px 10px;white-space:nowrap">${a.hora_fim}</td>
                  <td style="padding:5px 10px;font-weight:600">${(parseFloat(String(a.hh_total||0).replace(',','.'))||0).toFixed(1)}h</td>
                </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  document.getElementById('apt-tbl-toggle').addEventListener('click',()=>{
    S.tabelaAberta=!S.tabelaAberta; renderTabela();
  });
}

/* ═══════════════════════════════════════════════════════════════
   IMPORTADOR
   ═══════════════════════════════════════════════════════════════ */
function htmlImportador(){
  return `<div class="card import-section">
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
      <div id="apt-imp-msg" style="font-size:11px;color:#6b7280;margin-top:5px;line-height:1.5"></div>
    </div>
  </div>`;}

function bindImportador(){
  const inp=document.getElementById('apt-file'), zona=document.getElementById('apt-drop');
  if(!inp||!zona) return;
  zona.addEventListener('dragover',e=>{e.preventDefault();zona.classList.add('over');});
  zona.addEventListener('dragleave',()=>zona.classList.remove('over'));
  zona.addEventListener('drop',e=>{e.preventDefault();zona.classList.remove('over');if(e.dataTransfer.files[0])processarImport(e.dataTransfer.files[0]);});
  inp.addEventListener('change',()=>{if(inp.files[0])processarImport(inp.files[0]);});
}

async function processarImport(file){
  const prog=document.getElementById('apt-imp-prog'),bar=document.getElementById('apt-imp-bar'),msg=document.getElementById('apt-imp-msg');
  function setP(pct,txt){prog.style.display='block';bar.style.width=pct+'%';msg.innerHTML=txt;}
  try{
    setP(5,'Lendo arquivo…');
    showToast('Importando…','info',60000);
    const XLSX=await loadXLSX();
    const buf=await file.arrayBuffer();
    const wb=XLSX.read(buf,{type:'array'});
    const ws=wb.Sheets[wb.SheetNames[0]];
    const raw=XLSX.utils.sheet_to_json(ws,{header:1,defval:null,raw:true});
    setP(15,'Parseando apontamentos…');

    // Remove prefixo de aspas simples do formato SYLK do PIMS
    function L(v){ if(v==null) return null; const s=String(v).trim(); return s.startsWith("'")?s.slice(1).trim():s; }
    const reCracha=/^(\d{3,9})\s*-\s*(.+)/,reData=/^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
    function serialToIso(n){const d=new Date(Date.UTC(1900,0,1)+(n-2)*86400000);return d.toISOString().slice(0,10);}
    function parseData(v){
      if(v==null) return null;
      if(typeof v==='number'&&v>10000) return serialToIso(v);
      const s=L(v); if(!s) return null;
      if(reData.test(s)){const[d,m,y]=s.split('/');return `${y.length===2?'20'+y:y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;}
      return null;
    }
    function parseHora(v){
      if(v==null) return '';
      if(typeof v==='number'){const tm=Math.round(v*1440);return `${String(Math.floor(tm/60)).padStart(2,'0')}:${String(tm%60).padStart(2,'0')}`;}
      return L(v)||'';
    }
    function parseHH(v){
      if(v==null) return 0;
      if(typeof v==='number'&&v<1) return parseFloat((v*24).toFixed(2));
      return parseFloat(String(L(v)||'0').replace(',','.'))||0;
    }

    const records=[];let curCh=null,curNome=null;
    for(let i=0;i<raw.length;i++){
      const row=raw[i];
      const v0=L(row[0])||'', v1=L(row[1])||'';
      if(v0==='Funcionário:'){
        const m=reCracha.exec(v1);
        if(m){curCh=m[1].replace(/^0+/,'')||'0';curNome=m[2].trim();}
        continue;
      }
      const dataIso=parseData(row[0]);
      if(!dataIso||!curCh) continue;
      const nxt=raw[i+1]||[];
      const os=L(nxt[0])||'';
      const desc=nxt[1]!=null?String(L(nxt[1])||'').replace(/^\d+-\s*/,''):'';
      const hi=parseHora(row[2]),hf=parseHora(row[3]),ht=parseHH(row[4]);
      if(!os||!hi) continue;
      records.push({data_apontamento:dataIso,os,desc_servico:desc||null,tipo_atividade:L(v1)||'',hora_inicio:hi,hora_fim:hf,hh_total:ht,chapa:curCh,nome:curNome});
    }

    if(!records.length){
      const funcs=raw.filter(r=>L(r[0])==='Funcionário:').length;
      const linhasDatas=raw.filter(r=>parseData(r[0])).length;
      setP(0,`⚠ Nenhum registro encontrado.<br>Diagnóstico: ${funcs} funcionário(s) detectado(s), ${linhasDatas} linha(s) de data encontrada(s).<br>Verifique se é o relatório "Apontamento de Mão-de-Obra por Funcionário" do PIMS.`);
      showToast('Nenhum registro encontrado.','erro');
      return;
    }

    const nColabs=[...new Set(records.map(r=>r.nome))].length;
    const datas=[...new Set(records.map(r=>r.data_apontamento))].sort();
    const periodoStr=datas.length?` · ${fmtDM(datas[0])} – ${fmtDM(datas[datas.length-1])}`:'';
    setP(30,`${records.length} apontamentos de ${nColabs} colaborador(es)${periodoStr}. Enviando…`);

    const LOTE=200;
    for(let i=0;i<records.length;i+=LOTE){
      await sb('apontamentos',{method:'POST',prefer:'resolution=merge-duplicates,return=minimal',
        headers:{'Prefer':'resolution=merge-duplicates,return=minimal'},
        body:JSON.stringify(records.slice(i,i+LOTE))});
      setP(30+Math.round((i/records.length)*65),`Enviando… ${Math.min(i+LOTE,records.length)}/${records.length}`);
    }
    setP(100,`✓ ${records.length} apontamentos de ${nColabs} colaboradores importados${periodoStr}.`);
    showToast(`${records.length} apontamentos importados.`,'ok',5000);
    setTimeout(()=>carregarDados(),800);
  }catch(e){
    showToast('Erro na importação: '+e.message,'erro');
    setP(0,`⚠ Erro: ${e.message}`);
    console.error(e);
  }
}
async function loadXLSX(){if(window.XLSX)return window.XLSX;return new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';s.onload=()=>res(window.XLSX);s.onerror=()=>rej(new Error('Falha XLSX'));document.head.appendChild(s);});}

/* ═══════════════════════════════════════════════════════════════
   MODAL JUSTIFICATIVA
   ═══════════════════════════════════════════════════════════════ */
const LBL=txt=>`<label style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">${txt}</label>`;

function modalJustif(ch,nome,dias){
  abrirModal('Lançar justificativa',`
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="font-size:12px;background:var(--bg);border-radius:var(--radius-sm);padding:8px 10px"><strong>${nome}</strong> — ${dias.map(fmtDM).join(', ')}</div>
      <div>${LBL('Tipo')}<select id="jt-tipo" class="apt-select"><option>Ausência de apontamento</option><option>Troca de folga</option></select></div>
      <div style="display:flex;gap:8px">
        <div style="flex:1">${LBL('Data início')}<input type="date" id="jt-di" value="${dias[0]}" class="apt-input"></div>
        <div style="flex:1">${LBL('Data fim')}<input type="date" id="jt-df" value="${dias[dias.length-1]}" class="apt-input"></div>
      </div>
      <div>${LBL('Tratativa')}<select id="jt-trat" class="apt-select"><option>Treinamento</option><option>Serviço externo</option></select></div>
      <div>${LBL('Obs. (opcional)')}<input type="text" id="jt-obs" class="apt-input" placeholder="EX: NR-10 TURMA JUNHO…" oninput="this.value=this.value.toUpperCase()"></div>
    </div>`,
    async()=>{
      await sb('apt_justificativas',{method:'POST',body:JSON.stringify({chapa:ch,nome,tipo:document.getElementById('jt-tipo').value,tratativa:document.getElementById('jt-trat').value,data_inicio:document.getElementById('jt-di').value,data_fim:document.getElementById('jt-df').value,obs:document.getElementById('jt-obs').value})});
      fecharModal();showToast('Justificativa registrada.','ok');carregarDados();
    },'Salvar');
}

/* ═══════════════════════════════════════════════════════════════
   ABA CADASTRO
   ═══════════════════════════════════════════════════════════════ */
function htmlCadastro(){return `
  <div class="card">
    <div style="display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:16px;overflow-x:auto">
      <div id="cad-tab-c" class="apt-tab ${S.cadAba==='colab'?'on':''}">Colaboradores</div>
      <div id="cad-tab-e" class="apt-tab ${S.cadAba==='escalas'?'on':''}">Escalas</div>
      <div id="cad-tab-t" class="apt-tab ${S.cadAba==='turnos'?'on':''}">Turnos</div>
      <div id="cad-tab-j" class="apt-tab ${S.cadAba==='justif'?'on':''}">Justificativas</div>
    </div>
    <div id="cad-body"></div>
  </div>`;}

function bindCadastro(){
  document.getElementById('cad-tab-c').onclick=()=>{S.cadAba='colab';renderCadBody();};
  document.getElementById('cad-tab-e').onclick=()=>{S.cadAba='escalas';renderCadBody();};
  document.getElementById('cad-tab-t').onclick=()=>{S.cadAba='turnos';renderCadBody();};
  document.getElementById('cad-tab-j').onclick=()=>{S.cadAba='justif';renderCadBody();};
}

async function carregarCadastro(){
  try{
    const [cols,esp,jus,esc,tur]=await Promise.all([
      sb('apt_colaboradores?order=nome.asc'),
      sb('apt_especialidades?order=nome.asc').catch(()=>[]),
      sb('apt_justificativas?order=data_inicio.desc&limit=100').catch(()=>[]),
      sb('apt_escalas?order=nome.asc').catch(()=>[]),
      sb('apt_turnos?order=nome.asc').catch(()=>[]),
    ]);
    S.colaboradores=cols;S.especialidades=esp;S.justificativas=jus;S.escalas=esc;S.turnos=tur;
    renderCadBody();
  }catch(e){const el=document.getElementById('cad-body');if(el)el.innerHTML=`<p style="color:var(--red)">${e.message}</p>`;}
}

function renderCadBody(){
  ['cad-tab-c','cad-tab-e','cad-tab-t','cad-tab-j'].forEach((id,i)=>{
    const tabs=['colab','escalas','turnos','justif'];
    const el=document.getElementById(id);
    if(el) el.className='apt-tab'+(S.cadAba===tabs[i]?' on':'');
  });
  if(S.cadAba==='colab') renderCadColab();
  else if(S.cadAba==='escalas') renderCadEscalas();
  else if(S.cadAba==='turnos') renderCadTurnos();
  else renderCadJustif();
}

/* ── Colaboradores ── */
function renderCadColab(){
  document.getElementById('cad-body').innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <div class="dd-btn" style="cursor:text;width:200px;padding:0;gap:0">
          <i class="ti ti-search" style="padding:0 8px;color:#9ca3af"></i>
          <input id="cad-busca" type="text" placeholder="Buscar…" style="border:none;background:transparent;outline:none;font-family:var(--font);font-size:11px;flex:1;height:30px;padding-right:8px">
        </div>
        <select id="cad-mod-filtro" class="dd-btn" style="cursor:pointer;width:150px;font-family:var(--font);font-size:11px">
          <option value="">Todas modalidades</option>
          ${MODALIDADES.map(m=>`<option value="${m}">${m}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex;gap:6px">
        <button id="cad-imp" class="dd-action-btn secondary" style="height:30px;padding:0 12px;font-family:var(--font)"><i class="ti ti-download"></i> Importar da base</button>
        <button id="cad-esp-btn" class="dd-action-btn secondary" style="height:30px;padding:0 12px;font-family:var(--font)"><i class="ti ti-tag"></i> Especialidades</button>
      </div>
    </div>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr>${['Crachá','Nome','Modalidade','Especialidade','Escala','Turno','Status','Ações'].map(h=>`<th style="text-align:left;padding:6px 10px;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#6b7280;white-space:nowrap">${h}</th>`).join('')}</tr></thead>
        <tbody id="cad-tbody">${linhasColabs(S.colaboradores)}</tbody>
      </table>
    </div>`;
  document.getElementById('cad-busca').addEventListener('input',filtrarColabs);
  document.getElementById('cad-mod-filtro').addEventListener('change',filtrarColabs);
  document.getElementById('cad-imp').onclick=()=>importarBase();
  document.getElementById('cad-esp-btn').onclick=()=>modalEspecialidades();
  bindBotoesColab();
}

function linhasColabs(cols){
  if(!cols.length) return `<tr><td colspan="8" style="padding:24px;text-align:center;color:#9ca3af">Nenhum colaborador. Clique em <strong>Importar da base</strong>.</td></tr>`;
  return cols.map(c=>{
    const esp=S.especialidades.find(e=>e.id===c.especialidade_id);
    const esc=S.escalas.find(e=>e.id===c.escala_id);
    const tur=S.turnos.find(t=>t.id===c.turno_id);
    const ok=completo(c);
    return `<tr style="border-bottom:1px solid #f9fafb" data-cracha="${c.cracha}" data-mod="${c.modalidade||''}">
      <td style="padding:6px 10px;color:#6b7280;font-size:11px">${c.cracha}</td>
      <td style="padding:6px 10px;font-weight:500">${c.nome}</td>
      <td style="padding:6px 10px">${c.modalidade?`<span style="background:#eff6ff;color:#1d4ed8;font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px">${c.modalidade}</span>`:'—'}</td>
      <td style="padding:6px 10px;font-size:11px;color:#6b7280">${esp?esp.nome:'—'}</td>
      <td style="padding:6px 10px;font-size:11px">${esc?esc.nome:'—'}</td>
      <td style="padding:6px 10px;font-size:11px">${tur?tur.nome:'—'}</td>
      <td style="padding:6px 10px">${ok
        ?`<span style="background:var(--green-l);color:var(--green);font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px">✓ OK</span>`
        :`<span class="apt-incompleto">⚠ Incompleto</span>`}</td>
      <td style="padding:6px 10px">
        <div style="display:flex;gap:3px">
          <button class="apt-icon-btn cad-edit" data-cracha="${c.cracha}" title="Editar"><i class="ti ti-pencil"></i></button>
          <button class="apt-icon-btn cad-escala" data-cracha="${c.cracha}" title="Alterar escala"><i class="ti ti-calendar-event"></i></button>
          <button class="apt-icon-btn cad-turno" data-cracha="${c.cracha}" title="Alterar turno"><i class="ti ti-clock"></i></button>
          <button class="apt-icon-btn cad-justif" data-cracha="${c.cracha}" title="Justificativa"><i class="ti ti-notes"></i></button>
          <button class="apt-icon-btn cad-ferias" data-cracha="${c.cracha}" title="Férias"><i class="ti ti-beach"></i></button>
        </div>
      </td>
    </tr>`;}). join('');
}

function filtrarColabs(){
  const q=(document.getElementById('cad-busca')?.value||'').toLowerCase();
  const mod=document.getElementById('cad-mod-filtro')?.value||'';
  document.querySelectorAll('#cad-tbody tr[data-cracha]').forEach(tr=>{
    tr.style.display=(!q||tr.textContent.toLowerCase().includes(q))&&(!mod||tr.dataset.mod===mod)?'':'none';
  });
}

function bindBotoesColab(){
  document.querySelectorAll('.cad-edit').forEach(btn=>{const c=S.colaboradores.find(x=>x.cracha===btn.dataset.cracha);if(c)btn.onclick=()=>modalColab(c);});
  document.querySelectorAll('.cad-escala').forEach(btn=>{const c=S.colaboradores.find(x=>x.cracha===btn.dataset.cracha);if(c)btn.onclick=()=>modalEscalaColab(c);});
  document.querySelectorAll('.cad-turno').forEach(btn=>{const c=S.colaboradores.find(x=>x.cracha===btn.dataset.cracha);if(c)btn.onclick=()=>modalTurnoColab(c);});
  document.querySelectorAll('.cad-justif').forEach(btn=>{const c=S.colaboradores.find(x=>x.cracha===btn.dataset.cracha);if(c)btn.onclick=()=>modalJustif(c.cracha,c.nome,[hoje()]);});
  document.querySelectorAll('.cad-ferias').forEach(btn=>{const c=S.colaboradores.find(x=>x.cracha===btn.dataset.cracha);if(c)btn.onclick=()=>modalFerias(c);});
}

/* ── Escalas (ciclo de folgas) ── */
function renderCadEscalas(){
  document.getElementById('cad-body').innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div style="font-size:12px;color:#6b7280">Define o <strong>ciclo de folgas</strong> (5x1, 6x1, ADM)</div>
      <button id="esc-nova-btn" class="dd-action-btn primary" style="height:30px;padding:0 14px;font-family:var(--font)"><i class="ti ti-plus"></i> Nova escala</button>
    </div>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr>${['Nome','Tipo','Dias trabalhados','Folga','Ações'].map(h=>`<th style="text-align:left;padding:6px 10px;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#6b7280">${h}</th>`).join('')}</tr></thead>
        <tbody>
          ${S.escalas.length===0?`<tr><td colspan="5" style="padding:24px;text-align:center;color:#9ca3af">Nenhuma escala.</td></tr>`
          :S.escalas.map(e=>`<tr style="border-bottom:1px solid #f9fafb">
            <td style="padding:6px 10px;font-weight:500">${e.nome}</td>
            <td style="padding:6px 10px"><span style="background:${e.tipo_ciclo==='ADM'?'#eff6ff':'#f0fdf4'};color:${e.tipo_ciclo==='ADM'?'#1d4ed8':'var(--green)'};font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px">${e.tipo_ciclo}</span></td>
            <td style="padding:6px 10px">${e.tipo_ciclo==='ADM'?'—':e.dias_trabalho}</td>
            <td style="padding:6px 10px">${e.tipo_ciclo==='ADM'?'Sábado e domingo':'A cada '+e.dias_trabalho+' dias trabalhados'}</td>
            <td style="padding:6px 10px"><div style="display:flex;gap:3px">
              <button class="apt-icon-btn esc-edit" data-id="${e.id}" title="Editar"><i class="ti ti-pencil"></i></button>
              <button class="apt-icon-btn esc-del" data-id="${e.id}" title="Excluir" style="color:var(--red)"><i class="ti ti-trash"></i></button>
            </div></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  document.getElementById('esc-nova-btn').onclick=()=>modalEscalaCad();
  document.querySelectorAll('.esc-edit').forEach(btn=>{const e=S.escalas.find(x=>String(x.id)===btn.dataset.id);if(e)btn.onclick=()=>modalEscalaCad(e);});
  document.querySelectorAll('.esc-del').forEach(btn=>btn.onclick=async()=>{
    if(!confirm('Excluir escala?'))return;
    await sb(`apt_escalas?id=eq.${btn.dataset.id}`,{method:'DELETE'});
    showToast('Excluído.','ok');carregarCadastro();
  });
}

function modalEscalaCad(e=null){
  const edit=!!e;
  abrirModal(edit?'Editar escala':'Nova escala',`
    <div style="display:flex;flex-direction:column;gap:12px">
      <div>${LBL('Nome')}<input id="ec-nome" class="apt-input" value="${e?.nome||''}" placeholder="EX: 5X1" oninput="this.value=this.value.toUpperCase()"></div>
      <div>${LBL('Tipo de ciclo')}
        <select id="ec-tipo" class="apt-select">
          <option value="ROTATIVO" ${(!e||e.tipo_ciclo==='ROTATIVO')?'selected':''}>ROTATIVO</option>
          <option value="ADM" ${e?.tipo_ciclo==='ADM'?'selected':''}>ADM (folga sáb/dom)</option>
        </select>
      </div>
      <div id="ec-dias-wrap" style="${e?.tipo_ciclo==='ADM'?'display:none':''}">
        ${LBL('Dias trabalhados antes da folga')}
        <input id="ec-dias" type="number" class="apt-input" value="${e?.dias_trabalho||5}" min="1" max="9" style="width:100px">
      </div>
    </div>`,
    async()=>{
      const nome=document.getElementById('ec-nome').value.trim(),tipo=document.getElementById('ec-tipo').value;
      const dias=parseInt(document.getElementById('ec-dias').value)||5;
      if(!nome){showToast('Nome obrigatório.','erro');return;}
      const dados={nome,tipo_ciclo:tipo,hora_entrada:'00:00',hora_saida:'00:00',intervalo_min:0,dias_trabalho:tipo==='ROTATIVO'?dias:null,saida_sexta:null};
      if(edit) await sb(`apt_escalas?id=eq.${e.id}`,{method:'PATCH',body:JSON.stringify(dados)});
      else     await sb('apt_escalas',{method:'POST',body:JSON.stringify(dados)});
      fecharModal();showToast('Escala salva!','ok');carregarCadastro();
    },'Salvar');
  setTimeout(()=>{
    const tipo=document.getElementById('ec-tipo'),dw=document.getElementById('ec-dias-wrap');
    tipo.addEventListener('change',()=>{dw.style.display=tipo.value==='ADM'?'none':'block';});
  },50);
}

/* ── Turnos (horários) ── */
function renderCadTurnos(){
  document.getElementById('cad-body').innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div style="font-size:12px;color:#6b7280">Define os <strong>horários de entrada/saída</strong> e H-H esperado</div>
      <button id="tur-nova-btn" class="dd-action-btn primary" style="height:30px;padding:0 14px;font-family:var(--font)"><i class="ti ti-plus"></i> Novo turno</button>
    </div>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr>${['Nome','Entrada','Saída','Refeição','HH/dia','Exc. Sexta','HH Sexta','Ações'].map(h=>`<th style="text-align:left;padding:6px 10px;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#6b7280;white-space:nowrap">${h}</th>`).join('')}</tr></thead>
        <tbody>
          ${S.turnos.length===0?`<tr><td colspan="8" style="padding:24px;text-align:center;color:#9ca3af">Nenhum turno.</td></tr>`
          :S.turnos.map(t=>{
            const hh=calcHH(t.hora_entrada,t.hora_saida,t.intervalo_min);
            const hhSex=t.saida_sexta?calcHH(t.hora_entrada,t.saida_sexta,t.intervalo_min):null;
            return `<tr style="border-bottom:1px solid #f9fafb">
              <td style="padding:6px 10px;font-weight:500">${t.nome}</td>
              <td style="padding:6px 10px">${t.hora_entrada}</td>
              <td style="padding:6px 10px">${t.hora_saida}</td>
              <td style="padding:6px 10px">${t.intervalo_min}min</td>
              <td style="padding:6px 10px;font-weight:600">${hh.toFixed(2)}h</td>
              <td style="padding:6px 10px">${t.saida_sexta||'—'}</td>
              <td style="padding:6px 10px">${hhSex?hhSex.toFixed(2)+'h':'—'}</td>
              <td style="padding:6px 10px"><div style="display:flex;gap:3px">
                <button class="apt-icon-btn tur-edit" data-id="${t.id}" title="Editar"><i class="ti ti-pencil"></i></button>
                <button class="apt-icon-btn tur-del" data-id="${t.id}" title="Excluir" style="color:var(--red)"><i class="ti ti-trash"></i></button>
              </div></td>
            </tr>`;}).join('')}
        </tbody>
      </table>
    </div>`;
  document.getElementById('tur-nova-btn').onclick=()=>modalTurnoCad();
  document.querySelectorAll('.tur-edit').forEach(btn=>{const t=S.turnos.find(x=>String(x.id)===btn.dataset.id);if(t)btn.onclick=()=>modalTurnoCad(t);});
  document.querySelectorAll('.tur-del').forEach(btn=>btn.onclick=async()=>{
    if(!confirm('Excluir turno?'))return;
    await sb(`apt_turnos?id=eq.${btn.dataset.id}`,{method:'DELETE'});
    showToast('Excluído.','ok');carregarCadastro();
  });
}

function modalTurnoCad(t=null){
  const edit=!!t;
  abrirModal(edit?'Editar turno':'Novo turno',`
    <div style="display:flex;flex-direction:column;gap:12px">
      <div>${LBL('Nome do turno')}<input id="tc-nome" class="apt-input" value="${t?.nome||''}" placeholder="EX: TURNO A" oninput="this.value=this.value.toUpperCase()"></div>
      <div style="display:flex;gap:8px">
        <div style="flex:1">${LBL('Hora entrada')}<input id="tc-ent" type="time" class="apt-input" value="${t?.hora_entrada||'07:00'}"></div>
        <div style="flex:1">${LBL('Hora saída')}<input id="tc-sai" type="time" class="apt-input" value="${t?.hora_saida||'15:20'}"></div>
        <div style="flex:1">${LBL('Refeição (min)')}<input id="tc-int" type="number" class="apt-input" value="${t?.intervalo_min||60}" min="0"></div>
      </div>
      <div>${LBL('Saída sexta-feira (opcional — para ADM)')}
        <input id="tc-sex" type="time" class="apt-input" value="${t?.saida_sexta||''}">
      </div>
      <div id="tc-prev" style="font-size:11px;color:var(--green);background:var(--green-l);border-radius:var(--radius-sm);padding:7px 10px"></div>
    </div>`,
    async()=>{
      const nome=document.getElementById('tc-nome').value.trim();
      if(!nome){showToast('Nome obrigatório.','erro');return;}
      const dados={nome,hora_entrada:document.getElementById('tc-ent').value,hora_saida:document.getElementById('tc-sai').value,intervalo_min:parseInt(document.getElementById('tc-int').value)||60,saida_sexta:document.getElementById('tc-sex').value||null};
      if(edit) await sb(`apt_turnos?id=eq.${t.id}`,{method:'PATCH',body:JSON.stringify(dados)});
      else     await sb('apt_turnos',{method:'POST',body:JSON.stringify(dados)});
      fecharModal();showToast('Turno salvo!','ok');carregarCadastro();
    },'Salvar');
  setTimeout(()=>{
    const prev=document.getElementById('tc-prev');
    function upP(){
      const e=document.getElementById('tc-ent').value,s=document.getElementById('tc-sai').value,i=parseInt(document.getElementById('tc-int').value)||60,sx=document.getElementById('tc-sex').value;
      if(!e||!s)return;
      const hh=calcHH(e,s,i);
      prev.textContent=`HH/dia: ${hh.toFixed(2)}h${sx?` · Sexta: ${calcHH(e,sx,i).toFixed(2)}h`:''}`;
    }
    ['tc-ent','tc-sai','tc-int','tc-sex'].forEach(id=>document.getElementById(id)?.addEventListener('input',upP));
    upP();
  },50);
}

/* ── Modal editar colaborador ── */
function modalColab(c){
  const espOpts=`<option value="">Selecione…</option>`+S.especialidades.map(e=>`<option value="${e.id}" ${c.especialidade_id===e.id?'selected':''}>${e.nome}</option>`).join('');
  abrirModal('Editar colaborador',`
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;gap:8px">
        <div style="max-width:110px">${LBL('Crachá')}<input class="apt-input" value="${c.cracha}" readonly style="background:#f9fafb;color:#6b7280"></div>
        <div style="flex:1">${LBL('Nome')}<input class="apt-input" value="${c.nome}" readonly style="background:#f9fafb;color:#6b7280"></div>
      </div>
      <div style="display:flex;gap:8px">
        <div style="flex:1">${LBL('Modalidade')}
          <select id="nc-mod" class="apt-select">
            <option value="">Selecione…</option>
            ${MODALIDADES.map(m=>`<option value="${m}" ${c.modalidade===m?'selected':''}>${m}</option>`).join('')}
          </select>
        </div>
        <div style="flex:1">${LBL('Especialidade')}<select id="nc-esp" class="apt-select">${espOpts}</select></div>
      </div>
    </div>`,
    async()=>{
      await sb(`apt_colaboradores?cracha=eq.${c.cracha}`,{method:'PATCH',body:JSON.stringify({modalidade:document.getElementById('nc-mod').value||null,especialidade_id:document.getElementById('nc-esp').value||null})});
      fecharModal();showToast('Salvo!','ok');carregarCadastro();
    },'Salvar');
}

/* ── Modal escala do colaborador ── */
function modalEscalaColab(c){
  const escAtual=S.escalas.find(e=>e.id===c.escala_id);
  const escOpts=`<option value="">Selecione…</option>`+S.escalas.map(e=>`<option value="${e.id}" ${c.escala_id===e.id?'selected':''}>${e.nome}</option>`).join('');
  abrirModal('Alterar escala — '+c.nome.split(' ')[0],`
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="font-size:11px;background:var(--bg);border-radius:var(--radius-sm);padding:8px 10px;color:#6b7280">
        Escala atual: <strong style="color:#374151">${escAtual?escAtual.nome:'—'}</strong>
      </div>
      <div style="display:flex;gap:8px">
        <div style="flex:1">${LBL('Nova escala')}<select id="es-esc" class="apt-select">${escOpts}</select></div>
        <div style="flex:1">${LBL('Vigência a partir de')}<input type="date" id="es-vig" value="${hoje()}" class="apt-input"></div>
      </div>
      <div style="display:flex;gap:8px">
        <div style="flex:1">${LBL('Folga de transição?')}
          <select id="es-trans" class="apt-select"><option value="">Não</option><option value="sim">Sim</option></select>
        </div>
        <div style="flex:1" id="es-tdwrap" style="display:none">${LBL('Data transição')}<input type="date" id="es-td" class="apt-input"></div>
      </div>
      <div>${LBL('1ª folga da nova escala')}
        <input type="date" id="es-pf" value="${c.primeira_folga||''}" class="apt-input">
      </div>
      <div>${LBL('Data de referência passada (para projeção retroativa — opcional)')}
        <input type="date" id="es-ref" value="${c.data_ref_folga||''}" class="apt-input">
        <div style="font-size:10px;color:#9ca3af;margin-top:2px">Se informado, projeta folgas para frente e para trás a partir desta data.</div>
      </div>
      <div id="es-prev" style="display:none;font-size:10px;color:var(--green);background:var(--green-l);border-radius:var(--radius-sm);padding:7px 10px"></div>
    </div>`,
    async()=>{
      const escId=document.getElementById('es-esc').value;
      if(!escId){showToast('Selecione uma escala.','erro');return;}
      const vig=document.getElementById('es-vig').value,trans=document.getElementById('es-trans').value;
      const td=document.getElementById('es-td').value,pf=document.getElementById('es-pf').value,ref=document.getElementById('es-ref').value;
      await sb('apt_historico_escalas',{method:'POST',body:JSON.stringify({chapa:c.cracha,escala_anterior:c.escala_id,escala_nova:escId,vigencia_inicio:vig,folga_transicao:trans==='sim'?td:null,primeira_folga_nova:pf||null})});
      await sb(`apt_colaboradores?cracha=eq.${c.cracha}`,{method:'PATCH',body:JSON.stringify({escala_id:escId,primeira_folga:pf||null,data_ref_folga:ref||null})});
      fecharModal();showToast('Escala atualizada!','ok');carregarCadastro();
    },'Salvar');
  setTimeout(()=>{
    const trans=document.getElementById('es-trans'),tdw=document.getElementById('es-tdwrap');
    const escSel=document.getElementById('es-esc'),pfinp=document.getElementById('es-pf'),refinp=document.getElementById('es-ref'),prev=document.getElementById('es-prev');
    trans.addEventListener('change',()=>{tdw.style.display=trans.value==='sim'?'flex':'none';});
    function upPrev(){
      const escId=escSel.value,ancora=refinp.value||pfinp.value;
      if(!escId||!ancora)return;
      const esc=S.escalas.find(e=>String(e.id)===escId);
      if(!esc||esc.tipo_ciclo==='ADM'){prev.style.display='none';return;}
      const ciclo=esc.dias_trabalho+1;
      const fut=[],pass=[];
      let c=ancora;
      for(let i=0;i<5;i++){fut.push(fmtFull(c));c=addDays(c,ciclo);}
      c=addDays(ancora,-ciclo);
      for(let i=0;i<3;i++){pass.unshift(fmtFull(c));c=addDays(c,-ciclo);}
      prev.style.display='block';
      prev.innerHTML=`<i class="ti ti-calendar-check"></i> …${pass.join(' · ')} · <strong>${fmtFull(ancora)}</strong> · ${fut.slice(1).join(' · ')} · …`;
    }
    escSel.addEventListener('change',upPrev);pfinp.addEventListener('change',upPrev);refinp.addEventListener('change',upPrev);
  },50);
}

/* ── Modal turno do colaborador ── */
function modalTurnoColab(c){
  const turAtual=S.turnos.find(t=>t.id===c.turno_id);
  const turOpts=`<option value="">Selecione…</option>`+S.turnos.map(t=>`<option value="${t.id}" ${c.turno_id===t.id?'selected':''}>${t.nome}</option>`).join('');
  abrirModal('Alterar turno — '+c.nome.split(' ')[0],`
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="font-size:11px;background:var(--bg);border-radius:var(--radius-sm);padding:8px 10px;color:#6b7280">Turno atual: <strong style="color:#374151">${turAtual?turAtual.nome:'—'}</strong></div>
      <div style="display:flex;gap:8px">
        <div style="flex:1">${LBL('Novo turno')}<select id="tur-novo" class="apt-select">${turOpts}</select></div>
        <div style="flex:1">${LBL('Vigência a partir de')}<input type="date" id="tur-vig" value="${hoje()}" class="apt-input"></div>
      </div>
      <div>${LBL('Obs. (opcional)')}<input type="text" id="tur-obs" class="apt-input" placeholder="EX: TRANSFERÊNCIA TURNO A→B" oninput="this.value=this.value.toUpperCase()"></div>
    </div>`,
    async()=>{
      const turId=document.getElementById('tur-novo').value;
      if(!turId){showToast('Selecione um turno.','erro');return;}
      const vig=document.getElementById('tur-vig').value,obs=document.getElementById('tur-obs').value;
      await sb('apt_historico_turnos',{method:'POST',body:JSON.stringify({chapa:c.cracha,turno_anterior:c.turno_id,turno_novo:turId,vigencia_inicio:vig,obs:obs||null})});
      await sb(`apt_colaboradores?cracha=eq.${c.cracha}`,{method:'PATCH',body:JSON.stringify({turno_id:parseInt(turId)})});
      fecharModal();showToast('Turno atualizado!','ok');carregarCadastro();
    },'Salvar');
}

/* ── Modal Férias ── */
function modalFerias(c){
  abrirModal('Lançar férias — '+c.nome.split(' ')[0],`
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;gap:8px">
        <div style="flex:1">${LBL('Início')}<input type="date" id="fer-ini" value="${hoje()}" class="apt-input"></div>
        <div style="flex:1">${LBL('Duração (dias)')}<input id="fer-dias" type="number" value="30" min="1" max="90" class="apt-input"></div>
      </div>
      <div>${LBL('Venda de dias?')}
        <select id="fer-venda" class="apt-select"><option value="0">Não</option><option value="10">Sim — 10 dias</option><option value="custom">Personalizado</option></select>
      </div>
      <div id="fer-vcw" style="display:none">${LBL('Dias a vender')}<input id="fer-vc" type="number" value="10" min="1" max="30" class="apt-input" style="width:100px"></div>
      <div id="fer-prev" style="font-size:11px;color:var(--green);background:var(--green-l);border-radius:var(--radius-sm);padding:6px 10px"></div>
    </div>`,
    async()=>{
      const ini=document.getElementById('fer-ini').value,dias=parseInt(document.getElementById('fer-dias').value)||30;
      const vo=document.getElementById('fer-venda').value,vd=vo==='custom'?parseInt(document.getElementById('fer-vc').value)||0:parseInt(vo)||0;
      await sb('apt_ferias',{method:'POST',body:JSON.stringify({chapa:c.cracha,nome:c.nome,data_inicio:ini,data_fim:addDays(ini,dias-1),dias_totais:dias,dias_vendidos:vd})});
      fecharModal();showToast('Férias registradas!','ok');carregarCadastro();
    },'Salvar férias');
  setTimeout(()=>{
    const ini=document.getElementById('fer-ini'),dias=document.getElementById('fer-dias'),vend=document.getElementById('fer-venda'),vcw=document.getElementById('fer-vcw'),prev=document.getElementById('fer-prev');
    vend.addEventListener('change',()=>{vcw.style.display=vend.value==='custom'?'block':'none';upP();});
    ini.addEventListener('change',upP);dias.addEventListener('input',upP);
    function upP(){const i=ini.value,d=parseInt(dias.value)||30;if(!i)return;prev.textContent=`${fmtFull(i)} até ${fmtFull(addDays(i,d-1))} (${d} dias)`;}
    upP();
  },50);
}

/* ── Justificativas ── */
function renderCadJustif(){
  const todos=[...S.justificativas].sort((a,b)=>b.data_inicio<a.data_inicio?1:-1);
  document.getElementById('cad-body').innerHTML=`
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr>${['Data','Colaborador','Tipo','Tratativa','Obs.','Ações'].map(h=>`<th style="text-align:left;padding:6px 10px;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#6b7280">${h}</th>`).join('')}</tr></thead>
        <tbody>${todos.length===0?`<tr><td colspan="6" style="padding:24px;text-align:center;color:#9ca3af">Nenhuma justificativa.</td></tr>`
          :todos.map(j=>`<tr style="border-bottom:1px solid #f9fafb">
            <td style="padding:6px 10px;white-space:nowrap">${fmtDM(j.data_inicio)}${j.data_fim!==j.data_inicio?' – '+fmtDM(j.data_fim):''}</td>
            <td style="padding:6px 10px">${j.nome||j.chapa}</td>
            <td style="padding:6px 10px"><span style="background:${j.tipo.includes('Aus')?'var(--red-l)':'var(--green-l)'};color:${j.tipo.includes('Aus')?'var(--red)':'var(--green)'};font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px">${j.tipo}</span></td>
            <td style="padding:6px 10px;font-size:11px">${j.tratativa||'—'}</td>
            <td style="padding:6px 10px;font-size:11px;color:#6b7280">${j.obs||'—'}</td>
            <td style="padding:6px 10px"><button class="apt-icon-btn"><i class="ti ti-pencil"></i></button></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;}

/* ── Especialidades ── */
function modalEspecialidades(){
  function lista(specs){return specs.length===0?`<tr><td colspan="3" style="padding:12px;text-align:center;color:#9ca3af">Nenhuma especialidade.</td></tr>`:specs.map(e=>`<tr style="border-bottom:1px solid #f9fafb"><td id="esp-cell-${e.id}" style="padding:5px 8px;font-size:12px">${e.nome}</td><td style="width:28px"><button class="apt-icon-btn esp-ed" data-id="${e.id}" data-nome="${e.nome}"><i class="ti ti-pencil"></i></button></td><td style="width:28px"><button class="apt-icon-btn esp-del" data-id="${e.id}" style="color:var(--red)"><i class="ti ti-trash"></i></button></td></tr>`).join('');}
  abrirModal('Gerenciar especialidades',`
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="overflow-y:auto;max-height:200px;border:1px solid var(--border);border-radius:var(--radius-sm)">
        <table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:5px 8px;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6b7280">Especialidade</th><th></th><th></th></tr></thead><tbody id="esp-lista">${lista(S.especialidades)}</tbody></table>
      </div>
      <div style="display:flex;gap:8px">
        <input id="esp-nova" class="apt-input" placeholder="NOVA ESPECIALIDADE…" style="flex:1" oninput="this.value=this.value.toUpperCase()">
        <button id="esp-add" class="dd-action-btn primary" style="height:32px;padding:0 14px;font-family:var(--font)"><i class="ti ti-plus"></i></button>
      </div>
    </div>`);
  function bindEsp(){
    document.getElementById('esp-add').onclick=async()=>{const n=document.getElementById('esp-nova').value.trim();if(!n)return;await sb('apt_especialidades',{method:'POST',body:JSON.stringify({nome:n})});S.especialidades=await sb('apt_especialidades?order=nome.asc');document.getElementById('esp-lista').innerHTML=lista(S.especialidades);document.getElementById('esp-nova').value='';bindEsp();};
    document.querySelectorAll('.esp-ed').forEach(btn=>btn.addEventListener('click',()=>{const id=btn.dataset.id,cel=document.getElementById(`esp-cell-${id}`);cel.innerHTML=`<input id="esp-ei-${id}" class="apt-input" style="height:26px;font-size:11px" value="${btn.dataset.nome}" oninput="this.value=this.value.toUpperCase()">`;btn.innerHTML='<i class="ti ti-check"></i>';btn.onclick=async()=>{const nn=document.getElementById(`esp-ei-${id}`).value.trim();if(!nn)return;await sb(`apt_especialidades?id=eq.${id}`,{method:'PATCH',body:JSON.stringify({nome:nn})});S.especialidades=await sb('apt_especialidades?order=nome.asc');document.getElementById('esp-lista').innerHTML=lista(S.especialidades);bindEsp();};}));
    document.querySelectorAll('.esp-del').forEach(btn=>btn.addEventListener('click',async()=>{if(!confirm('Remover?'))return;await sb(`apt_especialidades?id=eq.${btn.dataset.id}`,{method:'DELETE'});S.especialidades=S.especialidades.filter(e=>String(e.id)!==btn.dataset.id);document.getElementById('esp-lista').innerHTML=lista(S.especialidades);bindEsp();}));
  }
  setTimeout(bindEsp,50);}

async function importarBase(){
  try{
    const apts=await sb('apontamentos?select=chapa,nome&order=nome.asc');
    const mapa={};apts.forEach(a=>{if(a.chapa&&!mapa[a.chapa])mapa[a.chapa]=a.nome;});
    const novos=Object.entries(mapa).filter(([ch])=>!S.colaboradores.find(c=>String(c.cracha)===String(ch)));
    if(!novos.length){showToast('Todos os colaboradores já estão cadastrados.','info');return;}
    if(!confirm(`Importar ${novos.length} colaboradores novos?`))return;
    await sb('apt_colaboradores',{method:'POST',body:JSON.stringify(novos.map(([ch,nome])=>({cracha:ch,nome})))});
    showToast(`${novos.length} importados. Configure modalidade, escala e turno.`,'ok');
    await carregarCadastro();
  }catch(e){showToast('Erro: '+e.message,'erro');}
}

/* ═══════════════════════════════════════════════════════════════
   MODAL GENÉRICO
   ═══════════════════════════════════════════════════════════════ */
function abrirModal(titulo,html,onOk=null,btnLabel='Confirmar'){
  fecharModal();
  const ov=document.createElement('div');ov.id='apt-modal-ov';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px';
  ov.innerHTML=`
    <div style="background:var(--card-bg);border-radius:var(--radius);padding:24px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;box-shadow:var(--shadow-md);font-family:var(--font)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
        <div style="font-size:14px;font-weight:700;color:#111">${titulo}</div>
        <button id="apt-modal-x" class="apt-icon-btn"><i class="ti ti-x"></i></button>
      </div>
      <div>${html}</div>
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
function fecharModal(){document.getElementById('apt-modal-ov')?.remove();}

/* ═══════════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════════ */
async function init(){
  injetarCSS();
  await Promise.all([carregarColabs(),carregarEscalas(),carregarTurnos()]);
  render();
}
if(!window.Modulos)window.Modulos={};
window.Modulos['apontamentos']={init};
init();

})();
