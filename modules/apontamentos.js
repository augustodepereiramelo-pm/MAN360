/* ═══════════════════════════════════════════════════════════════
   MAN360 — Módulo Apontamentos
   ═══════════════════════════════════════════════════════════════ */

(() => {

/* ── Constantes ─────────────────────────────────────────────── */
const SUPABASE_URL  = MAN360_CONFIG.supabase.url;
const SUPABASE_KEY  = MAN360_CONFIG.supabase.key;
const META_APONTAMENTO = 0.75; // 75% — meta de aderência por dia

// Semana 9 começa 25/05/2025; ancoramos aqui e calculamos as demais
const SEMANA_ANCORA      = 9;
const DATA_ANCORA_ISO    = '2025-05-25';
const SEMANAS_JANELA     = 8; // quantas semanas para frente/trás

/* ── Helpers de data ────────────────────────────────────────── */
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmtDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}`;
}
function fmtDateFull(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function semanaParaDatas(numSemana) {
  const diff = (numSemana - SEMANA_ANCORA) * 7;
  const inicio = addDays(DATA_ANCORA_ISO, diff);
  const fim    = addDays(inicio, 6);
  return { inicio, fim };
}
function datasParaSemana(isoDate) {
  const msAncora = new Date(DATA_ANCORA_ISO + 'T00:00:00').getTime();
  const msData   = new Date(isoDate + 'T00:00:00').getTime();
  const diffDias = Math.floor((msData - msAncora) / 86400000);
  return SEMANA_ANCORA + Math.floor(diffDias / 7);
}
function diasEntre(inicioIso, fimIso) {
  const dias = [];
  let cur = inicioIso;
  while (cur <= fimIso) { dias.push(cur); cur = addDays(cur, 1); }
  return dias;
}
function diaSemanaAbrev(iso) {
  const nomes = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  return nomes[new Date(iso + 'T00:00:00').getDay()];
}
function hojeIso() { return new Date().toISOString().slice(0, 10); }

/* ── Helpers de escala (projeção de folgas) ─────────────────── */
// escala: '5x1' | '6x1' | 'ADM'
// primeiraFolga: 'YYYY-MM-DD'
function gerarFolgas(escala, primeiraFolga, ate) {
  if (escala === 'ADM' || !primeiraFolga) return new Set();
  const ciclo = escala === '5x1' ? 6 : 7; // 5 trab + 1 folga / 6 trab + 1 folga
  const folgas = new Set();
  let cur = primeiraFolga;
  while (cur <= ate) {
    folgas.add(cur);
    cur = addDays(cur, ciclo);
  }
  return folgas;
}

/* ── Supabase fetch helper ──────────────────────────────────── */
async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': opts.prefer || 'return=representation',
      ...opts.headers,
    },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase ${res.status}: ${err}`);
  }
  return res.status === 204 ? [] : res.json();
}

/* ── Estado do módulo ───────────────────────────────────────── */
const state = {
  safra: '2024/25',
  periodoTipo: 'semana',   // 'semana' | 'intervalo'
  semana: SEMANA_ANCORA,
  dataInicio: semanaParaDatas(SEMANA_ANCORA).inicio,
  dataFim: semanaParaDatas(SEMANA_ANCORA).fim,
  modalidades: [],          // [] = nenhuma selecionada ainda
  colaboradorChapa: null,
  apontamentos: [],
  colaboradores: [],
  especialidades: [],
  justificativas: [],
  ferias: [],
  heatmapPagina: 0,         // índice de página do heatmap (2 semanas cada)
  abaAtiva: 'principal',    // 'principal' | 'cadastro'
  cadastroAba: 'colab',     // 'colab' | 'justif'
};

/* ── Listas de opções ───────────────────────────────────────── */
const MODALIDADES_DISPONIVEIS = ['MEC','CAL','ELE','CIV','INS','AUT','ISP'];
const SAFRAS_DISPONIVEIS      = ['2023/24','2024/25','2025/26'];
const ESCALAS                 = ['5x1','6x1','ADM'];
const TIPOS_JUSTIFICATIVA     = ['Ausência de apontamento', 'Troca de folga'];
const TRATATIVAS_AUSENCIA     = ['Treinamento', 'Serviço externo'];
const TRATATIVAS_TROCA        = ['Troca de folga'];

/* ═══════════════════════════════════════════════════════════════
   RENDER PRINCIPAL
   ═══════════════════════════════════════════════════════════════ */
function render() {
  const container = document.getElementById('module-container');
  container.innerHTML = `
    <div id="apt-root" style="padding:20px;max-width:1400px;margin:0 auto">
      ${renderTopTabs()}
      <div id="apt-content"></div>
    </div>
  `;
  document.getElementById('apt-tab-principal').addEventListener('click', () => { state.abaAtiva = 'principal'; renderContent(); });
  document.getElementById('apt-tab-cadastro').addEventListener('click',  () => { state.abaAtiva = 'cadastro';  renderContent(); });
  renderContent();
}

function renderTopTabs() {
  return `
    <div style="display:flex;gap:0;border-bottom:1px solid #e5e7eb;margin-bottom:20px">
      <div id="apt-tab-principal" class="apt-top-tab ${state.abaAtiva==='principal'?'active':''}" style="padding:8px 18px;font-size:12px;font-weight:500;cursor:pointer;border-bottom:2px solid ${state.abaAtiva==='principal'?'#2563eb':'transparent'};color:${state.abaAtiva==='principal'?'#2563eb':'#6b7280'}">
        <i class="ti ti-clock-record" aria-hidden="true"></i> Apontamentos
      </div>
      <div id="apt-tab-cadastro" class="apt-top-tab ${state.abaAtiva==='cadastro'?'active':''}" style="padding:8px 18px;font-size:12px;font-weight:500;cursor:pointer;border-bottom:2px solid ${state.abaAtiva==='cadastro'?'#2563eb':'transparent'};color:${state.abaAtiva==='cadastro'?'#2563eb':'#6b7280'}">
        <i class="ti ti-users" aria-hidden="true"></i> Cadastro e Gestão
      </div>
    </div>
  `;
}

function renderContent() {
  // Re-render só as tabs sem re-montar tudo
  const root = document.getElementById('apt-root');
  root.querySelector('[style*="border-bottom:1px solid"]').outerHTML = renderTopTabs();
  document.getElementById('apt-tab-principal').addEventListener('click', () => { state.abaAtiva = 'principal'; renderContent(); });
  document.getElementById('apt-tab-cadastro').addEventListener('click',  () => { state.abaAtiva = 'cadastro';  renderContent(); });

  const content = document.getElementById('apt-content');
  if (state.abaAtiva === 'principal') {
    content.innerHTML = renderFiltros() + renderPrincipal();
    bindFiltros();
    if (state.modalidades.length > 0 || state.colaboradorChapa) carregarDados();
  } else {
    content.innerHTML = renderCadastro();
    bindCadastro();
    carregarDadosCadastro();
  }
}

/* ═══════════════════════════════════════════════════════════════
   FILTROS
   ═══════════════════════════════════════════════════════════════ */
