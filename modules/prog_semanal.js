/* ═══════════════════════════════════════════════════════
   MAN360 — Módulo: Programação Semanal
   ═══════════════════════════════════════════════════════ */
window.Modulos = window.Modulos || {};

window.Modulos.prog_semanal = {

  _state: {
    semanas:      [],   // [{semana,ano,dataIni,dataFim}]
    dadosSem:     {},   // {'8/2026': {MEC1:{prev,real,adr}, ...}}
    activeSems:   [],
    activeEqs:    [],
    eqsPendentes: [],
    charts:       {},
  },

  /* ── Init ── */
  async init(container) {
    container.innerHTML = this._template();
    await this._carregarDados();
  },

  /* ── Template ── */
  _template() {
    const eqs = MAN360_CONFIG.equipes;
    return `
<div class="filters-bar">
  <span class="filter-label">Equipes</span>
  <div class="dd-wrap">
    <button class="dd-btn" onclick="Modulos.prog_semanal._toggleDD('dd-eq')">
      <i class="ti ti-users"></i>
      <span class="dd-label" id="eq-label">${eqs.join(', ')}</span>
      <i class="ti ti-chevron-down dd-arrow"></i>
    </button>
    <div class="dd-panel" id="dd-eq">
      <div class="dd-actions">
        <button class="dd-action-btn primary" onclick="Modulos.prog_semanal._allEqs(true)">Todas</button>
        <button class="dd-action-btn secondary" onclick="Modulos.prog_semanal._allEqs(false)">Nenhuma</button>
      </div>
      ${eqs.map(eq => `<label class="dd-item">
        <input type="checkbox" name="eq" value="${eq}" checked
          onchange="Modulos.prog_semanal._onEqChange()"> ${eq}
      </label>`).join('')}
    </div>
  </div>
  <span class="filter-label">Semana</span>
  <div class="dd-wrap">
    <button class="dd-btn" onclick="Modulos.prog_semanal._toggleDD('dd-sem')">
      <i class="ti ti-calendar"></i>
      <span class="dd-label" id="sem-label">Carregando...</span>
      <i class="ti ti-chevron-down dd-arrow"></i>
    </button>
    <div class="dd-panel" id="dd-sem">
      <div class="dd-actions">
        <button class="dd-action-btn primary" onclick="Modulos.prog_semanal._allSems(true)">SAFRA</button>
        <button class="dd-action-btn secondary" onclick="Modulos.prog_semanal._allSems(false)">Limpar</button>
      </div>
      <div class="dd-sep"></div>
      <div class="dd-group">Safra 2026</div>
      <div id="sem-checkboxes"></div>
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
    <div class="m-sub">H-h OS encerradas no período / H-h programado</div>
  </div>
  <div class="metric">
    <div class="m-label">Pré-OS Abertas</div>
    <div class="m-val" id="m-preos" style="color:var(--yellow)">—</div>
    <div class="m-sub">não convertidas em OS</div>
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
    <div class="card-title">EFICIÊNCIA DO PLANEJAMENTO <span style="font-weight:400;color:#9ca3af">previsto × realizado</span></div>
    <div class="chart-container"><canvas id="c4"></canvas></div>
  </div>
</div>

<div class="chart-wrap" style="margin-bottom:12px">
  <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px">
    <div class="card-title" style="margin:0">DISTRIBUIÇÃO H-H POR EQUIPE</div>
    <div style="display:flex;gap:10px;font-size:10px;font-weight:600">
      <span style="color:#E24B4A">⬤ MCU</span>
      <span style="color:#16a34a">⬤ Dentro da prog.</span>
      <span style="color:#2563eb">⬤ Fora da prog.</span>
    </div>
  </div>
  <div class="chart-container-wide"><canvas id="c5"></canvas></div>
</div>

<div class="charts-row">
  <div class="card">
    <div class="card-title"><i class="ti ti-alert-triangle" style="color:var(--amber)"></i> PONTOS DE ATENÇÃO</div>
    <div id="alertas-body">
      <div style="padding:12px 0;font-size:12px;color:#9ca3af;text-align:center">Importe os apontamentos para ver alertas</div>
    </div>
  </div>
  <div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div class="card-title" style="margin:0"><i class="ti ti-arrows-right-left" style="color:var(--yellow)"></i> REPROGRAMADAS NÃO EXECUTADAS</div>
      <span id="repr-count" style="font-size:10px;color:#9ca3af"></span>
    </div>
    <div id="repr-body">
      <div style="padding:12px 0;font-size:12px;color:#9ca3af;text-align:center">Carregando...</div>
    </div>
  </div>
</div>

<div class="import-section">
  <div class="card">
    <div class="card-title"><i class="ti ti-upload" style="color:var(--yellow)"></i> IMPORTAR DADOS</div>
    <div style="display:grid;grid-template-columns:1fr auto;gap:16px;align-items:start">
      <div class="dropzone" id="dz"
        ondragover="event.preventDefault();this.classList.add('over')"
        ondragleave="this.classList.remove('over')"
        ondrop="Modulos.prog_semanal._onDrop(event)"
        onclick="document.getElementById('file-input').click()">
        <i class="ti ti-cloud-upload"></i>
        <p><strong>Arraste o arquivo aqui</strong><br>ou clique para selecionar</p>
        <div class="file-types" style="margin-top:10px">
          <div class="file-type"><i class="ti ti-file-spreadsheet" style="color:var(--green)"></i><span class="ext">.xlsx</span></div>
          <div class="file-type"><i class="ti ti-file-spreadsheet" style="color:var(--amber)"></i><span class="ext">.xls</span></div>
        </div>
      </div>
      <div style="font-size:11px;color:#6b7280;min-width:180px">
        <div style="font-weight:600;color:#374151;margin-bottom:8px">Arquivos aceitos:</div>
        <div style="margin-bottom:4px">• Programação Semanal</div>
        <div style="margin-bottom:4px">• Ordens de Serviço</div>
        <div style="margin-bottom:4px">• Apontamentos</div>
        <div>• Pré-Ordens</div>
      </div>
    </div>
    <input type="file" id="file-input" accept=".xlsx,.xls,.csv" style="display:none"
      onchange="Modulos.prog_semanal._onFileSelect(event)">
    <div style="margin-top:16px">
      <div class="hist-title">IMPORTAÇÕES RECENTES</div>
      <div id="hist-list"></div>
    </div>
  </div>
</div>`;
  },

  /* ── Carregar dados ── */
  async _carregarDados() {
    showBanner('Carregando dados...', true);
    try {
      const db = getDB();

      /* 1. Programação semanal */
      const { data: progData, error: progErr } = await db
        .from('programacao_semanal')
        .select('semana,ano,equipe,hh_previsto,data_inicio_semana,data_fim_semana')
        .order('semana', { ascending: true });
      if (progErr) throw progErr;

      if (!progData || !progData.length) {
        showBanner('Sem dados importados. Use o campo "Importar dados" abaixo.', true);
        this._inicializarCharts();
        return;
      }

      /* 2. Equipes na prog vs equipes com OS no banco */
      const eqsNaProg  = [...new Set(progData.map(r => r.equipe).filter(Boolean))];
      const { data: osEqData } = await db.from('ordens_servico').select('equipe').not('equipe','is',null);
      const eqsComOS   = new Set((osEqData||[]).map(r => r.equipe).filter(Boolean));
      const eqsPend    = eqsNaProg.filter(eq => !eqsComOS.has(eq));

      if (eqsPend.length) {
        showBanner('Pendente importação das Ordens de Serviço das equipes: ' +
          eqsPend.join(', ') + '. Aderência não calculada para essas equipes.', true);
      } else {
        showBanner('', false);
      }

      /* 3. Agrupar H-h previsto por semana/equipe */
      const agrupado = {}, semInfos = {};
      progData.forEach(r => {
        const key = r.semana + '/' + r.ano;
        if (!agrupado[key]) agrupado[key] = {};
        if (!semInfos[key]) semInfos[key] = {
          semana: r.semana, ano: r.ano,
          dataIni: r.data_inicio_semana, dataFim: r.data_fim_semana,
        };
        const eq = r.equipe;
        if (eq) {
          if (!agrupado[key][eq]) agrupado[key][eq] = { prev: 0, realApt: 0, prevEncerrado: 0 };
          agrupado[key][eq].prev += parseFloat(r.hh_previsto) || 0;
        }
      });

      /* 4. Aderência: H-h previsto das OS encerradas dentro da semana */
      /* Buscar OS programadas por semana e verificar data_encerramento */
      for (const key of Object.keys(semInfos)) {
        const { dataIni, dataFim } = semInfos[key];
        if (!dataIni || !dataFim) continue;

        /* Aderência + Eficiência + Distribuição:
           Busca as OS da programação dessa semana e verifica status/Hh na tabela OS */
        const { data: progSem } = await db
          .from('programacao_semanal')
          .select('os, cod_servico, equipe, hh_previsto')
          .eq('semana', semInfos[key].semana)
          .eq('ano', semInfos[key].ano);

        if (progSem && progSem.length) {
          const osNums = [...new Set(progSem.map(p => p.os))];

          /* OS encerradas com Hh real */
          const { data: osEnc } = await db
            .from('ordens_servico')
            .select('os, cod_servico, tipo_atividade, hh_prev_servico, hh_real_servico, status_os')
            .in('os', osNums.slice(0, 500))
            .eq('status_os', '4 - Encerrada');

          /* Mapa: os+cod → {hhPrev, hhReal, tipo} */
          const mapaEnc = {};
          (osEnc || []).forEach(o => {
            mapaEnc[o.os + '|' + o.cod_servico] = {
              hhPrev: parseFloat(o.hh_prev_servico) || 0,
              hhReal: parseFloat(o.hh_real_servico) || 0,
              tipo:   o.tipo_atividade || '',
            };
          });

          /* Para cada serviço programado, verificar se está encerrado */
          progSem.forEach(p => {
            const chave = p.os + '|' + (p.cod_servico || '?');
            const eq    = p.equipe;
            if (!eq || !agrupado[key] || !agrupado[key][eq]) return;

            const enc = mapaEnc[chave];
            const hhProg = parseFloat(p.hh_previsto) || 0;

            /* Aderência: soma hh_previsto das OS encerradas na programação */
            if (enc) {
              agrupado[key][eq].prevEncerrado += hhProg;
              /* Eficiência: hh_real das OS encerradas */
              agrupado[key][eq].hhRealEnc     = (agrupado[key][eq].hhRealEnc || 0) + enc.hhReal;
              agrupado[key][eq].hhPrevEnc     = (agrupado[key][eq].hhPrevEnc || 0) + hhProg;
              /* Distribuição: dentro da prog (prog encerrada) */
              agrupado[key][eq].dentroProg    = (agrupado[key][eq].dentroProg || 0) + enc.hhReal;
            }
          });

          /* Distribuição: OS encerradas na semana MAS fora da programação
             = OS encerradas cujo os+cod NÃO está na programação da semana */
          const chavesProg = new Set(progSem.map(p => p.os + '|' + (p.cod_servico || '?')));

          /* Distribuição: OS encerradas no período por modalidade/equipe
             Mapa equipe → modalidade: MEC1→MEC, CAL1/CAL2/CAL3→CAL, CIV1→CIV, ELE1→ELE */
          const EQ_MODAL = {
            'MEC1':'MEC','MEC2':'MEC','MEC3':'MEC',
            'CAL1':'CAL','CAL2':'CAL','CAL3':'CAL','CAL4':'CAL',
            'CIV1':'CIV','CIV2':'CIV',
            'ELE1':'ELE','ELE2':'ELE',
            'AUT1':'AUT','AUT2':'AUT',
            'INS1':'INS','INS2':'INS',
          };

          const { dataIni, dataFim } = semInfos[key];
          if (dataIni && dataFim) {
            /* Para cada equipe na programação, buscar OS encerradas no período
               usando a equipe EXATA da programação semanal como filtro */
            const eqsNaSemana = [...new Set(progSem.map(p => p.equipe).filter(Boolean))];

            /* Buscar também equipes não na programação para MCU */
            const todasEqsAtivas = Object.keys(agrupado[key] || {});

            const { data: osEncPeriodo } = await db
              .from('ordens_servico')
              .select('os, cod_servico, tipo_atividade, hh_real_servico, equipe, modalidade')
              .eq('status_os', '4 - Encerrada')
              .gte('data_encerramento', dataIni)
              .lte('data_encerramento', dataFim);

            (osEncPeriodo || []).forEach(o => {
              const chave   = o.os + '|' + o.cod_servico;
              const hhR     = parseFloat(o.hh_real_servico) || 0;
              if (!hhR) return;

              /* Encontrar a equipe do agrupado que corresponde a essa OS
                 Primeiro tenta equipe exata, depois por modalidade */
              let eqAlvo = null;
              if (o.equipe && agrupado[key] && agrupado[key][o.equipe]) {
                eqAlvo = o.equipe;
              } else if (o.modalidade) {
                /* Buscar equipe do agrupado com mesma modalidade */
                const modal = o.modalidade.toUpperCase();
                eqAlvo = todasEqsAtivas.find(eq => (EQ_MODAL[eq] || '').toUpperCase() === modal
                  || eq.startsWith(modal));
              }
              if (!eqAlvo || !agrupado[key] || !agrupado[key][eqAlvo]) return;

              if (o.tipo_atividade === 'MCU') {
                agrupado[key][eqAlvo].mcu = (agrupado[key][eqAlvo].mcu || 0) + hhR;
              } else if (!chavesProg.has(chave)) {
                agrupado[key][eqAlvo].foraProg = (agrupado[key][eqAlvo].foraProg || 0) + hhR;
              }
            });
          }
        }

        /* H-h real via apontamentos no período */
        const { data: aptData } = await db
          .from('apontamentos')
          .select('os,hh_total,data_apontamento')
          .gte('data_apontamento', dataIni)
          .lte('data_apontamento', dataFim);

        if (aptData && aptData.length) {
          const osNums = [...new Set(aptData.map(a => a.os))];
          const { data: osEqs } = await db
            .from('ordens_servico').select('os,equipe').in('os', osNums.slice(0, 500));
          const mapaEq = {};
          (osEqs||[]).forEach(o => { mapaEq[o.os] = o.equipe; });
          aptData.forEach(apt => {
            const eq = mapaEq[apt.os];
            if (!eq || !agrupado[key] || !agrupado[key][eq]) return;
            agrupado[key][eq].realApt += parseFloat(apt.hh_total) || 0;
          });
        }
      }

      /* Arredondar */
      Object.values(agrupado).forEach(eqs => {
        Object.values(eqs).forEach(v => {
          v.prev          = Math.round(v.prev * 10) / 10;
          v.realApt       = Math.round(v.realApt * 10) / 10;
          v.prevEncerrado = Math.round(v.prevEncerrado * 10) / 10;
        });
      });

      this._state.dadosSem    = agrupado;
      this._state.semanas     = Object.values(semInfos).sort((a,b) => a.semana - b.semana);
      this._state.eqsPendentes = eqsPend;
      /* Equipes: usar todas que aparecem na programação + config */
      const todasEqs = [...new Set([...MAN360_CONFIG.equipes, ...eqsNaProg])].sort();
      this._state.todasEqs = todasEqs;
      this._state.activeEqs = todasEqs;
      this._atualizarDropdownEquipes(todasEqs);

      const ultima = this._state.semanas[this._state.semanas.length - 1];
      this._state.activeSems = ultima ? [ultima.semana + '/' + ultima.ano] : [];

      this._renderizarDropdownSemanas();
      this._inicializarCharts();
      this._atualizarMetricasAux();

    } catch (err) {
      console.error(err);
      showBanner('Erro ao carregar: ' + err.message, true);
    }
  },

  /* ── Dropdown semanas ── */
  _atualizarDropdownEquipes(eqs) {
    const dd = document.getElementById('dd-eq');
    if (!dd) return;
    /* Manter os botões de ação, recriar apenas os itens */
    dd.querySelectorAll('label.dd-item').forEach(l => l.remove());
    eqs.forEach(eq => {
      const lbl = document.createElement('label');
      lbl.className = 'dd-item';
      lbl.innerHTML = '<input type="checkbox" name="eq" value="' + eq + '" checked onchange="Modulos.prog_semanal._onEqChange()"> ' + eq;
      dd.appendChild(lbl);
    });
    /* Atualizar label */
    document.getElementById('eq-label').textContent = eqs.join(', ');
  },

  _renderizarDropdownSemanas() {
    const box = document.getElementById('sem-checkboxes');
    if (!box) return;
    box.innerHTML = '';
    this._state.semanas.forEach(({ semana, ano, dataIni }) => {
      const key     = semana + '/' + ano;
      const checked = this._state.activeSems.includes(key);
      const label   = document.createElement('label');
      label.className = 'dd-item';
      label.innerHTML = `<input type="checkbox" name="sem" value="${key}" ${checked ? 'checked' : ''}
        onchange="Modulos.prog_semanal._onSemChange()">
        Sem ${semana}
        <span style="color:#9ca3af;font-size:10px;margin-left:4px">
          ${dataIni ? dataIni.slice(5).replace('-','/') : ''}
        </span>`;
      box.appendChild(label);
    });
    this._atualizarLabelSem();
  },

  /* ── Charts ── */
  _inicializarCharts() {
    const Y='#F8C100', G='#16a34a', R='#E24B4A', B='#2563eb';
    const tC='rgba(80,80,80,.9)', gC='rgba(0,0,0,.06)';
    const base = { responsive:true, maintainAspectRatio:false,
                   plugins:{ legend:{display:false}, tooltip:{} } };
    const eqs  = MAN360_CONFIG.equipes;
    const z    = eqs.map(()=>0);

    Object.values(this._state.charts).forEach(c => c.destroy());
    this._state.charts = {};
    const ch = this._state.charts;

    ch.c1 = new Chart(document.getElementById('c1'), {
      type:'bar',
      data:{ labels:eqs, datasets:[{ data:z, backgroundColor:Y, borderRadius:4 }] },
      options:{ ...base, scales:{
        x:{ ticks:{color:tC,font:{size:10}}, grid:{display:false} },
        y:{ ticks:{color:tC,font:{size:10},callback:v=>v+'h'}, grid:{color:gC} }
      }}
    });

    ch.c2 = new Chart(document.getElementById('c2'), {
      type:'bar',
      data:{ labels:eqs, datasets:[
        { data:z, backgroundColor:z.map(()=>'#9ca3af'), borderRadius:4, order:2 },
        { type:'line', data:eqs.map(()=>80), borderColor:'#F8C100', borderWidth:2,
          borderDash:[6,4], pointRadius:0, fill:false, label:'Meta 80%', order:1,
          _noTick:true }
      ]},
      options:{ ...base,
        plugins:{ ...base.plugins, legend:{display:false} },
        scales:{
          x:{ ticks:{color:tC,font:{size:10}}, grid:{display:false} },
          y:{ min:0,max:100, ticks:{color:tC,font:{size:10},callback:v=>v+'%'}, grid:{color:gC} }
        }
      }
    });

    ch.c3 = new Chart(document.getElementById('c3'), {
      type:'bar',
      data:{ labels:[], datasets:[
        { data:[], backgroundColor:[], borderRadius:4, order:2 },
        { type:'line', data:[], borderColor:'#F8C100', borderWidth:2,
          borderDash:[6,4], pointRadius:0, fill:false, label:'Meta 80%', order:1 }
      ]},
      options:{ ...base,
        plugins:{ ...base.plugins, legend:{display:false} },
        scales:{
          x:{ ticks:{color:tC,font:{size:10}}, grid:{display:false} },
          y:{ min:0,max:100, ticks:{color:tC,font:{size:10},callback:v=>v+'%'}, grid:{color:gC} }
        }
      }
    });

    ch.c4 = new Chart(document.getElementById('c4'), {
      type:'bar',
      data:{ labels:eqs, datasets:[
        { label:'Previsto',  data:z, backgroundColor:Y, borderRadius:4 },
        { label:'Realizado', data:z, backgroundColor:z.map(()=>'#9ca3af'), borderRadius:4 },
      ]},
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:true,labels:{color:tC,font:{size:10},boxWidth:10}}, tooltip:{} },
        scales:{
          x:{ ticks:{color:tC,font:{size:10}}, grid:{display:false} },
          y:{ ticks:{color:tC,font:{size:10},callback:v=>v+'h'}, grid:{color:gC} }
        }
      }
    });

    ch.c5 = new Chart(document.getElementById('c5'), {
      type:'bar', indexAxis:'y',
      data:{ labels:eqs, datasets:[
        { label:'MCU',             data:z, backgroundColor:R },
        { label:'Dentro da prog.', data:z, backgroundColor:G },
        { label:'Fora da prog.',   data:z, backgroundColor:B },
      ]},
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false},
          tooltip:{callbacks:{label:ctx=>` ${ctx.dataset.label}: ${ctx.raw}h`}} },
        scales:{
          x:{ stacked:true, ticks:{color:tC,font:{size:10},callback:v=>v+'h'}, grid:{color:gC} },
          y:{ stacked:true, ticks:{color:tC,font:{size:10}}, grid:{display:false} }
        }
      }
    });

    this._atualizarCharts();
  },

  /* ── Atualizar charts ── */
  _atualizarCharts() {
    const { charts, activeSems, activeEqs, dadosSem, semanas, eqsPendentes } = this._state;
    if (!Object.keys(charts).length) return;

    const G='#16a34a', R='#E24B4A', CINZA='#d1d5db';

    /* H-h previsto por equipe (soma das semanas ativas) */
    const prev = activeEqs.map(eq =>
      activeSems.reduce((s,k) => s + (dadosSem[k]&&dadosSem[k][eq] ? dadosSem[k][eq].prev : 0), 0)
    );

    /* H-h real (apontamentos) por equipe */
    const real = activeEqs.map(eq =>
      activeSems.reduce((s,k) => s + (dadosSem[k]&&dadosSem[k][eq] ? dadosSem[k][eq].realApt : 0), 0)
    );

    /* Aderência: H-h previsto das OS encerradas no período / H-h programado
       -1 = pendente (sem OS importada) */
    const adr = activeEqs.map((eq, i) => {
      if (eqsPendentes.includes(eq)) return -1;
      const prevEnc = activeSems.reduce((s,k) =>
        s + (dadosSem[k]&&dadosSem[k][eq] ? dadosSem[k][eq].prevEncerrado : 0), 0);
      return prev[i] ? Math.round(prevEnc / prev[i] * 100) : 0;
    });

    /* Aderência global (só equipes com OS) */
    let totalPrevAdh = 0, totalEncAdh = 0;
    activeEqs.forEach((eq, i) => {
      if (!eqsPendentes.includes(eq)) {
        totalPrevAdh += prev[i];
        totalEncAdh  += activeSems.reduce((s,k) =>
          s + (dadosSem[k]&&dadosSem[k][eq] ? dadosSem[k][eq].prevEncerrado : 0), 0);
      }
    });
    const totalPrev = prev.reduce((a,b)=>a+b,0);
    const adrGlobal = totalPrevAdh ? Math.round(totalEncAdh/totalPrevAdh*100) : 0;

    /* Aderência semana a semana */
    const semLabels=[], semVals=[];
    semanas.forEach(({semana,ano}) => {
      const k = semana+'/'+ano;
      if (!dadosSem[k]) return;
      let tp=0, te=0;
      activeEqs.forEach(eq => {
        if (!eqsPendentes.includes(eq) && dadosSem[k][eq]) {
          tp += dadosSem[k][eq].prev;
          te += dadosSem[k][eq].prevEncerrado;
        }
      });
      semLabels.push('Sem '+semana);
      semVals.push(tp ? Math.round(te/tp*100) : 0);
    });

    /* Métricas */
    const mHH = document.getElementById('m-hh');
    const mAdr = document.getElementById('m-adr');
    const mSub = document.getElementById('m-hh-sub');
    if (mHH)  mHH.textContent = totalPrev.toLocaleString('pt-BR') + 'h';
    if (mSub) mSub.textContent = activeEqs.length + ' equipe' + (activeEqs.length!==1?'s':'') +
                                  ' · ' + activeSems.length + ' semana' + (activeSems.length!==1?'s':'');
    if (mAdr) {
      mAdr.textContent  = adrGlobal + '%';
      mAdr.style.color  = adrGlobal >= 80 ? G : (adrGlobal > 0 ? R : '#9ca3af');
    }

    /* C1 */
    charts.c1.data.labels = activeEqs;
    charts.c1.data.datasets[0].data = prev;
    charts.c1.update('none');

    /* C2 — aderência por equipe (-1 = cinza sem valor) */
    charts.c2.data.labels = activeEqs;
    charts.c2.data.datasets[0].data = adr.map(v => v === -1 ? 0 : v);
    charts.c2.data.datasets[0].backgroundColor = adr.map(v =>
      v === -1 ? CINZA : v >= 80 ? G : (v > 0 ? R : '#9ca3af'));
    charts.c2.data.datasets[1].data = activeEqs.map(()=>80); // linha meta
    charts.c2.update('none');

    /* C3 */
    charts.c3.data.labels = semLabels;
    charts.c3.data.datasets[0].data = semVals;
    charts.c3.data.datasets[0].backgroundColor = semVals.map(v => v>=80?G:(v>0?R:'#9ca3af'));
    charts.c3.data.datasets[1].data = semLabels.map(()=>80); // linha meta
    charts.c3.update('none');

    /* C4 — Eficiência: Hh previsto × Hh real das OS encerradas na programação */
    const hhPrevEnc = activeEqs.map(eq =>
      activeSems.reduce((s,k) => s + (dadosSem[k]&&dadosSem[k][eq] ? dadosSem[k][eq].hhPrevEnc||0 : 0), 0)
    );
    const hhRealEnc = activeEqs.map(eq =>
      activeSems.reduce((s,k) => s + (dadosSem[k]&&dadosSem[k][eq] ? dadosSem[k][eq].hhRealEnc||0 : 0), 0)
    );
    charts.c4.data.labels = activeEqs;
    charts.c4.data.datasets[0].data = hhPrevEnc;
    charts.c4.data.datasets[1].data = hhRealEnc;
    charts.c4.data.datasets[1].backgroundColor = hhRealEnc.map((r,i) =>
      hhPrevEnc[i] && r/hhPrevEnc[i] >= 0.8 ? G : (r > 0 ? R : '#9ca3af'));
    charts.c4.update('none');

    /* C5 — Distribuição H-h por MODALIDADE (CAL, MEC, CIV, ELE, AUT, INS...)
       Agrupa equipes pela modalidade: CAL1+CAL2+CAL3 → CAL */
    const modalMap = {};
    activeEqs.forEach(eq => {
      /* Extrair modalidade: 'MEC1' → 'MEC', 'CAL2' → 'CAL' */
      const modal = eq.replace(/\d+$/, '');
      if (!modalMap[modal]) modalMap[modal] = { mcu:0, dentro:0, fora:0 };
      activeSems.forEach(k => {
        if (dadosSem[k] && dadosSem[k][eq]) {
          modalMap[modal].mcu   += dadosSem[k][eq].mcu||0;
          modalMap[modal].dentro += dadosSem[k][eq].dentroProg||0;
          modalMap[modal].fora  += dadosSem[k][eq].foraProg||0;
        }
      });
    });
    const modals   = Object.keys(modalMap).sort();
    charts.c5.data.labels = modals;
    charts.c5.data.datasets[0].data = modals.map(m => Math.round(modalMap[m].mcu*10)/10);
    charts.c5.data.datasets[1].data = modals.map(m => Math.round(modalMap[m].dentro*10)/10);
    charts.c5.data.datasets[2].data = modals.map(m => Math.round(modalMap[m].fora*10)/10);
    charts.c5.update('none');

    /* Alertas */
    this._atualizarAlertas(adr, activeEqs, eqsPendentes);
    /* Reprogramadas */
    this._atualizarReprogramadas();
  },

  _atualizarAlertas(adr, activeEqs, eqsPendentes) {
    const alertasEl = document.getElementById('alertas-body');
    if (!alertasEl) return;

    const { activeSems, semanas, dadosSem } = this._state;
    const alertas = [];

    /* Equipes sem OS importada */
    eqsPendentes.forEach(function(eq) {
      if (activeEqs.includes(eq))
        alertas.push({ cor:'amber', icone:'ti-alert-circle',
          txt: '<strong>' + eq + '</strong>: OS não importadas — aderência indisponível' });
    });

    activeEqs.forEach(function(eq, i) {
      if (eqsPendentes.includes(eq)) return;

      /* Aderência atual */
      const adrAtual = adr[i];

      /* Sem OS encerrada no período */
      if (adrAtual === 0) {
        alertas.push({ cor:'amber', icone:'ti-circle-off',
          txt: '<strong>' + eq + '</strong>: nenhuma OS encerrada na semana programada' });
        return;
      }

      /* Abaixo da meta */
      if (adrAtual > 0 && adrAtual < 80) {
        var msg = '<strong>' + eq + '</strong>: aderência de <strong>' + adrAtual + '%</strong> — abaixo da meta de 80%';

        /* Verificar se foi abaixo da meta nas semanas anteriores também */
        var semsOrdenadas = [...semanas].sort(function(a,b){ return a.semana - b.semana; });
        var semsAtivas = activeSems.slice().sort();
        var ultimaSem = semsAtivas[semsAtivas.length - 1];
        var idxUlt = semsOrdenadas.findIndex(function(s){ return (s.semana+'/'+s.ano) === ultimaSem; });

        var semsConsecutivas = 0;
        for (var k = idxUlt - 1; k >= 0; k--) {
          var keyAnt = semsOrdenadas[k].semana + '/' + semsOrdenadas[k].ano;
          var dadosAnt = dadosSem[keyAnt] && dadosSem[keyAnt][eq];
          if (!dadosAnt) break;
          var adrAnt = dadosAnt.prev ? Math.round(dadosAnt.prevEncerrado / dadosAnt.prev * 100) : 0;
          if (adrAnt < 80) semsConsecutivas++;
          else break;
        }

        if (semsConsecutivas >= 1)
          msg += ' — <strong>' + (semsConsecutivas + 1) + ' semanas consecutivas</strong> abaixo da meta';

        alertas.push({ cor:'red', icone:'ti-trending-down', txt: msg });
      }

      /* Aderência acima da meta — verificar eficiência */
      var hhPrevEnc = activeSems.reduce(function(s, k) {
        return s + ((dadosSem[k] && dadosSem[k][eq]) ? dadosSem[k][eq].hhPrevEnc||0 : 0);
      }, 0);
      var hhRealEnc = activeSems.reduce(function(s, k) {
        return s + ((dadosSem[k] && dadosSem[k][eq]) ? dadosSem[k][eq].hhRealEnc||0 : 0);
      }, 0);
      if (hhPrevEnc > 0) {
        var efic = Math.round(hhRealEnc / hhPrevEnc * 100);
        if (efic < 80 && adrAtual >= 80) {
          alertas.push({ cor:'amber', icone:'ti-chart-bar',
            txt: '<strong>' + eq + '</strong>: aderência OK mas eficiência em <strong>' + efic + '%</strong> — H-h realizado abaixo do previsto nas OS encerradas' });
        }
        /* Eficiência muito acima — pode indicar subestimativa de H-h */
        if (efic > 130) {
          alertas.push({ cor:'amber', icone:'ti-alert-triangle',
            txt: '<strong>' + eq + '</strong>: eficiência em <strong>' + efic + '%</strong> — H-h realizado muito acima do previsto, revisar dimensionamento' });
        }
      }

      /* H-h programado muito alto comparado à média da safra */
      var totalPrevEq = activeSems.reduce(function(s, k) {
        return s + ((dadosSem[k] && dadosSem[k][eq]) ? dadosSem[k][eq].prev||0 : 0);
      }, 0);
      var mediasSem = semanas.map(function(s) {
        var k = s.semana + '/' + s.ano;
        return (dadosSem[k] && dadosSem[k][eq]) ? dadosSem[k][eq].prev||0 : 0;
      }).filter(function(v){ return v > 0; });
      if (mediasSem.length > 1) {
        var media = mediasSem.reduce(function(a,b){ return a+b; }, 0) / mediasSem.length;
        if (totalPrevEq > media * 1.4)
          alertas.push({ cor:'blue', icone:'ti-info-circle',
            txt: '<strong>' + eq + '</strong>: H-h programado nessa semana (' + Math.round(totalPrevEq) + 'h) acima da média histórica (' + Math.round(media) + 'h/semana)' });
      }
    });

    if (!alertas.length) {
      alertasEl.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:10px 0;color:#16a34a;font-size:12px"><i class="ti ti-circle-check" style="font-size:18px"></i><span>Nenhum ponto de atenção para as equipes no período selecionado</span></div>';
      return;
    }

    var corMap = { red:'#dc2626', amber:'#d97706', blue:'#2563eb' };
    var bgMap  = { red:'#fee2e2', amber:'#fef3c7', blue:'#dbeafe' };
    alertasEl.innerHTML = alertas.map(function(a) {
      return '<div style="display:flex;align-items:flex-start;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);font-size:12px">'
           + '<i class="ti ' + a.icone + '" style="font-size:16px;flex-shrink:0;margin-top:1px;color:' + corMap[a.cor] + '"></i>'
           + '<div>' + a.txt + '</div>'
           + '</div>';
    }).join('');
  },

  /* ── Reprogramadas não executadas ── */
  async _atualizarReprogramadas() {
    const reprEl = document.getElementById('repr-body');
    const cntEl  = document.getElementById('repr-count');
    if (!reprEl) return;

    const { activeSems, semanas, eqsPendentes } = this._state;

    if (!activeSems.length) {
      reprEl.innerHTML = '<div style="padding:12px 0;font-size:12px;color:#9ca3af;text-align:center">Selecione uma semana</div>';
      return;
    }

    try {
      const db = getDB();
      const semsOrdenadas = [...semanas].sort(function(a,b){ return a.semana - b.semana; });

      /* Usar a semana mais recente entre as selecionadas */
      var semAtualKey = activeSems.slice().sort().pop();
      var parts = semAtualKey.split('/');
      var semAtual = parseInt(parts[0]), anoAtual = parseInt(parts[1]);

      /* Semanas anteriores à semana atual */
      var semAnt = semsOrdenadas.filter(function(s) {
        return s.semana < semAtual || (s.semana === semAtual && s.ano < anoAtual);
      });

      if (!semAnt.length) {
        reprEl.innerHTML = '<div style="padding:12px 0;font-size:12px;color:#9ca3af;text-align:center">Nenhuma semana anterior disponível para comparação</div>';
        return;
      }

      /* OS programadas na semana atual */
      var progAtualRes = await db
        .from('programacao_semanal')
        .select('os, cod_servico, equipe, desc_servico, hh_previsto')
        .eq('semana', semAtual).eq('ano', anoAtual);
      var progAtual = progAtualRes.data || [];

      if (!progAtual.length) {
        reprEl.innerHTML = '<div style="padding:12px 0;font-size:12px;color:#9ca3af;text-align:center">Sem programação para a semana selecionada</div>';
        return;
      }

      /* Status de todas as OS programadas agora */
      var osNums = [...new Set(progAtual.map(function(p){ return p.os; }))];
      var osStatusRes = await db
        .from('ordens_servico').select('os, cod_servico, status_os')
        .in('os', osNums.slice(0, 500));
      var mapaStatus = {};
      (osStatusRes.data || []).forEach(function(o) {
        mapaStatus[o.os + '|' + (o.cod_servico||'?')] = o.status_os;
      });

      /* Para cada OS na semana atual, verificar se aparecia em semanas anteriores
         e se não foi encerrada → é reprogramada */
      var chavesAtual = {};
      progAtual.forEach(function(p) {
        chavesAtual[p.os + '|' + (p.cod_servico||'?')] = p;
      });

      /* Rastrear histórico nas semanas anteriores (mais recente primeiro) */
      var historico = {}; /* chave → [semana1, semana2, ...] onde apareceu antes */
      var semAntOrdenadas = semAnt.slice().reverse(); /* mais recente primeiro */

      for (var si = 0; si < semAntOrdenadas.length; si++) {
        var semInfo = semAntOrdenadas[si];
        var progAntRes = await db
          .from('programacao_semanal').select('os, cod_servico')
          .eq('semana', semInfo.semana).eq('ano', semInfo.ano);
        var progAnt = progAntRes.data || [];

        progAnt.forEach(function(p) {
          var ch = p.os + '|' + (p.cod_servico||'?');
          if (chavesAtual[ch]) {
            if (!historico[ch]) historico[ch] = [];
            historico[ch].push(semInfo.semana);
          }
        });
      }

      /* Reprogramadas = OS na semana atual que:
         1. Aparecem em pelo menos uma semana anterior
         2. NÃO estão encerradas */
      var reprog = [];
      Object.keys(chavesAtual).forEach(function(ch) {
        var semsPrev = historico[ch];
        if (!semsPrev || !semsPrev.length) return; /* só apareceu agora → não é reprogramada */
        var status = mapaStatus[ch] || '';
        if (status === '4 - Encerrada') return; /* já encerrada → ok */
        var p = chavesAtual[ch];
        var semMaisAntiga = semsPrev[semsPrev.length - 1]; /* menor semana */
        var nSems = semsPrev.length + 1; /* semanas anteriores + semana atual */
        reprog.push({
          os: p.os, desc: p.desc_servico||'—', hh: p.hh_previsto||0,
          equipe: p.equipe||'Sem equipe', desde: semMaisAntiga,
          nSems: nSems, status: status
        });
      });

      /* Agrupar por equipe */
      var porEquipe = {};
      reprog.forEach(function(r) {
        if (!porEquipe[r.equipe]) porEquipe[r.equipe] = [];
        porEquipe[r.equipe].push(r);
      });

      if (cntEl) cntEl.textContent = reprog.length + ' serviço' + (reprog.length !== 1 ? 's' : '');

      /* Equipes pendentes presentes na semana */
      var eqsNaSem = [...new Set(progAtual.map(function(p){ return p.equipe; }).filter(Boolean))];
      var pendNaSem = eqsNaSem.filter(function(eq){ return eqsPendentes.includes(eq); });

      var html = '';
      if (pendNaSem.length) {
        html += '<div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:11px;color:#92400e;display:flex;align-items:center;gap:8px">'
              + '<i class="ti ti-alert-triangle"></i>'
              + '<span>Equipes sem OS importada não contabilizadas: <strong>' + pendNaSem.join(', ') + '</strong></span>'
              + '</div>';
      }

      if (!reprog.length) {
        html += '<div style="display:flex;align-items:center;gap:8px;padding:10px 0;color:#16a34a;font-size:12px">'
              + '<i class="ti ti-circle-check" style="font-size:18px"></i>'
              + '<span>Nenhuma OS foi reprogramada para a Semana ' + semAtual + '</span></div>';
        reprEl.innerHTML = html;
        return;
      }

      var equipesFilt = Object.entries(porEquipe).filter(function(e) {
        return !eqsPendentes.includes(e[0]);
      });

      equipesFilt.forEach(function(entry) {
        var eq = entry[0], items = entry[1];
        html += '<div style="margin-bottom:14px">';
        html += '<div style="font-size:10px;font-weight:700;letter-spacing:.08em;color:#6b7280;text-transform:uppercase;padding:4px 0;border-bottom:2px solid var(--border);margin-bottom:6px;display:flex;align-items:center;justify-content:space-between">';
        html += '<span>' + eq + '</span>';
        html += '<span style="color:#9ca3af;font-weight:400">' + items.length + ' serviço' + (items.length!==1?'s':'') + '</span>';
        html += '</div>';
        items.sort(function(a,b){ return b.nSems - a.nSems; }).forEach(function(r) {
          var bgC  = r.nSems >= 3 ? '#fee2e2' : r.nSems === 2 ? '#fef3c7' : '#f3f4f6';
          var txtC = r.nSems >= 3 ? '#dc2626' : r.nSems === 2 ? '#92400e' : '#6b7280';
          var badge = 'Desde Sem ' + r.desde + ' (' + r.nSems + ' sem.)';
          html += '<div style="display:grid;grid-template-columns:56px 1fr auto auto;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:11px">';
          html += '<span style="font-weight:700;color:#374151">' + r.os + '</span>';
          html += '<span style="color:#6b7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + r.desc + '">' + r.desc + '</span>';
          html += '<span style="color:#9ca3af;font-size:10px;white-space:nowrap">' + r.hh + 'h</span>';
          html += '<span style="padding:2px 7px;border-radius:4px;font-size:9px;font-weight:700;white-space:nowrap;background:' + bgC + ';color:' + txtC + '">' + badge + '</span>';
          html += '</div>';
        });
        html += '</div>';
      });

      reprEl.innerHTML = html || '<div style="padding:8px 0;font-size:12px;color:#9ca3af;text-align:center">Nenhum serviço reprogramado nas equipes com OS importada</div>';

    } catch(e) {
      console.error('Reprogramadas:', e);
      reprEl.innerHTML = '<div style="padding:12px 0;font-size:12px;color:#dc2626">Erro: ' + e.message + '</div>';
    }
  },

  /* ── Filtros ── */
  async _atualizarMetricasAux() {
    try {
      const db = getDB();
      /* Pré-OS abertas: situacao = 'Aguardando' */
      const { count: abertas } = await db
        .from('pre_ordens')
        .select('*', { count: 'exact', head: true })
        .eq('situacao', 'Aguardando');
      const elP = document.getElementById('m-preos');
      if (elP && abertas != null) elP.textContent = abertas;

      /* Tempo médio Pré-OS → OS:
         data_geracao (OS) - data_comunicacao (Pré-OS) */
      const { data: preos } = await db
        .from('pre_ordens')
        .select('os, data_comunicacao')
        .not('os', 'is', null).neq('os', '');
      console.log('Pré-OS com OS:', preos ? preos.length : 0);
      if (!preos || !preos.length) {
        const elT = document.getElementById('m-tempo');
        if (elT) elT.textContent = 'sem dados';
        return;
      }
      const osNums = [...new Set(preos.map(p => p.os).filter(Boolean))];
      const { data: ordens } = await db
        .from('ordens_servico')
        .select('os, data_geracao')
        .in('os', osNums.slice(0, 500))
        .not('data_geracao', 'is', null);
      if (!ordens || !ordens.length) return;
      const mapaGer = {};
      ordens.forEach(o => { mapaGer[o.os] = o.data_geracao; });
      const diffs = [];
      preos.forEach(p => {
        const dGer = mapaGer[p.os];
        if (!dGer || !p.data_comunicacao) return;
        const diff = (new Date(dGer) - new Date(p.data_comunicacao)) / 86400000;
        if (diff >= 0 && diff < 365) diffs.push(diff);
      });
      console.log('Diffs calculados:', diffs.length);
      if (!diffs.length) { document.getElementById('m-tempo').textContent = 'sem dados'; return; }
      const media = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      const elT = document.getElementById('m-tempo');
      if (elT) { elT.textContent = media.toFixed(1) + ' dias'; elT.style.color = media <= 3 ? '#16a34a' : '#d97706'; }
    } catch(e) { console.error('Métricas aux:', e); }
  },

  _toggleDD(id) { toggleDD(id); },

  _onEqChange() {
    this._state.activeEqs = [...document.querySelectorAll('[name=eq]:checked')].map(c=>c.value);
    document.getElementById('eq-label').textContent = this._state.activeEqs.join(', ') || 'Nenhuma';
    this._atualizarCharts();
  },
  _allEqs(all) {
    document.querySelectorAll('[name=eq]').forEach(c=>{ c.checked=all; });
    this._onEqChange();
    document.getElementById('dd-eq').classList.remove('show');
  },
  _onSemChange() {
    this._state.activeSems = [...document.querySelectorAll('[name=sem]:checked')].map(c=>c.value);
    this._atualizarLabelSem();
    this._atualizarCharts();
  },
  _allSems(all) {
    document.querySelectorAll('[name=sem]').forEach(c=>{ c.checked=all; });
    if (!all && this._state.semanas.length) {
      const ult = this._state.semanas[this._state.semanas.length-1];
      const cb  = document.querySelector('[name=sem][value="'+ult.semana+'/'+ult.ano+'"]');
      if (cb) cb.checked = true;
    }
    this._onSemChange();
    document.getElementById('dd-sem').classList.remove('show');
  },
  _atualizarLabelSem() {
    const checked = [...document.querySelectorAll('[name=sem]:checked')].map(c=>c.value);
    this._state.activeSems = checked;
    const total = this._state.semanas.length;
    const lbl = checked.length===total&&total>0 ? 'SAFRA (todas)' :
                checked.length===0 ? 'Nenhuma' :
                checked.map(k=>'Sem '+k.split('/')[0]).join(', ');
    const el = document.getElementById('sem-label');
    if (el) el.textContent = lbl;
  },

  /* ── Importação ── */
  _onDrop(e) {
    e.preventDefault();
    document.getElementById('dz').classList.remove('over');
    const file = e.dataTransfer.files[0];
    if (file) this._processarArquivo(file);
  },
  _onFileSelect(e) {
    const file = e.target.files[0];
    if (file) this._processarArquivo(file);
    e.target.value = '';
  },
  async _processarArquivo(file) {
    showToast('Lendo ' + file.name + '...', 'info');
    const res = await processarArquivo(file);
    showToast(res.msg, res.ok ? 'ok' : 'erro', res.ok ? 4000 : 6000);
    this._addHistRow(file.name, res.msg, res.ok);
    if (res.ok) await this._carregarDados();
  },
  _addHistRow(nome, badge, ok) {
    const hora = new Date().getHours()+':'+String(new Date().getMinutes()).padStart(2,'0');
    const list = document.getElementById('hist-list');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'hist-row';
    row.innerHTML = `<i class="ti ti-file-spreadsheet" style="color:${ok?'var(--green)':'#dc2626'}"></i>
      <span class="hist-name" title="${nome}">${nome}</span>
      <span class="hist-date">hoje ${hora}</span>
      <span class="hist-badge ${ok?'hb-ok':'hb-err'}">${badge}</span>`;
    list.insertAdjacentElement('afterbegin', row);
  },

  exportar() { showToast('Exportação PDF em desenvolvimento', 'info'); },
};
