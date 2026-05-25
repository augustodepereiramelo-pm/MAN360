/* ═══════════════════════════════════════════════════════
   MAN360 — Configuração Central
   Para migrar de hospedagem: altere apenas este arquivo.
   ═══════════════════════════════════════════════════════ */

const MAN360_CONFIG = {
  supabase: {
    url: 'https://gwejwvsmmogzdpgyaggf.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3ZWp3dnNtbW9nemRwZ3lhZ2dmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTU0NjIsImV4cCI6MjA5NTEzMTQ2Mn0.HgsOjYyHTOiCtjblADpCcwi7SNkK17jjMTdG4Z7H8Uc',
  },

  /* Navegação lateral — altere aqui para adicionar/remover módulos
     Cada grupo tem um label e uma lista de itens.
     page: nome do arquivo em /modules/ (sem .js)
     icon: ícone do Tabler Icons (sem o prefixo 'ti-') */
  nav: [
    {
      group: 'Planejamento e Programação',
      items: [
        { label: 'Programação Semanal', page: 'prog_semanal', icon: 'calendar-stats' },
        { label: 'Serviços Programados', page: 'servicos_programados', icon: 'list-check', disabled: true },
        { label: 'Solicitações de Materiais', page: 'solicitacoes_materiais', icon: 'package', disabled: true },
      ],
    },
    {
      group: 'Oficinas',
      items: [
        { label: 'Mecânica', page: 'mecanica', icon: 'tool', disabled: true },
        { label: 'Apontamentos', page: 'apontamentos', icon: 'clock-record', disabled: true },
      ],
    },
  ],

  /* Equipes ativas no sistema (usadas nos filtros) */
  equipes: ['MEC1', 'CAL1', 'CAL2', 'CAL3', 'CIV1'],

  /* Cores institucionais */
  cores: {
    amarelo: '#F8C100',
    vermelho: '#C8102E',
    cinzaEscuro: '#2e2e2e',
  },
};