function renderFiltros() {
  const semanas = [];
  for (let s = SEMANA_ANCORA - SEMANAS_JANELA; s <= SEMANA_ANCORA + SEMANAS_JANELA; s++) {
    const { inicio, fim } = semanaParaDatas(s);
    semanas.push({ s, inicio, fim });
  }
  const semanaOpts = semanas.map(({ s, inicio, fim }) =>
    `<option value="${s}" ${state.semana===s?'selected':''}>${s===SEMANA_ANCORA?`Sem ${s} (atual)  ·  `:`Sem ${s}  ·  `}${fmtDate(inicio)} – ${fmtDate(fim)}</option>`
  ).join('');

  const modOpts = MODALIDADES_DISPONIVEIS.map(m =>
    `<option value="${m}" ${state.modalidades.includes(m)?'selected':''}>${m}</option>`
  ).join('');

  return `
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px 18px;margin-bottom:16px">
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end">

      <div style="display:flex;flex-direction:column;gap:4px;min-width:100px">
        <label style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.06em">Safra</label>
        <select id="apt-safra" style="${selStyle()}">
          ${SAFRAS_DISPONIVEIS.map(s=>`<option ${s===state.safra?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>

      <div style="display:flex;flex-direction:column;gap:4px;flex:1;min-width:200px">
        <label style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.06em">
          Período
          <span style="text-transform:none;font-weight:400;margin-left:6px">
            <label style="cursor:pointer"><input type="radio" name="apt-periodo-tipo" value="semana" ${state.periodoTipo==='semana'?'checked':''}> Semana</label>
            &nbsp;
            <label style="cursor:pointer"><input type="radio" name="apt-periodo-tipo" value="intervalo" ${state.periodoTipo==='intervalo'?'checked':''}> Intervalo</label>
          </span>
        </label>
        <div id="apt-periodo-semana" style="display:${state.periodoTipo==='semana'?'block':'none'}">
          <select id="apt-semana" style="${selStyle(220)}">
            ${semanaOpts}
          </select>
        </div>
        <div id="apt-periodo-intervalo" style="display:${state.periodoTipo==='intervalo'?'flex':'none'};gap:6px;align-items:center">
          <input type="date" id="apt-data-inicio" value="${state.dataInicio}" style="${selStyle(130)}">
          <span style="font-size:11px;color:#9ca3af">até</span>
          <input type="date" id="apt-data-fim" value="${state.dataFim}" style="${selStyle(130)}">
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:4px;min-width:150px">
        <label style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.06em">Modalidade <span style="font-weight:400">(múltipla)</span></label>
        <select id="apt-modalidade" multiple style="${selStyle(160)};height:60px">
          ${modOpts}
        </select>
        <div style="font-size:9px;color:#9ca3af">Ctrl/Cmd para múltiplos</div>
      </div>

      <div style="display:flex;flex-direction:column;gap:4px;min-width:180px">
        <label style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.06em">Colaborador</label>
        <input type="text" id="apt-colab-busca" placeholder="Nome ou crachá…" value="${state.colaboradorChapa||''}" style="${selStyle(200)};background:#f9fafb">
        <div id="apt-colab-lista" style="display:none;position:absolute;z-index:100;background:#fff;border:1px solid #e5e7eb;border-radius:6px;max-height:160px;overflow-y:auto;width:200px;box-shadow:0 4px 12px rgba(0,0,0,.1)"></div>
        <div style="font-size:9px;color:#9ca3af">Busca por nome ou crachá</div>
      </div>

      <button id="apt-btn-filtrar" style="${btnStyle('primary')}">
        <i class="ti ti-search" aria-hidden="true"></i> Filtrar
      </button>
      <button id="apt-btn-limpar" style="${btnStyle('ghost')}">
        <i class="ti ti-x" aria-hidden="true"></i> Limpar
      </button>

    </div>
    <div style="font-size:11px;color:#6b7280;background:#f9fafb;border-radius:6px;padding:6px 10px;margin-top:10px;display:flex;gap:6px;align-items:flex-start;line-height:1.5">
      <i class="ti ti-info-circle" style="font-size:13px;flex-shrink:0;margin-top:1px" aria-hidden="true"></i>
      Safra e período são obrigatórios. Selecione ao menos <strong>modalidade</strong> ou <strong>colaborador</strong> para visualizar dados. Ao selecionar colaborador, a modalidade é inferida do cadastro.
    </div>
  </div>`;
}

function bindFiltros() {
  // Tipo de período
  document.querySelectorAll('input[name="apt-periodo-tipo"]').forEach(r => {
    r.addEventListener('change', () => {
      state.periodoTipo = r.value;
      document.getElementById('apt-periodo-semana').style.display    = r.value === 'semana'    ? 'block' : 'none';
      document.getElementById('apt-periodo-intervalo').style.display = r.value === 'intervalo' ? 'flex'  : 'none';
    });
  });

  // Safra
  document.getElementById('apt-safra').addEventListener('change', e => { state.safra = e.target.value; });

  // Semana
  document.getElementById('apt-semana').addEventListener('change', e => {
    state.semana = parseInt(e.target.value);
    const { inicio, fim } = semanaParaDatas(state.semana);
    state.dataInicio = inicio; state.dataFim = fim;
  });

  // Datas
  document.getElementById('apt-data-inicio').addEventListener('change', e => { state.dataInicio = e.target.value; });
  document.getElementById('apt-data-fim').addEventListener('change', e => { state.dataFim = e.target.value; });

  // Modalidade (multi-select)
  document.getElementById('apt-modalidade').addEventListener('change', e => {
    state.modalidades = Array.from(e.target.selectedOptions).map(o => o.value);
  });

  // Colaborador busca
  const inputColab = document.getElementById('apt-colab-busca');
  const listaColab = document.getElementById('apt-colab-lista');
  inputColab.addEventListener('input', async () => {
    const q = inputColab.value.trim().toLowerCase();
    if (q.length < 1) { listaColab.style.display = 'none'; return; }
    const colabs = state.colaboradores.filter(c =>
      c.nome.toLowerCase().includes(q) || String(c.cracha).includes(q)
    );
    if (colabs.length === 0) { listaColab.style.display = 'none'; return; }
    listaColab.style.display = 'block';
    listaColab.style.top = (inputColab.getBoundingClientRect().bottom + window.scrollY + 2) + 'px';
    listaColab.style.left = inputColab.getBoundingClientRect().left + 'px';
    listaColab.innerHTML = colabs.map(c => `
      <div data-cracha="${c.cracha}" style="padding:7px 10px;font-size:11px;cursor:pointer;border-bottom:1px solid #f3f4f6;display:flex;gap:8px;align-items:center">
        <span style="color:#9ca3af;font-size:10px">${c.cracha}</span>
        <span>${c.nome}</span>
        <span style="margin-left:auto;font-size:10px;background:#e6f1fb;color:#185fa5;padding:1px 6px;border-radius:10px">${c.modalidade||''}</span>
      </div>
    `).join('');
    listaColab.querySelectorAll('[data-cracha]').forEach(el => {
      el.addEventListener('click', () => {
        const c = state.colaboradores.find(x => String(x.cracha) === el.dataset.cracha);
        state.colaboradorChapa = c.cracha;
        inputColab.value = `${c.cracha} — ${c.nome}`;
        listaColab.style.display = 'none';
        // Inferir modalidade
        if (c.modalidade) state.modalidades = [c.modalidade];
      });
    });
  });
  document.addEventListener('click', e => {
    if (!listaColab.contains(e.target) && e.target !== inputColab) listaColab.style.display = 'none';
  });

  // Filtrar
  document.getElementById('apt-btn-filtrar').addEventListener('click', () => {
    if (state.periodoTipo === 'semana') {
      const { inicio, fim } = semanaParaDatas(state.semana);
      state.dataInicio = inicio; state.dataFim = fim;
    }
    if (state.modalidades.length === 0 && !state.colaboradorChapa) {
      alert('Selecione ao menos uma modalidade ou um colaborador.');
      return;
    }
    carregarDados();
  });

  // Limpar
  document.getElementById('apt-btn-limpar').addEventListener('click', () => {
    state.modalidades = []; state.colaboradorChapa = null;
    document.getElementById('apt-colab-busca').value = '';
    document.getElementById('apt-modalidade').querySelectorAll('option').forEach(o => o.selected = false);
    renderContent();
  });
}

/* ═══════════════════════════════════════════════════════════════
   ABA PRINCIPAL — estado vazio / carregado
   ═══════════════════════════════════════════════════════════════ */
function renderPrincipal() {
  if (state.modalidades.length === 0 && !state.colaboradorChapa) {
    return `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:320px;gap:12px;color:#9ca3af;text-align:center">
        <i class="ti ti-users" style="font-size:42px;color:#d1d5db" aria-hidden="true"></i>
        <p style="font-size:12px;max-width:300px;line-height:1.6;margin:0">Selecione uma <strong style="color:#374151">modalidade</strong> ou busque um <strong style="color:#374151">colaborador</strong> para visualizar os apontamentos do período.</p>
      </div>`;
  }
  return `<div id="apt-dados">
    <div id="apt-metricas" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px">
      ${[1,2,3,4].map(()=>`<div style="${cardStyle()};animation:pulse 1.5s infinite">
        <div style="height:12px;background:#f3f4f6;border-radius:4px;width:70%;margin-bottom:8px"></div>
        <div style="height:24px;background:#f3f4f6;border-radius:4px;width:40%"></div>
      </div>`).join('')}
    </div>
    <div id="apt-pontos" style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-bottom:16px">
      <div style="height:12px;background:#f3f4f6;border-radius:4px;width:30%;margin-bottom:12px"></div>
      <div style="height:60px;background:#f9fafb;border-radius:6px"></div>
    </div>
    <div id="apt-heatmap" style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-bottom:16px">
      <div style="height:12px;background:#f3f4f6;border-radius:4px;width:40%;margin-bottom:12px"></div>
      <div style="height:120px;background:#f9fafb;border-radius:6px"></div>
    </div>
    <div id="apt-tabela" style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-bottom:16px">
      <div style="height:12px;background:#f3f4f6;border-radius:4px;width:50%;margin-bottom:12px"></div>
      <div style="height:80px;background:#f9fafb;border-radius:6px"></div>
    </div>
    <div id="apt-importar">${renderImportador()}</div>
  </div>`;
}

/* ═══════════════════════════════════════════════════════════════
   CARREGAR DADOS
   ═══════════════════════════════════════════════════════════════ */
async function carregarDados() {
  try {
    // Buscar colaboradores cadastrados nas modalidades selecionadas
    let colabFiltro = state.colaboradores;
    if (state.colaboradorChapa) {
      colabFiltro = state.colaboradores.filter(c => String(c.cracha) === String(state.colaboradorChapa));
    } else if (state.modalidades.length > 0) {
      colabFiltro = state.colaboradores.filter(c => state.modalidades.includes(c.modalidade));
    }
    if (colabFiltro.length === 0) {
      document.getElementById('apt-dados').innerHTML = `
        <div style="text-align:center;padding:40px;color:#9ca3af;font-size:12px">
          <i class="ti ti-user-off" style="font-size:32px;display:block;margin-bottom:8px" aria-hidden="true"></i>
          Nenhum colaborador cadastrado para os filtros selecionados.<br>
          <span style="color:#2563eb;cursor:pointer;text-decoration:underline" id="apt-ir-cadastro">Ir para Cadastro</span> para registrar colaboradores.
        </div>
      `;
      document.getElementById('apt-ir-cadastro')?.addEventListener('click', () => { state.abaAtiva = 'cadastro'; renderContent(); });
      return;
    }
    const chapas = colabFiltro.map(c => c.cracha);

    // Buscar apontamentos no período
    const apts = await sbFetch(
      `apontamentos?data_apontamento=gte.${state.dataInicio}&data_apontamento=lte.${state.dataFim}&chapa=in.(${chapas.join(',')})&order=data_apontamento.asc,chapa.asc`,
      { method: 'GET' }
    );
    state.apontamentos = apts;

    // Buscar justificativas do período
    const justs = await sbFetch(
      `apt_justificativas?data_inicio=lte.${state.dataFim}&data_fim=gte.${state.dataInicio}&chapa=in.(${chapas.join(',')})`,
      { method: 'GET' }
    ).catch(() => []);
    state.justificativas = justs;

    // Buscar férias
    const fer = await sbFetch(
      `apt_ferias?data_inicio=lte.${state.dataFim}&data_fim=gte.${state.dataInicio}&chapa=in.(${chapas.join(',')})`,
      { method: 'GET' }
    ).catch(() => []);
    state.ferias = fer;

    renderDados(colabFiltro);
  } catch(e) {
    console.error(e);
    document.getElementById('apt-dados').innerHTML = `
      <div style="padding:40px;text-align:center;color:#9ca3af;font-size:12px">
        <i class="ti ti-alert-circle" style="font-size:32px;display:block;margin-bottom:8px" aria-hidden="true"></i>
        Erro ao carregar dados: ${e.message}
      </div>${renderImportador()}`;
  }
}

/* ═══════════════════════════════════════════════════════════════
   RENDER DADOS
   ═══════════════════════════════════════════════════════════════ */
function renderDados(colabFiltro) {
  const dias = diasEntre(state.dataInicio, state.dataFim);

  // Para cada colaborador × dia: calcular HH apontado e status
  function hhDia(cracha, dia) {
    return state.apontamentos
      .filter(a => String(a.chapa) === String(cracha) && a.data_apontamento === dia)
      .reduce((s, a) => s + parseFloat(String(a.hh_total).replace(',','.') || 0), 0);
  }
  function ehFolga(colab, dia) {
    if (colab.escala === 'ADM') return new Date(dia + 'T00:00:00').getDay() === 0 || new Date(dia + 'T00:00:00').getDay() === 6;
    if (!colab.primeira_folga) return false;
    const folgas = gerarFolgas(colab.escala, colab.primeira_folga, state.dataFim);
    return folgas.has(dia);
  }
  function estaDeFerias(cracha, dia) {
    return state.ferias.some(f =>
      String(f.chapa) === String(cracha) && f.data_inicio <= dia && f.data_fim >= dia
    );
  }
  function justificativa(cracha, dia) {
    return state.justificativas.find(j =>
      String(j.chapa) === String(cracha) && j.data_inicio <= dia && j.data_fim >= dia
    ) || null;
  }

  // HH previsto = 8h por dia trabalhado (escala)
  const HH_DIA = 8;
  let totalPrevisto = 0, totalApontado = 0;
  let ausencias = [], baixos = [];

  colabFiltro.forEach(c => {
    dias.forEach(dia => {
      const folga  = ehFolga(c, dia);
      const ferias = estaDeFerias(c.cracha, dia);
      const just   = justificativa(c.cracha, dia);
      if (folga || ferias || just) return;
      totalPrevisto += HH_DIA;
      const hh = hhDia(c.cracha, dia);
      totalApontado += hh;
      if (hh === 0) {
        ausencias.push({ colab: c, dia, hh });
      } else if (hh < HH_DIA * META_APONTAMENTO) {
        baixos.push({ colab: c, dia, hh });
      }
    });
  });
  const aderencia = totalPrevisto > 0 ? Math.round((totalApontado / totalPrevisto) * 100) : 0;

  // ── Métricas ──
  document.getElementById('apt-metricas').innerHTML = `
    ${metricCard('H-H previsto', totalPrevisto.toFixed(0) + ' h', 'Baseado na escala cadastrada', '#374151')}
    ${metricCard('Aderência ao apontamento', aderencia + '%', 'H-H apontado / H-H disponível', aderencia >= 75 ? '#15803d' : '#b91c1c')}
    ${metricCard('Ausência de apontamento', ausencias.length, 'Dias sem registro (sem justificativa)', ausencias.length > 0 ? '#b91c1c' : '#374151')}
    ${metricCard('Baixo apontamento', baixos.length, `Dias abaixo de ${Math.round(META_APONTAMENTO*100)}% do previsto`, baixos.length > 0 ? '#92400e' : '#374151')}
  `;

  // ── Pontos de atenção ──
  const pontosHtml = (() => {
    if (ausencias.length === 0 && baixos.length === 0) {
      return `<div style="text-align:center;padding:20px;color:#9ca3af;font-size:12px"><i class="ti ti-circle-check" style="font-size:24px;color:#22c55e;display:block;margin-bottom:6px" aria-hidden="true"></i>Nenhum ponto de atenção no período.</div>`;
    }
    // Agrupar ausências por colaborador
    const ausMap = {};
    ausencias.forEach(({ colab, dia }) => {
      const k = colab.cracha;
      if (!ausMap[k]) ausMap[k] = { colab, dias: [] };
      ausMap[k].dias.push(dia);
    });
    return `
      <div style="display:flex;gap:20px;flex-wrap:wrap">
        ${ausencias.length > 0 ? `
        <div style="flex:1;min-width:220px">
          <div style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Ausência de apontamento</div>
          ${Object.values(ausMap).map(({ colab, dias }) => `
            <div style="display:flex;align-items:flex-start;gap:8px;padding:7px 0;border-bottom:1px solid #f3f4f6;font-size:11px">
              <span style="width:7px;height:7px;border-radius:50%;background:#ef4444;flex-shrink:0;margin-top:4px;display:inline-block"></span>
              <div style="flex:1"><strong>${colab.nome.split(' ')[0]}</strong> — ${dias.map(fmtDate).join(', ')}</div>
              <button class="apt-btn-justificar" data-cracha="${colab.cracha}" data-nome="${colab.nome}" data-dias="${dias.join(',')}" style="${btnStyle('ghost','xs')}">
                <i class="ti ti-pencil" aria-hidden="true"></i>
              </button>
            </div>
          `).join('')}
          <div style="font-size:10px;color:#9ca3af;margin-top:6px;background:#f9fafb;padding:5px 8px;border-radius:5px">Lançar tratativa: Treinamento ou Serviço externo</div>
        </div>` : ''}
        ${baixos.length > 0 ? `
        <div style="flex:1;min-width:220px">
          <div style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">
            Baixo apontamento <span style="background:#fef3c7;color:#92400e;font-size:10px;padding:1px 7px;border-radius:10px;font-weight:500">meta ${Math.round(META_APONTAMENTO*100)}%</span>
          </div>
          ${baixos.map(({ colab, dia, hh }) => `
            <div style="display:flex;align-items:flex-start;gap:8px;padding:7px 0;border-bottom:1px solid #f3f4f6;font-size:11px">
              <span style="width:7px;height:7px;border-radius:50%;background:#f59e0b;flex-shrink:0;margin-top:4px;display:inline-block"></span>
              <div><strong>${colab.nome.split(' ')[0]}</strong> — ${fmtDate(dia)} · ${hh.toFixed(1)}h (${Math.round(hh/HH_DIA*100)}%)</div>
            </div>
          `).join('')}
          <div style="font-size:10px;color:#9ca3af;margin-top:6px;background:#f9fafb;padding:5px 8px;border-radius:5px">Tratativa de baixo apontamento disponível em breve.</div>
        </div>` : ''}
      </div>
    `;
  })();

  document.getElementById('apt-pontos').innerHTML = `
    <div style="font-size:11px;font-weight:600;color:#374151;margin-bottom:12px;display:flex;align-items:center;gap:6px">
      <i class="ti ti-alert-triangle" style="font-size:14px;color:#f59e0b" aria-hidden="true"></i> Pontos de atenção
    </div>
    ${pontosHtml}
  `;

  // Bind botões justificar
  document.querySelectorAll('.apt-btn-justificar').forEach(btn => {
    btn.addEventListener('click', () => {
      abrirModalJustificativa(btn.dataset.cracha, btn.dataset.nome, btn.dataset.dias.split(','));
    });
  });

  // ── Heatmap ──
  renderHeatmap(colabFiltro, dias, hhDia, ehFolga, estaDeFerias, justificativa);

  // ── Tabela ──
  renderTabela();

  // ── Importador ──
  document.getElementById('apt-importar').innerHTML = renderImportador();
  bindImportador();
}

/* ═══════════════════════════════════════════════════════════════
   HEATMAP
   ═══════════════════════════════════════════════════════════════ */
function renderHeatmap(colabFiltro, todosDias, hhDia, ehFolga, estaDeFerias, justificativa) {
  const HH_DIA = 8;
  const DIAS_POR_PAGINA = 14;
  const paginas = Math.ceil(todosDias.length / DIAS_POR_PAGINA);
  const pag = Math.min(state.heatmapPagina, paginas - 1);
  const dias = todosDias.slice(pag * DIAS_POR_PAGINA, (pag + 1) * DIAS_POR_PAGINA);

  function cellColor(colab, dia) {
    if (estaDeFerias(colab.cracha, dia)) return ['#dbeafe','#1e40af','F'];
    const just = justificativa(colab.cracha, dia);
    if (just) return ['#fef3c7','#92400e', just.tratativa?.substring(0,1) || 'J'];
    if (ehFolga(colab, dia)) return ['#e5e7eb','#9ca3af',''];
    const hh = hhDia(colab.cracha, dia);
    if (hh === 0)                        return ['#fee2e2','#b91c1c',''];
    if (hh >= HH_DIA * 0.9)             return ['#166534','#bbf7d0', hh.toFixed(0)+'h'];
    if (hh >= HH_DIA * META_APONTAMENTO) return ['#16a34a','#dcfce7', hh.toFixed(0)+'h'];
    return ['#fde68a','#92400e', hh.toFixed(0)+'h'];
  }

  const labelInicio = fmtDateFull(dias[0]);
  const labelFim    = fmtDateFull(dias[dias.length - 1]);

  document.getElementById('apt-heatmap').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:600;color:#374151;display:flex;align-items:center;gap:6px">
        <i class="ti ti-layout-grid" aria-hidden="true"></i> Presença por colaborador
        <span style="font-size:10px;font-weight:400;color:#9ca3af">${labelInicio} – ${labelFim}</span>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${[['#166534','Alto >6h'],['#16a34a','Médio 4–6h'],['#fde68a','Baixo <4h'],['#fee2e2','Sem registro'],['#e5e7eb','Folga'],['#fef3c7','Justificado'],['#dbeafe','Férias']].map(([c,l])=>`
            <span style="display:flex;align-items:center;gap:4px;font-size:10px;color:#6b7280">
              <span style="width:10px;height:10px;border-radius:2px;background:${c};display:inline-block"></span>${l}
            </span>`).join('')}
        </div>
        <div style="display:flex;gap:4px">
          <button id="apt-hm-prev" style="${btnStyle('ghost','xs')}" ${pag===0?'disabled':''}>
            <i class="ti ti-chevron-left" aria-hidden="true"></i>
          </button>
          <span style="font-size:10px;color:#6b7280;display:flex;align-items:center;padding:0 4px">${pag+1}/${paginas}</span>
          <button id="apt-hm-next" style="${btnStyle('ghost','xs')}" ${pag>=paginas-1?'disabled':''}>
            <i class="ti ti-chevron-right" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    </div>
    <div style="overflow-x:auto">
      <div style="display:grid;grid-template-columns:70px repeat(${dias.length},minmax(28px,1fr));gap:2px;min-width:${70+dias.length*30}px">
        <div></div>
        ${dias.map(d=>`
          <div style="font-size:9px;color:#9ca3af;text-align:center;padding-bottom:2px;line-height:1.2">
            <div>${diaSemanaAbrev(d)}</div>
            <div>${fmtDate(d)}</div>
          </div>`).join('')}
        ${colabFiltro.map(c => `
          <div style="font-size:10px;color:#374151;display:flex;align-items:center;height:26px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:4px" title="${c.nome}">
            ${c.nome.split(' ')[0]}
          </div>
          ${dias.map(dia => {
            const [bg, fg, label] = cellColor(c, dia);
            return `<div style="height:26px;border-radius:3px;background:${bg};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:500;color:${fg};cursor:pointer" 
              class="apt-hm-cell" data-cracha="${c.cracha}" data-dia="${dia}" title="${c.nome} · ${fmtDate(dia)}">${label}</div>`;
          }).join('')}
        `).join('')}
      </div>
    </div>
  `;

  document.getElementById('apt-hm-prev')?.addEventListener('click', () => { state.heatmapPagina--; renderHeatmap(colabFiltro, todosDias, hhDia, ehFolga, estaDeFerias, justificativa); });
  document.getElementById('apt-hm-next')?.addEventListener('click', () => { state.heatmapPagina++; renderHeatmap(colabFiltro, todosDias, hhDia, ehFolga, estaDeFerias, justificativa); });

  // Click na célula → detalhe
  document.querySelectorAll('.apt-hm-cell').forEach(cel => {
    cel.addEventListener('click', () => {
      const colab = colabFiltro.find(c => String(c.cracha) === cel.dataset.cracha);
      const dia = cel.dataset.dia;
      abrirDetalhecelula(colab, dia);
    });
  });
}

function abrirDetalhecelula(colab, dia) {
  const apts = state.apontamentos.filter(a =>
    String(a.chapa) === String(colab.cracha) && a.data_apontamento === dia
  );
  const totalHH = apts.reduce((s, a) => s + parseFloat(String(a.hh_total).replace(',','.') || 0), 0);
  const html = `
    <div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:8px">${colab.nome} · ${fmtDateFull(dia)}</div>
    ${apts.length === 0 ? '<div style="color:#9ca3af;font-size:11px">Nenhum apontamento neste dia.</div>' : `
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead><tr>
          ${['OS','Descrição','Início','Fim','H-H'].map(h=>`<th style="text-align:left;padding:4px 6px;border-bottom:1px solid #f3f4f6;font-size:10px;color:#6b7280">${h}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${apts.map(a=>`<tr>
            <td style="padding:4px 6px;border-bottom:1px solid #f9fafb">${a.os}</td>
            <td style="padding:4px 6px;border-bottom:1px solid #f9fafb;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.desc_servico||''}</td>
            <td style="padding:4px 6px;border-bottom:1px solid #f9fafb">${a.hora_inicio}</td>
            <td style="padding:4px 6px;border-bottom:1px solid #f9fafb">${a.hora_fim}</td>
            <td style="padding:4px 6px;border-bottom:1px solid #f9fafb;font-weight:500">${parseFloat(String(a.hh_total).replace(',','.') || 0).toFixed(1)}h</td>
          </tr>`).join('')}
          <tr><td colspan="4" style="padding:4px 6px;font-weight:600;font-size:10px;color:#374151">Total</td>
          <td style="padding:4px 6px;font-weight:600">${totalHH.toFixed(1)}h</td></tr>
        </tbody>
      </table>
    `}
  `;
  abrirModal('Detalhamento do dia', html);
}

/* ═══════════════════════════════════════════════════════════════
   TABELA
   ═══════════════════════════════════════════════════════════════ */
function renderTabela() {
  const apts = [...state.apontamentos].sort((a,b) => {
    if (a.data_apontamento !== b.data_apontamento) return a.data_apontamento < b.data_apontamento ? -1 : 1;
    return (a.nome||'') < (b.nome||'') ? -1 : 1;
  });

  document.getElementById('apt-tabela').innerHTML = `
    <div style="font-size:11px;font-weight:600;color:#374151;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between">
      <span><i class="ti ti-list-details" aria-hidden="true"></i> Detalhamento de apontamentos</span>
      <span style="font-size:10px;font-weight:400;color:#9ca3af">${apts.length} registros</span>
    </div>
    <div style="overflow-x:auto;max-height:320px;overflow-y:auto">
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead style="position:sticky;top:0;background:#fff;z-index:1">
          <tr>${['Data','Colaborador','OS','Descrição','Início','Fim','H-H'].map(h=>`<th style="text-align:left;padding:5px 8px;border-bottom:1px solid #e5e7eb;font-size:10px;color:#6b7280;white-space:nowrap">${h}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${apts.length === 0
            ? `<tr><td colspan="7" style="text-align:center;padding:24px;color:#9ca3af">Nenhum apontamento no período.</td></tr>`
            : apts.map(a=>`<tr style="border-bottom:1px solid #f9fafb">
                <td style="padding:5px 8px;white-space:nowrap">${fmtDate(a.data_apontamento)}</td>
                <td style="padding:5px 8px;white-space:nowrap">${(a.nome||'').split(' ').slice(0,2).join(' ')}</td>
                <td style="padding:5px 8px;font-family:monospace">${a.os}</td>
                <td style="padding:5px 8px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${a.desc_servico||''}">${a.desc_servico||'—'}</td>
                <td style="padding:5px 8px;white-space:nowrap">${a.hora_inicio}</td>
                <td style="padding:5px 8px;white-space:nowrap">${a.hora_fim}</td>
                <td style="padding:5px 8px;font-weight:500">${parseFloat(String(a.hh_total).replace(',','.') || 0).toFixed(1)}h</td>
              </tr>`).join('')
          }
        </tbody>
      </table>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   IMPORTADOR
   ═══════════════════════════════════════════════════════════════ */
function renderImportador() {
  return `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-bottom:16px">
      <div style="font-size:11px;font-weight:600;color:#374151;margin-bottom:12px;display:flex;align-items:center;gap:6px">
        <i class="ti ti-upload" aria-hidden="true"></i> Importar apontamentos (.xls/.xlsx)
      </div>
      <div id="apt-drop-zone" style="border:2px dashed #d1d5db;border-radius:8px;padding:24px;text-align:center;cursor:pointer;transition:border-color .2s;position:relative">
        <input type="file" id="apt-file-input" accept=".xls,.xlsx" style="position:absolute;inset:0;opacity:0;cursor:pointer;width:100%">
        <i class="ti ti-file-spreadsheet" style="font-size:28px;color:#9ca3af;display:block;margin-bottom:6px" aria-hidden="true"></i>
        <div style="font-size:12px;color:#374151;font-weight:500">Arraste o arquivo aqui ou clique para selecionar</div>
        <div style="font-size:11px;color:#9ca3af;margin-top:4px">Relatório "Apontamento de Mão-de-Obra por Funcionário" do PIMS MI</div>
      </div>
      <div id="apt-import-status" style="display:none;margin-top:10px;font-size:11px;padding:8px 12px;border-radius:6px"></div>
      <div id="apt-import-prog" style="display:none;margin-top:8px">
        <div style="height:4px;background:#f3f4f6;border-radius:2px;overflow:hidden">
          <div id="apt-import-bar" style="height:100%;background:#2563eb;border-radius:2px;width:0%;transition:width .3s"></div>
        </div>
        <div id="apt-import-msg" style="font-size:10px;color:#6b7280;margin-top:4px"></div>
      </div>
    </div>
  `;
}

function bindImportador() {
  const input = document.getElementById('apt-file-input');
  const zone  = document.getElementById('apt-drop-zone');
  if (!input || !zone) return;

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.style.borderColor = '#2563eb'; });
  zone.addEventListener('dragleave', () => { zone.style.borderColor = '#d1d5db'; });
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.style.borderColor = '#d1d5db';
    const file = e.dataTransfer.files[0];
    if (file) processarArquivoApt(file);
  });
  input.addEventListener('change', () => {
    if (input.files[0]) processarArquivoApt(input.files[0]);
  });
}

async function processarArquivoApt(file) {
  const status = document.getElementById('apt-import-status');
  const prog   = document.getElementById('apt-import-prog');
  const bar    = document.getElementById('apt-import-bar');
  const msg    = document.getElementById('apt-import-msg');

  function setStatus(txt, tipo) {
    status.style.display = 'block';
    status.style.background = tipo === 'ok' ? '#f0fdf4' : tipo === 'err' ? '#fef2f2' : '#eff6ff';
    status.style.color = tipo === 'ok' ? '#15803d' : tipo === 'err' ? '#b91c1c' : '#1d4ed8';
    status.innerHTML = txt;
  }
  function setProgresso(pct, texto) {
    prog.style.display = 'block';
    bar.style.width = pct + '%';
    msg.textContent = texto;
  }

  try {
    setStatus('<i class="ti ti-loader" aria-hidden="true"></i> Lendo arquivo…', 'info');
    setProgresso(5, 'Lendo planilha…');

    const XLSX = await loadXLSX();
    const buf  = await file.arrayBuffer();
    const wb   = XLSX.read(buf, { type: 'array' });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const raw  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    setProgresso(20, 'Parseando apontamentos…');

    // Parser igual ao importador existente
    const records = [];
    let curCracha = null, curNome = null;
    const reCracha = /^(\d{3,8})\s*-\s*(.+)/;
    const reData   = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;

    for (let i = 0; i < raw.length; i++) {
      const row = raw[i];
      const v0  = row[0] != null ? String(row[0]).trim() : '';
      const v1  = row[1] != null ? String(row[1]).trim() : '';
      if (v0 === 'Funcionário:') {
        const m = reCracha.exec(v1);
        if (m) { curCracha = m[1].replace(/^0+/, '') || '0'; curNome = m[2].trim(); }
        continue;
      }
      // Detecta data na col 0 (formato DD/MM/YYYY ou objeto Date via cellDates)
      let dataIso = null;
      if (row[0] instanceof Date) {
        dataIso = row[0].toISOString().slice(0,10);
      } else if (reData.test(v0)) {
        const [d,m,y] = v0.split('/');
        dataIso = `${y.length===2?'20'+y:y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
      }
      if (!dataIso || !curCracha) continue;
      const nextRow = raw[i+1] || [];
      const os      = nextRow[0] != null ? String(nextRow[0]).trim() : '';
      const desc    = nextRow[1] != null ? String(nextRow[1]).trim().replace(/^\d+-/,'') : '';
      const ta      = v1;
      const hi      = row[2] != null ? String(row[2]).trim() : '';
      const hf      = row[3] != null ? String(row[3]).trim() : '';
      const ht      = row[4] != null ? String(row[4]).trim().replace(',','.') : '0';
      if (!os || !hi) continue;
      records.push({ data_apontamento: dataIso, os, desc_servico: desc, tipo_atividade: ta, hora_inicio: hi, hora_fim: hf, hh_total: parseFloat(ht) || 0, chapa: curCracha, nome: curNome });
    }

    if (records.length === 0) { setStatus('Nenhum registro encontrado. Verifique o arquivo.', 'err'); prog.style.display='none'; return; }
    setProgresso(35, `${records.length} apontamentos identificados. Enviando ao banco…`);

    // Upsert em lotes de 200
    // Chave única: os + data_apontamento + chapa + hora_inicio + hora_fim
    // Se hora_inicio+hora_fim coincidir com existente → atualiza
    // Se não → insere como novo registro
    const LOTE = 200;
    let inseridos = 0, atualizados = 0, ignorados = 0;

    for (let i = 0; i < records.length; i += LOTE) {
      const lote = records.slice(i, i + LOTE);
      // Upsert com onConflict na chave composta
      await sbFetch('apontamentos', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=representation',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(lote.map(r => ({
          os: r.os,
          data_apontamento: r.data_apontamento,
          chapa: r.chapa,
          nome: r.nome,
          hora_inicio: r.hora_inicio,
          hora_fim: r.hora_fim,
          hh_total: r.hh_total,
          tipo_atividade: r.tipo_atividade,
          desc_servico: r.desc_servico,
        }))),
      });
      inseridos += lote.length;
      const pct = 35 + Math.round((i / records.length) * 60);
      setProgresso(pct, `Enviando… ${Math.min(i + LOTE, records.length)}/${records.length}`);
    }

    setProgresso(100, 'Concluído!');
    setStatus(`<i class="ti ti-circle-check" aria-hidden="true"></i> <strong>${records.length}</strong> registros processados com sucesso.`, 'ok');
    setTimeout(() => carregarDados(), 1000);

  } catch(e) {
    setStatus(`<i class="ti ti-alert-circle" aria-hidden="true"></i> Erro: ${e.message}`, 'err');
    prog.style.display = 'none';
    console.error(e);
  }
}

