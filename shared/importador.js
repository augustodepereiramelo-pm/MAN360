/* ═══════════════════════════════════════════════════════
   MAN360 — Importador
   Orquestra detecção, parsing e salvamento no banco.
   ═══════════════════════════════════════════════════════ */

/* ── Importar OS ──────────────────────────────────────── */
async function importarOS(rows) {
  const regs = Parsers.parseOS(rows);
  if (!regs.length) return { ok: false, msg: '0 OS encontradas no arquivo' };

  const mcu  = regs.filter(r => r.tipo_atividade === 'MCU');
  const prog = regs.filter(r => r.tipo_atividade !== 'MCU');

  const db = getDB();
  let total = 0;

  // MCU: delete + insert (partial index nao suporta upsert direto)
  if (mcu.length) {
    const osNums = mcu.map(r => r.os);
    // Apagar MCUs existentes com mesmo numero de OS
    await db.from('ordens_servico').delete().in('os', osNums).is('cod_servico', null);
    const { count, error } = await dbUpsert('ordens_servico', mcu, null);
    if (error) return { ok: false, msg: 'Erro MCU: ' + error.message };
    total += mcu.length;
  }

  // Programaveis: delete + insert pelo par os+cod_servico
  if (prog.length) {
    // Apagar registros existentes com mesmo os+cod_servico
    for (const r of prog) {
      await db.from('ordens_servico')
        .delete().eq('os', r.os).eq('cod_servico', r.cod_servico);
    }
    const { count, error } = await dbUpsert('ordens_servico', prog, null);
    if (error) return { ok: false, msg: 'Erro Prog: ' + error.message };
    total += prog.length;
  }

  return { ok: true, msg: 'OK . ' + total + ' OS (' + mcu.length + ' MCU + ' + prog.length + ' prog.)' };
}

/* ── Importar Pré-OS ──────────────────────────────────── */
async function importarPreOS(rows) {
  const regs = Parsers.parsePreOS(rows);
  if (!regs.length) return { ok: false, msg: '0 pré-OS encontradas no arquivo' };

  const { count, error } = await dbUpsert('pre_ordens', regs, 'pre_os');
  if (error) return { ok: false, msg: 'Erro: ' + error.message };

  return { ok: true, msg: `OK · ${count} pré-OS` };
}

/* ── Importar Programação Semanal ─────────────────────── */
async function importarProgSemanal(rows, wb) {
  // Carregar OS do banco para resolver cod_servico
  const db = getDB();
  const { data: osData } = await db
    .from('ordens_servico')
    .select('os, cod_servico, desc_servico')
    .not('cod_servico', 'is', null);

  // Montar mapa: { os: [{ cod, desc }, ...] }
  const tabelaOS = {};
  (osData || []).forEach(r => {
    if (!tabelaOS[r.os]) tabelaOS[r.os] = [];
    tabelaOS[r.os].push({ cod: r.cod_servico, desc: r.desc_servico || '' });
  });

  const { registros, semana, ano, dataIni, dataFim } = Parsers.parseProgSemanal(rows, wb, tabelaOS);
  if (!registros.length) return { ok: false, msg: '0 serviços encontrados' };

  if (!semana || !ano) return { ok: false, msg: 'Semana/ano não identificados no cabeçalho' };

  // Verificar duplicidade da semana
  const { count: jaExiste } = await dbCount('programacao_semanal', [
    ['semana', 'eq', semana], ['ano', 'eq', ano],
  ]);

  if (jaExiste > 0) {
    const ok = confirm(
      `Semana ${semana}/${ano} já está importada (${jaExiste} registros).\n` +
      `Deseja substituir pelos dados do arquivo?`
    );
    if (!ok) return { ok: false, msg: 'Importação cancelada pelo usuário' };
    await dbDelete('programacao_semanal', [['semana', semana], ['ano', ano]]);
  }

  // Inserir novos registros
  const { count, error } = await dbUpsert('programacao_semanal', registros, 'os,cod_servico,semana,ano');
  if (error) return { ok: false, msg: 'Erro ao salvar: ' + error.message };

  // Resolver cod_servico pendentes (OS ainda não importadas)
  const semResolucao = registros.filter(r => !r.cod_servico);
  const resolvidos   = registros.filter(r => r.cod_servico);

  return {
    ok: true,
    msg: `OK · ${count} serviços (Sem ${semana}/${ano}) · ${resolvidos.length} com cód.serviço resolvido · ${semResolucao.length} pendentes`,
    semana, ano,
    dataIni, dataFim,
  };
}

/* ── Importar Apontamentos ───────────────────────────── */
async function importarApontamento(rows) {
  const regs = Parsers.parseApontamento(rows);
  if (!regs.length) return { ok: false, msg: '0 apontamentos encontrados' };

  // Upsert com chave única: os + cod_servico + data + chapa + hora_inicio
  // cod_servico pode ser null → precisa tratar MCU separadamente
  const mcu  = regs.filter(r => r.cod_servico === null);
  const prog = regs.filter(r => r.cod_servico !== null);
  let total  = 0;

  // Apontamentos: upsert pela chave completa
  // MCU e prog usam a mesma constraint (cod_servico pode ser null na chave)
  const todos_apt = [...mcu, ...prog];
  const { count, error } = await dbUpsert('apontamentos', todos_apt, 'os,data_apontamento,chapa,hora_inicio');
  if (error) {
    // Fallback: insert ignorando duplicatas
    const db2 = getDB();
    for (const lote of [mcu, prog]) {
      if (!lote.length) continue;
      for (let i = 0; i < lote.length; i += 50) {
        await db2.from('apontamentos').upsert(lote.slice(i, i+50), { ignoreDuplicates: true });
      }
      total += lote.length;
    }
  } else {
    total = count;
  }

  return { ok: true, msg: `OK · ${total} apontamentos (${mcu.length} MCU + ${prog.length} prog.)` };
}

/* ── Orquestrador principal ──────────────────────────── */
async function processarArquivo(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const wb   = XLSX.read(ev.target.result, { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        const tipo = Parsers.detectarTipo(file.name, rows);

        let resultado;
        switch (tipo) {
          case 'os':
            resultado = await importarOS(rows);
            break;
          case 'preos':
            resultado = await importarPreOS(rows);
            break;
          case 'progsem':
            resultado = await importarProgSemanal(rows, wb);
            break;
          case 'apontamento':
            resultado = await importarApontamento(rows);
            break;
          default:
            resultado = { ok: false, msg: 'Tipo de arquivo não reconhecido' };
        }

        resolve({ tipo, ...resultado });
      } catch (err) {
        console.error('Erro ao processar arquivo:', err);
        resolve({ tipo: 'erro', ok: false, msg: 'Erro: ' + err.message });
      }
    };
    reader.readAsArrayBuffer(file);
  });
}
