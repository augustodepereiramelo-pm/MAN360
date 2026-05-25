/* ═══════════════════════════════════════════════════════
   MAN360 — Módulo: Programação Semanal
   ═══════════════════════════════════════════════════════ */

window.Modulos = window.Modulos || {};

window.Modulos.prog_semanal = {

  /* Estado do módulo */
  _state: {
    semanas:    [],   // [{ semana, ano, dataIni, dataFim }] disponíveis
    dadosSem:   {},   // { '8/2026': { MEC1: { prev, real }, ... } }
    activeSems: [],   // semanas selecionadas
    activeEqs:  [],   // equipes selecionadas
    charts:     {},
  },

  /* ── Inicializar ── */
  async init(container) {
    container.innerHTML = this._template();
    this._bindEvents();
    await this._carregarDados();
  },

  /* ── Template HTML do módulo ── */
  _template() {
    const eqs = MAN360_CONFIG.equipes;
    return `
<!-- FILTROS -->
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
      ${eqs.map(eq => `
        <label class="dd-item">
          <input type="checkbox" name="eq" value="${eq}" checked
            onchange="Modulos.prog_semanal._onEqChange()"> ${eq}
        </label>
      `).join('')}
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
      <div id="sem-checkboxes"><!-- populado dinamicamente --></div>
    </div>
  </div>
</div>

<!-- MÉTRICAS -->
<div class="metrics-row">
  <div class="metric">
    <div class="m-label">H-H Programadas</div>
    <div class="m-val" id="m-hh" style="color:var(--yellow)">—</div>
    <div class="m-sub" id="m-hh-sub">carregando...</div>
  </div>
  <div class="metric">
    <div class="m-label">Aderência Global</div>
    <div class="m-val" id="m-adr" style="color:#9ca3af">—</div>
    <div class="m-sub">realizado / programado</div>
  </div>
  <div class="metric">
    <div class="m-label">Pré-OS Abertas</div>
    <div class="m-val" id="m-preos" style="color:var(--yellow)">—</div>
    <div class="m-sub">aguardando planejador</div>
  </div>
  <div class="metric">
    <div class="m-label">Tempo Médio Pré → OS</div>
    <div class="m-val" id="m-tempo" style="color:var(--green)">—</div>
    <div class="m-sub">média geral da safra</div>
  </div>
</div>

<!-- GRÁFICOS LINHA 1 -->
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

<!-- GRÁFICOS LINHA 2 -->
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

<!-- GRÁFICO LINHA 3 (largura total) -->
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

<!-- ALERTAS + REPROGRAMADAS -->
<div class="charts-row">
  <div class="card">
    <div class="card-title"><i class="ti ti-alert-triangle" style="color:var(--amber)"></i> PONTOS DE ATENÇÃO</div>
    <div id="alertas-body">
      <div style="padding:12px 0;font-size:12px;color:var(--text-muted);text-align:center">
        Importe os apontamentos para ver alertas automáticos
      </div>
    </div>
  </div>
  <div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div class="card-title" style="margin:0"><i class="ti ti-arrows-right-left" style="color:var(--yellow)"></i> REPROGRAMADAS NÃO EXECUTADAS</div>
      <span id="repr-count" style="font-size:10px;color:#9ca3af"></span>
    </div>
    <div id="repr-body">
      <div style="padding:12px 0;font-size:12px;color:var(--text-muted);text-align:center">
        Selecione uma única semana para ver serviços reprogramados
      </div>
    </div>
  </div>
</div>

<!-- IMPORTAÇÃO -->
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
          <div class="file-type"><i class="ti ti-file-text" style="color:var(--blue)"></i><span class="ext">.csv</span></div>
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

    <div class="hist-list" id="hist-list-wrap" style="margin-top:16px">
      <div class="hist-title">IMPORTAÇÕES RECENTES</div>
      <div id="hist-list"></div>
    </div>
  </div>
</div>
    `;
  },

  /* ── Bind de eventos ── */
  _bindEvents() {
    // Fechar dropdowns ao clicar fora
    // (já tratado no shell global)
  },

  /* ── Carregar dados do banco ── */
  async _carregarDados() {
    showBanner('Carregando dados...', true);
    try {
      const db = getDB();

      // 1. Buscar programação semanal
      const { data: progData, error: progErr } = await db
        .from('programacao_semanal')
        .select('semana, ano, equipe, hh_previsto, data_inicio_semana, data_fim_semana')
        .order('semana', { ascending: true });

      if (progErr) throw progErr;

      if (!progData || !progData.length) {
        showBanner('Sem dados importados. Use o campo "Importar dados" abaixo.', true);
        this._inicializarCharts([]);
        return;
      }

      // Agrupar por semana → equipe → H-h
      const agrupado = {};
      const semInfos = {};
      progData.forEach(r => {
        const key = `${r.semana}/${r.ano}`;
        if (!agrupado[key]) agrupado[key] = {};
        if (!semInfos[key])  semInfos[key] = {
          semana: r.semana, ano: r.ano,
          dataIni: r.data_inicio_semana, dataFim: r.data_fim_semana,
        };
        const eq = r.equipe;
        if (eq) {
          if (!agrupado[key][eq]) agrupado[key][eq] = { prev: 0, real: 0 };
          agrupado[key][eq].prev += parseFloat(r.hh_previsto) || 0;
        }
      });

      // 2. Buscar apontamentos (H-h real por semana/equipe)
      // Para cada semana, filtramos apontamentos pelo período
      for (const key of Object.keys(semInfos)) {
        const { dataIni, dataFim, semana, ano } = semInfos[key];
        if (!dataIni || !dataFim) continue;

        const { data: aptData } = await db
          .from('apontamentos')
          .select('os, hh_total, data_apontamento')
          .gte('data_apontamento', dataIni)
          .lte('data_apontamento', dataFim);

        if (!aptData || !aptData.length) continue;

        // Cruzar apontamentos com OS para saber a equipe
        const osNums = [...new Set(aptData.map(a => a.os))];
        const { data: osEqs } = await db
          .from('ordens_servico')
          .select('os, equipe')
          .in('os', osNums.slice(0, 500));

        const mapaEq = {};
        (osEqs || []).forEach(o => { mapaEq[o.os] = o.equipe; });

        aptData.forEach(apt => {
          const eq = mapaEq[apt.os];
          if (!eq) return;
          if (!agrupado[key]) agrupado[key] = {};
          if (!agrupado[key][eq]) agrupado[key][eq] = { prev: 0, real: 0 };
          agrupado[key][eq].real += parseFloat(apt.hh_total) || 0;
        });
      }

      // Arredondar valores
      Object.values(agrupado).forEach(eqs => {
        Object.values(eqs).forEach(v => {
          v.prev = Math.round(v.prev * 10) / 10;
          v.real = Math.round(v.real * 10) / 10;
        });
      });

      this._state.dadosSem  = agrupado;
      this._state.semanas   = Object.values(semInfos).sort((a, b) => a.semana - b.semana);
      this._state.activeEqs = [...MAN360_CONFIG.equipes];

      // Selecionar semana mais recente por padrão
      const ultima = this._state.semanas[this._state.semanas.length - 1];
      this._state.activeSems = ultima ? [`${ultima.semana}/${ultima.ano}`] : [];

      this._renderizarDropdownSemanas();
      this._inicializarCharts();
      this._atualizarMetricasAux();

      showBanner('', false);
    } catch (err) {
      console.error(err);
      showBanner('Erro ao carregar: ' + err.message, true);
    }
  },

  /* ── Renderizar checkboxes de semanas ── */
  _renderizarDropdownSemanas() {
    const box = document.getElementById('sem-checkboxes');
    if (!box) return;
    box.innerHTML = '';
    this._state.semanas.forEach(({ semana, ano, dataIni, dataFim }) => {
      const key = `${semana}/${ano}`;
      const checked = this._state.activeSems.includes(key);
      const label = document.createElement('label');
      label.className = 'dd-item';
      label.innerHTML = `
        <input type="checkbox" name="sem" value="${key}" ${checked ? 'checked' : ''}
          onchange="Modulos.prog_semanal._onSemChange()">
        Sem ${semana}
        <span style="color:#9ca3af;font-size:10px;margin-left:4px">${dataIni ? dataIni.slice(5).replace('-','/') : ''}</span>
      `;
      box.appendChild(label);
    });
    this._atualizarLabelSem();
  },

  /* ── Inicializar charts ── */
  _inicializarCharts() {
    const YELLOW = '#F8C100', GREEN = '#16a34a', RED = '#E24B4A', BLUE = '#2563eb';
    const tickC  = 'rgba(80,80,80,.9)', gridC = 'rgba(0,0,0,.06)';
    const base   = { responsive: true, maintainAspectRatio: false,
                     plugins: { legend: { display: false }, tooltip: {} } };

    const eqs = MAN360_CONFIG.equipes;
    const zeros = eqs.map(() => 0);

    // Destruir charts anteriores se existirem
    Object.values(this._state.charts).forEach(c => c.destroy());
    this._state.charts = {};

    const mkScale = (axis, cb) => ({
      [axis]: {
        ticks: { color: tickC, font: { size: 10 }, callback: cb },
        grid:  axis === 'x' ? { display: false } : { color: gridC },
      }
    });

    // C1 — H-h programado
    this._state.charts.c1 = new Chart(document.getElementById('c1'), {
      type: 'bar',
      data: { labels: eqs, datasets: [{ data: zeros, backgroundColor: YELLOW, borderRadius: 4,
        _fmt: v => v + 'h' }] },
      options: { ...base, plugins: { ...base.plugins,
        tooltip: { callbacks: { label: ctx => ` ${ctx.raw}h` } } },
        scales: { x: { ticks: { color: tickC, font: { size: 10 } }, grid: { display: false } },
                  y: { ticks: { color: tickC, font: { size: 10 }, callback: v => v + 'h' }, grid: { color: gridC } } } },
    });

    // C2 — Aderência por equipe
    this._state.charts.c2 = new Chart(document.getElementById('c2'), {
      type: 'bar',
      data: { labels: eqs, datasets: [{ data: zeros, backgroundColor: zeros.map(() => '#9ca3af'), borderRadius: 4 }] },
      options: { ...base,
        scales: { x: { ticks: { color: tickC, font: { size: 10 } }, grid: { display: false } },
                  y: { min: 0, max: 100, ticks: { color: tickC, font: { size: 10 }, callback: v => v + '%' }, grid: { color: gridC } } } },
    });

    // C3 — Aderência global semana a semana
    this._state.charts.c3 = new Chart(document.getElementById('c3'), {
      type: 'bar',
      data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderRadius: 4 }] },
      options: { ...base,
        scales: { x: { ticks: { color: tickC, font: { size: 10 } }, grid: { display: false } },
                  y: { min: 0, max: 100, ticks: { color: tickC, font: { size: 10 }, callback: v => v + '%' }, grid: { color: gridC } } } },
    });

    // C4 — Eficiência: previsto x realizado
    this._state.charts.c4 = new Chart(document.getElementById('c4'), {
      type: 'bar',
      data: { labels: eqs, datasets: [
        { label: 'Previsto',  data: zeros, backgroundColor: YELLOW, borderRadius: 4 },
        { label: 'Realizado', data: zeros, backgroundColor: zeros.map(() => '#9ca3af'), borderRadius: 4 },
      ]},
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: true, labels: { color: tickC, font: { size: 10 }, boxWidth: 10 } },
                   tooltip: {} },
        scales: { x: { ticks: { color: tickC, font: { size: 10 } }, grid: { display: false } },
                  y: { ticks: { color: tickC, font: { size: 10 }, callback: v => v + 'h' }, grid: { color: gridC } } } },
    });

    // C5 — Distribuição H-h
    this._state.charts.c5 = new Chart(document.getElementById('c5'), {
      type: 'bar',
      data: { labels: eqs, datasets: [
        { label: 'MCU',             data: zeros, backgroundColor: RED,   borderRadius: 0 },
        { label: 'Dentro da prog.', data: zeros, backgroundColor: GREEN, borderRadius: 0 },
        { label: 'Fora da prog.',   data: zeros, backgroundColor: BLUE,  borderRadius: 0 },
      ]},
      options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: { legend: { display: false },
                   tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.raw}h` } } },
        scales: {
          x: { stacked: true, ticks: { color: tickC, font: { size: 10 }, callback: v => v + 'h' }, grid: { color: gridC } },
          y: { stacked: true, ticks: { color: tickC, font: { size: 10 } }, grid: { display: false } },
        } },
    });

    this._atualizarCharts();
  },

  /* ── Atualizar charts com estado atual ── */
  _atualizarCharts() {
    const { charts, activeSems, activeEqs, dadosSem, semanas } = this._state;
    if (!Object.keys(charts).length) return;

    const GREEN = '#16a34a', RED = '#E24B4A';

    // Agregar por equipe somando as semanas ativas
    const prev = activeEqs.map(eq => {
      return activeSems.reduce((sum, key) => {
        return sum + ((dadosSem[key] && dadosSem[key][eq]) ? dadosSem[key][eq].prev : 0);
      }, 0);
    });
    const real = activeEqs.map(eq => {
      return activeSems.reduce((sum, key) => {
        return sum + ((dadosSem[key] && dadosSem[key][eq]) ? dadosSem[key][eq].real : 0);
      }, 0);
    });
    const adr = activeEqs.map((eq, i) => prev[i] ? Math.round(real[i] / prev[i] * 100) : 0);

    const totalPrev = prev.reduce((a, b) => a + b, 0);
    const totalReal = real.reduce((a, b) => a + b, 0);
    const adrGlobal = totalPrev ? Math.round(totalReal / totalPrev * 100) : 0;

    // Aderência global semana a semana
    const semLabels = [], semVals = [];
    semanas.forEach(({ semana, ano }) => {
      const key = `${semana}/${ano}`;
      if (!dadosSem[key]) return;
      let tp = 0, tr = 0;
      activeEqs.forEach(eq => {
        if (dadosSem[key][eq]) { tp += dadosSem[key][eq].prev; tr += dadosSem[key][eq].real; }
      });
      semLabels.push('Sem ' + semana);
      semVals.push(tp ? Math.round(tr / tp * 100) : 0);
    });

    // Atualizar métricas
    const mHH  = document.getElementById('m-hh');
    const mAdr = document.getElementById('m-adr');
    if (mHH)  mHH.textContent  = totalPrev.toLocaleString('pt-BR') + 'h';
    if (mAdr) { mAdr.textContent = adrGlobal + '%'; mAdr.style.color = adrGlobal >= 80 ? GREEN : RED; }

    const sub = document.getElementById('m-hh-sub');
    if (sub) sub.textContent = `${activeEqs.length} equipe${activeEqs.length !== 1 ? 's' : ''} · ${activeSems.length} semana${activeSems.length !== 1 ? 's' : ''}`;

    // C1
    charts.c1.data.labels = activeEqs;
    charts.c1.data.datasets[0].data = prev;
    charts.c1.update('none');

    // C2
    charts.c2.data.labels = activeEqs;
    charts.c2.data.datasets[0].data = adr;
    charts.c2.data.datasets[0].backgroundColor = adr.map(v => v >= 80 ? GREEN : (v > 0 ? RED : '#9ca3af'));
    charts.c2.update('none');

    // C3
    charts.c3.data.labels = semLabels;
    charts.c3.data.datasets[0].data = semVals;
    charts.c3.data.datasets[0].backgroundColor = semVals.map(v => v >= 80 ? GREEN : (v > 0 ? RED : '#9ca3af'));
    charts.c3.update('none');

    // C4
    charts.c4.data.labels = activeEqs;
    charts.c4.data.datasets[0].data = prev;
    charts.c4.data.datasets[1].data = real;
    charts.c4.data.datasets[1].backgroundColor = real.map((r, i) => prev[i] && r / prev[i] >= 0.8 ? GREEN : (r > 0 ? RED : '#9ca3af'));
    charts.c4.update('none');

    // C5 — por enquanto zeros para MCU/dentro/fora até ter cruzamento completo
    charts.c5.data.labels = activeEqs;
    charts.c5.update('none');
  },

  /* ── Métricas auxiliares (Pré-OS e Tempo Médio) ── */
  async _atualizarMetricasAux() {
    try {
      const db = getDB();

      // Pré-OS abertas
      const { count: abertas } = await db
        .from('pre_ordens')
        .select('*', { count: 'exact', head: true })
        .or('os.is.null,os.eq.');
      const elP = document.getElementById('m-preos');
      if (elP && abertas != null) elP.textContent = abertas;

      // Tempo médio pré → OS
      const { data: preos } = await db
        .from('pre_ordens')
        .select('os, data_comunicacao')
        .not('os', 'is', null)
        .neq('os', '');
      if (!preos || !preos.length) return;

      const osNums = preos.map(p => p.os).filter(Boolean);
      const { data: ordens } = await db
        .from('ordens_servico')
        .select('os, data_geracao')
        .in('os', osNums.slice(0, 500));
      if (!ordens) return;

      const mapaGer = {};
      ordens.forEach(o => { if (o.data_geracao) mapaGer[o.os] = o.data_geracao; });

      const diffs = [];
      preos.forEach(p => {
        const dGer = mapaGer[p.os];
        if (!dGer || !p.data_comunicacao) return;
        const d1 = new Date(p.data_comunicacao);
        const d2 = new Date(dGer);
        const diff = (d2 - d1) / (1000 * 60 * 60 * 24);
        if (diff >= 0 && diff < 365) diffs.push(diff);
      });

      if (!diffs.length) return;
      const media = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      const elT = document.getElementById('m-tempo');
      if (elT) {
        elT.textContent = media.toFixed(1) + ' dias';
        elT.style.color = media <= 3 ? '#16a34a' : '#d97706';
      }
    } catch (e) { console.warn('Métricas aux:', e); }
  },

  /* ── Filtros ── */
  _toggleDD(id) { toggleDD(id); },

  _onEqChange() {
    this._state.activeEqs = [...document.querySelectorAll('[name=eq]:checked')].map(c => c.value);
    document.getElementById('eq-label').textContent = this._state.activeEqs.join(', ') || 'Nenhuma';
    this._atualizarCharts();
  },
  _allEqs(all) {
    document.querySelectorAll('[name=eq]').forEach(c => { c.checked = all; });
    this._onEqChange();
    document.getElementById('dd-eq').classList.remove('show');
  },

  _onSemChange() {
    this._state.activeSems = [...document.querySelectorAll('[name=sem]:checked')].map(c => c.value);
    this._atualizarLabelSem();
    this._atualizarCharts();
  },
  _allSems(all) {
    document.querySelectorAll('[name=sem]').forEach(c => { c.checked = all; });
    if (!all && this._state.semanas.length) {
      const ult = this._state.semanas[this._state.semanas.length - 1];
      const cb  = document.querySelector(`[name=sem][value="${ult.semana}/${ult.ano}"]`);
      if (cb) cb.checked = true;
    }
    this._onSemChange();
    document.getElementById('dd-sem').classList.remove('show');
  },
  _atualizarLabelSem() {
    const checked = [...document.querySelectorAll('[name=sem]:checked')].map(c => c.value);
    this._state.activeSems = checked;
    const total = this._state.semanas.length;
    const lbl = checked.length === total && total > 0 ? 'SAFRA (todas)' :
                checked.length === 0 ? 'Nenhuma semana' :
                checked.map(k => 'Sem ' + k.split('/')[0]).join(', ');
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
    const resultado = await processarArquivo(file);
    const ok = resultado.ok;
    showToast(resultado.msg, ok ? 'ok' : 'erro', ok ? 4000 : 6000);
    this._addHistRow(file.name, resultado.msg, ok);

    // Se foi programação semanal, recarregar dados
    if (ok && resultado.tipo === 'progsem') {
      await this._carregarDados();
    }
  },

  _addHistRow(nome, badge, ok) {
    const now  = new Date();
    const hora = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');
    const list = document.getElementById('hist-list');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'hist-row';
    row.innerHTML = `
      <i class="ti ti-file-spreadsheet" style="color:${ok ? 'var(--green)' : '#dc2626'}"></i>
      <span class="hist-name" title="${nome}">${nome}</span>
      <span class="hist-date">hoje ${hora}</span>
      <span class="hist-badge ${ok ? 'hb-ok' : 'hb-err'}">${badge}</span>
    `;
    list.insertAdjacentElement('afterbegin', row);
  },

  /* ── Exportar (placeholder) ── */
  exportar() {
    showToast('Exportação PDF em desenvolvimento', 'info');
  },
};
