/* ═══════════════════════════════════════════════════════
   MAN360 — Parsers de Planilhas
   Detecta tipo de arquivo e converte para objetos limpos.
   ═══════════════════════════════════════════════════════ */

/* ── Utilitários de normalização ─────────────────────── */

// Número de OS/crachá: sempre string sem zeros extras
// '000034488' → '34488' | 41724 (int) → '41724'
function normNum(v) {
  if (v == null || v === '') return null;
  const n = parseInt(String(v).replace(/[^\d]/g, ''));
  return isNaN(n) ? null : String(n);
}

// Remove acentos e normaliza para comparação
function normStr(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim();
}

// Data: aceita datetime objeto, string ISO, string DD/MM/YYYY
// Retorna 'YYYY-MM-DD' ou null
function normData(v) {
  if (!v) return null;
  if (v instanceof Date) {
    return v.toISOString().split('T')[0];
  }
  const s = String(v).trim();
  // ISO: 2026-05-22 00:00:00
  const mISO = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (mISO) return mISO[1];
  // BR: 22/05/2026
  const mBR = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (mBR) return `${mBR[3]}-${mBR[2]}-${mBR[1]}`;
  return null;
}

// Hora: limpa e valida HH:MM
function normHora(v) {
  if (!v) return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : null;
}

// Extrai código de serviço do início da descrição: "1-TEXTO" → '1'
// Retorna { cod: '1', desc: 'TEXTO' } ou { cod: null, desc: 'TEXTO' }
function extrairCodServico(descRaw) {
  const s = String(descRaw || '').trim();
  const m = s.match(/^(\d+)\s*-\s*(.+)$/);
  if (m) return { cod: m[1], desc: m[2].trim() };
  return { cod: null, desc: s };
}

// Encontrar índice de coluna tolerante a acentos e variações
function colIdx(hdr, ...nomes) {
  const normHdr = hdr.map(normStr);
  for (const nome of nomes) {
    const n = normStr(nome);
    const i = normHdr.findIndex(h => h === n);
    if (i >= 0) return i;
  }
  // Busca parcial como fallback
  for (const nome of nomes) {
    const n = normStr(nome);
    const i = normHdr.findIndex(h => h.includes(n) || n.includes(h.slice(0, 5)));
    if (i >= 0) return i;
  }
  return -1;
}

/* ── Detecção automática de tipo ─────────────────────── */
function detectarTipo(filename, rows) {
  const nome = filename.toLowerCase();
  const flat = rows ? rows.slice(0, 12).flat().map(c => normStr(String(c || ''))) : [];
  const texto = flat.join(' ');

  if (
    flat.some(c => c.includes('h-h (hr:mi)')) ||
    texto.includes('prog.semanal') ||
    texto.includes('plano de execu') ||
    (flat.some(c => c.includes('equipe:')) && flat.some(c => c.includes('disponivel'))) ||
    nome.includes('progsem') || nome.includes('prog_sem') ||
    nome.includes('programacao') || nome.includes('programaçao') || nome.includes('programação')
  ) return 'progsem';

  if (
    flat.some(c => c === 'o.s.' || c === 'os') &&
    flat.some(c => c.includes('codigo') && c.includes('servi'))
  ) return 'os';
  if (nome.includes('bdd_os') || nome.includes('os_cal') ||
      nome.includes('os_mec') || nome.includes('os_civ') || nome.includes('os_ele'))
    return 'os';

  if (
    flat.some(c => c.includes('hr.in') || c.includes('hr.fim') || c.includes('hr.total')) ||
    texto.includes('apontamento de mao') || nome.includes('apontamento')
  ) return 'apontamento';

  if (
    flat.some(c => c === 'pre-os' || c.startsWith('pre-os')) ||
    (flat.some(c => c.includes('situac')) && flat.some(c => c.includes('pre'))) ||
    nome.includes('preos') || nome.includes('pre_os') || nome.includes('pre-os')
  ) return 'preos';

  return 'desconhecido';
}

/* ══════════════════════════════════════════════════════
   PARSER: ORDENS DE SERVIÇO
   ══════════════════════════════════════════════════════ */
