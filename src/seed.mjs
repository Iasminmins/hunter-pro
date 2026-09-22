export const seed = {
  windows: [
    { window:'13M', trades:'612', hit:'32,8%', pf:'1,99', result:'+$17.460' },
    { window:'6M', trades:'302', hit:'34,1%', pf:'2,06', result:'+$8.940' },
    { window:'3M', trades:'168', hit:'34,5%', pf:'2,08', result:'+$4.210' },
    { window:'1M', trades:'58', hit:'32,76%', pf:'1,99', result:'+$1.746' }
  ],
  monthly: [320,640,390,890,520,760,1050,560,830,660,980,700,1100],
  filters: [
    ['F2','1.248','312','18','74','126','+38,4R','ATIVO'],
    ['F4','986','205','12','61','98','+29,1R','ATIVO'],
    ['F6','744','177','9','48','82','+24,7R','ATIVO'],
    ['F7','128','84','3','11','19','+8,6R','OBSERVAÇÃO'],
    ['RG3','164','52','11','31','18','-4,8R','REVISÃO']
  ],
  clusters: [
    ['RG6-A','Direta · BUY · 08:00–08:59 · Gap TINY','46','19','23','4','+9,8R','AMOSTRA PEQUENA'],
    ['RG7-A','Absorção · ENTRY MARKET · 10:00–10:59','118','48','61','9','+4,1R','OVERLAP ALTO']
  ],
  snapshots: [
    { version:'Hunter HSG V21.2 · RG4', date:'11/09/2026', range:'Ago/2025 → Ago/2026', oos:'—', status:'BASE HISTÓRICA' },
    { version:'Hunter HSG V24 · RG5-A', date:'16/09/2026', range:'Ago/2025 → Ago/2026', oos:'Set/2026 em diante', status:'AGUARDANDO OOS' }
  ]
};
