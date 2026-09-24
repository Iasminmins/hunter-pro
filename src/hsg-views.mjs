import { aggregateFilters, summarizeTrades, weightedRecentMonths } from './model.mjs';

const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const num = value => value == null || Number.isNaN(Number(value)) ? '—' : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
const tradesOf = state => state.months.flatMap(block => (block.trades || []).map(trade => ({ ...trade, blockMonth:block.month, blockYear:block.year })));
const filterCodes = trade => [...new Set(String(trade.filterHits || '').split(/[,|;+\s]+/).map(code => code.trim().toUpperCase()).filter(Boolean))];
function table(headers, rows) { return `<div class="table-scroll"><table><thead><tr>${headers.map((header, i) => `<th scope="col" ${i ? '' : 'class="first-col"'}>${header}</th>`).join('')}</tr></thead><tbody>${rows || ''}</tbody></table></div>`; }
function card(title, content, extra = '') { return `<section class="panel ${extra}"><div class="panel-heading"><h2>${title}</h2></div>${content}</section>`; }
function kpi(label, value, help) { return `<article class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-help">${help}</div></article>`; }
function empty(message, detail = '') { return `<div class="empty-state"><span class="empty-icon">↥</span><strong>${message}</strong>${detail ? `<p>${detail}</p>` : ''}</div>`; }
const fmtR = value => value == null ? '—' : `${Number(value) >= 0 ? '+' : ''}${num(value)}R`;
const fmtPF = value => value === Infinity ? '∞' : num(value);
const hasNumber = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const fmtUSD = value => hasNumber(value) ? new Intl.NumberFormat('pt-BR',{style:'currency',currency:'USD'}).format(Number(value)) : '—';
const summary = trades => trades.length ? summarizeTrades(trades) : null;
function payoff(trades=[]) {
  const wins=trades.map(trade=>Number(trade.resultR)||0).filter(value=>value>0);
  const losses=trades.map(trade=>Math.abs(Number(trade.resultR)||0)).filter(value=>value>0);
  if(!wins.length)return '—';
  if(!losses.length)return '∞';
  return num((wins.reduce((sum,value)=>sum+value,0)/wins.length)/(losses.reduce((sum,value)=>sum+value,0)/losses.length));
}