function parseOS(rows) {
  const registros = [];
  if (!rows.length) return registros;

  // Cabeçalho: primeira linha com 'O.S.' ou 'OS'
  let hdrIdx = rows.findIndex(r =>
    r.some(c => normStr(c) === 'o.s.' || normStr(c) === 'os')
  );
  if (hdrIdx < 0) hdrIdx = 0;
  const hdr = rows[hdrIdx].map(c => String(c || ''));

  const g = (i, row) => (i >= 0 && i < row.length) ? String(row[i] || '').trim() : '';

  const iOS       = colIdx(hdr, 'O.S.', 'OS');
  const iCod      = colIdx(hdr, 'Codigo Serviço', 'Código Serviço', 'Cod Servico');
  const iTipo     = colIdx(hdr, 'Tipo Ativ.', 'Tipo Atividade', 'Tipo Ativ');
  const iDescOS   = colIdx(hdr, 'Descrição OS', 'Descricao OS', 'Desc OS');
  const iDescServ = colIdx(hdr, 'Descrição Serviço', 'Descricao Servico', 'Desc Servico');
  const iDCom     = colIdx(hdr, 'Data Comunic.', 'Data Comunicacao', 'Data Comunic');
  const iHCom     = colIdx(hdr, 'Hora Comunic.', 'Hora Comunicacao', 'Hora Comunic');
  const iDGer     = colIdx(hdr, 'Data Geração', 'Data Geracao', 'Data Ger');
  const iDEnc     = colIdx(hdr, 'Data Encerramento');
  const iDIni     = colIdx(hdr, 'Data Ínicio', 'Data Inicio');
  const iHIni     = colIdx(hdr, 'Hora Ínicio.', 'Hora Inicio');
  const iDFim     = colIdx(hdr, 'Data Fim');
  const iHFim     = colIdx(hdr, 'Hora Fim');
  const iDDes     = colIdx(hdr, 'Data Desejada');
  const iEquipe   = colIdx(hdr, 'Equipe');
  const iModal    = colIdx(hdr, 'Modalidade');
  const iMis      = colIdx(hdr, 'Mis', 'MIS');
  const iDescMis  = colIdx(hdr, 'Descrição MIS', 'Descricao MIS');
  const iEquip    = colIdx(hdr, 'Equipamento');
  const iDescEq   = colIdx(hdr, 'Descrição Equipamento');
  const iSetor    = colIdx(hdr, 'Setor');
  const iDescSet  = colIdx(hdr, 'Descrição Setor');
  const iTag      = colIdx(hdr, 'TAG');
  const iSafra    = colIdx(hdr, 'Safra');
  const iHhPrevS  = colIdx(hdr, 'Hh Prev. Serviço (Decimal)', 'Hh Prev. Servico');
  const iHhRealS  = colIdx(hdr, 'Hh Real Serviço (Decimal)', 'Hh Real Servico');
  const iStatusOS = colIdx(hdr, 'Status OS');
  const iStatusS  = colIdx(hdr, 'Status Serviço', 'Status Servico');
  const iCracha   = colIdx(hdr, 'Cracha', 'Crachá');
  const iNome     = colIdx(hdr, 'Nome');

  rows.slice(hdrIdx + 1).forEach(row => {
    const osRaw  = g(iOS, row);
    const os     = normNum(osRaw);
    if (!os || !/^\d{4,}$/.test(os)) return;

    const tipo   = g(iTipo, row) || null;
    const codRaw = g(iCod, row);
    // MCU: cod_servico = null (nunca tem código válido além de '1' genérico)
    // Mas na OS, MCU também tem cod=1 — a distinção é pelo tipo
    // MCU: cod_servico='0' (nunca tem servico filho). Programavel: '1','2'...
    const cod = (tipo === 'MCU') ? '0' : (codRaw ? String(parseInt(codRaw) || codRaw) : '0');

    registros.push({
      os,
      cod_servico:         cod,
      tipo_atividade:      tipo,
      desc_os:             g(iDescOS, row).slice(0, 500) || null,
      desc_servico:        g(iDescServ, row).slice(0, 500) || null,
      data_comunicacao:    normData(row[iDCom]),
      hora_comunicacao:    normHora(row[iHCom]),
      data_geracao:        normData(row[iDGer]),
      data_encerramento:   normData(row[iDEnc]),
      data_inicio_exec:    normData(row[iDIni]),
      hora_inicio_exec:    normHora(row[iHIni]),
      data_fim_exec:       normData(row[iDFim]),
      hora_fim_exec:       normHora(row[iHFim]),
      data_desejada:       normData(row[iDDes]),
      equipe:              g(iEquipe, row).slice(0, 20) || null,
      modalidade:          g(iModal, row).slice(0, 20) || null,
      mis:                 g(iMis, row).slice(0, 20) || null,
      desc_mis:            g(iDescMis, row).slice(0, 100) || null,
      equipamento:         g(iEquip, row).slice(0, 30) || null,
      desc_equipamento:    g(iDescEq, row).slice(0, 150) || null,
      setor:               g(iSetor, row).slice(0, 20) || null,
      desc_setor:          g(iDescSet, row).slice(0, 100) || null,
      tag:                 g(iTag, row).slice(0, 50) || null,
      safra:               g(iSafra, row).slice(0, 10) || null,
      hh_prev_servico:     parseFloat(g(iHhPrevS, row)) || null,
      hh_real_servico:     parseFloat(g(iHhRealS, row)) || null,
      status_os:           g(iStatusOS, row).slice(0, 30) || null,
      status_servico:      g(iStatusS, row).slice(0, 30) || null,
      cracha:              normNum(row[iCracha]),
      nome:                g(iNome, row).slice(0, 100) || null,
    });
  });

  return registros;
}

