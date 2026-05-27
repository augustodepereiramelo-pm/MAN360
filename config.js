/* ═══════════════════════════════════════════════════════
   MAN360 — Configuração Central
   Para migrar de hospedagem: altere apenas este arquivo.
   ═══════════════════════════════════════════════════════ */

const MAN360_CONFIG = {
  supabase: {
    url: 'https://gwejwvsmmogzdpgyaggf.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3ZWp3dnNtbW9nemRwZ3lhZ2dmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTU0NjIsImV4cCI6MjA5NTEzMTQ2Mn0.HgsOjYyHTOiCtjblADpCcwi7SNkK17jjMTdG4Z7H8Uc',
  },

  /* Navegação lateral
     status: 'active' → módulo navegável
     status: 'wip'    → exibe "Em construção" e desabilita o clique
     module: caminho do .js dentro de modules/ (só para active) */
  nav: [
    {
      group: 'Execução',
      icon: 'tool',
      items: [
        { label: 'Ordens de Serviço',        page: 'ordens_servico',    icon: 'clipboard-list',   status: 'wip' },
        { label: 'Apontamentos',             page: 'apontamentos',      icon: 'clock-record',      status: 'active' },
      ],
    },
    {
      group: 'Planejamento',
      icon: 'calendar-stats',
      items: [
        { label: 'Programação Semanal',      page: 'prog_semanal',      icon: 'calendar-stats',    status: 'active' },
        { label: 'Serviços Programados',     page: 'servicos_prog',     icon: 'list-check',        status: 'wip' },
        { label: 'Solicitações de Material', page: 'sol_material',      icon: 'package',           status: 'wip' },
      ],
    },
    {
      group: 'Gestão de Pessoas',
      icon: 'users',
      items: [
        { label: 'Treinamentos Normativos',  page: 'treinamentos',      icon: 'certificate',       status: 'wip' },
        { label: 'Férias e Ausências',       page: 'ferias_ausencias',  icon: 'beach',             status: 'wip' },
        { label: 'Espelho de Ponto',         page: 'espelho_ponto',     icon: 'clock',             status: 'wip' },
        { label: 'Cadastros',                page: 'cadastros',         icon: 'user-plus',         status: 'wip' },
      ],
    },
    {
      group: 'Serviços Externos',
      icon: 'building-factory',
      items: [
        { label: 'Contratos',                page: 'contratos',         icon: 'file-text',         status: 'wip' },
        { label: 'Medições',                 page: 'medicoes',          icon: 'ruler-measure',     status: 'wip' },
        { label: 'Manutenção de Equipamentos', page: 'manut_equip',     icon: 'settings',          status: 'wip' },
      ],
    },
    {
      group: 'Confiabilidade',
      icon: 'chart-line',
      items: [
        { label: 'Análise de Óleo',          page: 'analise_oleo',      icon: 'droplet',           status: 'wip' },
        { label: 'Análise de Vibração',      page: 'analise_vibracao',  icon: 'activity',          status: 'wip' },
        { label: 'Inspeções',                page: 'inspecoes',         icon: 'eye',               status: 'wip' },
      ],
    },
  ],

  /* Equipes ativas no sistema (usadas nos filtros) */
  equipes: ['MEC1', 'CAL1', 'CAL2', 'CAL3', 'CIV1', 'ELE1', 'INS1', 'AUT1', 'ISP1', 'ISP2'],

  /* Cores institucionais */
  cores: {
    amarelo:    '#F8C100',
    vermelho:   '#C8102E',
    cinzaEscuro:'#2e2e2e',
  },
};