function renderGeneral(state) {
  const months = [...state.months].sort((a,b) => (a.year * 12 + a.month) - (b.year * 12 + b.month));
  const allTrades = tradesOf({months});
  const base = state.historicalBases.find(item => item.id === state.selectedHistoricalBaseId);
  const full = summary(base?.trades || allTrades);
  const hasOos = state.snapshots.some(s => s.developmentEnd && state.months.some(block => !(s.sourceBlockIds || []).includes(block.id) && `${block.year}-${String(block.month).padStart(2,'0')}` > s.developmentEnd && block.trades?.length));
  const windows = [
    ['Base histórica', base?.trades || []],
    ['Histórico mensal', allTrades],
    ['Últimos 6M', tradesOf({ months: months.slice(-6) })],
    ['Últimos 3M', tradesOf({ months: months.slice(-3) })],
    ['1M', tradesOf({ months: months.slice(-1) })]
  ].map(([label, trades]) => {
    const s = summary(trades);
    return `<tr><td><strong>${label}</strong></td><td>${s?.trades ?? '—'}</td><td>${s ? `${num(s.winRate * 100)}%` : '—'}</td><td>${s ? fmtPF(s.profitFactor) : '—'}</td><td>${s ? fmtR(s.totalR) : '—'}</td></tr>`;
  }).join('');
  const chartRows = months.slice(-13).map(block => `<div class="bar-item"><div class="bar ${block.summary.totalR < 0 ? 'negative' : ''}" style="--bar-height:${Math.max(6, Math.min(100, Math.abs(block.summary.totalR) * 8))}%" title="${monthNames[block.month-1]} ${block.year}: ${fmtR(block.summary.totalR)}"></div><span>${monthNames[block.month-1].slice(0,3)}</span></div>`).join('');
  const recent = weightedRecentMonths(state.months);
  const imported = state.months.length ? (() => {
    const total=summary(allTrades)||{trades:0,winRate:0,profitFactor:0,totalR:0,drawdown:0};
    const hasAllNetProfit=months.every(block=>hasNumber(block.ninjaSummary?.netProfit));
    const netProfit=hasAllNetProfit?months.reduce((sum,block)=>sum+Number(block.ninjaSummary.netProfit),0):null;
    const gridTrades=months.every(block=>hasNumber(block.ninjaRows))?months.reduce((sum,block)=>sum+Number(block.ninjaRows),0):null;
    const rows=months.slice().reverse().map(block=>`<tr><td><strong>${monthNames[block.month-1]} ${block.year}</strong></td><td>${esc(block.hunterVersion)}</td><td>${block.summary.trades}</td><td>${block.ninjaRows??'—'}</td><td>${fmtUSD(block.ninjaSummary?.netProfit)}</td><td>${hasNumber(block.ninjaSummary?.maxDrawdown)?fmtUSD(Math.abs(Number(block.ninjaSummary.maxDrawdown))):'—'}</td><td>${fmtR(block.summary.drawdown)}</td><td>${payoff(block.trades)}</td><td>${num(block.summary.winRate*100)}%</td><td>${fmtPF(block.summary.profitFactor)}</td><td>${fmtR(block.summary.totalR)}</td><td>Importado</td></tr>`).join('');
    const totalRow=`<tr class="operational-total"><td><strong>TOTAL</strong></td><td>${months.length} meses</td><td>${total.trades}</td><td>${gridTrades??'—'}</td><td>${netProfit==null?`— (${months.filter(block=>hasNumber(block.ninjaSummary?.netProfit)).length}/${months.length} meses com lucro $)` : fmtUSD(netProfit)}</td><td>—</td><td>${fmtR(total.drawdown)}</td><td>${payoff(allTrades)}</td><td>${num(total.winRate*100)}%</td><td>${fmtPF(total.profitFactor)}</td><td>${fmtR(total.totalR)}</td><td>Consolidado</td></tr>`;
    return `${table(['Mês','Versão','HSG trades','Grid trades','Lucro líquido ($)','DD do Grid ($)','DD operacional (R)','Payoff','Acerto','PF','Resultado (R)','Status'],`${rows}${totalRow}`)}<p class="table-hint operational-hint">Lucro líquido e DD do Grid em $ vêm dos resumos NinjaTrader importados. DD operacional em R, payoff, acerto, PF e resultado em R são calculados dos trades HSG. Payoff = ganho médio dividido pela perda média; PF = ganho bruto dividido pela perda bruta. O DD total em R percorre os meses em ordem cronológica; DDs mensais em $ não são somados. Se o relatório já importado não continha DD em $, reimporte-o para preencher essa coluna.</p>`;
  })() : empty('Nenhum fechamento mensal importado.','Adicione um mês na seção Meses.');
  const health = allTrades.length ? 'DADOS IMPORTADOS · AUDITORIA PENDENTE' : 'AGUARDANDO IMPORTAÇÃO';
  return `<div class="kpi-grid">${kpi('Trades analisados',full?.trades ?? '—',full ? `${base ? 'base histórica selecionada' : 'fechamentos operacionais'}` : 'Sem dados importados')}${kpi('Acerto',full ? `${num(full.winRate*100)}%` : '—',full ? 'resultado observado no HSG CSV' : 'Sem dados importados')}${kpi('Profit Factor',full ? fmtPF(full.profitFactor) : '—',full ? 'resultado observado no HSG CSV' : 'Sem dados importados')}${kpi('Drawdown máximo',full ? fmtR(full.drawdown) : '—',full ? 'equity em R na ordem do arquivo' : 'Sem dados importados')}</div><div class="comparison-grid">${card('Histórico × janelas móveis',windows ? table(['Janela','Trades','Acerto','PF','Resultado'],windows) : empty('Sem dados suficientes.'))}${card('Evolução mensal',months.length ? `<div class="chart"><div class="bars">${chartRows}</div></div>` : empty('Sem dados para o gráfico.'))}</div>${card('Leitura rápida',`<dl class="quick-list"><div><dt>Estado</dt><dd>${health}</dd></div><div><dt>Regime recente</dt><dd>${recent.months.length ? `${recent.trades} trades · ${fmtR(recent.totalR)} · pesos 50% / 30% / 20% normalizados para os meses existentes.` : 'Pendente · importe fechamentos mensais.'}</dd></div><div><dt>OOS / Forward</dt><dd>${hasOos ? 'Há comparações disponíveis na seção Versões.' : 'Pendente · requer uma versão congelada e fechamentos posteriores.'}</dd></div></dl>`)}${card('Placar de saúde do HSG',`<span class="badge warning panel-badge">${health}</span><div class="health-grid"><div><span>Dados</span><strong>${allTrades.length ? 'IMPORTADOS' : 'PENDENTE'}</strong></div><div><span>Regime</span><strong>PENDENTE</strong></div><div><span>Núcleo F2/F4/F6/F7</span><strong>AUDITORIA PENDENTE</strong></div><div><span>OOS / Forward</span><strong>${hasOos ? 'DISPONÍVEL' : 'PENDENTE'}</strong></div></div><p class="health-note">Dados importados não representam aprovação automática dos filtros ou do sistema.</p>`)}${card('Fechamentos operacionais',imported)}`;
}

