/* ═══════════════════════════════════════════════════════════════
   MAN360 — Acompanhamento Caldeiraria
   Padrão: window.Modulos.cal_acomp = { init(container) }
   Dependências: getDB() de shared/db.js · SortableJS (CDN)
   ═══════════════════════════════════════════════════════════════ */

window.Modulos = window.Modulos || {};
window.Modulos.cal_acomp = (() => {

  /* ── Semana âncora (mesma lógica do módulo apontamentos) ── */
  const ANCORA_SEMANA = 9;
  const ANCORA_DATA   = new Date('2026-05-25');

  function semanaAtual() {
    const hoje = new Date();
    hoje.setHours(0,0,0,0);
    const diff  = Math.round((hoje - ANCORA_DATA) / 86400000);
    const delta = Math.floor(diff / 7);
    return ANCORA_SEMANA + delta;
  }

  function inicioSemana(semana) {
    const d = new Date(ANCORA_DATA);
    d.setDate(d.getDate() + (semana - ANCORA_SEMANA) * 7);
    return d;
  }

  function fimSemana(semana) {
    const d = inicioSemana(semana);
    d.setDate(d.getDate() + 6);
    return d;
  }

  function fmtData(d) {
    if (!d) return '—';
    const dt = typeof d === 'string' ? new Date(d + 'T00:00:00') : d;
    return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }

  function fmtDataFull(d) {
    if (!d) return '—';
    const dt = typeof d === 'string' ? new Date(d + 'T00:00:00') : d;
    return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function isoDate(d) {
    return d.toISOString().split('T')[0];
  }

  /* ── Estado ── */
  let _semana    = semanaAtual();
  let _safra     = null;
  let _safras    = [];
  let _equipes   = [];      // [{id, nome, membros:[{chapa,nome}]}]
  let _fila      = {};      // equipe_id → [{...}]
  let _progSem   = [];      // programação semanal da semana
  let _aponts    = [];      // apontamentos importados
  let _colabs    = [];      // apt_colaboradores CAL
  let _turnos    = {};      // id → {hora_entrada, hora_saida, intervalo_min, saida_sexta}
  let _escalas   = {};      // id → {tipo_ciclo, dias_trabalho, ...}
  let _ferias    = [];
  let _justific  = [];
  let _container = null;

  /* ── Helpers de data ── */
  function hoje() { const d = new Date(); d.setHours(0,0,0,0); return d; }
  function amanha() { const d = hoje(); d.setDate(d.getDate()+1); return d; }

  function hhDiaTurno(turnoId) {
    const t = _turnos[turnoId];
    if (!t) return 0;
    const [eh,em] = (t.hora_entrada||'00:00').split(':').map(Number);
    const [sh,sm] = (t.hora_saida  ||'00:00').split(':').map(Number);
    const total   = (sh*60+sm) - (eh*60+em) - (t.intervalo_min||0);
    return Math.max(0, total / 60);
  }

  /* Projeta folgas para um colaborador num período */
  function projetarFolgas(colab, dataIni, dataFim) {
    const folgas = new Set();
    const esc = _escalas[colab.escala_id];
    if (!esc) return folgas;

    if (esc.tipo_ciclo === 'ADM') {
      // Sáb e Dom
      let d = new Date(dataIni);
      while (d <= dataFim) {
        if (d.getDay() === 0 || d.getDay() === 6) folgas.add(isoDate(d));
        d.setDate(d.getDate()+1);
      }
      return folgas;
    }

    // ROTATIVO
    const ancora = colab.data_ref_folga || colab.primeira_folga;
    if (!ancora) return folgas;
    const ancD = new Date(ancora + 'T00:00:00');
    const ciclo = (esc.dias_trabalho || 5) + 1; // trabalho + 1 folga
    let d = new Date(dataIni);
    while (d <= dataFim) {
      const diff = Math.round((d - ancD) / 86400000);
      const pos  = ((diff % ciclo) + ciclo) % ciclo;
      if (pos === esc.dias_trabalho) folgas.add(isoDate(d));
      d.setDate(d.getDate()+1);
    }
    return folgas;
  }

  /* HH disponível por dia para uma equipe */
  function hhDisponivel(equipe, data) {
    const iso = isoDate(data);
    let total = 0;
    for (const m of (equipe.membros || [])) {
      const colab = _colabs.find(c => c.chapa === m.chapa);
      if (!colab || !colab.turno_id) continue;
      // Férias
      if (_ferias.some(f => f.chapa === m.chapa && iso >= f.data_inicio && iso <= f.data_fim)) continue;
      // Justificativa
      if (_justific.some(j => j.chapa === m.chapa && iso >= j.data_inicio && iso <= j.data_fim)) continue;
      // Folga
      const ini = inicioSemana(_semana);
      const fim = fimSemana(_semana);
      const folgas = projetarFolgas(colab, ini, fim);
      if (folgas.has(iso)) continue;
      total += hhDiaTurno(colab.turno_id);
    }
    return total;
  }

  /* HH total disponível da equipe na semana */
  function hhSemanaEquipe(equipe) {
    let total = 0;
    const ini = inicioSemana(_semana);
    for (let i = 0; i < 7; i++) {
      const d = new Date(ini); d.setDate(d.getDate()+i);
      total += hhDisponivel(equipe, d);
    }
    return total;
  }

  /* Cor do tipo no mini-Gantt */
  function corMiniGantt(tipo) {
    if (tipo === 'realizado') return 'var(--cag-realizado)';
    if (tipo === 'prog')      return 'var(--cag-prog)';
    if (tipo === 'fora')      return 'var(--cag-fora)';
    if (tipo === 'mcu')       return 'var(--cag-mcu)';
    if (tipo === 'estourado') return 'var(--cag-estourado)';
    if (tipo === 'folga')     return 'var(--cag-folga)';
    return 'var(--cag-vazio)';
  }

  /* Estado do dia no mini-Gantt para uma equipe */
  function estadoDia(equipe, data, hhAcumPre) {
    const iso = isoDate(data);
    const hd  = hhDisponivel(equipe, data);
    if (hd === 0) return 'folga';
    // Dia passado com algo apontado → realizado
    const h = hoje();
    if (data < h) {
      const temApontamento = _aponts.some(a => {
        const memb = equipe.membros || [];
        return a.data_apontamento === iso && memb.some(m => m.chapa === a.chapa);
      });
      if (temApontamento) return 'realizado';
    }
    // Calcula carga alocada nesse dia
    const fila = _fila[equipe.id] || [];
    let hhDia = 0;
    for (const item of fila) {
      if (item.status === 'encerrado') continue;
      hhDia += (item.hh_previsto || 0);
    }
    // Simplificação visual: marca tipo predominante
    const tipos = fila.filter(i => i.status !== 'encerrado').map(i => i.tipo);
    if (tipos.includes('mcu'))       return 'mcu';
    if (tipos.includes('fora_prog')) return 'fora';
    if (tipos.includes('programado'))return 'prog';
    return 'vazio';
  }

  /* ════════════════════════════════════════════════
     CARREGAMENTO DE DADOS
  ════════════════════════════════════════════════ */
  async function carregarTudo() {
    const db = getDB();

    // Safras disponíveis
    const { data: safrasRaw } = await db
      .from('programacao_semanal').select('safra').not('safra','is',null);
    _safras = [...new Set((safrasRaw||[]).map(r=>r.safra))].sort().reverse();
    if (!_safra && _safras.length) _safra = _safras[0];

    // Colaboradores CAL
    const { data: colabs } = await db
      .from('apt_colaboradores').select('*').eq('modalidade','CAL');
    _colabs = colabs || [];

    // Turnos
    const { data: turnos } = await db.from('apt_turnos').select('*');
    (turnos||[]).forEach(t => { _turnos[t.id] = t; });

    // Escalas
    const { data: escalas } = await db.from('apt_escalas').select('*');
    (escalas||[]).forEach(e => { _escalas[e.id] = e; });

    // Férias e justificativas
    const ini = isoDate(inicioSemana(_semana));
    const fim = isoDate(fimSemana(_semana));
    const { data: ferias } = await db.from('apt_ferias')
      .select('*').lte('data_inicio', fim).gte('data_fim', ini);
    _ferias = ferias || [];

    const { data: just } = await db.from('apt_justificativas')
      .select('*').lte('data_inicio', fim).gte('data_fim', ini);
    _justific = just || [];

    // Equipes + membros
    const { data: eqs } = await db.from('cal_equipes').select('*').eq('ativo', true);
    const { data: mbs } = await db.from('cal_equipe_membros').select('*');
    _equipes = (eqs||[]).map(e => ({
      ...e,
      membros: (mbs||[]).filter(m => m.equipe_id === e.id)
        .map(m => ({ chapa: m.chapa, nome: m.nome, vigencia_inicio: m.vigencia_inicio }))
    }));

    // Fila da semana
    const ano = inicioSemana(_semana).getFullYear();
    const { data: fila } = await db.from('cal_fila')
      .select('*').eq('semana', _semana).eq('ano', ano)
      .order('ordem', { ascending: true });
    _fila = {};
    (fila||[]).forEach(item => {
      if (!_fila[item.equipe_id]) _fila[item.equipe_id] = [];
      _fila[item.equipe_id].push(item);
    });

    // Programação semanal
    const { data: prog } = await db.from('programacao_semanal')
      .select('*, ordens_servico(tipo_atividade)')
      .eq('semana', _semana).eq('ano', ano);
    _progSem = prog || [];

    // Apontamentos do período
    const { data: apts } = await db.from('apontamentos')
      .select('*').gte('data_apontamento', ini).lte('data_apontamento', fim);
    _aponts = apts || [];
  }

  /* ════════════════════════════════════════════════
     PERSISTÊNCIA
  ════════════════════════════════════════════════ */
  async function salvarOrdemFila(equipeId) {
    const db  = getDB();
    const ano = inicioSemana(_semana).getFullYear();
    const items = _fila[equipeId] || [];
    for (let i = 0; i < items.length; i++) {
      await db.from('cal_fila').update({ ordem: i + 1 }).eq('id', items[i].id);
    }
  }

  async function atualizarStatus(itemId, status, extra = {}) {
    const db = getDB();
    const payload = { status, ...extra };
    await db.from('cal_fila').update(payload).eq('id', itemId);
    // Atualizar local
    for (const eqId in _fila) {
      const idx = _fila[eqId].findIndex(i => i.id === itemId);
      if (idx >= 0) { Object.assign(_fila[eqId][idx], payload); break; }
    }
  }

  async function inserirNaFila(equipeId, item) {
    const db  = getDB();
    const ano = inicioSemana(_semana).getFullYear();
    const fila = _fila[equipeId] || [];
    const ordem = fila.length + 1;
    const payload = { equipe_id: equipeId, semana: _semana, ano, ordem, ...item };
    const { data, error } = await db.from('cal_fila').insert(payload).select().single();
    if (error) return null;
    if (!_fila[equipeId]) _fila[equipeId] = [];
    _fila[equipeId].push(data);
    return data;
  }

  async function removerDaFila(itemId) {
    const db = getDB();
    await db.from('cal_fila').delete().eq('id', itemId);
    for (const eqId in _fila) {
      _fila[eqId] = _fila[eqId].filter(i => i.id !== itemId);
    }
  }

  /* ════════════════════════════════════════════════
     HTML — COMPONENTES
  ════════════════════════════════════════════════ */

  /* Badge de tipo */
  function badgeTipo(tipo, compact) {
    const map = {
      programado:  ['PRG', 'var(--cs-prog)',  'var(--cag-prog-l)'],
      fora_prog:   ['NPG', 'var(--cs-fora)',  'var(--cag-fora-l)'],
      mcu:         ['MCU', 'var(--cs-mcu)',   'var(--cag-mcu-l)'],
      sem_os:      ['S/O', '#6b7280',         '#f3f4f6'],
    };
    const [label, color, bg] = map[tipo] || ['?', '#9ca3af', '#f3f4f6'];
    return `<span class="cag-badge" style="color:${color};background:${bg}">${label}</span>`;
  }

  /* Mini Gantt de 7 dias */
  function htmlMiniGantt(equipe) {
    const DIAS = ['S','T','Q','Q','S','S','D'];
    const ini  = inicioSemana(_semana);
    const h    = hoje();
    const fila = (_fila[equipe.id]||[]).filter(i => i.status !== 'encerrado');

    // Calcular HH total alocado e HH disponível total
    let hhAcum = 0;
    let hhDisp = hhSemanaEquipe(equipe);

    // Distribuir HH por dia (simplificado: distribui sequencialmente)
    const diasHH = Array(7).fill(0).map((_,i) => {
      const d = new Date(ini); d.setDate(d.getDate()+i);
      return hhDisponivel(equipe, d);
    });
    const diasRestante = [...diasHH];
    const diasTipo = Array(7).fill('vazio');

    // Marcar folgas primeiro
    for (let i = 0; i < 7; i++) {
      if (diasHH[i] === 0) diasTipo[i] = 'folga';
    }

    // Distribuir serviços nos dias úteis
    let diaIdx = 0;
    for (const item of fila) {
      let hhRestante = item.hh_previsto || 0;
      while (hhRestante > 0 && diaIdx < 7) {
        if (diasTipo[diaIdx] === 'folga') { diaIdx++; continue; }
        const d = new Date(ini); d.setDate(d.getDate()+diaIdx);
        const tipo = item.tipo === 'mcu' ? 'mcu' : item.tipo === 'fora_prog' ? 'fora' : 'prog';

        if (diasRestante[diaIdx] > 0) {
          // Dia com capacidade — verifica prioridade de cor
          if (diasTipo[diaIdx] === 'vazio' || diasTipo[diaIdx] === 'prog') {
            diasTipo[diaIdx] = tipo;
          } else if (tipo === 'mcu') {
            diasTipo[diaIdx] = 'mcu';
          }
          const usado = Math.min(hhRestante, diasRestante[diaIdx]);
          diasRestante[diaIdx] -= usado;
          hhRestante -= usado;
          if (diasRestante[diaIdx] <= 0) diaIdx++;
        } else {
          // Estouro
          diasTipo[diaIdx] = 'estourado';
          diaIdx++;
        }
      }
    }

    // Dias passados com apontamento → realizado
    for (let i = 0; i < 7; i++) {
      const d = new Date(ini); d.setDate(d.getDate()+i);
      if (d < h && diasTipo[i] !== 'folga') {
        const iso = isoDate(d);
        const temApt = _aponts.some(a =>
          a.data_apontamento === iso &&
          (equipe.membros||[]).some(m => m.chapa === a.chapa)
        );
        if (temApt) diasTipo[i] = 'realizado';
      }
    }

    const blocos = DIAS.map((dl, i) => {
      const tipo = diasTipo[i];
      const bg   = corMiniGantt(tipo);
      const borda = tipo === 'folga' ? '1px solid rgba(200,200,200,.4)' : '1px solid rgba(0,0,0,.06)';
      return `<div class="cag-mg-day" style="background:${bg};border:${borda}" title="${tipo}"></div>`;
    }).join('');

    const labels = DIAS.map(dl =>
      `<div class="cag-mg-dl">${dl}</div>`
    ).join('');

    const hhAloc = fila.reduce((s,i) => s + (i.hh_previsto||0), 0);
    const hhLivre = hhDisp - hhAloc;
    const excedido = hhLivre < 0;
    const hhTxt = excedido
      ? `<span style="color:#f87171;font-weight:700">${hhAloc.toFixed(0)} HH · +${Math.abs(hhLivre).toFixed(0)} excedido</span>`
      : `${hhAloc.toFixed(0)} HH alocados · ${hhLivre.toFixed(0)} livres`;

    return `
      <div class="cag-mg-labels">${labels}</div>
      <div class="cag-mg">${blocos}</div>
      <div class="cag-cap-hh">${hhTxt}</div>
    `;
  }

  /* Card de OS */
  function htmlCard(item, equipeId) {
    const stripeColor = {
      programado: 'var(--cs-prog)',
      fora_prog:  'var(--cs-fora)',
      mcu:        'var(--cs-mcu)',
      sem_os:     '#9ca3af',
    }[item.tipo] || '#9ca3af';

    const isConcluido    = item.status === 'encerrado';
    const isEmExec       = item.status === 'em_execucao';
    const isInterrompido = item.status === 'interrompido';

    let cardClass = 'cag-card';
    if (isConcluido)    cardClass += ' concluido';
    if (isEmExec)       cardClass += ' em-exec';
    if (isInterrompido) cardClass += ' interrompido';

    const osNum = item.os
      ? `<span class="cag-os-num">${item.os}</span>`
      : `<span class="cag-os-num sem-os">sem nº</span>`;

    const statusIcon = isConcluido
      ? `<i class="ti ti-circle-check cag-si done"></i>`
      : isEmExec
      ? `<i class="ti ti-player-play cag-si exec"></i>`
      : isInterrompido
      ? `<i class="ti ti-player-pause cag-si inter"></i>`
      : '';

    const execBar = isEmExec
      ? `<div class="cag-exec-bar"><div class="cag-exec-dot"></div> Em execução · ${item.iniciado_em ? fmtData(item.iniciado_em.split('T')[0]) : '—'}</div>`
      : '';

    const interMotivo = isInterrompido && item.obs
      ? `<div class="cag-inter-motivo"><i class="ti ti-alert-circle"></i> ${item.obs}</div>`
      : '';

    const semOsAviso = !item.os || !item.vinculado
      ? `<div class="cag-sem-os-aviso"><i class="ti ti-alert-circle"></i> Não vinculada · toque para adicionar nº OS</div>`
      : '';

    // Botões expandidos — variam por status
    let botoesExpand = '';
    if (isConcluido) {
      botoesExpand = `
        <button class="cag-act blue" data-action="reabrir" data-id="${item.id}"><i class="ti ti-rotate-clockwise"></i> Reabrir</button>
      `;
    } else if (isEmExec) {
      botoesExpand = `
        <button class="cag-act green"  data-action="concluir"    data-id="${item.id}"><i class="ti ti-check"></i> Concluir</button>
        <button class="cag-act amber"  data-action="interromper" data-id="${item.id}"><i class="ti ti-player-pause"></i> Interromper</button>
        <button class="cag-act blue"   data-action="mover-equipe" data-id="${item.id}" data-eq="${equipeId}"><i class="ti ti-arrows-transfer-right"></i> Mover equipe</button>
        <button class="cag-act ghost"  data-action="remover"     data-id="${item.id}"><i class="ti ti-x"></i> Remover</button>
      `;
    } else if (isInterrompido) {
      botoesExpand = `
        <button class="cag-act blue"  data-action="reabrir"     data-id="${item.id}"><i class="ti ti-rotate-clockwise"></i> Recolocar na fila</button>
        <button class="cag-act ghost" data-action="remover"     data-id="${item.id}"><i class="ti ti-x"></i> Remover</button>
      `;
    } else {
      botoesExpand = `
        <button class="cag-act blue"  data-action="iniciar"      data-id="${item.id}"><i class="ti ti-player-play"></i> Iniciar</button>
        <button class="cag-act blue"  data-action="mover-equipe" data-id="${item.id}" data-eq="${equipeId}"><i class="ti ti-arrows-transfer-right"></i> Mover equipe</button>
        <button class="cag-act ghost" data-action="mover-pos"    data-id="${item.id}" data-eq="${equipeId}"><i class="ti ti-arrows-up-down"></i> Posição</button>
        <button class="cag-act ghost" data-action="remover"      data-id="${item.id}"><i class="ti ti-x"></i> Remover</button>
      `;
      if (!item.os || !item.vinculado) {
        botoesExpand += `<button class="cag-act amber" data-action="vincular" data-id="${item.id}"><i class="ti ti-link"></i> Vincular OS</button>`;
      }
    }

    const hhTxt = item.hh_previsto ? `<span class="cag-os-hh"><i class="ti ti-clock"></i> ${item.hh_previsto} HH prev.</span>` : '';

    return `
      <div class="${cardClass}" data-id="${item.id}" data-eq="${equipeId}">
        <div class="cag-stripe" style="background:${stripeColor}"></div>
        <div class="cag-card-body">
          ${execBar}
          <div class="cag-card-head">
            ${osNum}
            <span class="cag-os-desc">${item.desc_servico || '—'}</span>
            ${statusIcon}
          </div>
          ${interMotivo}
          ${semOsAviso}
        </div>
        <div class="cag-card-expand">
          <div class="cag-expand-row">${hhTxt}</div>
          <div class="cag-act-row">${botoesExpand}</div>
        </div>
      </div>
    `;
  }

  /* Coluna de equipe */
  function htmlEquipeCol(equipe) {
    const fila  = _fila[equipe.id] || [];
    const hhDisp = hhSemanaEquipe(equipe);
    const hhAloc = fila.filter(i=>i.status!=='encerrado').reduce((s,i)=>s+(i.hh_previsto||0),0);
    const estouro = hhAloc > hhDisp;

    // Membros
    const membrosHtml = (equipe.membros||[]).map(m => {
      const colab = _colabs.find(c => c.chapa === m.chapa);
      const semTurno = colab && !colab.turno_id;
      return `<span class="cag-membro-tag${semTurno?' warn':''}" title="${semTurno?'Sem turno cadastrado':''}">
        ${m.nome ? m.nome.split(' ')[0] : m.chapa}${semTurno?' ⚠':''}
      </span>`;
    }).join('');

    // Linha de estouro — separa cards dentro e fora da capacidade
    let hhAcum = 0;
    let linhaEstouro = false;
    const cardsHtml = fila.map(item => {
      const isEnc = item.status === 'encerrado' || item.status === 'interrompido';
      if (!isEnc) hhAcum += (item.hh_previsto || 0);
      let divider = '';
      if (!linhaEstouro && hhAcum > hhDisp && !isEnc) {
        linhaEstouro = true;
        divider = `
          <div class="cag-overflow-div">
            <div class="cag-overflow-line"></div>
            <div class="cag-overflow-label"><i class="ti ti-alert-triangle"></i> Estouro de capacidade</div>
            <div class="cag-overflow-line"></div>
          </div>
        `;
      }
      return divider + htmlCard(item, equipe.id);
    }).join('');

    return `
      <div class="cag-equipe-col" data-eq-id="${equipe.id}">
        <div class="cag-eq-header${estouro?' estouro':''}">
          <div class="cag-eq-nome">
            ${equipe.nome}
            <button class="cag-eq-btn" data-action="config-equipe" data-eq="${equipe.id}" title="Configurar equipe">
              <i class="ti ti-settings"></i>
            </button>
          </div>
          <div class="cag-membros">${membrosHtml || '<span style="color:#6b7280;font-size:9px">Sem membros</span>'}</div>
          ${htmlMiniGantt(equipe)}
        </div>
        <div class="cag-fila" id="fila-${equipe.id}">
          ${cardsHtml}
          <button class="cag-add-os-btn" data-action="add-os" data-eq="${equipe.id}">
            <i class="ti ti-plus"></i> Inserir OS
          </button>
        </div>
      </div>
    `;
  }

  /* Lista suspensa genérica */
  function htmlLista(id, titulo, icone, badge, conteudo, corBadge) {
    const badgeHtml = badge != null
      ? `<span class="cag-lista-badge" style="${corBadge||''}">${badge}</span>`
      : '';
    return `
      <div class="cag-lista" id="lista-${id}">
        <div class="cag-lista-toggle" data-lista="${id}">
          <i class="ti ti-${icone}"></i>
          <span>${titulo}</span>
          ${badgeHtml}
          <i class="ti ti-chevron-down cag-lista-chevron" style="margin-left:auto"></i>
        </div>
        <div class="cag-lista-body" id="lista-body-${id}">
          ${conteudo}
        </div>
      </div>
    `;
  }

  /* Linha de tabela genérica */
  function tr(...cells) {
    return `<div class="cag-tr">${cells.map(c=>`<div class="cag-td">${c}</div>`).join('')}</div>`;
  }
  function th(...cells) {
    return `<div class="cag-tr cag-thead">${cells.map(c=>`<div class="cag-td">${c}</div>`).join('')}</div>`;
  }

  /* ── Conteúdo das listas ── */

  function htmlServsEmAndamento() {
    const emExec = [];
    for (const eq of _equipes) {
      const fila = _fila[eq.id] || [];
      for (const item of fila) {
        if (item.status === 'em_execucao' || item.status === 'pendente') {
          emExec.push({ ...item, equipeNome: eq.nome });
        }
      }
    }

    // Indisponíveis hoje/amanhã
    const hj   = isoDate(hoje());
    const amh  = isoDate(amanha());
    const indispHoje   = [];
    const indispAmanha = [];
    const deFerias     = [];

    for (const colab of _colabs) {
      // Férias
      if (_ferias.some(f => f.chapa === colab.chapa && hj >= f.data_inicio && hj <= f.data_fim)) {
        deFerias.push(colab.nome || colab.chapa);
        continue;
      }
      // Folga hoje
      const folgasHj = projetarFolgas(colab, hoje(), hoje());
      if (folgasHj.has(hj)) { indispHoje.push(colab.nome || colab.chapa); continue; }
      // Folga amanhã
      const folgasAmh = projetarFolgas(colab, amanha(), amanha());
      if (folgasAmh.has(amh)) indispAmanha.push(colab.nome || colab.chapa);
    }

    let html = '';

    // Serviços em andamento
    if (emExec.length) {
      html += th('OS', 'Descrição', 'Início', 'Prev. Fim', 'Equipe', 'Tipo');
      html += emExec.map(i => tr(
        i.os || '<span style="color:#9ca3af;font-style:italic">sem nº</span>',
        `<span class="cag-desc-cell">${i.desc_servico||'—'}</span>`,
        i.iniciado_em ? fmtData(i.iniciado_em) : '—',
        '—', // Prev. Fim calculado futuramente com base na fila
        `<span class="cag-equipe-cell">${i.equipeNome}</span>`,
        badgeTipo(i.tipo)
      )).join('');
    } else {
      html += `<div class="cag-lista-empty"><i class="ti ti-check"></i> Nenhum serviço em andamento</div>`;
    }

    // Disponibilidade
    const dispHtml = [
      indispHoje.length   ? `<div class="cag-disp-group"><span class="cag-disp-label">Folga hoje</span>${indispHoje.map(n=>`<span class="cag-disp-tag folga">${n}</span>`).join('')}</div>` : '',
      indispAmanha.length ? `<div class="cag-disp-group"><span class="cag-disp-label">Folga amanhã</span>${indispAmanha.map(n=>`<span class="cag-disp-tag folga-amh">${n}</span>`).join('')}</div>` : '',
      deFerias.length     ? `<div class="cag-disp-group"><span class="cag-disp-label">Férias</span>${deFerias.map(n=>`<span class="cag-disp-tag ferias">${n}</span>`).join('')}</div>` : '',
    ].filter(Boolean).join('');

    if (dispHtml) {
      html += `<div class="cag-disp-wrap">${dispHtml}</div>`;
    }

    return html || `<div class="cag-lista-empty">Sem dados</div>`;
  }

  function htmlPendencias() {
    // OS encerradas no MAN360 mas sem apontamento importado
    const encerradas = [];
    for (const eq of _equipes) {
      for (const item of (_fila[eq.id]||[])) {
        if (item.status !== 'encerrado' || !item.os) continue;
        const temApt = _aponts.some(a =>
          a.os === item.os &&
          item.encerrado_em &&
          a.data_apontamento <= item.encerrado_em.split('T')[0]
        );
        if (!temApt) encerradas.push(item);
      }
    }
    if (!encerradas.length)
      return `<div class="cag-lista-empty"><i class="ti ti-check"></i> Sem pendências de apontamento</div>`;
    return th('OS','Descrição','Início','Fim') +
      encerradas.map(i => tr(
        i.os,
        `<span class="cag-desc-cell">${i.desc_servico||'—'}</span>`,
        i.iniciado_em  ? fmtData(i.iniciado_em.split('T')[0])  : '—',
        i.encerrado_em ? fmtData(i.encerrado_em.split('T')[0]) : '—'
      )).join('');
  }

  function htmlProgSemana() {
    if (!_progSem.length)
      return `<div class="cag-lista-empty">Sem serviços programados para esta semana</div>`;

    // Quais OS já estão em alguma fila
    const osNaFila = new Set();
    for (const eqId in _fila) {
      for (const item of _fila[eqId]) {
        if (item.os) osNaFila.add(item.os + '|' + (item.cod_servico||''));
      }
    }

    return th('OS','Descrição','HH Prev.','Status') +
      _progSem.map(p => {
        const key = p.os + '|' + (p.cod_servico||'');
        const incluso = osNaFila.has(key);
        const statusBadge = incluso
          ? `<span class="cag-badge" style="color:var(--green);background:var(--green-l)">Incluso</span>`
          : `<span class="cag-badge" style="color:#9ca3af;background:#f3f4f6">Não incluso</span>`;
        return tr(
          p.os || '—',
          `<span class="cag-desc-cell">${p.desc_servico||'—'}</span>`,
          p.hh_previsto ? `${p.hh_previsto} HH` : '—',
          statusBadge
        );
      }).join('');
  }

  function htmlExecutados() {
    const encerrados = [];
    for (const eq of _equipes) {
      for (const item of (_fila[eq.id]||[])) {
        if (item.status === 'encerrado') encerrados.push(item);
      }
    }
    if (!encerrados.length)
      return `<div class="cag-lista-empty">Nenhum serviço concluído nesta semana</div>`;
    return th('OS','Descrição','Início','Fim','Tipo') +
      encerrados.map(i => tr(
        i.os || '<span style="color:#9ca3af;font-style:italic">sem nº</span>',
        `<span class="cag-desc-cell">${i.desc_servico||'—'}</span>`,
        i.iniciado_em  ? fmtData(i.iniciado_em.split('T')[0])  : '—',
        i.encerrado_em ? fmtData(i.encerrado_em.split('T')[0]) : '—',
        badgeTipo(i.tipo)
      )).join('');
  }

  /* ════════════════════════════════════════════════
     MONTAGEM PRINCIPAL
  ════════════════════════════════════════════════ */
  function renderizar() {
    const ini = fmtDataFull(inicioSemana(_semana));
    const fim = fmtDataFull(fimSemana(_semana));
    const ano = inicioSemana(_semana).getFullYear();
    const atual = semanaAtual();

    // Chips de safra
    const safraOpts = _safras.map(s =>
      `<option value="${s}"${s===_safra?' selected':''}>${s}</option>`
    ).join('');

    // Colunas de equipe
    const colsHtml = _equipes.length
      ? _equipes.map(htmlEquipeCol).join('')
      : `<div class="cag-sem-equipes">
           <i class="ti ti-users-group"></i>
           <p>Nenhuma equipe cadastrada.</p>
           <button class="cag-btn-primary" id="btn-nova-equipe-vazio">
             <i class="ti ti-plus"></i> Criar primeira equipe
           </button>
         </div>`;

    // Legenda
    const legItens = [
      ['var(--cag-realizado)', 'Realizado'],
      ['var(--cag-prog)',      'Programado'],
      ['var(--cag-fora)',      'Fora da prog.'],
      ['var(--cag-mcu)',       'MCU'],
      ['var(--cag-estourado)', 'Estourado'],
      ['var(--cag-folga)',     'Folga / F. semana', 'border:1px solid #d1d5db'],
      ['var(--cag-vazio)',     'Disponível'],
    ].map(([bg, label, extra]) =>
      `<div class="cag-leg-item"><div class="cag-leg-dot" style="background:${bg};${extra||''}"></div>${label}</div>`
    ).join('');

    // Contadores para badges das listas
    const nPendencias = (() => {
      let n = 0;
      for (const eq of _equipes) {
        for (const item of (_fila[eq.id]||[])) {
          if (item.status !== 'encerrado' || !item.os) continue;
          const temApt = _aponts.some(a => a.os === item.os);
          if (!temApt) n++;
        }
      }
      return n;
    })();

    const nAndamento = Object.values(_fila).flat()
      .filter(i => i.status === 'em_execucao' || i.status === 'pendente').length;

    const nExecutados = Object.values(_fila).flat()
      .filter(i => i.status === 'encerrado').length;

    _container.innerHTML = `
      <div class="cag-mod">

        <!-- Filtros -->
        <div class="cag-filtros">
          <div class="cag-week-nav">
            <button class="cag-wbtn" id="btn-sem-ant" title="Semana anterior"><i class="ti ti-chevron-left"></i></button>
            <div class="cag-week-chip prev" id="btn-sem-prev"></div>
            <div class="cag-week-atual">
              <i class="ti ti-calendar-week"></i>
              <span id="cag-sem-label">Sem ${_semana} · ${ini} – ${fim}</span>
            </div>
            <div class="cag-week-chip next" id="btn-sem-prox"></div>
            <button class="cag-wbtn" id="btn-sem-prox2" title="Próxima semana"><i class="ti ti-chevron-right"></i></button>
          </div>

          <div class="cag-filtros-sep"></div>

          <div class="cag-dd-wrap">
            <select class="cag-select" id="cag-safra-sel">${safraOpts}</select>
          </div>

          <div class="cag-filtros-sep"></div>

          <button class="cag-btn-primary" id="btn-nova-equipe">
            <i class="ti ti-plus"></i> Nova equipe
          </button>
        </div>

        <!-- Lista: Serviços em Andamento (acima do kanban) -->
        ${htmlLista('andamento', 'Serviços em Andamento', 'activity',
            nAndamento, htmlServsEmAndamento(),
            'background:#dbeafe;color:#1d4ed8')}

        <!-- Kanban -->
        <div class="cag-kanban-scroll">
          <div class="cag-kanban" id="cag-kanban">
            ${colsHtml}
          </div>
        </div>

        <!-- Legenda -->
        <div class="cag-legenda">${legItens}</div>

        <!-- Listas inferiores -->
        ${htmlLista('pendencias', 'Pendências de Apontamento', 'alert-circle',
            nPendencias || null, htmlPendencias(),
            'background:#fee2e2;color:#dc2626')}
        ${htmlLista('prog-semana', 'Serviços Programados da Semana', 'calendar-week',
            _progSem.length, htmlProgSemana(), '')}
        ${htmlLista('executados', 'Serviços Executados', 'circle-check',
            nExecutados || null, htmlExecutados(),
            'background:#dcfce7;color:#16a34a')}

      </div>
    `;

    // Semanas adjacentes
    const semPrev = _semana - 1;
    const semProx = _semana + 1;
    const iniPrev = fmtData(inicioSemana(semPrev));
    const fimPrev = fmtData(fimSemana(semPrev));
    const iniProx = fmtData(inicioSemana(semProx));
    const fimProx = fmtData(fimSemana(semProx));
    _container.querySelector('#btn-sem-prev').textContent  = `Sem ${semPrev} · ${iniPrev}–${fimPrev}`;
    _container.querySelector('#btn-sem-prox').textContent  = `Sem ${semProx} · ${iniProx}–${fimProx}`;

    bindEventos();
    iniciarSortable();
  }

  /* ════════════════════════════════════════════════
     EVENTOS
  ════════════════════════════════════════════════ */
  function bindEventos() {
    const c = _container;

    // Navegação de semana
    c.querySelector('#btn-sem-ant').addEventListener('click', () => trocarSemana(_semana - 1));
    c.querySelector('#btn-sem-prox2').addEventListener('click', () => trocarSemana(_semana + 1));
    c.querySelector('#btn-sem-prev').addEventListener('click', () => trocarSemana(_semana - 1));
    c.querySelector('#btn-sem-prox').addEventListener('click', () => trocarSemana(_semana + 1));

    // Safra
    c.querySelector('#cag-safra-sel').addEventListener('change', e => {
      _safra = e.target.value;
      recarregarDados();
    });

    // Nova equipe
    c.querySelector('#btn-nova-equipe').addEventListener('click', () => abrirModalEquipe(null));
    const btnVazio = c.querySelector('#btn-nova-equipe-vazio');
    if (btnVazio) btnVazio.addEventListener('click', () => abrirModalEquipe(null));

    // Listas suspensas
    c.querySelectorAll('.cag-lista-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const id   = btn.dataset.lista;
        const body = c.querySelector(`#lista-body-${id}`);
        const chev = btn.querySelector('.cag-lista-chevron');
        const open = body.classList.toggle('open');
        chev.style.transform = open ? 'rotate(180deg)' : '';
      });
    });

    // Cards — expandir/retrair ao clicar no body
    c.querySelectorAll('.cag-card-body').forEach(body => {
      body.addEventListener('click', e => {
        if (e.target.closest('button')) return; // não expande se clicou num botão
        const card = body.closest('.cag-card');
        card.classList.toggle('open');
      });
    });

    // Ações dos cards
    c.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const id     = btn.dataset.id ? parseInt(btn.dataset.id) : null;
        const eq     = btn.dataset.eq ? parseInt(btn.dataset.eq) : null;

        switch (action) {
          case 'iniciar':       acaoIniciar(id);         break;
          case 'concluir':      acaoConcluir(id);        break;
          case 'reabrir':       acaoReabrir(id);         break;
          case 'interromper':   acaoInterromper(id);     break;
          case 'remover':       acaoRemover(id);         break;
          case 'mover-equipe':  acaoMoverEquipe(id, eq); break;
          case 'mover-pos':     acaoMoverPos(id, eq);    break;
          case 'vincular':      acaoVincular(id);        break;
          case 'add-os':        abrirModalOS(eq);        break;
          case 'config-equipe': abrirModalEquipe(eq);    break;
        }
      });
    });
  }

  /* ── Ações ── */
  async function acaoIniciar(id) {
    const agora = new Date().toISOString();
    await atualizarStatus(id, 'em_execucao', { iniciado_em: agora });
    recarregarDados();
  }

  async function acaoConcluir(id) {
    const agora = new Date().toISOString();
    await atualizarStatus(id, 'encerrado', { encerrado_em: agora });
    recarregarDados();
  }

  async function acaoReabrir(id) {
    await atualizarStatus(id, 'pendente', { encerrado_em: null });
    recarregarDados();
  }

  async function acaoInterromper(id) {
    const motivos = ['Falta de Material', 'Falta de Acesso', 'Segurança Comprometida'];
    const motivo  = await abrirModalOpcoes('Motivo da interrupção', motivos);
    if (!motivo) return;
    // Move para o final da fila da equipe
    let equipeId = null;
    for (const eqId in _fila) {
      if (_fila[eqId].some(i => i.id === id)) { equipeId = parseInt(eqId); break; }
    }
    if (equipeId) {
      const fila = _fila[equipeId];
      const idx  = fila.findIndex(i => i.id === id);
      if (idx >= 0) {
        const [item] = fila.splice(idx, 1);
        fila.push(item);
        await salvarOrdemFila(equipeId);
      }
    }
    await atualizarStatus(id, 'interrompido', { obs: motivo });
    recarregarDados();
  }

  async function acaoRemover(id) {
    if (!confirm('Remover este serviço da fila?')) return;
    await removerDaFila(id);
    recarregarDados();
  }

  async function acaoMoverEquipe(id, equipeAtualId) {
    const opcoes = _equipes.filter(e => e.id !== equipeAtualId).map(e => e.nome);
    const escolha = await abrirModalOpcoes('Mover para qual equipe?', opcoes);
    if (!escolha) return;
    const novaEq = _equipes.find(e => e.nome === escolha);
    if (!novaEq) return;

    // Buscar item
    let item = null;
    for (const eqId in _fila) {
      item = _fila[eqId].find(i => i.id === id);
      if (item) break;
    }
    if (!item) return;

    const db  = getDB();
    const ano = inicioSemana(_semana).getFullYear();
    const nova_ordem = (_fila[novaEq.id]||[]).length + 1;
    await db.from('cal_fila').update({ equipe_id: novaEq.id, ordem: nova_ordem }).eq('id', id);

    // Atualizar local
    for (const eqId in _fila) {
      const idx = _fila[eqId].findIndex(i => i.id === id);
      if (idx >= 0) { _fila[eqId].splice(idx,1); break; }
    }
    if (!_fila[novaEq.id]) _fila[novaEq.id] = [];
    _fila[novaEq.id].push({ ...item, equipe_id: novaEq.id, ordem: nova_ordem });

    recarregarDados();
  }

  async function acaoMoverPos(id, equipeId) {
    const fila  = _fila[equipeId] || [];
    const total = fila.length;
    const atual = fila.findIndex(i => i.id === id) + 1;
    const pos   = prompt(`Posição atual: ${atual}/${total}\nNova posição (1–${total}):`, atual);
    if (!pos) return;
    const nova = Math.max(1, Math.min(total, parseInt(pos)));
    if (isNaN(nova)) return;

    const idx = fila.findIndex(i => i.id === id);
    const [item] = fila.splice(idx, 1);
    fila.splice(nova - 1, 0, item);
    await salvarOrdemFila(equipeId);
    recarregarDados();
  }

  async function acaoVincular(id) {
    const num = prompt('Digite o número da OS:');
    if (!num) return;
    const db = getDB();
    const os = num.trim().replace(/^0+/,'');
    const { data } = await db.from('ordens_servico')
      .select('os, desc_servico, hh_prev_servico, tipo_atividade')
      .eq('os', os).limit(1).single();

    if (data) {
      const tipo = data.tipo_atividade === 'MCU' ? 'mcu' : 'programado';
      await db.from('cal_fila').update({
        os: data.os,
        desc_servico: data.desc_servico || undefined,
        hh_previsto:  data.hh_prev_servico || undefined,
        tipo,
        vinculado: true
      }).eq('id', id);
    } else {
      await db.from('cal_fila').update({ os, vinculado: false }).eq('id', id);
      mostrarToast('OS não encontrada no banco — salvo sem vínculo', 'info');
    }
    recarregarDados();
  }

  /* ── Modal de opções (interromper / mover equipe) ── */
  function abrirModalOpcoes(titulo, opcoes) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'cag-modal-overlay';
      overlay.innerHTML = `
        <div class="cag-modal">
          <div class="cag-modal-titulo">${titulo}</div>
          <div class="cag-modal-opcoes">
            ${opcoes.map((o,i) => `<button class="cag-modal-opt" data-idx="${i}">${o}</button>`).join('')}
          </div>
          <button class="cag-modal-cancel">Cancelar</button>
        </div>
      `;
      overlay.querySelectorAll('.cag-modal-opt').forEach((btn, i) => {
        btn.addEventListener('click', () => { overlay.remove(); resolve(opcoes[i]); });
      });
      overlay.querySelector('.cag-modal-cancel').addEventListener('click', () => { overlay.remove(); resolve(null); });
      document.body.appendChild(overlay);
    });
  }

  /* ── Modal inserir OS ── */
  function abrirModalOS(equipeId) {
    const overlay = document.createElement('div');
    overlay.className = 'cag-modal-overlay';
    overlay.innerHTML = `
      <div class="cag-modal" style="width:340px">
        <div class="cag-modal-titulo">Inserir Serviço</div>
        <div class="cag-modal-form">
          <label class="cag-form-label">Tipo</label>
          <div class="cag-tipo-opts">
            <button class="cag-tipo-btn active" data-tipo="programado">Programado</button>
            <button class="cag-tipo-btn" data-tipo="fora_prog">Fora da prog.</button>
            <button class="cag-tipo-btn" data-tipo="mcu">MCU</button>
          </div>
          <label class="cag-form-label">Nº OS <span style="color:#9ca3af">(opcional)</span></label>
          <input type="text" id="modal-os-num" class="cag-form-input" placeholder="Ex: 1234567">
          <div id="modal-os-hint" class="cag-form-hint"></div>
          <label class="cag-form-label">Descrição</label>
          <input type="text" id="modal-os-desc" class="cag-form-input" placeholder="Descrição do serviço">
          <label class="cag-form-label">HH Estimado</label>
          <input type="number" id="modal-os-hh" class="cag-form-input" placeholder="Ex: 8" min="0" step="0.5">
        </div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="cag-modal-cancel" style="flex:1">Cancelar</button>
          <button class="cag-btn-primary" id="modal-os-confirm" style="flex:2"><i class="ti ti-plus"></i> Adicionar</button>
        </div>
      </div>
    `;

    let tipoSel = 'programado';
    overlay.querySelectorAll('.cag-tipo-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        overlay.querySelectorAll('.cag-tipo-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        tipoSel = btn.dataset.tipo;
      });
    });

    // Busca automática ao digitar nº OS
    const inputNum = overlay.querySelector('#modal-os-num');
    const hint     = overlay.querySelector('#modal-os-hint');
    let _buscarTimer = null;
    inputNum.addEventListener('input', () => {
      clearTimeout(_buscarTimer);
      const val = inputNum.value.trim();
      if (val.length < 4) { hint.textContent = ''; return; }
      _buscarTimer = setTimeout(async () => {
        const db = getDB();
        const os = val.replace(/^0+/,'');
        const { data } = await db.from('ordens_servico')
          .select('os, desc_servico, hh_prev_servico, tipo_atividade')
          .eq('os', os).limit(1).single();
        if (data) {
          hint.innerHTML = `<span style="color:var(--green)"><i class="ti ti-check"></i> Encontrada: ${data.desc_servico||'sem descrição'}</span>`;
          overlay.querySelector('#modal-os-desc').value = data.desc_servico || '';
          overlay.querySelector('#modal-os-hh').value   = data.hh_prev_servico || '';
          if (data.tipo_atividade === 'MCU') {
            tipoSel = 'mcu';
            overlay.querySelectorAll('.cag-tipo-btn').forEach(b => {
              b.classList.toggle('active', b.dataset.tipo === 'mcu');
            });
          }
        } else {
          hint.innerHTML = `<span style="color:var(--amber)"><i class="ti ti-alert-circle"></i> Não encontrada no banco</span>`;
        }
      }, 500);
    });

    overlay.querySelector('#modal-os-confirm').addEventListener('click', async () => {
      const os   = inputNum.value.trim() || null;
      const desc = overlay.querySelector('#modal-os-desc').value.trim();
      const hh   = parseFloat(overlay.querySelector('#modal-os-hh').value) || null;
      if (!desc) { alert('Informe a descrição do serviço'); return; }
      const osNum = os ? os.replace(/^0+/,'') : null;
      // Checar vinculo
      let vinculado = false;
      if (osNum) {
        const db = getDB();
        const { data } = await db.from('ordens_servico').select('os').eq('os', osNum).limit(1).single();
        vinculado = !!data;
      }
      await inserirNaFila(equipeId, {
        os: osNum, cod_servico: null,
        desc_servico: desc, hh_previsto: hh,
        tipo: tipoSel, status: 'pendente', vinculado
      });
      overlay.remove();
      recarregarDados();
    });

    overlay.querySelector('.cag-modal-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  /* ── Modal configurar equipe ── */
  function abrirModalEquipe(equipeId) {
    const equipe  = equipeId ? _equipes.find(e => e.id === equipeId) : null;
    const membros = equipe ? equipe.membros : [];
    const chapasNaEq = new Set(membros.map(m => m.chapa));

    // Colaboradores CAL disponíveis
    const colabsDisp = _colabs.map(c => {
      const emOutraEq = !chapasNaEq.has(c.chapa) && _equipes.some(e =>
        e.id !== equipeId && (e.membros||[]).some(m => m.chapa === c.chapa)
      );
      const semTurno = !c.turno_id;
      return { ...c, emOutraEq, semTurno };
    });

    const membHtml = colabsDisp.map(c => {
      const naEq  = chapasNaEq.has(c.chapa);
      const aviso = c.semTurno ? ' ⚠ sem turno' : c.emOutraEq ? ' (outra equipe)' : '';
      return `
        <label class="cag-colab-item${naEq?' checked':''}">
          <input type="checkbox" value="${c.chapa}"${naEq?' checked':''}>
          <span>${c.nome || c.chapa}<span class="cag-colab-hint">${aviso}</span></span>
        </label>
      `;
    }).join('');

    const overlay = document.createElement('div');
    overlay.className = 'cag-modal-overlay';
    overlay.innerHTML = `
      <div class="cag-modal" style="width:360px;max-height:80vh;overflow-y:auto">
        <div class="cag-modal-titulo">${equipe ? 'Configurar: ' + equipe.nome : 'Nova Equipe'}</div>
        <div class="cag-modal-form">
          <label class="cag-form-label">Nome da equipe</label>
          <input type="text" id="modal-eq-nome" class="cag-form-input"
            placeholder="Ex: Eq. Marcelo"
            value="${equipe ? equipe.nome : ''}">
          <label class="cag-form-label" style="margin-top:10px">Colaboradores CAL</label>
          <div class="cag-colab-list">${membHtml}</div>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="cag-modal-cancel" style="flex:1">Cancelar</button>
          ${equipe ? `<button class="cag-act red" id="modal-eq-del" style="flex:1"><i class="ti ti-trash"></i> Desativar</button>` : ''}
          <button class="cag-btn-primary" id="modal-eq-confirm" style="flex:2"><i class="ti ti-check"></i> Salvar</button>
        </div>
      </div>
    `;

    overlay.querySelector('#modal-eq-confirm').addEventListener('click', async () => {
      const nome = overlay.querySelector('#modal-eq-nome').value.trim();
      if (!nome) { alert('Informe o nome da equipe'); return; }
      const selecionados = [...overlay.querySelectorAll('.cag-colab-list input:checked')].map(i => i.value);
      await salvarEquipe(equipeId, nome, selecionados);
      overlay.remove();
      recarregarDados();
    });

    const delBtn = overlay.querySelector('#modal-eq-del');
    if (delBtn) {
      delBtn.addEventListener('click', async () => {
        if (!confirm('Desativar esta equipe?')) return;
        const db = getDB();
        await db.from('cal_equipes').update({ ativo: false }).eq('id', equipeId);
        overlay.remove();
        recarregarDados();
      });
    }

    overlay.querySelector('.cag-modal-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  async function salvarEquipe(equipeId, nome, chapas) {
    const db = getDB();
    let eqId = equipeId;

    if (!eqId) {
      const { data } = await db.from('cal_equipes').insert({ nome, ativo: true }).select().single();
      if (!data) return;
      eqId = data.id;
    } else {
      await db.from('cal_equipes').update({ nome }).eq('id', eqId);
    }

    // Buscar membros atuais
    const { data: membAtuais } = await db.from('cal_equipe_membros').select('*').eq('equipe_id', eqId);
    const chapasAtuais = new Set((membAtuais||[]).map(m => m.chapa));

    // Adicionar novos
    for (const chapa of chapas) {
      if (!chapasAtuais.has(chapa)) {
        const colab = _colabs.find(c => c.chapa === chapa);
        await db.from('cal_equipe_membros').insert({
          equipe_id: eqId, chapa, nome: colab?.nome || null,
          vigencia_inicio: new Date().toISOString()
        });
        // Remover de outra equipe (mantém histórico, só insere novo)
      }
    }

    // Remover os que saíram
    for (const chapa of chapasAtuais) {
      if (!chapas.includes(chapa)) {
        await db.from('cal_equipe_membros').delete()
          .eq('equipe_id', eqId).eq('chapa', chapa);
      }
    }
  }

  /* ── SortableJS ── */
  function iniciarSortable() {
    if (typeof Sortable === 'undefined') return;
    _container.querySelectorAll('.cag-fila').forEach(el => {
      Sortable.create(el, {
        animation: 150,
        handle: '.cag-card',
        draggable: '.cag-card',
        onEnd: async evt => {
          const equipeId = parseInt(el.id.replace('fila-',''));
          // Reordenar array local
          const fila = _fila[equipeId];
          if (!fila) return;
          const [item] = fila.splice(evt.oldIndex, 1);
          fila.splice(evt.newIndex, 0, item);
          await salvarOrdemFila(equipeId);
        }
      });
    });
  }

  /* ── Navegação ── */
  async function trocarSemana(nova) {
    _semana = nova;
    _container.innerHTML = `<div class="cag-loading"><i class="ti ti-loader-2"></i> Carregando...</div>`;
    await carregarTudo();
    renderizar();
  }

  async function recarregarDados() {
    await carregarTudo();
    renderizar();
  }

  /* ════════════════════════════════════════════════
     CSS
  ════════════════════════════════════════════════ */
  function injetarCSS() {
    if (document.getElementById('cag-style')) return;
    const style = document.createElement('style');
    style.id = 'cag-style';
    style.textContent = `
      /* ── Vars específicas do módulo ── */
      :root {
        --cag-realizado:  #86efac;
        --cag-prog:       #93c5fd;
        --cag-fora:       #fde047;
        --cag-mcu:        #fca5a5;
        --cag-estourado:  #c4b5fd;
        --cag-folga:      #ffffff;
        --cag-vazio:      #e4e4e7;
        --cag-prog-l:     #dbeafe;
        --cag-fora-l:     #fef9c3;
        --cag-mcu-l:      #fee2e2;
        --cs-prog:        #2563eb;
        --cs-fora:        #ca8a04;
        --cs-mcu:         #dc2626;
        --cs-inter:       #d97706;
        --cs-done:        #16a34a;
      }

      /* ── Módulo shell ── */
      .cag-mod {
        display: flex; flex-direction: column; gap: 10px;
        padding: 14px; overflow: hidden;
      }
      .cag-loading {
        display: flex; align-items: center; justify-content: center;
        gap: 8px; padding: 48px; color: #9ca3af; font-size: 13px;
      }
      .cag-loading i { font-size: 20px; animation: spin 1s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }

      /* ── Filtros ── */
      .cag-filtros {
        background: var(--card-bg); border: 1px solid var(--border);
        border-radius: var(--radius); padding: 10px 14px;
        display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
        box-shadow: var(--shadow);
      }
      .cag-week-nav { display: flex; align-items: center; gap: 4px; }
      .cag-wbtn {
        width: 28px; height: 28px; border: 1px solid var(--border);
        border-radius: var(--radius-sm); background: var(--bg); cursor: pointer;
        display: flex; align-items: center; justify-content: center; font-size: 13px; color: #6b7280;
      }
      .cag-wbtn:hover { background: var(--border); }
      .cag-week-atual {
        height: 28px; padding: 0 12px; background: var(--yellow);
        border-radius: var(--radius-sm); font-size: 11px; font-weight: 700;
        color: var(--dark1); display: flex; align-items: center; gap: 6px; white-space: nowrap;
      }
      .cag-week-chip {
        height: 28px; padding: 0 10px; border: 1px solid var(--border);
        border-radius: var(--radius-sm); background: var(--bg);
        font-size: 10px; font-weight: 500; color: #6b7280;
        display: flex; align-items: center; cursor: pointer; white-space: nowrap;
      }
      .cag-week-chip:hover { border-color: #9ca3af; }
      .cag-filtros-sep { width: 1px; height: 24px; background: var(--border); }
      .cag-select {
        height: 28px; padding: 0 8px; border: 1px solid var(--border);
        border-radius: var(--radius-sm); background: var(--bg);
        font-family: var(--font); font-size: 11px; font-weight: 500; color: #374151; cursor: pointer;
      }
      .cag-btn-primary {
        height: 28px; padding: 0 12px; border: none;
        border-radius: var(--radius-sm); background: var(--yellow);
        font-family: var(--font); font-size: 11px; font-weight: 700;
        color: var(--dark1); cursor: pointer;
        display: flex; align-items: center; gap: 5px;
      }
      .cag-btn-primary:hover { background: var(--yellow-dk); }

      /* ── Listas suspensas ── */
      .cag-lista {
        background: var(--card-bg); border: 1px solid var(--border);
        border-radius: var(--radius); box-shadow: var(--shadow); overflow: hidden;
      }
      .cag-lista-toggle {
        display: flex; align-items: center; gap: 8px;
        padding: 9px 14px; cursor: pointer; user-select: none;
        font-size: 10px; font-weight: 700; letter-spacing: .08em;
        text-transform: uppercase; color: #6b7280;
        transition: background var(--transition);
      }
      .cag-lista-toggle:hover { background: var(--bg); }
      .cag-lista-toggle i:first-child { font-size: 14px; }
      .cag-lista-badge {
        padding: 1px 7px; border-radius: 10px;
        font-size: 9px; font-weight: 700;
      }
      .cag-lista-chevron { font-size: 13px; transition: transform .2s; }
      .cag-lista-body { display: none; border-top: 1px solid var(--border); overflow-x: auto; }
      .cag-lista-body.open { display: block; }
      .cag-lista-empty {
        padding: 14px; font-size: 11px; color: #9ca3af;
        display: flex; align-items: center; gap: 6px;
      }

      /* Tabela das listas */
      .cag-tr {
        display: flex; align-items: center;
        border-bottom: 1px solid var(--border); min-width: 480px;
      }
      .cag-tr:last-child { border-bottom: none; }
      .cag-thead { background: #fafafa; }
      .cag-thead .cag-td {
        font-size: 9px; font-weight: 700; letter-spacing: .08em;
        text-transform: uppercase; color: #9ca3af;
      }
      .cag-td {
        padding: 7px 12px; font-size: 11px; color: #374151;
        flex-shrink: 0;
      }
      .cag-td:first-child  { width: 90px; font-weight: 700; font-variant-numeric: tabular-nums; }
      .cag-td:nth-child(2) { flex: 1; min-width: 160px; }
      .cag-td:nth-child(3) { width: 70px; }
      .cag-td:nth-child(4) { width: 70px; }
      .cag-td:nth-child(5) { width: 120px; }
      .cag-td:nth-child(6) { width: 60px; }
      .cag-desc-cell { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; max-width: 220px; }
      .cag-equipe-cell { font-size: 10px; color: #6b7280; }

      /* Badge */
      .cag-badge {
        display: inline-block; padding: 2px 6px; border-radius: 4px;
        font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
      }

      /* Disponibilidade (folgas/férias) */
      .cag-disp-wrap {
        padding: 10px 14px; border-top: 1px solid var(--border);
        display: flex; flex-direction: column; gap: 6px;
      }
      .cag-disp-group { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
      .cag-disp-label {
        font-size: 9px; font-weight: 700; text-transform: uppercase;
        letter-spacing: .08em; color: #9ca3af; min-width: 90px;
      }
      .cag-disp-tag {
        padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 500;
      }
      .cag-disp-tag.folga     { background: #f3f4f6; color: #6b7280; }
      .cag-disp-tag.folga-amh { background: var(--amber-l); color: var(--amber); }
      .cag-disp-tag.ferias    { background: var(--blue-l); color: var(--blue); }

      /* ── Kanban ── */
      .cag-kanban-scroll { overflow-x: auto; }
      .cag-kanban-scroll::-webkit-scrollbar { height: 5px; }
      .cag-kanban-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
      .cag-kanban {
        display: flex; gap: 10px; min-width: max-content; padding-bottom: 4px;
      }
      .cag-sem-equipes {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 10px; padding: 48px; color: #9ca3af; text-align: center; width: 100%;
      }
      .cag-sem-equipes i { font-size: 32px; }
      .cag-sem-equipes p { font-size: 12px; }

      /* Coluna de equipe */
      .cag-equipe-col { width: 230px; flex-shrink: 0; display: flex; flex-direction: column; gap: 5px; }

      /* Cabeçalho da equipe */
      .cag-eq-header {
        background: var(--dark2); border-radius: var(--radius);
        padding: 9px 10px; color: var(--text-light);
        transition: background .2s;
      }
      .cag-eq-header.estouro { background: #3b1a1a; }
      .cag-eq-nome {
        font-size: 11px; font-weight: 700; letter-spacing: .04em;
        margin-bottom: 5px;
        display: flex; align-items: center; justify-content: space-between;
      }
      .cag-eq-btn {
        width: 20px; height: 20px; border: 1px solid rgba(255,255,255,.15);
        border-radius: 4px; background: transparent; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        color: #9ca3af; font-size: 11px;
      }
      .cag-eq-btn:hover { background: rgba(255,255,255,.1); color: #fff; }

      .cag-membros { display: flex; gap: 3px; flex-wrap: wrap; margin-bottom: 7px; }
      .cag-membro-tag {
        padding: 1px 6px; border-radius: 10px;
        background: rgba(255,255,255,.1); font-size: 9px; color: var(--text-muted);
      }
      .cag-membro-tag.warn { background: rgba(248,193,0,.2); color: var(--yellow); }

      /* Mini Gantt */
      .cag-mg-labels { display: flex; gap: 2px; margin-bottom: 2px; }
      .cag-mg-dl { flex: 1; text-align: center; font-size: 7px; color: var(--text-muted); font-weight: 600; }
      .cag-mg { display: flex; gap: 2px; }
      .cag-mg-day { flex: 1; height: 16px; border-radius: 3px; }
      .cag-cap-hh { font-size: 9px; color: var(--text-muted); margin-top: 3px; text-align: right; }

      /* Fila */
      .cag-fila { display: flex; flex-direction: column; gap: 4px; }

      /* Card */
      .cag-card {
        background: var(--card-bg); border: 1px solid var(--border);
        border-radius: var(--radius-sm); overflow: hidden;
        cursor: pointer; transition: box-shadow .15s; position: relative;
      }
      .cag-card:hover { box-shadow: var(--shadow-md); }
      .cag-stripe { position: absolute; left: 0; top: 0; bottom: 0; width: 4px; }
      .cag-card-body { padding: 6px 8px 6px 12px; }
      .cag-card-head { display: flex; align-items: center; gap: 6px; }
      .cag-os-num {
        font-size: 10px; font-weight: 700; color: #374151;
        font-variant-numeric: tabular-nums; flex-shrink: 0;
      }
      .cag-os-num.sem-os { color: #9ca3af; font-style: italic; font-weight: 400; }
      .cag-os-desc { font-size: 10px; color: #6b7280; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .cag-si { font-size: 12px; flex-shrink: 0; }
      .cag-si.done  { color: var(--cs-done); }
      .cag-si.exec  { color: #0891b2; }
      .cag-si.inter { color: var(--cs-inter); }

      .cag-exec-bar {
        display: flex; align-items: center; gap: 4px;
        font-size: 8px; font-weight: 600; color: #0891b2; margin-bottom: 2px;
      }
      .cag-exec-dot {
        width: 5px; height: 5px; border-radius: 50%; background: #0891b2;
        animation: pulse 1.5s infinite;
      }
      @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.7)} }

      .cag-inter-motivo { font-size: 8px; color: var(--cs-inter); margin-top: 2px; font-weight: 600; }
      .cag-sem-os-aviso { font-size: 8px; color: var(--amber); margin-top: 2px; display: flex; align-items: center; gap: 3px; }

      /* Card expand */
      .cag-card-expand { display: none; padding: 6px 8px 7px 12px; border-top: 1px solid var(--border); background: #fafafa; }
      .cag-card.open .cag-card-expand { display: block; }
      .cag-expand-row { margin-bottom: 5px; }
      .cag-os-hh { font-size: 9px; font-weight: 600; color: #9ca3af; display: flex; align-items: center; gap: 3px; }
      .cag-act-row { display: flex; gap: 3px; flex-wrap: wrap; }
      .cag-act {
        height: 24px; padding: 0 7px; border: 1px solid var(--border);
        border-radius: 4px; background: var(--bg); font-family: var(--font);
        font-size: 9px; font-weight: 600; color: #374151; cursor: pointer;
        display: flex; align-items: center; gap: 3px; white-space: nowrap;
        transition: background .12s;
      }
      .cag-act i { font-size: 11px; }
      .cag-act.green { background: var(--green-l);  border-color: #86efac; color: var(--green); }
      .cag-act.amber { background: var(--amber-l);  border-color: #fcd34d; color: var(--amber); }
      .cag-act.blue  { background: var(--blue-l);   border-color: #93c5fd; color: var(--blue); }
      .cag-act.red   { background: var(--red-l);    border-color: #fca5a5; color: #dc2626; }
      .cag-act.ghost { background: transparent; border-color: var(--border); color: #9ca3af; }

      /* Estados dos cards */
      .cag-card.concluido { background: #f0fdf4; border-color: #bbf7d0; opacity: .72; }
      .cag-card.concluido .cag-os-num { color: var(--cs-done); }
      .cag-card.concluido .cag-os-desc { color: #86efac; }
      .cag-card.em-exec { border-color: #a5f3fc; background: #ecfeff; }
      .cag-card.interrompido { background: var(--amber-l); border-color: #fcd34d; }
      .cag-card.interrompido .cag-os-num { color: var(--amber); }

      /* Linha de estouro */
      .cag-overflow-div { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
      .cag-overflow-line { flex: 1; height: 2px; background: #c4b5fd; border-radius: 1px; }
      .cag-overflow-label { font-size: 9px; font-weight: 700; color: #7c3aed; white-space: nowrap; display: flex; align-items: center; gap: 3px; }

      /* Btn add OS */
      .cag-add-os-btn {
        width: 100%; height: 28px; border: 1px dashed var(--border);
        border-radius: var(--radius-sm); background: transparent;
        font-family: var(--font); font-size: 10px; font-weight: 500; color: #9ca3af;
        cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px;
        transition: border-color .15s, color .15s, background .15s;
      }
      .cag-add-os-btn:hover { border-color: var(--yellow); color: var(--dark1); background: #fffbeb; }

      /* Legenda */
      .cag-legenda { display: flex; gap: 10px; flex-wrap: wrap; padding: 4px 0; }
      .cag-leg-item { display: flex; align-items: center; gap: 5px; font-size: 9px; color: #6b7280; }
      .cag-leg-dot { width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }

      /* Modais */
      .cag-modal-overlay {
        position: fixed; inset: 0;
        background: rgba(0,0,0,.45); z-index: 9999;
        display: flex; align-items: center; justify-content: center;
        padding: 20px;
      }
      .cag-modal {
        background: var(--card-bg); border-radius: var(--radius);
        box-shadow: var(--shadow-md); padding: 20px;
        width: 300px; max-width: 100%;
      }
      .cag-modal-titulo {        font-size: 13px; font-weight: 700; margin-bottom: 14px; color: var(--dark1);
      }
      .cag-modal-opcoes { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
      .cag-modal-opt {
        width: 100%; padding: 9px 14px; border: 1px solid var(--border);
        border-radius: var(--radius-sm); background: var(--bg);
        font-family: var(--font); font-size: 12px; font-weight: 500;
        color: #374151; cursor: pointer; text-align: left;
        transition: background .12s, border-color .12s;
      }
      .cag-modal-opt:hover { border-color: var(--yellow); background: #fffbeb; }
      .cag-modal-cancel {
        width: 100%; padding: 8px; border: 1px solid var(--border);
        border-radius: var(--radius-sm); background: var(--bg);
        font-family: var(--font); font-size: 11px; font-weight: 600;
        color: #6b7280; cursor: pointer;
      }
      .cag-modal-form { display: flex; flex-direction: column; gap: 6px; }
      .cag-form-label { font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #9ca3af; }
      .cag-form-input {
        width: 100%; height: 32px; padding: 0 10px;
        border: 1px solid var(--border); border-radius: var(--radius-sm);
        font-family: var(--font); font-size: 12px; color: #374151;
        background: var(--bg);
      }
      .cag-form-hint { font-size: 10px; min-height: 14px; }
      .cag-tipo-opts { display: flex; gap: 4px; }
      .cag-tipo-btn {
        flex: 1; height: 28px; border: 1px solid var(--border);
        border-radius: var(--radius-sm); background: var(--bg);
        font-family: var(--font); font-size: 10px; font-weight: 600;
        color: #6b7280; cursor: pointer; transition: all .12s;
      }
      .cag-tipo-btn.active { background: var(--yellow); border-color: var(--yellow-dk); color: var(--dark1); }
      .cag-colab-list { display: flex; flex-direction: column; gap: 4px; max-height: 260px; overflow-y: auto; }
      .cag-colab-item {
        display: flex; align-items: center; gap: 8px;
        padding: 7px 10px; border: 1px solid var(--border);
        border-radius: var(--radius-sm); cursor: pointer;
        font-size: 11px; color: #374151; font-weight: 500;
        transition: background .12s;
      }
      .cag-colab-item:hover { background: var(--bg); }
      .cag-colab-item.checked { background: var(--blue-l); border-color: #93c5fd; }
      .cag-colab-item input { accent-color: var(--yellow); }
      .cag-colab-hint { font-size: 9px; color: #9ca3af; margin-left: 4px; }
    `;
    document.head.appendChild(style);
  }

  /* ── Carregar SortableJS dinamicamente ── */
  function carregarSortable() {
    return new Promise(resolve => {
      if (typeof Sortable !== 'undefined') { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js';
      s.onload = resolve; s.onerror = resolve;
      document.head.appendChild(s);
    });
  }

  /* ════════════════════════════════════════════════
     INIT
  ════════════════════════════════════════════════ */
  async function init(container) {
    _container = container;
    injetarCSS();

    // Loading state — HTML no DOM ANTES de qualquer await
    _container.innerHTML = `<div class="cag-loading"><i class="ti ti-loader-2"></i> Carregando acompanhamento...</div>`;

    await carregarSortable();

    try {
      await carregarTudo();
      renderizar();
    } catch(e) {
      console.error('cal_acomp:', e);
      _container.innerHTML = `
        <div style="padding:40px;text-align:center;color:#9ca3af">
          <i class="ti ti-alert-circle" style="font-size:32px;display:block;margin-bottom:8px"></i>
          Erro ao carregar: ${e.message}
        </div>`;
    }
  }

  return { init };
})();