/* ══════════════════════════════════════════════════════
   PARSER: PRÉ-ORDENS
   ══════════════════════════════════════════════════════ */
function parsePreOS(rows) {
  const registros = [];

  // Encontrar cabeçalho: linha onde a primeira célula normalizada = 'pre-os'
  let hdrIdx = rows.findIndex(r => normStr(r[0]) === 'pre-os');
  if (hdrIdx < 0) hdrIdx = rows.findIndex(r => r.some(c => normStr(c) === 'pre-os'));
  if (hdrIdx < 0) hdrIdx = 2; // fallback: linha 3

  const hdr = rows[hdrIdx].map(c => String(c || ''));
  const g = (i, row) => (i >= 0 && i < row.length) ? String(row[i] || '').trim() : '';

  const iPreOS  = colIdx(hdr, 'Pré-OS', 'Pre-OS', 'Pre OS');
  const iSit    = colIdx(hdr, 'Situação', 'Situacao', 'Situação');
  const iOS     = colIdx(hdr, 'OS');
  const iDCom   = colIdx(hdr, 'Data comunicação', 'Data comunicacao', 'Data Comunicacao');
  const iHCom   = colIdx(hdr, 'Hora comunicação', 'Hora comunicacao', 'Hora Comunicacao');
  const iDInc   = colIdx(hdr, 'Data inclusão', 'Data inclusao', 'Data Inclusao');
  const iHInc   = colIdx(hdr, 'Hora inclusão', 'Hora inclusao', 'Hora Inclusao');
  const iUser   = colIdx(hdr, 'Usuário', 'Usuario');
  const iCracha = colIdx(hdr, 'Crachá', 'Cracha');
  const iNome   = colIdx(hdr, 'Nome');
  const iDesc   = colIdx(hdr, 'Descrição Serviço', 'Descricao Servico', 'Descrição Serviço');
  const iMis    = colIdx(hdr, 'MIS', 'Mis');
  const iEquip  = colIdx(hdr, 'Equipamento');

  rows.slice(hdrIdx + 1).forEach(row => {
    // normNum garante que 7720 (int) ou '7720' viram '7720'
    const preOS = normNum(row[iPreOS >= 0 ? iPreOS : 0]);
    if (!preOS || !/^\d+$/.test(preOS)) return;

    const osRaw = g(iOS, row);
    const os    = normNum(osRaw);

    registros.push({
      pre_os:           preOS,
      situacao:         g(iSit, row) || null,
      os:               os || null,
      data_comunicacao: normData(row[iDCom]),
      hora_comunicacao: normHora(row[iHCom]),
      data_inclusao:    normData(row[iDInc]),
      hora_inclusao:    normHora(row[iHInc]),
      usuario:          g(iUser, row).slice(0, 50) || null,
      cracha:           normNum(row[iCracha]),
      nome:             g(iNome, row).slice(0, 100) || null,
      desc_servico:     g(iDesc, row).slice(0, 500) || null,
      mis:              g(iMis, row).slice(0, 20) || null,
      equipamento:      g(iEquip, row).slice(0, 30) || null,
    });
  });

  return registros;
}

/* ══════════════════════════════════════════════════════
   PARSER: PROGRAMAÇÃO SEMANAL (múltiplas abas)
   ══════════════════════════════════════════════════════ */