function renderMonths(state) {
  const currentYear=new Date().getFullYear();
  const years = [...new Set([currentYear,currentYear-1,state.selectedMonthYear,...state.months.map(m => m.year)].filter(Boolean))].sort((a,b) => b-a);
  const year = Number(state.selectedMonthYear) || years[0];
  const yearTabs=[...new Set([year,currentYear-1,currentYear])].sort((a,b)=>a-b);
  const recent = weightedRecentMonths(state.months);
  const cards = monthNames.map((name,index) => {
    const block = state.months.find(item => item.month === index+1 && item.year === year);
    const profit=block?.ninjaSummary?.netProfit,gridDrawdown=block?.ninjaSummary?.maxDrawdown;
    return `<article class="month-card ${block ? 'has-data' : ''}"><span>${name}</span>${block ? `<strong>${block.summary.trades} trades · ${fmtR(block.summary.totalR)}</strong><div class="month-financials"><small>Faturado líquido: <b>${fmtUSD(profit)}</b></small><small>Drawdown: <b>${fmtR(block.summary.drawdown)}</b>${hasNumber(gridDrawdown)?` <span>· Grid ${fmtUSD(Math.abs(Number(gridDrawdown)))}</span>`:''}</small></div><small>${esc(block.hunterVersion)} · ${block.revision ? `rev. ${block.revision}` : 'importado'}</small>` : '<small>Sem dados</small>'}<div class="month-card-actions"><button class="button ${block ? 'secondary' : 'primary'}" data-action="create-month" data-month="${index+1}" data-year="${year}">${block ? 'Atualizar mês' : `Importar ${name}`}</button>${block?`<button class="button danger-quiet" data-action="delete-month" data-id="${esc(block.id)}" aria-label="Excluir ${name} ${year}">Excluir</button>`:''}</div></article>`;
  }).join('');
  return `<section class="panel"><div class="panel-heading"><div><h2>Regime recente ponderado</h2><p class="panel-description">Até três fechamentos mais recentes · pesos 50%, 30% e 20%, normalizados se faltarem meses.</p></div></div>${recent.months.length ? table(['Mês','Peso','Trades','Acerto','PF','Resultado'],recent.weightsUsed.map(item => { const block=recent.months.find(m => m.month===item.month&&m.year===item.year); return `<tr><td>${monthNames[item.month-1]} ${item.year}</td><td>${num(item.weight*100)}%</td><td>${block.summary.trades}</td><td>${num(block.summary.winRate*100)}%</td><td>${fmtPF(block.summary.profitFactor)}</td><td>${fmtR(block.summary.totalR)}</td></tr>`; }).join('')) : empty('Nenhum mês importado.','O regime será calculado após os fechamentos.')}</section><section class="panel"><div class="panel-heading"><div><h2>Calendário de ${year}</h2><p class="panel-description">Importe vários fechamentos de uma vez; os trades serão organizados pelo mês da data registrada.</p></div><div class="month-heading-actions"><div class="month-year-tabs" role="tablist" aria-label="Anos recentes">${yearTabs.map(tabYear=>`<button class="year-tab ${tabYear===year?'active':''}" role="tab" aria-selected="${tabYear===year}" data-action="select-month-year" data-year="${tabYear}">${tabYear}</button>`).join('')}</div><label class="month-year-picker">Trocar ano<select id="month-year">${years.map(y => `<option value="${y}" ${y===year?'selected':''}>${y}</option>`).join('')}</select></label><span class="panel-tag">${state.months.filter(m=>m.year===year).length} mês(es) preservado(s)</span><button class="button primary" data-action="import-month-batch">＋ Importar vários meses</button></div></div><div class="month-grid">${cards}</div></section>`;
}