async function loadXLSX() {
  if (window.XLSX) return window.XLSX;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload  = () => resolve(window.XLSX);
    s.onerror = () => reject(new Error('Falha ao carregar XLSX'));
    document.head.appendChild(s);
  });
}

/* ═══════════════════════════════════════════════════════════════
   MODAL JUSTIFICATIVA
   ═══════════════════════════════════════════════════════════════ */
function abrirModalJustificativa(cracha, nome, dias) {
  const primeiroNome = nome.split(' ')[0];
  const html = `
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="font-size:12px;color:#374151"><strong>${nome}</strong> — ${dias.map(fmtDate).join(', ')}</div>
      <div>
        <label style="${labelStyle()}">Tipo</label>
        <select id="just-tipo" style="${selStyle(300)}">
          ${TIPOS_JUSTIFICATIVA.map(t=>`<option>${t}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex;gap:8px">
        <div style="flex:1"><label style="${labelStyle()}">Data início</label>
          <input type="date" id="just-di" value="${dias[0]}" style="${selStyle()}"></div>
        <div style="flex:1"><label style="${labelStyle()}">Data fim</label>
          <input type="date" id="just-df" value="${dias[dias.length-1]}" style="${selStyle()}"></div>
      </div>
      <div id="just-tratativa-wrap">
        <label style="${labelStyle()}">Tratativa</label>
        <select id="just-tratativa" style="${selStyle(300)}">
          ${TRATATIVAS_AUSENCIA.map(t=>`<option>${t}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="${labelStyle()}">Observação (opcional)</label>
        <input type="text" id="just-obs" placeholder="Ex: NR-10 turma junho…" style="${selStyle(300)}">
      </div>
    </div>
  `;
  abrirModal('Lançar justificativa', html, async () => {
    const tipo = document.getElementById('just-tipo').value;
    const di   = document.getElementById('just-di').value;
    const df   = document.getElementById('just-df').value;
    const trat = document.getElementById('just-tratativa').value;
    const obs  = document.getElementById('just-obs').value;
    await sbFetch('apt_justificativas', {
      method: 'POST',
      body: JSON.stringify({ chapa: cracha, nome, tipo, data_inicio: di, data_fim: df, tratativa: trat, obs }),
    });
    fecharModal();
    carregarDados();
  }, 'Salvar');
}

/* ═══════════════════════════════════════════════════════════════
   ABA CADASTRO
   ═══════════════════════════════════════════════════════════════ */
function renderCadastro() {
  return `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px">
      <div style="display:flex;gap:0;border-bottom:1px solid #e5e7eb;margin-bottom:16px">
        <div id="cad-tab-colab" style="${tabStyle(state.cadastroAba==='colab')}">Colaboradores</div>
        <div id="cad-tab-justif" style="${tabStyle(state.cadastroAba==='justif')}">Justificativas e Trocas de Folga</div>
      </div>
      <div id="cad-content"></div>
    </div>
  `;
}

function bindCadastro() {
  document.getElementById('cad-tab-colab').addEventListener('click', () => { state.cadastroAba = 'colab'; renderCadastroConteudo(); });
  document.getElementById('cad-tab-justif').addEventListener('click', () => { state.cadastroAba = 'justif'; renderCadastroConteudo(); });
  renderCadastroConteudo();
}

async function carregarDadosCadastro() {
  try {
    const [colabs, specs, justs, ferias] = await Promise.all([
      sbFetch('apt_colaboradores?order=nome.asc'),
      sbFetch('apt_especialidades?order=nome.asc').catch(()=>[]),
      sbFetch('apt_justificativas?order=data_inicio.desc&limit=50').catch(()=>[]),
      sbFetch('apt_ferias?order=data_inicio.desc&limit=50').catch(()=>[]),
    ]);
    state.colaboradores  = colabs;
    state.especialidades = specs;
    state.justificativas = justs;
    state.ferias         = ferias;
    renderCadastroConteudo();
  } catch(e) {
    document.getElementById('cad-content').innerHTML = `<div style="color:#b91c1c;font-size:12px;padding:20px">${e.message}</div>`;
  }
}

function renderCadastroConteudo() {
  // Re-estilizar tabs
  document.getElementById('cad-tab-colab').style.cssText  = tabStyle(state.cadastroAba==='colab');
  document.getElementById('cad-tab-justif').style.cssText = tabStyle(state.cadastroAba==='justif');

  if (state.cadastroAba === 'colab') renderAbaColaboradores();
  else renderAbaJustificativas();
}

function renderAbaColaboradores() {
  const html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <input type="text" id="cad-busca" placeholder="Buscar colaborador…" style="${selStyle(220)}">
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button id="cad-btn-importar-base" style="${btnStyle('ghost')}"><i class="ti ti-download" aria-hidden="true"></i> Importar da base</button>
        <button id="cad-btn-nova-esp" style="${btnStyle('ghost')}"><i class="ti ti-tag" aria-hidden="true"></i> Especialidades</button>
        <button id="cad-btn-novo-colab" style="${btnStyle('primary')}"><i class="ti ti-plus" aria-hidden="true"></i> Novo colaborador</button>
      </div>
    </div>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead>
          <tr>${['Crachá','Nome','Modalidade','Especialidade','Escala','Ações'].map(h=>`<th style="text-align:left;padding:5px 8px;border-bottom:1px solid #e5e7eb;font-size:10px;color:#6b7280;white-space:nowrap">${h}</th>`).join('')}</tr>
        </thead>
        <tbody id="cad-tbody">
          ${state.colaboradores.length === 0
            ? `<tr><td colspan="6" style="padding:24px;text-align:center;color:#9ca3af;font-size:12px">Nenhum colaborador cadastrado.<br>Clique em <strong>Importar da base</strong> para preencher a partir dos apontamentos existentes.</td></tr>`
            : state.colaboradores.map(c => `
              <tr style="border-bottom:1px solid #f9fafb">
                <td style="padding:6px 8px;color:#6b7280">${c.cracha}</td>
                <td style="padding:6px 8px;font-weight:500">${c.nome}</td>
                <td style="padding:6px 8px"><span style="background:#eff6ff;color:#1d4ed8;font-size:10px;font-weight:500;padding:2px 7px;border-radius:10px">${c.modalidade||'—'}</span></td>
                <td style="padding:6px 8px;font-size:10px;color:#6b7280">${c.especialidade||'—'}</td>
                <td style="padding:6px 8px"><span style="background:#f3f4f6;color:#374151;font-size:10px;padding:2px 7px;border-radius:10px">${c.escala||'—'}</span></td>
                <td style="padding:6px 8px">
                  <div style="display:flex;gap:4px">
                    <button class="cad-btn-editar" data-cracha="${c.cracha}" style="${btnStyle('icon')}" title="Editar dados"><i class="ti ti-pencil" aria-hidden="true"></i></button>
                    <button class="cad-btn-escala" data-cracha="${c.cracha}" style="${btnStyle('icon')}" title="Alterar escala"><i class="ti ti-calendar-event" aria-hidden="true"></i></button>
                    <button class="cad-btn-justif" data-cracha="${c.cracha}" data-nome="${c.nome}" style="${btnStyle('icon')}" title="Justificativa/Troca de folga"><i class="ti ti-notes" aria-hidden="true"></i></button>
                    <button class="cad-btn-ferias" data-cracha="${c.cracha}" data-nome="${c.nome}" style="${btnStyle('icon')}" title="Lançar férias"><i class="ti ti-beach" aria-hidden="true"></i></button>
                  </div>
                </td>
              </tr>`).join('')
          }
        </tbody>
      </table>
    </div>
  `;
  document.getElementById('cad-content').innerHTML = html;

  // Busca
  document.getElementById('cad-busca').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('#cad-tbody tr').forEach(tr => {
      tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });

  // Botões de ação
  document.getElementById('cad-btn-novo-colab').addEventListener('click', () => abrirModalNovoColab());
  document.getElementById('cad-btn-nova-esp').addEventListener('click', () => abrirModalEspecialidades());
  document.getElementById('cad-btn-importar-base').addEventListener('click', () => importarDaBase());

  document.querySelectorAll('.cad-btn-editar').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = state.colaboradores.find(x => String(x.cracha) === btn.dataset.cracha);
      if (c) abrirModalEditarColab(c);
    });
  });
  document.querySelectorAll('.cad-btn-escala').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = state.colaboradores.find(x => String(x.cracha) === btn.dataset.cracha);
      if (c) abrirModalEscala(c);
    });
  });
  document.querySelectorAll('.cad-btn-justif').forEach(btn => {
    btn.addEventListener('click', () => {
      abrirModalJustificativa(btn.dataset.cracha, btn.dataset.nome, [hojeIso()]);
    });
  });
  document.querySelectorAll('.cad-btn-ferias').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = state.colaboradores.find(x => String(x.cracha) === btn.dataset.cracha);
      if (c) abrirModalFerias(c);
    });
  });
}

function abrirModalNovoColab(colab = null) {
  const editar = !!colab;
  const espOpts = state.especialidades.map(e =>
    `<option value="${e.id}" ${colab?.especialidade_id===e.id?'selected':''}>${e.nome}</option>`
  ).join('');
  const html = `
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;gap:8px">
        <div style="flex:0 0 110px"><label style="${labelStyle()}">Crachá</label>
          <input type="text" id="nc-cracha" value="${colab?.cracha||''}" style="${selStyle()}" ${editar?'readonly':''}></div>
        <div style="flex:1"><label style="${labelStyle()}">Nome completo</label>
          <input type="text" id="nc-nome" value="${colab?.nome||''}" style="${selStyle()}"></div>
      </div>
      <div style="display:flex;gap:8px">
        <div style="flex:1"><label style="${labelStyle()}">Modalidade</label>
          <select id="nc-modalidade" style="${selStyle()}">
            <option value="">Selecione…</option>
            ${MODALIDADES_DISPONIVEIS.map(m=>`<option value="${m}" ${colab?.modalidade===m?'selected':''}>${m}</option>`).join('')}
          </select>
        </div>
        <div style="flex:1"><label style="${labelStyle()}">Especialidade</label>
          <select id="nc-especialidade" style="${selStyle()}">
            <option value="">Selecione…</option>
            ${espOpts}
          </select>
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <div style="flex:1"><label style="${labelStyle()}">Escala</label>
          <select id="nc-escala" style="${selStyle()}">
            <option value="">Selecione…</option>
            ${ESCALAS.map(e=>`<option value="${e}" ${colab?.escala===e?'selected':''}>${e}</option>`).join('')}
          </select>
        </div>
        <div style="flex:1" id="nc-wrap-folga"><label style="${labelStyle()}">1ª folga</label>
          <input type="date" id="nc-primeira-folga" value="${colab?.primeira_folga||''}" style="${selStyle()}">
        </div>
      </div>
    </div>
  `;
  abrirModal(editar ? 'Editar colaborador' : 'Novo colaborador', html, async () => {
    const dados = {
      cracha: document.getElementById('nc-cracha').value.trim(),
      nome: document.getElementById('nc-nome').value.trim(),
      modalidade: document.getElementById('nc-modalidade').value,
      especialidade_id: document.getElementById('nc-especialidade').value || null,
      escala: document.getElementById('nc-escala').value,
      primeira_folga: document.getElementById('nc-primeira-folga').value || null,
    };
    if (!dados.cracha || !dados.nome) { alert('Crachá e nome são obrigatórios.'); return; }
    if (editar) {
      await sbFetch(`apt_colaboradores?cracha=eq.${colab.cracha}`, { method: 'PATCH', body: JSON.stringify(dados) });
    } else {
      await sbFetch('apt_colaboradores', { method: 'POST', body: JSON.stringify(dados) });
    }
    fecharModal();
    carregarDadosCadastro();
  }, 'Salvar');

  // Ocultar 1ª folga se ADM
  setTimeout(() => {
    const escSel = document.getElementById('nc-escala');
    const folgaWrap = document.getElementById('nc-wrap-folga');
    function toggleFolga() { folgaWrap.style.display = escSel.value === 'ADM' ? 'none' : 'flex'; folgaWrap.style.flex = '1'; }
    escSel.addEventListener('change', toggleFolga);
    toggleFolga();
  }, 50);
}

function abrirModalEditarColab(c) { abrirModalNovoColab(c); }

function abrirModalEscala(colab) {
  const html = `
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="font-size:12px;color:#374151;font-weight:500">${colab.nome}</div>
      <div style="background:#f9fafb;border-radius:6px;padding:8px 10px;font-size:11px;color:#6b7280">
        Escala atual: <strong style="color:#374151">${colab.escala||'não configurada'}</strong>
        ${colab.primeira_folga ? `· 1ª folga: <strong style="color:#374151">${fmtDateFull(colab.primeira_folga)}</strong>` : ''}
      </div>
      <div style="display:flex;gap:8px">
        <div style="flex:1"><label style="${labelStyle()}">Nova escala</label>
          <select id="esc-nova" style="${selStyle()}">
            ${ESCALAS.map(e=>`<option value="${e}">${e}</option>`).join('')}
          </select>
        </div>
        <div style="flex:1"><label style="${labelStyle()}">Vigência a partir de</label>
          <input type="date" id="esc-vigencia" value="${hojeIso()}" style="${selStyle()}">
        </div>
      </div>
      <div id="esc-folga-wrap" style="display:flex;gap:8px">
        <div style="flex:1"><label style="${labelStyle()}">Folga de transição?</label>
          <select id="esc-transicao" style="${selStyle()}">
            <option value="">Não</option>
            <option value="sim">Sim</option>
          </select>
        </div>
        <div style="flex:1" id="esc-data-trans-wrap" style="display:none"><label style="${labelStyle()}">Data folga transição</label>
          <input type="date" id="esc-data-trans" style="${selStyle()}">
        </div>
      </div>
      <div id="esc-pri-folga-wrap"><label style="${labelStyle()}">1ª folga da nova escala</label>
        <input type="date" id="esc-primeira-folga" style="${selStyle()}">
      </div>
      <div id="esc-preview" style="font-size:10px;color:#6b7280;background:#f9fafb;border-radius:5px;padding:6px 8px;display:none"></div>
    </div>
  `;
  abrirModal('Alterar escala', html, async () => {
    const novaEscala    = document.getElementById('esc-nova').value;
    const vigencia      = document.getElementById('esc-vigencia').value;
    const transicao     = document.getElementById('esc-transicao').value;
    const dataTransicao = document.getElementById('esc-data-trans').value;
    const primeiraFolga = document.getElementById('esc-primeira-folga').value;
    // Salvar novo histórico de escala
    await sbFetch('apt_historico_escalas', {
      method: 'POST',
      body: JSON.stringify({
        chapa: colab.cracha, escala_anterior: colab.escala, escala_nova: novaEscala,
        vigencia_inicio: vigencia, folga_transicao: transicao === 'sim' ? dataTransicao : null,
        primeira_folga_nova: primeiraFolga,
      }),
    });
    // Atualizar colaborador
    await sbFetch(`apt_colaboradores?cracha=eq.${colab.cracha}`, {
      method: 'PATCH',
      body: JSON.stringify({ escala: novaEscala, primeira_folga: primeiraFolga || null }),
    });
    fecharModal();
    carregarDadosCadastro();
  }, 'Salvar alteração');

  // Preview de folgas + toggle transição
  setTimeout(() => {
    const novaEsc  = document.getElementById('esc-nova');
    const trans    = document.getElementById('esc-transicao');
    const dtWrap   = document.getElementById('esc-data-trans-wrap');
    const pfWrap   = document.getElementById('esc-pri-folga-wrap');
    const preview  = document.getElementById('esc-preview');
    const pfInput  = document.getElementById('esc-primeira-folga');

    trans.addEventListener('change', () => {
      dtWrap.style.display = trans.value === 'sim' ? 'flex' : 'none';
    });
    novaEsc.addEventListener('change', () => {
      pfWrap.style.display = novaEsc.value === 'ADM' ? 'none' : 'block';
    });
    pfInput.addEventListener('change', () => atualizarPreviewFolgas());
    novaEsc.addEventListener('change', () => atualizarPreviewFolgas());

    function atualizarPreviewFolgas() {
      const esc = novaEsc.value;
      const pf  = pfInput.value;
      if (!pf || esc === 'ADM') { preview.style.display = 'none'; return; }
      const folgas = [];
      let cur = pf;
      for (let i = 0; i < 6; i++) {
        folgas.push(fmtDateFull(cur));
        cur = addDays(cur, esc === '5x1' ? 6 : 7);
      }
      preview.style.display = 'block';
      preview.textContent = 'Projeção: ' + folgas.join(' · ') + ' · …';
    }
  }, 50);
}

function abrirModalFerias(colab) {
  const html = `
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="font-size:12px;color:#374151;font-weight:500">${colab.nome}</div>
      <div style="display:flex;gap:8px">
        <div style="flex:1"><label style="${labelStyle()}">Início das férias</label>
          <input type="date" id="fer-inicio" value="${hojeIso()}" style="${selStyle()}">
        </div>
        <div style="flex:1"><label style="${labelStyle()}">Duração (dias corridos)</label>
          <input type="number" id="fer-dias" value="30" min="1" max="90" style="${selStyle()}">
        </div>
      </div>
      <div>
        <label style="${labelStyle()}">Venda de dias?</label>
        <select id="fer-venda" style="${selStyle()}">
          <option value="0">Não</option>
          <option value="10">Sim — vender 10 dias</option>
          <option value="custom">Sim — quantidade personalizada</option>
        </select>
      </div>
      <div id="fer-venda-custom-wrap" style="display:none">
        <label style="${labelStyle()}">Dias a vender</label>
        <input type="number" id="fer-venda-custom" value="10" min="1" max="30" style="${selStyle(120)}">
      </div>
      <div id="fer-preview" style="font-size:11px;background:#f0fdf4;border-radius:6px;padding:8px 10px;color:#15803d;display:none"></div>
    </div>
  `;
  abrirModal('Lançar férias', html, async () => {
    const inicio    = document.getElementById('fer-inicio').value;
    const dias      = parseInt(document.getElementById('fer-dias').value) || 30;
    const vendaOpt  = document.getElementById('fer-venda').value;
    const diasVenda = vendaOpt === 'custom'
      ? parseInt(document.getElementById('fer-venda-custom').value) || 0
      : parseInt(vendaOpt) || 0;
    const fim = addDays(inicio, dias - 1);
    await sbFetch('apt_ferias', {
      method: 'POST',
      body: JSON.stringify({ chapa: colab.cracha, nome: colab.nome, data_inicio: inicio, data_fim: fim, dias_totais: dias, dias_vendidos: diasVenda }),
    });
    fecharModal();
    carregarDadosCadastro();
  }, 'Salvar férias');

  setTimeout(() => {
    const inicioI = document.getElementById('fer-inicio');
    const diasI   = document.getElementById('fer-dias');
    const vendaI  = document.getElementById('fer-venda');
    const customW = document.getElementById('fer-venda-custom-wrap');
    const preview = document.getElementById('fer-preview');

    vendaI.addEventListener('change', () => { customW.style.display = vendaI.value === 'custom' ? 'block' : 'none'; atualizarPreview(); });
    inicioI.addEventListener('change', atualizarPreview);
    diasI.addEventListener('input', atualizarPreview);

    function atualizarPreview() {
      const ini = inicioI.value; const d = parseInt(diasI.value) || 30;
      if (!ini) return;
      const fim = addDays(ini, d - 1);
      preview.style.display = 'block';
      preview.textContent = `Férias de ${fmtDateFull(ini)} até ${fmtDateFull(fim)} (${d} dias)`;
    }
    atualizarPreview();
  }, 50);
}

function renderAbaJustificativas() {
  const todos = [...state.justificativas].sort((a,b) => b.data_inicio < a.data_inicio ? 1 : -1);
  document.getElementById('cad-content').innerHTML = `
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead><tr>${['Data','Colaborador','Tipo','Tratativa','Obs.','Registrado por','Ações'].map(h=>`<th style="text-align:left;padding:5px 8px;border-bottom:1px solid #e5e7eb;font-size:10px;color:#6b7280">${h}</th>`).join('')}</tr></thead>
        <tbody>
          ${todos.length === 0
            ? `<tr><td colspan="7" style="padding:24px;text-align:center;color:#9ca3af">Nenhuma justificativa registrada.</td></tr>`
            : todos.map(j => `<tr style="border-bottom:1px solid #f9fafb">
                <td style="padding:5px 8px;white-space:nowrap">${fmtDate(j.data_inicio)}${j.data_fim !== j.data_inicio ? ' – '+fmtDate(j.data_fim) : ''}</td>
                <td style="padding:5px 8px">${j.nome||j.chapa}</td>
                <td style="padding:5px 8px"><span style="background:${j.tipo==='Ausência de apontamento'?'#fef2f2':'#e1f5ee'};color:${j.tipo==='Ausência de apontamento'?'#b91c1c':'#0f6e56'};font-size:10px;padding:2px 7px;border-radius:10px">${j.tipo}</span></td>
                <td style="padding:5px 8px;font-size:10px">${j.tratativa||'—'}</td>
                <td style="padding:5px 8px;font-size:10px;color:#6b7280">${j.obs||'—'}</td>
                <td style="padding:5px 8px;font-size:10px;color:#9ca3af">${j.created_by||'—'}</td>
                <td style="padding:5px 8px"><button class="just-btn-editar" data-id="${j.id}" style="${btnStyle('icon')}"><i class="ti ti-pencil" aria-hidden="true"></i></button></td>
              </tr>`).join('')
          }
        </tbody>
      </table>
    </div>
  `;
}

async function importarDaBase() {
  try {
    // Buscar chapas + nomes distintos dos apontamentos
    const apts = await sbFetch('apontamentos?select=chapa,nome&order=nome.asc');
    const mapa = {};
    apts.forEach(a => { if (a.chapa && !mapa[a.chapa]) mapa[a.chapa] = a.nome; });
    const novos = Object.entries(mapa).filter(([ch]) =>
      !state.colaboradores.find(c => String(c.cracha) === String(ch))
    );
    if (novos.length === 0) { alert('Todos os colaboradores da base já estão cadastrados.'); return; }
    if (!confirm(`Importar ${novos.length} colaboradores novos da base de apontamentos?`)) return;
    await sbFetch('apt_colaboradores', {
      method: 'POST',
      body: JSON.stringify(novos.map(([ch, nome]) => ({ cracha: ch, nome }))),
    });
    await carregarDadosCadastro();
    alert(`${novos.length} colaboradores importados. Complete modalidade e escala de cada um.`);
  } catch(e) { alert('Erro ao importar: ' + e.message); }
}

function abrirModalEspecialidades() {
  const html = `
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="overflow-x:auto;max-height:200px">
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead><tr><th style="text-align:left;padding:4px 8px;border-bottom:1px solid #e5e7eb;font-size:10px;color:#6b7280">Especialidade</th><th style="width:40px"></th></tr></thead>
          <tbody id="esp-lista">
            ${state.especialidades.map(e => `<tr style="border-bottom:1px solid #f9fafb">
              <td style="padding:5px 8px">${e.nome}</td>
              <td><button class="esp-del" data-id="${e.id}" style="${btnStyle('icon','xs')}"><i class="ti ti-trash" style="color:#ef4444" aria-hidden="true"></i></button></td>
            </tr>`).join('') || `<tr><td colspan="2" style="padding:12px;text-align:center;color:#9ca3af;font-size:11px">Nenhuma especialidade cadastrada.</td></tr>`}
          </tbody>
        </table>
      </div>
      <div style="display:flex;gap:8px">
        <input type="text" id="esp-nova" placeholder="Nova especialidade…" style="${selStyle()};flex:1">
        <button id="esp-btn-add" style="${btnStyle('primary')}"><i class="ti ti-plus" aria-hidden="true"></i> Adicionar</button>
      </div>
    </div>
  `;
  abrirModal('Gerenciar especialidades', html, null, null);
  setTimeout(() => {
    document.getElementById('esp-btn-add').addEventListener('click', async () => {
      const nome = document.getElementById('esp-nova').value.trim();
      if (!nome) return;
      await sbFetch('apt_especialidades', { method: 'POST', body: JSON.stringify({ nome }) });
      const atualizado = await sbFetch('apt_especialidades?order=nome.asc');
      state.especialidades = atualizado;
      document.getElementById('esp-nova').value = '';
      document.getElementById('esp-lista').innerHTML = atualizado.map(e => `<tr style="border-bottom:1px solid #f9fafb">
        <td style="padding:5px 8px">${e.nome}</td>
        <td><button class="esp-del" data-id="${e.id}" style="${btnStyle('icon','xs')}"><i class="ti ti-trash" style="color:#ef4444" aria-hidden="true"></i></button></td>
      </tr>`).join('') || `<tr><td colspan="2" style="padding:12px;text-align:center;color:#9ca3af;font-size:11px">Nenhuma especialidade cadastrada.</td></tr>`;
    });
    document.querySelectorAll('.esp-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Remover especialidade?')) return;
        await sbFetch(`apt_especialidades?id=eq.${btn.dataset.id}`, { method: 'DELETE' });
        btn.closest('tr').remove();
      });
    });
  }, 50);
}

/* ═══════════════════════════════════════════════════════════════
   MODAL GENÉRICO
   ═══════════════════════════════════════════════════════════════ */
function abrirModal(titulo, html, onConfirm = null, btnLabel = 'Confirmar') {
  fecharModal();
  const overlay = document.createElement('div');
  overlay.id = 'apt-modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:12px;padding:24px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.2)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div style="font-size:14px;font-weight:600;color:#111827">${titulo}</div>
        <button id="apt-modal-close" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:18px;padding:2px;display:flex;align-items:center"><i class="ti ti-x" aria-hidden="true"></i></button>
      </div>
      <div id="apt-modal-body">${html}</div>
      ${onConfirm ? `
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:20px;padding-top:16px;border-top:1px solid #f3f4f6">
          <button id="apt-modal-cancel" style="${btnStyle('ghost')}">Cancelar</button>
          <button id="apt-modal-confirm" style="${btnStyle('primary')}">${btnLabel}</button>
        </div>` : ''}
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('apt-modal-close').addEventListener('click', fecharModal);
  document.getElementById('apt-modal-cancel')?.addEventListener('click', fecharModal);
  document.getElementById('apt-modal-confirm')?.addEventListener('click', onConfirm);
  overlay.addEventListener('click', e => { if (e.target === overlay) fecharModal(); });
}

function fecharModal() {
  document.getElementById('apt-modal-overlay')?.remove();
}

/* ═══════════════════════════════════════════════════════════════
   UTILITÁRIOS DE ESTILO
   ═══════════════════════════════════════════════════════════════ */
function selStyle(w) { return `height:32px;border:1px solid #d1d5db;border-radius:6px;background:#f9fafb;padding:0 8px;font-size:11px;color:#374151;outline:none;${w?'width:'+w+'px':'width:100%'}`; }
function btnStyle(tipo, size='sm') {
  const h  = size==='xs' ? '26px' : '32px';
  const px = size==='xs' ? '8px'  : '12px';
  const fs = size==='xs' ? '11px' : '11px';
  if (tipo==='primary') return `height:${h};padding:0 ${px};background:#2563eb;color:#fff;border:none;border-radius:6px;font-size:${fs};font-weight:500;cursor:pointer;display:inline-flex;align-items:center;gap:5px`;
  if (tipo==='icon')    return `width:${h};height:${h};padding:0;background:#fff;border:1px solid #e5e7eb;border-radius:6px;font-size:14px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;color:#6b7280`;
  return `height:${h};padding:0 ${px};background:#fff;color:#374151;border:1px solid #e5e7eb;border-radius:6px;font-size:${fs};cursor:pointer;display:inline-flex;align-items:center;gap:5px`;
}
function labelStyle() { return 'font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:4px'; }
function tabStyle(ativo) { return `padding:7px 16px;font-size:11px;font-weight:500;cursor:pointer;border-bottom:2px solid ${ativo?'#2563eb':'transparent'};color:${ativo?'#2563eb':'#6b7280'}`; }
function cardStyle() { return 'background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px'; }
function metricCard(label, val, sub, cor) {
  return `<div style="${cardStyle()}">
    <div style="font-size:11px;color:#6b7280">${label}</div>
    <div style="font-size:24px;font-weight:600;color:${cor};margin:4px 0">${val}</div>
    <div style="font-size:10px;color:#9ca3af">${sub}</div>
  </div>`;
}

/* ═══════════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════════ */
async function init() {
  // Pré-carregar colaboradores para busca nos filtros
  try {
    state.colaboradores = await sbFetch('apt_colaboradores?order=nome.asc');
  } catch(e) {
    state.colaboradores = [];
  }
  render();
}

// Registrar módulo
if (!window.Modulos) window.Modulos = {};
window.Modulos['apontamentos'] = { init };
init();

})();
