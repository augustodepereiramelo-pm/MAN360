/* ═══════════════════════════════════════════════════════
   MAN360 — Configuração Central
   ═══════════════════════════════════════════════════════ */

const MAN360_CONFIG = {
  supabase: {
    url: 'https://gwejwvsmmogzdpgyaggf.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3ZWp3dnNtbW9nemRwZ3lhZ2dmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTU0NjIsImV4cCI6MjA5NTEzMTQ2Mn0.HgsOjYyHTOiCtjblADpCcwi7SNkK17jjMTdG4Z7H8Uc',
  },

  /*
    Estrutura de navegação:
    - grupo: label do grupo pai (nível 1)
    - subgrupo: label do subgrupo (nível 2, opcional — expande dentro do grupo)
    - items: módulos folha (nível 2 ou 3)

    status: 'active' = navegável | 'wip' = Em construção
    module: caminho do JS (só para active)
  */
  nav: [
    {
      group: 'Ordens de Serviço',
      icon: 'clipboard-list',
      items: [
        { label: 'Carteiras de Serviço', page: 'carteiras',    icon: 'folders',       status: 'wip' },
        { label: 'Apontamentos',         page: 'apontamentos', icon: 'clock-record',  status: 'active', module: 'modules/apontamentos.js' },
      ],
    },
    {
      group: 'Planejamento',
      icon: 'calendar-stats',
      items: [
        { label: 'Programação Semanal', page: 'prog_semanal', icon: 'calendar-week', status: 'active', module: 'modules/prog_semanal.js' },
      ],
      subgroups: [
        {
          label: 'Caldeiraria',
          icon: 'flame',
          items: [
            { label: 'Acompanhamento Serviços', page: 'cal_acomp',   icon: 'chart-bar',    status: 'wip' },
            { label: 'Backlog Caldeiraria',     page: 'cal_backlog', icon: 'list-details', status: 'wip' },
          ],
        },
        {
          label: 'Mecânica',
          icon: 'tool',
          items: [
            { label: 'Acompanhamento Serviços', page: 'mec_acomp',   icon: 'chart-bar',    status: 'wip' },
            { label: 'Backlog Mecânica',        page: 'mec_backlog', icon: 'list-details', status: 'wip' },
          ],
        },
        {
          label: 'Lubrificação',
          icon: 'droplet',
          items: [
            { label: 'Aderência das Rotas',    page: 'lub_rotas',   icon: 'route',        status: 'wip' },
            { label: 'Consumo Lubrificante',   page: 'lub_consumo', icon: 'chart-line',   status: 'wip' },
          ],
        },
      ],
    },
    {
      group: 'Externo',
      icon: 'building-factory',
      items: [
        { label: 'Equipamentos em Manutenção', page: 'ext_equip',    icon: 'settings',      status: 'wip' },
        { label: 'Reparo Componentes',         page: 'ext_reparo',   icon: 'hammer',        status: 'wip' },
        { label: 'Locações',                   page: 'ext_locacoes', icon: 'truck',         status: 'wip' },
      ],
    },
    {
      group: 'Confiabilidade',
      icon: 'chart-line',
      items: [
        { label: 'Análise de Vibração', page: 'conf_vibracao', icon: 'activity',  status: 'wip' },
        { label: 'Análise de Óleo',    page: 'conf_oleo',     icon: 'droplet',   status: 'wip' },
      ],
    },
    {
      group: 'Equipamentos',
      icon: 'engine',
      items: [
        { label: 'Fichas Técnicas', page: 'equip_fichas',   icon: 'file-description', status: 'wip' },
        { label: 'Pré-cadastro',   page: 'equip_precad',   icon: 'forms',            status: 'wip' },
      ],
    },
  ],

  equipes: ['MEC1','CAL1','CAL2','CAL3','CIV1','ELE1','INS1','AUT1','ISP1','ISP2'],

  cores: {
    amarelo:     '#F8C100',
    vermelho:    '#C8102E',
    cinzaEscuro: '#2e2e2e',
  },
};