function renderFilters(state) {
  const known = ['F1','F2','F3','F4','F5','F6','F7','RG1','RG3','RG4','RG5A','OBS_R1','CORE_R1','CORE_R2','CORE_R3','CORE3','D3','D4','D7','TINYUP','ESPACO_UTIL'];
  const trades = tradesOf(state); const rows = aggregateFilters(trades,known).map(row => `<tr><td><strong>${esc(row.code)}</strong></td><td>${row.hits || '—'}</td><td>${row.blocks == null ? '—' : row.blocks}</td><td>${row.blockRate == null ? '—' : `${num(row.blockRate*100)}%`}</td><td>${row.hits ? row.exclusive : '—'}</td><td>${row.hits ? row.overlap : '—'}</td><td>${row.winsBlocked == null ? '—' : row.winsBlocked}</td><td>${row.lossesBlocked == null ? '—' : row.lossesBlocked}</td><td>${row.hits ? fmtR(row.resultR) : '—'}</td><td><span class="badge ${row.hits||row.blocks?'neutral':'warning'}">${row.status}</span></td></tr>`).join('');
  return card('Auditoria de filtros',`${trades.length ? `<p class="table-hint">Base: ${trades.length} trades HSG dos fechamentos operacionais. Hits usam Filter Hits; bloqueios e W/L bloqueados só são calculados quando todos os CSVs usados incluem um campo reconhecido como Filter Blocks / Blocked Filters. Overlap conta ocorrências compartilhadas. Resultado real é o R observado nos trades associados ao filtro.</p>${table(['Filtro','Hits','Bloqueios','% bloqueio','Exclusivos','Overlap','W bloqueados','L bloqueados','Resultado real','Status'],rows)}` : empty('Sem dados importados.','Importe fechamentos mensais com os campos HSG de hits e bloqueios para calcular ocorrências.')}`);
}

function renderResearch(state) {
  const trades = tradesOf(state); const residual = trades.filter(trade => !filterCodes(trade).length); const grouped = new Map();
  for (const trade of residual) {
    const parts = [['Direção',trade.direction],['Sessão',trade.session],['Gap',trade.gapSize]].filter(([,value]) => value);
    const key = parts.length ? parts.map(([label,value])=>`${label}: ${value}`).join(' · ') : 'Sem campos de agrupamento disponíveis';
    const group = grouped.get(key) || { trades:0,wins:0,losses:0,breakeven:0,totalR:0 };
    group.trades++; if (/^(w|win|winner|gain|vitoria)$/i.test(String(trade.outcome))) group.wins++; else if (/^(l|loss|loser|perda)$/i.test(String(trade.outcome))) group.losses++; else group.breakeven++;
    group.totalR += Number(trade.resultR)||0; grouped.set(key,group);
  }
  const rows = [...grouped].sort((a,b)=>b[1].trades-a[1].trades).map(([rule,g],i)=>`<tr><td><strong>CSV-${i+1}</strong></td><td>${esc(rule)}</td><td>${g.trades}</td><td>${g.wins}</td><td>${g.losses}</td><td>${g.breakeven}</td><td>${fmtR(g.totalR)}</td><td>Exploratório · validar OOS</td></tr>`).join('');
  return `<div class="kpi-grid">${kpi('Meses auditados',new Set(state.months.map(m=>`${m.year}-${m.month}`)).size,'fechamentos operacionais')}${kpi('Trades analisados',trades.length,'CSV HSG importados')}${kpi('Clusters exploratórios',trades.length?grouped.size:'—',trades.length?`${residual.length} trades residuais`:'Aguardando dados')}${kpi('Risco de overfitting','Pendente','requer validação fora da amostra')}</div>${card('Trades residuais',trades.length ? (residual.length ? `<p class="table-hint">Agrupamento exploratório por campos disponíveis no CSV. Recomendação: investigar padrões com pelo menos 30 ocorrências; aprovação requer amostra maior, vários meses e validação OOS.</p>${table(['Cluster','Regra','Trades','W','L','BE','R total','Estado'],rows)}` : empty('Nenhum trade residual.','Todos os trades têm Filter Hits registrados.')) : empty('Pesquisa RG sem dados.','Importe fechamentos HSG para iniciar uma análise exploratória.'))}`;
}

