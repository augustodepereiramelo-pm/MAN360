/* ═══════════════════════════════════════════════════════
   MAN360 — Módulo: Programação Semanal
   ═══════════════════════════════════════════════════════ */
window.Modulos = window.Modulos || {};

window.Modulos.prog_semanal = {

  _s: {
    semanas: [], dadosSem: {}, activeSems: [],
    activeEqs: [], eqsPend: [], charts: {},
  },

  async init(container) {
    container.innerHTML = this._tpl();
    await this._carregar();
  },

  _tpl() {
    return `
<div class="filters-bar">
  <span class="filter-label">Equipes</span>
  <div class="dd-wrap">
    <button class="dd-btn" onclick="Modulos.prog_semanal._dd('dd-eq')">
      <i class="ti ti-users"></i><span class="dd-label" id="eq-label">—</span>
      <i class="ti ti-chevron-down dd-arrow"></i>
    </button>
    <div class="dd-panel" id="dd-eq">
      <div class="dd-actions">
        <button class="dd-action-btn primary" onclick="Modulos.prog_semanal._allEq(true)">Todas</button>
        <button class="dd-action-btn secondary" onclick="Modulos.prog_semanal._allEq(false)">Nenhuma</button>
      </div>
      <div id="eq-items"></div>
    </div>
  </div>
  <span class="filter-label">Semana</span>
  <div class="dd-wrap">
    <button class="dd-btn" onclick="Modulos.prog_semanal._dd('dd-sem')">
      <i class="ti ti-calendar"></i><span class="dd-label" id="sem-label">Carregando...</span>
      <i class="ti ti-chevron-down dd-arrow"></i>
    </button>
    <div class="dd-panel" id="dd-sem">
      <div class="dd-actions">
        <button class="dd-action-btn primary" onclick="Modulos.prog_semanal._allSem(true)">SAFRA</button>
        <button class="dd-action-btn secondary" onclick="Modulos.prog_semanal._allSem(false)">Limpar</button>
      </div>
      <div class="dd-sep"></div>
      <div class="dd-group">Safra 2026</div>
      <div id="sem-items"></div>
    </div>
  </div>
</div>

<div class="metrics-row">
  <div class="metric">
    <div class="m-label">H-H Programadas</div>
    <div class="m-val" id="m-hh" style="color:var(--yellow)">—</div>
    <div class="m-sub" id="m-hh-sub">semana selecionada</div>
  </div>
  <div class="metric">
    <div class="m-label">Aderência Global</div>
    <div class="m-val" id="m-adr" style="color:#9ca3af">—</div>
    <div class="m-sub">H-h OS encerradas na prog. / H-h programado</div>
  </div>
  <div class="metric">
    <div class="m-label">Pré-OS Abertas</div>
    <div class="m-val" id="m-preos" style="color:var(--yellow)">—</div>
    <div class="m-sub">situação "Aguardando"</div>
  </div>
  <div class="metric">
    <div class="m-label">Tempo Médio Pré → OS</div>
    <div class="m-val" id="m-tempo" style="color:var(--green)">—</div>
    <div class="m-sub">média geral da safra</div>
  </div>
</div>

<div class="charts-row">
  <div class="chart-wrap">
    <div class="card-title">H-H PROGRAMADO</div>
    <div class="chart-container"><canvas id="c1"></canvas></div>
  </div>
  <div class="chart-wrap">
    <div class="card-title">ADERÊNCIA DA PROGRAMAÇÃO <span style="font-weight:400;color:#9ca3af">meta: 80%</span></div>
    <div class="chart-container"><canvas id="c2"></canvas></div>
  </div>
</div>
<div class="charts-row">
  <div class="chart-wrap">
    <div class="card-title">ADERÊNCIA GLOBAL <span style="font-weight:400;color:#9ca3af">semana a semana</span></div>
    <div class="chart-container"><canvas id="c3"></canvas></div>
  </div>
  <div class="chart-wrap">
    <div class="card-title">EFICIÊNCIA DO PLANEJAMENTO <span style="font-weight:400;color:#9ca3af">H-h previsto × realizado (OS encerradas)</span></div>
    <div class="chart-container"><canvas id="c4"></canvas></div>
  </div>
</div>
<div class="chart-wrap" style="margin-bottom:12px">
  <div class="card-title">DISTRIBUIÇÃO H-H POR MODALIDADE
    <span style="font-weight:400;color:#9ca3af;margin-left:8px">OS encerradas no período selecionado</span>
    <span style="margin-left:16px;font-size:10px;font-weight:600">
      <span style="color:#E24B4A">⬤ MCU</span>
      <span style="color:#16a34a;margin-left:8px">⬤ Dentro da prog.</span>
      <span style="color:#2563eb;margin-left:8px">⬤ Fora da prog.</span>
    </span>
  </div>
  <div class="chart-container-wide"><canvas id="c5"></canvas></div>
</div>

<div class="charts-row">
  <div class="card">
    <div class="card-title"><i class="ti ti-alert-triangle" style="color:var(--amber)"></i> PONTOS DE ATENÇÃO</div>
    <div id="alertas-body"><div style="padding:12px 0;font-size:12px;color:#9ca3af;text-align:center">Carregando...</div></div>
  </div>
  <div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div class="card-title" style="margin:0"><i class="ti ti-arrows-right-left" style="color:var(--yellow)"></i> REPROGRAMADAS NÃO EXECUTADAS</div>
      <span id="repr-count" style="font-size:10px;color:#9ca3af"></span>
    </div>
    <div id="repr-body"><div style="padding:12px 0;font-size:12px;color:#9ca3af;text-align:center">Carregando...</div></div>
  </div>
</div>

<div class="import-section"><div class="card">
  <div class="card-title"><i class="ti ti-upload" style="color:var(--yellow)"></i> IMPORTAR DADOS</div>
  <div style="display:grid;grid-template-columns:1fr auto;gap:16px;align-items:start">
    <div class="dropzone" id="dz"
      ondragover="event.preventDefault();this.classList.add('over')"
      ondragleave="this.classList.remove('over')"
      ondrop="Modulos.prog_semanal._drop(event)"
      onclick="document.getElementById('file-input').click()">
      <i class="ti ti-cloud-upload"></i>
      <p><strong>Arraste o arquivo aqui</strong><br>ou clique para selecionar</p>
      <div class="file-types" style="margin-top:10px">
        <div class="file-type"><i class="ti ti-file-spreadsheet" style="color:var(--green)"></i><span class="ext">.xlsx</span></div>
        <div class="file-type"><i class="ti ti-file-spreadsheet" style="color:var(--amber)"></i><span class="ext">.xls</span></div>
      </div>
    </div>
    <div style="font-size:11px;color:#6b7280;min-width:160px">
      <div style="font-weight:600;color:#374151;margin-bottom:8px">Arquivos aceitos:</div>
      <div>• Programação Semanal</div><div>• Ordens de Serviço</div>
      <div>• Apontamentos</div><div>• Pré-Ordens</div>
    </div>
  </div>
  <input type="file" id="file-input" accept=".xlsx,.xls,.csv" style="display:none"
    onchange="Modulos.prog_semanal._filesel(event)">
  <div style="margin-top:16px">
    <div class="hist-title">IMPORTAÇÕES RECENTES</div>
    <div id="hist-list"></div>
  </div>
</div></div>`;
  },

  /* ══════════════════════════════════════════
     CARREGAR DADOS
  ══════════════════════════════════════════ */
  async _carregar() {
    showBanner('Carregando...', true);
    try {
      const db = getDB();

      /* 1. Programação semanal */
      const { data: prog, error: e1 } = await db
        .from('programacao_semanal')
        .select('semana,ano,equipe,hh_previsto,data_inicio_semana,data_fim_semana')
        .order('semana', { ascending: true });
      if (e1) throw e1;

      if (!prog || !prog.length) {
        showBanner('Sem dados. Importe as planilhas abaixo.', true);
        this._initCharts([]);
        this._preosAbertas();
        this._tempoMedio();
        return;
      }

      /* 2. Equipes na programação vs equipes com OS */
      const eqsProg = [...new Set(prog.map(r => r.equipe).filter(Boolean))].sort();
      const { data: osEqData } = await db.from('ordens_servico').select('equipe').not('equipe','is',null);
      const eqsComOS = new Set((osEqData||[]).map(r => r.equipe).filter(Boolean));
      const eqsPend  = eqsProg.filter(eq => !eqsComOS.has(eq));

      if (eqsPend.length)
        showBanner('Pendente importação das OS das equipes: ' + eqsPend.join(', ') + '. Aderência não calculada para essas equipes.', true);
      else
        showBanner('', false);

      /* 3. Agrupar H-h previsto + info de semana */
      const ag = {}, semInfos = {};
      prog.forEach(r => {
        const k = r.semana + '/' + r.ano;
        if (!ag[k]) ag[k] = {};
        if (!semInfos[k]) semInfos[k] = { semana: r.semana, ano: r.ano, dataIni: r.data_inicio_semana, dataFim: r.data_fim_semana };
        if (r.equipe) {
          if (!ag[k][r.equipe]) ag[k][r.equipe] = { prev: 0, prevEnc: 0, hhPrevEnc: 0, hhRealEnc: 0 };
          ag[k][r.equipe].prev += parseFloat(r.hh_previsto) || 0;
        }
      });

      /* 4. Para cada semana: OS encerradas na programação (aderência + eficiência) */
      for (const k of Object.keys(semInfos)) {
        const { semana, ano, dataIni, dataFim } = semInfos[k];
        if (!dataIni || !dataFim) continue;

        /* OS programadas nessa semana */
        const { data: progSem } = await db
          .from('programacao_semanal')
          .select('os,cod_servico,equipe,hh_previsto')
          .eq('semana', semana).eq('ano', ano);
        if (!progSem || !progSem.length) continue;

        const osNums = [...new Set(progSem.map(p => p.os))];

        /* Status e Hh das OS programadas */
        const { data: osInfo } = await db
          .from('ordens_servico')
          .select('os,cod_servico,status_os,hh_prev_servico,hh_real_servico')
          .in('os', osNums.slice(0,500));

        const mapaOS = {};
        (osInfo||[]).forEach(o => { mapaOS[o.os+'|'+(o.cod_servico||'?')] = o; });

        progSem.forEach(p => {
          const eq  = p.equipe;
          const inf = mapaOS[p.os+'|'+(p.cod_servico||'?')];
          if (!eq || !ag[k] || !ag[k][eq] || !inf) return;
          if (inf.status_os === '4 - Encerrada') {
            const hhProg = parseFloat(p.hh_previsto) || 0;
            ag[k][eq].prevEnc    += hhProg;
            ag[k][eq].hhPrevEnc  += hhProg;
            ag[k][eq].hhRealEnc  += parseFloat(inf.hh_real_servico) || 0;
          }
        });

        /* 5. Distribuição por modalidade: OS encerradas no período (data_encerramento) */
        /* Chaves da programação desta semana */
        const chavProg = new Set(progSem.map(p => p.os+'|'+(p.cod_servico||'?')));

        const { data: osEnc } = await db
          .from('ordens_servico')
          .select('os,cod_servico,tipo_atividade,modalidade,hh_real_servico')
          .eq('status_os', '4 - Encerrada')
          .gte('data_encerramento', dataIni)
          .lte('data_encerramento', dataFim);

        if (!ag[k]['_dist']) ag[k]['_dist'] = {};
        (osEnc||[]).forEach(o => {
          const modal = (o.modalidade||'OUTROS').toUpperCase().trim();
          const hhR   = parseFloat(o.hh_real_servico) || 0;
          if (!ag[k]['_dist'][modal]) ag[k]['_dist'][modal] = { mcu:0, dentro:0, fora:0 };
          const chav = o.os+'|'+(o.cod_servico||'?');
          if (o.tipo_atividade === 'MCU')       ag[k]['_dist'][modal].mcu   += hhR;
          else if (chavProg.has(chav))           ag[k]['_dist'][modal].dentro += hhR;
          else                                   ag[k]['_dist'][modal].fora   += hhR;
        });

        /* Arredondar */
        Object.values(ag[k]).forEach(v => {
          if (typeof v === 'object' && v !== null && !v.mcu && !v.dentro && !v.fora) {
            v.prev     = Math.round((v.prev||0)*10)/10;
            v.prevEnc  = Math.round((v.prevEnc||0)*10)/10;
            v.hhPrevEnc = Math.round((v.hhPrevEnc||0)*10)/10;
            v.hhRealEnc = Math.round((v.hhRealEnc||0)*10)/10;
          }
        });
      }

      this._s.dadosSem   = ag;
      this._s.semanas    = Object.values(semInfos).sort((a,b) => a.semana - b.semana);
      this._s.eqsPend    = eqsPend;
      this._s.activeEqs  = eqsProg;

      const ult = this._s.semanas[this._s.semanas.length-1];
      this._s.activeSems = ult ? [ult.semana+'/'+ult.ano] : [];

      this._buildEqDD(eqsProg);
      this._buildSemDD();
      this._initCharts();
      this._preosAbertas();
      this._tempoMedio();

    } catch(err) {
      console.error(err);
      showBanner('Erro ao carregar: ' + err.message, true);
    }
  },

  /* ══════════════════════════════════════════
     MÉTRICAS SIMPLES
  ══════════════════════════════════════════ */
  async _preosAbertas() {
    try {
      const { count } = await getDB()
        .from('pre_ordens')
        .select('*', { count:'exact', head:true })
        .eq('situacao', 'Aguardando');
      const el = document.getElementById('m-preos');
      if (el) el.textContent = (count != null ? count : '—');
    } catch(e) { console.warn('preosAbertas:', e); }
  },

  async _tempoMedio() {
    try {
      const db = getDB();
      const { data: preos } = await db.from('pre_ordens')
        .select('os,data_comunicacao').not('os','is',null).neq('os','');
      if (!preos || !preos.length) return;

      const osNums = [...new Set(preos.map(p=>p.os).filter(Boolean))];
      const { data: ords } = await db.from('ordens_servico')
        .select('os,data_geracao').in('os', osNums.slice(0,500)).not('data_geracao','is',null);
      if (!ords || !ords.length) return;

      const mapa = {};
      ords.forEach(o => { mapa[o.os] = o.data_geracao; });

      const diffs = [];
      preos.forEach(p => {
        const dG = mapa[p.os], dC = p.data_comunicacao;
        if (!dG || !dC) return;
        const d = (new Date(dG) - new Date(dC)) / 86400000;
        if (d >= 0 && d < 365) diffs.push(d);
      });

      if (!diffs.length) return;
      const media = diffs.reduce((a,b)=>a+b,0) / diffs.length;
      const el = document.getElementById('m-tempo');
      if (el) { el.textContent = media.toFixed(1)+' dias'; el.style.color = media<=3?'#16a34a':'#d97706'; }
    } catch(e) { console.warn('tempoMedio:', e); }
  },

  /* ══════════════════════════════════════════
     DROPDOWNS
  ══════════════════════════════════════════ */
  _buildEqDD(eqs) {
    const box = document.getElementById('eq-items');
    if (!box) return;
    box.innerHTML = '';
    eqs.forEach(eq => {
      const lbl = document.createElement('label');
      lbl.className = 'dd-item';
      lbl.innerHTML = '<input type="checkbox" name="eq" value="'+eq+'" checked onchange="Modulos.prog_semanal._onEq()"> '+eq;
      box.appendChild(lbl);
    });
    document.getElementById('eq-label').textContent = eqs.join(', ');
  },

  _buildSemDD() {
    const box = document.getElementById('sem-items');
    if (!box) return;
    box.innerHTML = '';
    this._s.semanas.forEach(({semana,ano,dataIni}) => {
      const k = semana+'/'+ano;
      const checked = this._s.activeSems.includes(k);
      const lbl = document.createElement('label');
      lbl.className = 'dd-item';
      lbl.innerHTML = '<input type="checkbox" name="sem" value="'+k+'" '+(checked?'checked':'')+' onchange="Modulos.prog_semanal._onSem()"> Sem '+semana
        +(dataIni?'<span style="color:#9ca3af;font-size:10px;margin-left:4px">'+dataIni.slice(5).replace('-','/')+'</span>':'');
      box.appendChild(lbl);
    });
    this._updSemLabel();
  },

  _dd(id) { toggleDD(id); },
  _onEq() {
    this._s.activeEqs = [...document.querySelectorAll('[name=eq]:checked')].map(c=>c.value);
    document.getElementById('eq-label').textContent = this._s.activeEqs.join(', ') || 'Nenhuma';
    this._update();
  },
  _allEq(all) {
    document.querySelectorAll('[name=eq]').forEach(c=>{c.checked=all;});
    this._onEq();
    document.getElementById('dd-eq').classList.remove('show');
  },
  _onSem() {
    this._s.activeSems = [...document.querySelectorAll('[name=sem]:checked')].map(c=>c.value);
    this._updSemLabel();
    this._update();
    this._reprog();
  },
  _allSem(all) {
    document.querySelectorAll('[name=sem]').forEach(c=>{c.checked=all;});
    if (!all && this._s.semanas.length) {
      const u = this._s.semanas[this._s.semanas.length-1];
      const cb = document.querySelector('[name=sem][value="'+u.semana+'/'+u.ano+'"]');
      if (cb) cb.checked = true;
    }
    this._onSem();
    document.getElementById('dd-sem').classList.remove('show');
  },
  _updSemLabel() {
    this._s.activeSems = [...document.querySelectorAll('[name=sem]:checked')].map(c=>c.value);
    const n = this._s.activeSems.length, t = this._s.semanas.length;
    const lbl = n===t&&t>0 ? 'SAFRA (todas)' : n===0 ? 'Nenhuma' : this._s.activeSems.map(k=>'Sem '+k.split('/')[0]).join(', ');
    const el = document.getElementById('sem-label');
    if (el) el.textContent = lbl;
  },

  /* ══════════════════════════════════════════
     CHARTS
  ══════════════════════════════════════════ */
  _initCharts() {
    const Y='#F8C100',G='#16a34a',R='#E24B4A',B='#2563eb';
    const tC='rgba(80,80,80,.9)', gC='rgba(0,0,0,.06)';
    const base = { responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} } };

    Object.values(this._s.charts).forEach(c=>c.destroy());
    this._s.charts = {};
    const ch = this._s.charts;

    ch.c1 = new Chart(document.getElementById('c1'),{
      type:'bar', data:{ labels:[], datasets:[{data:[],backgroundColor:Y,borderRadius:4}] },
      options:{...base,scales:{x:{ticks:{color:tC,font:{size:10}},grid:{display:false}},y:{ticks:{color:tC,font:{size:10},callback:v=>v+'h'},grid:{color:gC}}}}
    });

    ch.c2 = new Chart(document.getElementById('c2'),{
      type:'bar',
      data:{ labels:[], datasets:[
        {data:[],backgroundColor:[],borderRadius:4,order:2},
        {type:'line',data:[],borderColor:Y,borderWidth:2,borderDash:[6,4],pointRadius:0,fill:false,label:'Meta 80%',order:1}
      ]},
      options:{...base,plugins:{...base.plugins,legend:{display:false}},
        scales:{x:{ticks:{color:tC,font:{size:10}},grid:{display:false}},y:{min:0,max:100,ticks:{color:tC,font:{size:10},callback:v=>v+'%'},grid:{color:gC}}}}
    });

    ch.c3 = new Chart(document.getElementById('c3'),{
      type:'bar',
      data:{ labels:[], datasets:[
        {data:[],backgroundColor:[],borderRadius:4,order:2},
        {type:'line',data:[],borderColor:Y,borderWidth:2,borderDash:[6,4],pointRadius:0,fill:false,label:'Meta 80%',order:1}
      ]},
      options:{...base,plugins:{...base.plugins,legend:{display:false}},
        scales:{x:{ticks:{color:tC,font:{size:10}},grid:{display:false}},y:{min:0,max:100,ticks:{color:tC,font:{size:10},callback:v=>v+'%'},grid:{color:gC}}}}
    });

    ch.c4 = new Chart(document.getElementById('c4'),{
      type:'bar',
      data:{ labels:[], datasets:[
        {label:'Previsto', data:[],backgroundColor:Y,borderRadius:4},
        {label:'Realizado',data:[],backgroundColor:[],borderRadius:4}
      ]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:true,labels:{color:tC,font:{size:10},boxWidth:10}}},
        scales:{x:{ticks:{color:tC,font:{size:10}},grid:{display:false}},y:{ticks:{color:tC,font:{size:10},callback:v=>v+'h'},grid:{color:gC}}}}
    });

    ch.c5 = new Chart(document.getElementById('c5'),{
      type:'bar', indexAxis:'y',
      data:{ labels:[], datasets:[
        {label:'MCU',            data:[],backgroundColor:R,borderRadius:0},
        {label:'Dentro da prog.',data:[],backgroundColor:G,borderRadius:0},
        {label:'Fora da prog.',  data:[],backgroundColor:B,borderRadius:0}
      ]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>' '+ctx.dataset.label+': '+ctx.raw+'h'}}},
        scales:{
          x:{stacked:true,ticks:{color:tC,font:{size:10},callback:v=>v+'h'},grid:{color:gC}},
          y:{stacked:true,ticks:{color:tC,font:{size:10}},grid:{display:false}}
        }}
    });

    this._update();
  },

  _update() {
    const {charts:ch, activeSems:sems, activeEqs:eqs, dadosSem:ds, semanas, eqsPend} = this._s;
    if (!Object.keys(ch).length) return;
    const G='#16a34a', R='#E24B4A', CINZA='#d1d5db';

    /* H-h previsto por equipe */
    const prev = eqs.map(eq => sems.reduce((s,k)=>s+((ds[k]&&ds[k][eq])?ds[k][eq].prev:0),0));

    /* Aderência: prevEnc / prev */
    const adr = eqs.map((eq,i) => {
      if (eqsPend.includes(eq)) return -1;
      const pEnc = sems.reduce((s,k)=>s+((ds[k]&&ds[k][eq])?ds[k][eq].prevEnc:0),0);
      return prev[i] ? Math.round(pEnc/prev[i]*100) : 0;
    });

    /* Aderência global */
    let tP=0, tE=0;
    eqs.forEach((eq,i)=>{ if(!eqsPend.includes(eq)){tP+=prev[i]; tE+=sems.reduce((s,k)=>s+((ds[k]&&ds[k][eq])?ds[k][eq].prevEnc:0),0);} });
    const adrGlob = tP ? Math.round(tE/tP*100) : 0;

    /* Eficiência: hhPrevEnc × hhRealEnc */
    const hhPE = eqs.map(eq=>sems.reduce((s,k)=>s+((ds[k]&&ds[k][eq])?ds[k][eq].hhPrevEnc:0),0));
    const hhRE = eqs.map(eq=>sems.reduce((s,k)=>s+((ds[k]&&ds[k][eq])?ds[k][eq].hhRealEnc:0),0));

    /* Aderência semana a semana */
    const semLbl=[], semVals=[];
    semanas.forEach(({semana,ano})=>{
      const k=semana+'/'+ano; if(!ds[k]) return;
      let p=0,e=0;
      eqs.forEach(eq=>{ if(!eqsPend.includes(eq)&&ds[k][eq]){p+=ds[k][eq].prev;e+=ds[k][eq].prevEnc;} });
      semLbl.push('Sem '+semana); semVals.push(p?Math.round(e/p*100):0);
    });

    /* Distribuição por modalidade */
    const modAcum = {};
    sems.forEach(k=>{
      const dist = ds[k] && ds[k]['_dist'];
      if (!dist) return;
      Object.keys(dist).forEach(m=>{
        if (!modAcum[m]) modAcum[m]={mcu:0,dentro:0,fora:0};
        modAcum[m].mcu    += dist[m].mcu    || 0;
        modAcum[m].dentro += dist[m].dentro || 0;
        modAcum[m].fora   += dist[m].fora   || 0;
      });
    });
    const mods = Object.keys(modAcum).sort();

    /* Métricas cabeçalho */
    const totalPrev = prev.reduce((a,b)=>a+b,0);
    const mHH = document.getElementById('m-hh');
    const mAdr = document.getElementById('m-adr');
    const mSub = document.getElementById('m-hh-sub');
    if (mHH)  mHH.textContent  = totalPrev.toLocaleString('pt-BR')+'h';
    if (mSub) mSub.textContent = eqs.length+' equipe'+(eqs.length!==1?'s':'')+' · '+sems.length+' semana'+(sems.length!==1?'s':'');
    if (mAdr) { mAdr.textContent=adrGlob+'%'; mAdr.style.color=adrGlob>=80?G:(adrGlob>0?R:'#9ca3af'); }

    /* C1 */
    ch.c1.data.labels=eqs; ch.c1.data.datasets[0].data=prev.map(v=>Math.round(v*10)/10); ch.c1.update('none');

    /* C2 */
    ch.c2.data.labels=eqs;
    ch.c2.data.datasets[0].data=adr.map(v=>v===-1?0:v);
    ch.c2.data.datasets[0].backgroundColor=adr.map(v=>v===-1?CINZA:v>=80?G:v>0?R:'#9ca3af');
    ch.c2.data.datasets[1].data=eqs.map(()=>80);
    ch.c2.update('none');

    /* C3 */
    ch.c3.data.labels=semLbl;
    ch.c3.data.datasets[0].data=semVals;
    ch.c3.data.datasets[0].backgroundColor=semVals.map(v=>v>=80?G:v>0?R:'#9ca3af');
    ch.c3.data.datasets[1].data=semLbl.map(()=>80);
    ch.c3.update('none');

    /* C4 */
    ch.c4.data.labels=eqs;
    ch.c4.data.datasets[0].data=hhPE.map(v=>Math.round(v*10)/10);
    ch.c4.data.datasets[1].data=hhRE.map(v=>Math.round(v*10)/10);
    ch.c4.data.datasets[1].backgroundColor=hhRE.map((r,i)=>hhPE[i]&&r/hhPE[i]>=0.8?G:r>0?R:'#9ca3af');
    ch.c4.update('none');

    /* C5 */
    ch.c5.data.labels=mods;
    ch.c5.data.datasets[0].data=mods.map(m=>Math.round(modAcum[m].mcu*10)/10);
    ch.c5.data.datasets[1].data=mods.map(m=>Math.round(modAcum[m].dentro*10)/10);
    ch.c5.data.datasets[2].data=mods.map(m=>Math.round(modAcum[m].fora*10)/10);
    ch.c5.update('none');

    /* Alertas */
    this._alertas(adr, eqs);
    this._reprog();
  },

  /* ══════════════════════════════════════════
     ALERTAS
  ══════════════════════════════════════════ */
  _alertas(adr, eqs) {
    const el = document.getElementById('alertas-body');
    if (!el) return;
    const {eqsPend, dadosSem:ds, semanas, activeSems:sems} = this._s;
    const G='#16a34a', R='#dc2626', AM='#d97706', BL='#2563eb';
    const alertas = [];

    eqsPend.forEach(eq => {
      if (eqs.includes(eq))
        alertas.push({c:AM,i:'ti-alert-circle',t:'<strong>'+eq+'</strong>: OS não importadas — aderência indisponível'});
    });

    eqs.forEach((eq,i) => {
      if (eqsPend.includes(eq)) return;
      const a = adr[i];

      if (a === 0) {
        alertas.push({c:AM,i:'ti-circle-off',t:'<strong>'+eq+'</strong>: nenhuma OS encerrada na programação desta semana'});
        return;
      }
      if (a > 0 && a < 80) {
        /* Contar semanas consecutivas abaixo da meta */
        const semsOrd = [...semanas].sort((x,y)=>x.semana-y.semana);
        const ultKey  = sems.slice().sort().pop();
        const idx     = semsOrd.findIndex(s=>s.semana+'/'+s.ano===ultKey);
        let consec = 0;
        for (let k=idx-1; k>=0; k--) {
          const kk = semsOrd[k].semana+'/'+semsOrd[k].ano;
          const d  = ds[kk]&&ds[kk][eq];
          if (!d) break;
          const aAnt = d.prev ? Math.round(d.prevEnc/d.prev*100) : 0;
          if (aAnt < 80) consec++; else break;
        }
        let txt = '<strong>'+eq+'</strong>: aderência de <strong>'+a+'%</strong> — abaixo da meta de 80%';
        if (consec >= 1) txt += ' — <strong>'+(consec+1)+' semanas consecutivas</strong>';
        alertas.push({c:R,i:'ti-trending-down',t:txt});
      }

      /* Eficiência */
      const hhPE = sems.reduce((s,k)=>s+((ds[k]&&ds[k][eq])?ds[k][eq].hhPrevEnc:0),0);
      const hhRE = sems.reduce((s,k)=>s+((ds[k]&&ds[k][eq])?ds[k][eq].hhRealEnc:0),0);
      if (hhPE > 0) {
        const ef = Math.round(hhRE/hhPE*100);
        if (ef < 80 && a >= 80)
          alertas.push({c:AM,i:'ti-chart-bar',t:'<strong>'+eq+'</strong>: aderência OK mas eficiência em <strong>'+ef+'%</strong> — H-h realizado abaixo do previsto nas OS encerradas'});
        if (ef > 130)
          alertas.push({c:AM,i:'ti-alert-triangle',t:'<strong>'+eq+'</strong>: eficiência em <strong>'+ef+'%</strong> — H-h realizado muito acima do previsto, revisar dimensionamento'});
      }

      /* H-h acima da média histórica */
      const prevEq = sems.reduce((s,k)=>s+((ds[k]&&ds[k][eq])?ds[k][eq].prev:0),0);
      const hist = semanas.map(s=>{const k=s.semana+'/'+s.ano; return ds[k]&&ds[k][eq]?ds[k][eq].prev:0;}).filter(v=>v>0);
      if (hist.length > 1) {
        const med = hist.reduce((a,b)=>a+b,0)/hist.length;
        if (prevEq > med*1.4)
          alertas.push({c:BL,i:'ti-info-circle',t:'<strong>'+eq+'</strong>: H-h programado ('+Math.round(prevEq)+'h) acima da média histórica ('+Math.round(med)+'h/sem)'});
      }
    });

    if (!alertas.length) {
      el.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:10px 0;color:#16a34a;font-size:12px"><i class="ti ti-circle-check" style="font-size:18px"></i><span>Nenhum ponto de atenção para o período selecionado</span></div>';
      return;
    }
    const cMap={red:'#dc2626',amber:'#d97706',blue:'#2563eb'};
    el.innerHTML = alertas.map(a=>'<div style="display:flex;align-items:flex-start;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);font-size:12px"><i class="ti '+a.i+'" style="font-size:16px;flex-shrink:0;margin-top:1px;color:'+a.c+'"></i><div>'+a.t+'</div></div>').join('');
  },

  /* ══════════════════════════════════════════
     REPROGRAMADAS
  ══════════════════════════════════════════ */
  async _reprog() {
    const reprEl = document.getElementById('repr-body');
    const cntEl  = document.getElementById('repr-count');
    if (!reprEl) return;
    const {activeSems:sems, semanas, eqsPend} = this._s;
    if (!sems.length) { reprEl.innerHTML='<div style="padding:12px 0;font-size:12px;color:#9ca3af;text-align:center">Selecione uma semana</div>'; return; }

    try {
      const db = getDB();
      const semsOrd = [...semanas].sort((a,b)=>a.semana-b.semana);
      const semAtualKey = sems.slice().sort().pop();
      const [semAtual,anoAtual] = semAtualKey.split('/').map(Number);
      const semAnt = semsOrd.filter(s=>s.semana<semAtual||(s.semana===semAtual&&s.ano<anoAtual));

      if (!semAnt.length) { reprEl.innerHTML='<div style="padding:12px 0;font-size:12px;color:#9ca3af;text-align:center">Nenhuma semana anterior disponível</div>'; return; }

      /* OS programadas na semana atual */
      const {data:pAtual} = await db.from('programacao_semanal')
        .select('os,cod_servico,equipe,desc_servico,hh_previsto')
        .eq('semana',semAtual).eq('ano',anoAtual);
      if (!pAtual||!pAtual.length) { reprEl.innerHTML='<div style="padding:12px 0;font-size:12px;color:#9ca3af;text-align:center">Sem programação para a semana selecionada</div>'; return; }

      /* Status atual das OS */
      const osNums = [...new Set(pAtual.map(p=>p.os))];
      const {data:osS} = await db.from('ordens_servico').select('os,cod_servico,status_os').in('os',osNums.slice(0,500));
      const mSt = {};
      (osS||[]).forEach(o=>{ mSt[o.os+'|'+(o.cod_servico||'?')]=o.status_os; });

      const chavAtual = {};
      pAtual.forEach(p=>{ chavAtual[p.os+'|'+(p.cod_servico||'?')]=p; });

      /* Rastrear em semanas anteriores */
      const hist = {};
      for (const si of semAnt.slice().reverse()) {
        const {data:pA} = await db.from('programacao_semanal').select('os,cod_servico').eq('semana',si.semana).eq('ano',si.ano);
        (pA||[]).forEach(p=>{
          const ch = p.os+'|'+(p.cod_servico||'?');
          if (chavAtual[ch]) { if(!hist[ch]) hist[ch]=[]; hist[ch].push(si.semana); }
        });
      }

      /* Reprogramadas = na semana atual + em semana anterior + não encerrada */
      const reprog = [];
      Object.keys(chavAtual).forEach(ch=>{
        const prev = hist[ch];
        if (!prev||!prev.length) return;
        const st = mSt[ch]||'';
        if (st==='4 - Encerrada') return;
        const p = chavAtual[ch];
        const desde = prev[prev.length-1];
        reprog.push({os:p.os,desc:p.desc_servico||'—',hh:p.hh_previsto||0,
          equipe:p.equipe||'Sem equipe',desde,nSems:semAtual-desde+1,status:st});
      });

      const porEq = {};
      reprog.forEach(r=>{ if(!porEq[r.equipe]) porEq[r.equipe]=[]; porEq[r.equipe].push(r); });
      if (cntEl) cntEl.textContent = reprog.length+' serviço'+(reprog.length!==1?'s':'');

      const eqsNaSem = [...new Set(pAtual.map(p=>p.equipe).filter(Boolean))];
      const pendNa   = eqsNaSem.filter(eq=>eqsPend.includes(eq));
      let html = '';
      if (pendNa.length)
        html += '<div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:11px;color:#92400e;display:flex;align-items:center;gap:8px"><i class="ti ti-alert-triangle"></i><span>Equipes sem OS importada não contabilizadas: <strong>'+pendNa.join(', ')+'</strong></span></div>';

      if (!reprog.length) {
        html += '<div style="display:flex;align-items:center;gap:8px;padding:10px 0;color:#16a34a;font-size:12px"><i class="ti ti-circle-check" style="font-size:18px"></i><span>Nenhuma OS reprogramada para a Semana '+semAtual+'</span></div>';
        reprEl.innerHTML = html; return;
      }

      Object.entries(porEq).filter(([eq])=>!eqsPend.includes(eq)).forEach(([eq,items])=>{
        html += '<div style="margin-bottom:14px">';
        html += '<div style="font-size:10px;font-weight:700;letter-spacing:.08em;color:#6b7280;text-transform:uppercase;padding:4px 0;border-bottom:2px solid var(--border);margin-bottom:6px;display:flex;align-items:center;justify-content:space-between"><span>'+eq+'</span><span style="color:#9ca3af;font-weight:400">'+items.length+' serviço'+(items.length!==1?'s':'')+'</span></div>';
        items.sort((a,b)=>b.nSems-a.nSems).forEach(r=>{
          const bgC = r.nSems>=3?'#fee2e2':r.nSems===2?'#fef3c7':'#f3f4f6';
          const tC2 = r.nSems>=3?'#dc2626':r.nSems===2?'#92400e':'#6b7280';
          html += '<div style="display:grid;grid-template-columns:56px 1fr auto auto;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:11px">';
          html += '<span style="font-weight:700;color:#374151">'+r.os+'</span>';
          html += '<span style="color:#6b7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+r.desc+'">'+r.desc+'</span>';
          html += '<span style="color:#9ca3af;font-size:10px;white-space:nowrap">'+r.hh+'h</span>';
          html += '<span style="padding:2px 7px;border-radius:4px;font-size:9px;font-weight:700;white-space:nowrap;background:'+bgC+';color:'+tC2+'">Desde Sem '+r.desde+' ('+r.nSems+' sem.)</span>';
          html += '</div>';
        });
        html += '</div>';
      });
      reprEl.innerHTML = html || '<div style="padding:8px 0;font-size:12px;color:#9ca3af;text-align:center">Nenhum serviço reprogramado nas equipes com OS importada</div>';

    } catch(e) { console.error('Reprog:',e); reprEl.innerHTML='<div style="color:#dc2626;font-size:12px;padding:8px">Erro: '+e.message+'</div>'; }
  },

  /* ══════════════════════════════════════════
     IMPORTAÇÃO
  ══════════════════════════════════════════ */
  _drop(e) { e.preventDefault(); document.getElementById('dz').classList.remove('over'); const f=e.dataTransfer.files[0]; if(f) this._proc(f); },
  _filesel(e) { const f=e.target.files[0]; if(f) this._proc(f); e.target.value=''; },
  async _proc(file) {
    showToast('Lendo '+file.name+'...','info');
    const res = await processarArquivo(file);
    showToast(res.msg, res.ok?'ok':'erro', res.ok?4000:6000);
    this._hist(file.name, res.msg, res.ok);
    if (res.ok) await this._carregar();
  },
  _hist(nome,badge,ok) {
    const hora = new Date().getHours()+':'+String(new Date().getMinutes()).padStart(2,'0');
    const list = document.getElementById('hist-list');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'hist-row';
    row.innerHTML = '<i class="ti ti-file-spreadsheet" style="color:'+(ok?'var(--green)':'#dc2626')+'"></i><span class="hist-name" title="'+nome+'">'+nome+'</span><span class="hist-date">hoje '+hora+'</span><span class="hist-badge '+(ok?'hb-ok':'hb-err')+'">'+badge+'</span>';
    list.insertAdjacentElement('afterbegin', row);
  },
  exportar() { showToast('Exportação PDF em desenvolvimento','info'); },
};