function parseProgSemanal(rows, wb, tabelaOS) {
  let todos = [];
  let ctx   = { semana: null, ano: null, dataIni: null, dataFim: null };

  if (wb && wb.SheetNames && wb.SheetNames.length > 1) {
    wb.SheetNames.forEach(sn => {
      const ws = wb.Sheets[sn];
      const r  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      const { registros, ...novoCtx } = _parseProgAba(r, ctx, tabelaOS);
      todos = todos.concat(registros);
      if (novoCtx.semana) ctx = { ...ctx, ...novoCtx };
    });
  } else {
    const { registros, ...novoCtx } = _parseProgAba(rows, ctx, tabelaOS);
    todos = registros;
    ctx   = { ...ctx, ...novoCtx };
  }

  return { registros: todos, ...ctx };
}

function _parseProgAba(rows, ctxIn, tabelaOS) {
  const registros  = [];
  let equipe       = '';
  let semana       = ctxIn.semana;
  let ano          = ctxIn.ano;
  let dataIni      = ctxIn.dataIni;
  let dataFim      = ctxIn.dataFim;

  // Cabeçalho: extrair semana e período das primeiras 10 linhas
  // Normalizar acentos para garantir que regex funcionem (Início -> Inicio, etc)
  const headerRaw  = rows.slice(0, 10).map(r => r.map(c => String(c || '')).join(' ')).join(' ');
  const headerText = headerRaw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // "SEM 9 25/05-31/05/26" ou "SEM 8 18/05-24/05/26"
  const mSem = headerText.match(/SEM\s*(\d+)\s+(\d{2})\/(\d{2})-(\d{2})\/(\d{2})\/(\d{2,4})/i)
            || headerText.match(/SEM\s*(\d+)/i);
  if (mSem && mSem[1]) semana = parseInt(mSem[1]);

  // "Inicio : 25/05/2026" ou "Inicio :  25/05/2026" (com espacos extras)
  const mIni = headerText.match(/Inicio\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
  const mFim = headerText.match(/Fim\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (mIni) { dataIni = normData(mIni[1]); ano = parseInt(mIni[1].split('/')[2]); }
  if (mFim)   dataFim = normData(mFim[1]);

  // Se tem o padrão compacto de data no cabeçalho
  if (mSem && mSem[6]) {
    const anoRaw = mSem[6];
    ano     = anoRaw.length === 2 ? 2000 + parseInt(anoRaw) : parseInt(anoRaw);
    dataIni = `${ano}-${mSem[3]}-${mSem[2]}`;
    dataFim = `${ano}-${mSem[5]}-${mSem[4]}`;
  }

  rows.forEach(row => {
    const cells = row.map(c => String(c || '').trim());

    // Linha de equipe
    if (normStr(cells[0]) === 'equipe:') {
      const src = cells[1] || cells.slice(1).join(' ');
      const mEq = src.match(/([A-Z0-9]{2,6})\s*[-–]\s*(.+)/i);
      if (mEq) equipe = mEq[1].trim();
      return;
    }

    // Linha de serviço: OS de 5+ dígitos
    const os = normNum(cells[0]);
    if (!os || !/^\d{5,}$/.test(os) || !equipe) return;

    const descBruta = cells[1] || '';
    const mis       = cells[2] || null;
    const hhRaw     = cells[5] || cells[4] || cells[3] || '';
    const hh        = parseFloat(String(hhRaw).replace(',', '.')) || null;

    // Datas de previsão: pode ser "18/05 07:00       19/05 12:00" (num col) ou em cols separadas
    const prevStr = cells[3] || '';
    let dataIniPrev = null, horaIniPrev = null, dataFimPrev = null, horaFimPrev = null;
    const mPrev = prevStr.match(/(\d{2}\/\d{2})\s+(\d{2}:\d{2})\s+(\d{2}\/\d{2})\s+(\d{2}:\d{2})/);
    if (mPrev && ano) {
      dataIniPrev = `${ano}-${mPrev[1].split('/')[1]}-${mPrev[1].split('/')[0]}`;
      horaIniPrev = mPrev[2];
      dataFimPrev = `${ano}-${mPrev[3].split('/')[1]}-${mPrev[3].split('/')[0]}`;
      horaFimPrev = mPrev[4];
    } else {
      // Colunas separadas (formato novo)
      const ini = cells[3]; const fim = cells[4];
      const mI = ini && ini.match(/(\d{2}\/\d{2})\s+(\d{2}:\d{2})/);
      const mF = fim && fim.match(/(\d{2}\/\d{2})\s+(\d{2}:\d{2})/);
      if (mI && ano) {
        dataIniPrev = `${ano}-${mI[1].split('/')[1]}-${mI[1].split('/')[0]}`;
        horaIniPrev = mI[2];
      }
      if (mF && ano) {
        dataFimPrev = `${ano}-${mF[1].split('/')[1]}-${mF[1].split('/')[0]}`;
        horaFimPrev = mF[2];
      }
    }

    // Resolver cod_servico cruzando com tabela de OS em memória
    let codServico = null;
    if (tabelaOS && tabelaOS[os]) {
      const candidatos = tabelaOS[os]; // array de { cod, desc }
      // Tentar match por início da descrição
      const descNorm = normStr(descBruta).slice(0, 20);
      const match    = candidatos.find(c => normStr(c.desc).startsWith(descNorm.slice(0, 15)));
      codServico     = match ? match.cod : (candidatos[0]?.cod || null);
    }

    if (!descBruta && !mis) return; // linha vazia

    registros.push({
      semana,
      ano,
      data_inicio_semana: dataIni,
      data_fim_semana:    dataFim,
      equipe,
      os,
      cod_servico:     codServico || '0',
      desc_servico:    descBruta.slice(0, 500) || null,
      mis:             mis ? mis.slice(0, 20) : null,
      hh_previsto:     hh,
      data_inicio_prev: dataIniPrev,
      hora_inicio_prev: horaIniPrev,
      data_fim_prev:    dataFimPrev,
      hora_fim_prev:    horaFimPrev,
    });
  });

  return { registros, semana, ano, dataIni, dataFim };
}

/* ══════════════════════════════════════════════════════
   PARSER: APONTAMENTOS
   Formato: pares de linhas dentro de blocos por funcionário
   Linha A: [Data, Tipo_TA, Hr_Ini, Hr_Fim, Hr_Total]
   Linha B: [OS,   Descrição_com_ou_sem_numeral]
   ══════════════════════════════════════════════════════ */
function parseApontamento(rows) {
  const registros = [];
  let chapa = '', nome = '';
  let dataAtual = null, tipoAtual = '', horaIni = '', horaFim = '', hhTotal = null;
  let pendente = false;

  rows.forEach(row => {
    const cells = row.map(c => String(c || '').trim());
    const c0 = cells[0] || '';

    // Linha de funcionário: "Funcionário:" na col 0
    if (normStr(c0).startsWith('funcion')) {
      const raw = cells[1] || '';
      const m   = raw.match(/^(\d+)\s*[-–]\s*(.+)$/);
      if (m) { chapa = String(parseInt(m[1])); nome = m[2].trim(); }
      pendente = false;
      return;
    }

    // Linha A: data DD/MM/YYYY na col 0
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(c0)) {
      dataAtual = normData(c0);
      tipoAtual = cells[1] || '';
      horaIni   = normHora(cells[2]) || '00:00';
      horaFim   = normHora(cells[3]) || '00:00';
      hhTotal   = parseFloat(String(cells[4] || '').replace(',', '.')) || null;
      pendente  = true;
      return;
    }

    // Linha B: OS de 5-6 dígitos na col 0
    if (pendente && /^\d{5,6}$/.test(c0)) {
      const os         = normNum(c0);
      const descRaw    = cells[1] || '';
      const { cod, desc } = extrairCodServico(descRaw);

      // MCU: sem numeral → cod = '0'. Programável: cod = '1','2'...
      const codFinal = (tipoAtual === 'MCU') ? '0' : (cod || '0');

      registros.push({
        os,
        cod_servico:     codFinal,
        data_apontamento: dataAtual,
        chapa,
        nome:            nome.slice(0, 100) || null,
        hora_inicio:     horaIni,
        hora_fim:        horaFim,
        hh_total:        hhTotal,
        tipo_atividade:  tipoAtual || null,
      });
      pendente = false;
    }
  });

  return registros;
}

/* ── Exportar para uso global ─────────────────────────── */
window.Parsers = {
  detectarTipo,
  parseOS,
  parsePreOS,
  parseProgSemanal,
  parseApontamento,
  // utilitários
  normNum, normStr, normData, normHora, extrairCodServico,
};