function renderVersions(state) {
  const rows = state.snapshots.map(s => {
    const sourceIds = new Set(s.sourceBlockIds || []);
    const later = s.developmentEnd ? state.months.filter(block => !sourceIds.has(block.id) && `${block.year}-${String(block.month).padStart(2,'0')}` > s.developmentEnd) : [];
    const oosTrades = later.flatMap(block => block.trades || []);
    const oos = summary(oosTrades);
    const oosStatus = oos ? `${oos.trades} trades · ${fmtR(oos.totalR)} · PF ${fmtPF(oos.profitFactor)}` : `Pendente · ${s.developmentEnd ? 'sem fechamento posterior importado' : 'snapshot antigo sem escopo congelado'}`;
    return `<tr><td><strong>${esc(s.version)}</strong></td><td>${esc(s.date)}</td><td>${esc(s.range)}</td><td>${oosStatus}</td><td><span class="badge warning">${oos ? 'COMPARAÇÃO DISPONÍVEL' : 'AGUARDANDO OOS'}</span></td></tr>`;
  }).join('');
  const year = Number(state.historicalYear) || new Date().getFullYear();
  const slots = monthNames.map((name,index) => {
    const slot=state.historicalSlots.find(item=>item.month===index+1&&item.year===year);
    return `<article class="month-card ${slot?'has-data':''}"><span>${name}</span>${slot?`<strong>${slot.trades.length} trades HSG</strong><small>${slot.ninjaRows??'—'} operações Grid</small><label class="slot-check"><input class="slot-select" type="checkbox" value="${esc(slot.id)}"> Incluir na base</label>`:'<small>Sem dados</small>'}<button class="button ${slot?'secondary':'primary'}" data-action="historical-slot" data-month="${index+1}" data-year="${year}">${slot?'Substituir arquivos':'Importar par CSV'}</button></article>`;
  }).join('');
  const options=state.historicalBases.map(base=>`<option value="${esc(base.id)}" ${base.id===state.selectedHistoricalBaseId?'selected':''}>${esc(base.name)}</option>`).join('');
  const selected=state.historicalBases.find(base=>base.id===state.selectedHistoricalBaseId);
  const histControls=`<div class="history-controls"><label>Base selecionada <select id="historical-base"><option value="">Nenhuma base</option>${options}</select></label><button class="button secondary" data-action="import-history">＋ Importar base consolidada</button><button class="button primary" data-action="consolidate-history">Consolidar meses selecionados</button></div>`;
  const histSummary=selected?`<div class="kpi-grid">${kpi('Lucro líquido em R',fmtR(selected.summary.totalR),`${selected.summary.trades} trades · base histórica`)}${kpi('Acerto',`${num(selected.summary.winRate*100)}%`,'HSG CSV')}${kpi('Profit Factor',fmtPF(selected.summary.profitFactor),'HSG CSV')}${kpi('Drawdown máximo',fmtR(selected.summary.drawdown),'HSG CSV · ordem do arquivo')}</div>`:empty('Nenhuma base histórica selecionada.','Importe uma base consolidada ou os pares mensais e consolide os meses desejados.');
  return `<section class="panel"><div class="panel-heading"><div><h2>Base histórica · 12 meses</h2><p class="panel-description">Referência independente; não é somada aos fechamentos operacionais.</p></div><label>Ano <select id="history-year">${[...new Set([year,...state.historicalSlots.map(s=>s.year)])].sort((a,b)=>b-a).map(y=>`<option value="${y}" ${y===year?'selected':''}>${y}</option>`).join('')}</select></label></div>${histControls}<div class="month-grid">${slots}</div>${histSummary}</section><section class="panel"><div class="panel-heading"><div><h2>Snapshots congelados</h2><p class="panel-description">Snapshots registram a configuração e a referência no momento do congelamento.</p></div><button class="button primary" data-action="create-snapshot">＋ Congelar versão</button></div>${rows?table(['Versão','Congelada em','Desenvolvimento','OOS / Forward','Status'],rows):empty('Nenhuma versão congelada.')}<p class="table-hint">OOS usa apenas fechamentos operacionais posteriores ao fim do desenvolvimento e que não faziam parte do snapshot.</p></section><section class="panel"><div class="panel-heading"><h2>Backup local HSG</h2><span class="panel-tag">Contas de trader separadas</span></div><div class="backup-actions"><button class="button secondary" data-action="export-backup">Exportar backup JSON</button><label class="button secondary backup-file">Restaurar backup JSON<input id="backup-file" type="file" accept=".json,application/json"></label></div><p class="table-hint">A restauração substitui os dados HSG após prévia e confirmação.</p></section>`;
}

export function renderHsgPage(page,state) {
  if(page==='geral')return renderGeneral(state);
  if(page==='filtros')return renderFilters(state);
  if(page==='pesquisa')return renderResearch(state);
  if(page==='versoes')return renderVersions(state);
  if(page==='meses')return renderMonths(state);
  return '';
}
