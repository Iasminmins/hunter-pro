import { seed } from './seed.mjs';
import { csvHeaderError, csvTableError, parseCsv, parseCsvTable, parseNinjaReport, summarizeTrades, validateMonthlyInput } from './model.mjs';
import { renderTrader } from './trader.mjs';

const pages = {
  geral: ['Saúde do Hunter', 'Visão consolidada do comportamento recente do sistema'],
  filtros: ['Filtros HSG', 'Hits, overlaps e resultado por filtro'],
  pesquisa: ['Pesquisa RG', 'Hipóteses sobre padrões que continuam passando'],
  versoes: ['Versões', 'Histórico congelado e comparação OOS / Forward'],
  trader: ['Contas de trader', 'Gestão independente das suas contas de trading']
};
const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const number = value => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
const view = document.querySelector('#view');
const modalRoot = document.querySelector('#modal-root');
let page = 'geral';
let toastTimer;
let state = loadState();

function loadState() {
  try { return { months: [], snapshots: [], audit: [], ...(JSON.parse(localStorage.getItem('hunter-hsg-state') || '{}')) }; }
  catch { return { months: [], snapshots: [], audit: [] }; }
}
function persist() { localStorage.setItem('hunter-hsg-state', JSON.stringify(state)); }
function showToast(message, type = 'success') {
  const toast = document.querySelector('#toast'); toast.textContent = message; toast.dataset.type = type; toast.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('visible'), 4500);
}
function setPage(next) {
  page = next; document.querySelector('#page-title').textContent = pages[next][0]; document.querySelector('#page-subtitle').textContent = pages[next][1];
  document.querySelectorAll('.nav-item').forEach(item => item.setAttribute('aria-current', item.dataset.page === next ? 'page' : 'false'));
  document.querySelector('.breadcrumb').innerHTML = next === 'trader' ? 'CONTAS DE TRADER <span>/</span> GESTÃO FINANCEIRA' : 'HSG <span>/</span> MONITORAMENTO ESTATÍSTICO';
  document.querySelector('#create-month').hidden = next === 'trader';
  document.querySelector('.health-pill').hidden = next === 'trader';
  document.querySelector('#sidebar-status').textContent = next === 'trader' ? 'Dados locais · Contas de trader' : 'Ambiente demonstrativo · HSG';
  document.querySelector('#mobile-title').textContent = next === 'trader' ? 'CONTAS DE TRADER' : 'HUNTER HSG';
  document.querySelector('#sidebar').classList.remove('open'); document.querySelector('#menu-toggle').setAttribute('aria-expanded', 'false'); render();
}
function card(title, content, extra = '') { return `<section class="panel ${extra}"><div class="panel-heading"><h2>${title}</h2></div>${content}</section>`; }
function table(headers, rows, classes = '') {
  return `<div class="table-scroll"><table class="${classes}"><thead><tr>${headers.map((header, i) => `<th scope="col" ${i ? '' : 'class="first-col"'}>${header}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
function kpi(label, value, help, tone = '') {
  return `<article class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value ${tone}">${value}</div><div class="kpi-help">${help}</div></article>`;
}
function importedTrades() { return state.months.flatMap(block => block.trades.map(trade => ({ ...trade, blockMonth:block.month, blockYear:block.year }))); }
function filterCodes(trade) { return String(trade.filterHits || '').split(/[,|;+\s]+/).map(code => code.trim().toUpperCase()).filter(Boolean); }
function renderGeneral() {
  const extra = state.months.reduce((sum, block) => sum + block.summary.trades, 0);
  const windows = seed.windows.map(row => `<tr><td><strong>${row.window}</strong></td><td>${row.trades}</td><td>${row.hit}</td><td>${row.pf}</td><td class="positive">${row.result}</td></tr>`).join('');
  const max = Math.max(...seed.monthly);
  const bars = seed.monthly.map((value, i) => `<div class="bar-item"><div class="bar ${i === 8 ? 'negative' : ''}" style="--bar-height:${Math.round(value / max * 78) + 16}%" tabindex="0" aria-label="Mês ${i + 1}: ${i === 8 ? '−' : '+'}$${number(value)}; ${i === 8 ? 'negativo' : 'positivo'}" data-tip="Mês ${i + 1} · ${i === 8 ? '−' : '+'}$${number(value)} · ${i === 8 ? 'negativo' : 'positivo'}"></div><span>${i + 1}</span></div>`).join('');
  const compare = card('13M × 6M × 3M × 1M', `<span class="panel-tag">comparativo</span>${table(['Janela','Trades','Acerto','PF','Resultado'], windows)}`, 'compare-panel');
  const chart = card('Evolução mensal', `<span class="panel-tag">lucro</span><div class="chart" role="img" aria-label="Gráfico de barras com resultados dos meses 1 a 13; mês 9 negativo"><div class="bars">${bars}</div></div>`, 'chart-panel');
  const quick = card('Leitura rápida', `<span class="badge warning panel-badge">OBSERVAR ASSERTIVIDADE</span><dl class="quick-list"><div><dt>Estado atual</dt><dd>O Laboratório separa integridade dos dados, núcleo validado e camadas experimentais. Um mês negativo inicia investigação, não alteração automática.</dd></div><div><dt>OOS / Forward</dt><dd class="muted">Nenhum período OOS cadastrado ainda.</dd></div><div><dt>Próxima ação</dt><dd>Comparar o fechamento mensal com a referência de 13 meses e investigar mudança de regime.</dd></div></dl>`);
  const health = card('Placar de saúde do HSG', `<span class="health-pill panel-badge"><span>●</span> SAUDÁVEL</span><div class="health-grid"><div><span>Dados</span><strong class="positive">OK</strong></div><div><span>Regime</span><strong class="warning-text">MONITORAR</strong></div><div><span>Núcleo F2/F4/F6/F7</span><strong class="warning-text">AUDITAR</strong></div><div><span>OOS/Forward</span><strong class="muted">PENDENTE</strong></div></div><p class="health-note">Nenhuma falha crítica encontrada nos meses processados. A ausência de alerta não significa aprovação automática de filtro.</p>`);
  const imported = state.months.length ? `<div class="imported-list"><div class="subheading"><h3>Blocos mensais importados</h3><span>${state.months.length} registro(s)</span></div>${table(['Mês','Versão','HSG trades','Grid trades','Acerto HSG','PF HSG','Resultado R','Status'], state.months.map(m => `<tr><td><strong>${months[m.month - 1]} ${m.year}</strong></td><td>${escapeHtml(m.hunterVersion)}${m.revision ? ` <small>rev. ${m.revision}</small>` : ''}</td><td>${m.summary.trades}</td><td>${m.ninjaRows ?? '—'}</td><td>${number(m.summary.winRate * 100)}%</td><td>${m.summary.profitFactor === Infinity ? '∞' : number(m.summary.profitFactor)}</td><td class="${m.summary.totalR >= 0 ? 'positive' : 'negative-text'}">${m.summary.totalR >= 0 ? '+' : ''}${number(m.summary.totalR)}R</td><td><span class="badge neutral">PROCESSADO</span></td></tr>`).join(''))}</div>` : `<div class="empty-state"><span class="empty-icon">↥</span><strong>Nenhum mês importado ainda.</strong><p>Clique em <button class="text-button" data-action="create-month">Adicionar mês</button> para criar a primeira janela mensal.</p></div>`;
  return `<div class="kpi-grid">${kpi('Lucro líquido · 13M','+$17.460','benchmark demonstrativo','positive')}${kpi('Acerto · 13M','32,8%','benchmark demonstrativo')}${kpi('Profit Factor · 13M','1,99','benchmark demonstrativo')}${kpi('Drawdown máximo','-$1.549,5','benchmark demonstrativo','negative-text')}</div><div class="comparison-grid">${compare}${chart}</div><div class="stack">${quick}${health}<section class="panel">${imported}</section></div>`;
}
function renderFilters() {
  const rows = seed.filters.map(([filter,hits,exclusive,overlap,wins,losses,result,status]) => `<tr><td><strong>${filter}</strong></td><td>${hits}</td><td>${exclusive}</td><td>${overlap}</td><td>${wins}</td><td>${losses}</td><td class="${result.startsWith('-') ? 'negative-text' : 'positive'}">${result}</td><td><span class="badge ${status === 'ATIVO' ? 'good' : status === 'OBSERVAÇÃO' ? 'warning' : 'review'}">${status}</span></td></tr>`).join('');
  const trades = importedTrades(); const codes = [...new Set(trades.flatMap(filterCodes))].sort();
  const importedRows = codes.map(code => {
    const matched = trades.filter(trade => filterCodes(trade).includes(code)); const exclusive = matched.filter(trade => filterCodes(trade).length === 1).length; const overlap = matched.filter(trade => filterCodes(trade).length > 1).length;
    const result = matched.reduce((sum,trade) => sum + (Number(trade.resultR) || 0), 0);
    return `<tr><td><strong>${escapeHtml(code)}</strong></td><td>${matched.length}</td><td>${exclusive}</td><td>${overlap}</td><td>—</td><td>—</td><td class="${result >= 0 ? 'positive' : 'negative-text'}">${result >= 0 ? '+' : ''}${number(result)}R</td><td><span class="badge neutral">IMPORTADO</span></td></tr>`;
  }).join('');
  const importedPanel = trades.length ? `<section class="panel"><div class="panel-heading"><h2>Filtros encontrados nos CSVs</h2><span class="panel-tag">calculado · ${trades.length} trades</span></div><p class="table-hint">Métricas derivadas de Filter Hits. W bloqueados e L evitados dependem do mapeamento real de regras.</p>${codes.length ? table(['Filtro','Hits','Exclusivos','Overlap','W bloqueados','L evitados','Resultado R','Status'], importedRows) : '<div class="empty-state compact"><strong>Coluna de filtros não encontrada nos registros.</strong><p>Inclua Filter Hits no CSV HSG para calcular esta tabela.</p></div>'}</section>` : '';
  return `${importedPanel}<section class="panel"><div class="panel-heading"><h2>Eficiência dos filtros</h2><span class="panel-tag">13M · demonstração</span></div><p class="table-hint">W <span title="Wins: operações vencedoras">ⓘ</span> · L <span title="Losses: operações perdedoras">ⓘ</span> · Overlap: ocorrências compartilhadas por mais de um filtro.</p>${table(['Filtro','Hits','Exclusivos','Overlap','W bloqueados','L evitados','Resultado R','Status'], rows)}</section><div class="info-strip"><span>ⓘ</span><p>Os indicadores demonstrativos ajudam a orientar auditorias. Resultado histórico não aprova filtros automaticamente.</p></div>`;
}
function renderResearch() {
  const clusters = seed.clusters.map(([code,rule,trades,wins,losses,be,total,note]) => `<tr><td><strong>${code}</strong></td><td>${rule}</td><td>${trades}</td><td>${wins}</td><td>${losses}</td><td>${be}</td><td class="positive">${total}</td><td><span class="badge ${note === 'AMOSTRA PEQUENA' ? 'warning' : 'neutral'}">${note}</span></td></tr>`).join('');
  const all = importedTrades(); const residual = all.filter(trade => !filterCodes(trade).length); const grouped = new Map();
  for (const trade of residual) { const key = [trade.direction || 'Direção não informada',trade.session || 'Sessão não informada',trade.gapSize || 'Gap não informado'].join(' · '); const group = grouped.get(key) || { trades:0,wins:0,losses:0,be:0,total:0 }; group.trades++; group.wins += /^(w|win|winner|gain|vitoria)$/i.test(trade.outcome) ? 1 : 0; group.losses += /^(l|loss|loser|perda)$/i.test(trade.outcome) ? 1 : 0; group.be += /^(be|breakeven|break even)$/i.test(trade.outcome) ? 1 : 0; group.total += Number(trade.resultR) || 0; grouped.set(key,group); }
  const importedClusters = [...grouped.entries()].sort((a,b) => b[1].trades - a[1].trades).slice(0,5).map(([rule,g]) => `<tr><td><strong>CSV-${escapeHtml(rule.split(' · ')[0].slice(0,12))}</strong></td><td>${escapeHtml(rule)}</td><td>${g.trades}</td><td>${g.wins}</td><td>${g.losses}</td><td>${g.be}</td><td class="${g.total >= 0 ? 'positive' : 'negative-text'}">${g.total >= 0 ? '+' : ''}${number(g.total)}R</td><td><span class="badge neutral">CSV IMPORTADO</span></td></tr>`).join('');
  const residualPanel = all.length ? `<section class="panel"><div class="panel-heading"><h2>Trades sem filtros registrados</h2><span class="panel-tag">${residual.length} residual(is) · CSV importado</span></div><p class="table-hint">Agrupamento exploratório por direção, sessão e gap; exige validação da regra antes de uso.</p>${residual.length ? table(['Cluster','Regra','Trades','W','L','BE','R total','Nota'], importedClusters) : '<div class="empty-state compact"><strong>Todos os trades importados têm filtros associados.</strong><p>Nenhum trade residual calculável neste CSV.</p></div>'}</section>` : '';
  const residualKpi = all.length ? kpi('Trades residuais',number(residual.length),`${all.length} trades importados`,residual.length ? '' : 'positive') : kpi('Trades residuais','1.862','após filtros ativos');
  return `<div class="kpi-grid">${residualKpi}${kpi('Clusters encontrados',all.length ? String(grouped.size) : '27',all.length ? 'agrupados do CSV' : '8 com amostra pequena')}${kpi('Melhor média R',all.length ? '—' : '+0,42R',all.length ? 'amostra importada' : 'mínimo 30 trades',all.length ? '' : 'positive')}${kpi('Risco de overfitting','Moderado','revisão manual','warning-text')}</div>${residualPanel}<section class="panel"><div class="panel-heading"><h2>Clusters residuais</h2><span class="panel-tag">pesquisa exploratória · demonstração</span></div>${table(['Cluster','Regra','Trades','W','L','BE','R total','Nota'], clusters)}</section><div class="info-strip"><span>ⓘ</span><p>W = wins · L = losses · BE = breakeven. Overlap indica regras que identificam o mesmo trade. Avalie amostras fora do período de descoberta.</p></div>`;
}
function renderVersions() {
  const rows = [...seed.snapshots, ...state.snapshots].map(s => `<tr><td><strong>${escapeHtml(s.version)}</strong></td><td>${escapeHtml(s.date)}</td><td>${escapeHtml(s.range)}</td><td>${escapeHtml(s.oos || '—')}</td><td><span class="badge ${s.status === 'BASE HISTÓRICA' ? 'neutral' : 'warning'}">${escapeHtml(s.status)}</span></td></tr>`).join('');
  return `<section class="panel"><div class="panel-heading"><div><h2>Snapshots congelados</h2><p class="panel-description">Versões registradas permanecem imutáveis para preservar a comparação.</p></div><button class="button primary" data-action="create-snapshot">＋ Congelar versão</button></div>${table(['Versão','Congelada em','Desenvolvimento','OOS disponível','Status'], rows)}</section><div class="info-strip"><span>ⓘ</span><p>OOS (out-of-sample) e Forward medem o comportamento em períodos posteriores ao desenvolvimento. Nenhum período OOS real foi processado ainda.</p></div>`;
}
function render() {
  if (page === 'trader') { renderTrader(view); return; }
  view.innerHTML = page === 'geral' ? renderGeneral() : page === 'filtros' ? renderFilters() : page === 'pesquisa' ? renderResearch() : renderVersions();
}
function closeModal() { modalRoot.innerHTML = ''; document.body.classList.remove('modal-open'); }
function openModal(content) {
  modalRoot.innerHTML = `<div class="modal-backdrop" data-action="backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">${content}</section></div>`;
  document.body.classList.add('modal-open'); modalRoot.querySelector('input,select,button')?.focus();
}
function openMonthForm() {
  openModal(`<form id="month-form" novalidate><div class="modal-header"><div><span class="eyebrow">IMPORTAÇÃO DE DADOS</span><h2 id="modal-title">Bloco de importação mensal</h2><p>Os arquivos são lidos localmente e não são enviados a um servidor.</p></div><button type="button" class="icon-button" data-action="close-modal" aria-label="Fechar">×</button></div><div class="form-grid"><label>Mês<select name="month" required><option value="">Selecione</option>${months.map((m,i) => `<option value="${i+1}">${m}</option>`).join('')}</select></label><label>Ano<input name="year" type="number" min="2000" max="2100" value="${new Date().getFullYear()}" required></label><label>Versão Hunter<input name="hunterVersion" placeholder="V24" required></label><label>Configuração HSG<input name="hsgConfig" value="F2 + F4 + F6 + F7 + RG1" required></label><label class="file-field"><span>CSV HSG Dataset <b>*</b></span><input name="hsgFile" type="file" accept=".csv,text/csv" required><small>Aceita Result_R. Se não houver Outcome, W/L/BE é inferido pelo sinal de R.</small></label><label class="file-field"><span>CSV NinjaTrader / Grid <b>*</b></span><input name="ninjaFile" type="file" accept=".csv,text/csv" required><small>Aceita relatório de desempenho ou tabela de operações com Result_R.</small></label><label class="full-width">Observação <input name="observations" placeholder="Ex.: RG5-A ativo"></label></div><div id="form-errors" class="form-errors" role="alert"></div><div id="import-progress" class="progress-message" hidden><span class="spinner"></span> Validando arquivos e processando linhas…</div><div class="modal-actions"><button class="button secondary" type="button" data-action="close-modal">Fechar</button><button class="button primary" type="submit">Importar este mês</button></div></form>`);
  modalRoot.querySelector('#month-form').addEventListener('submit', submitMonth);
}
async function submitMonth(event) {
  event.preventDefault(); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form));
  const errors = validateMonthlyInput(data); const errorBox = form.querySelector('#form-errors'); errorBox.innerHTML = errors.map(escapeHtml).join('<br>');
  if (errors.length) return;
  const submit = form.querySelector('[type="submit"]'); submit.disabled = true; form.querySelector('#import-progress').hidden = false; errorBox.textContent = '';
  try {
    const [hsgText, ninjaText] = await Promise.all([data.hsgFile.text(), data.ninjaFile.text()]);
    const hsgError = csvHeaderError(hsgText, 'CSV HSG Dataset');
    const ninjaError = csvTableError(ninjaText, 'CSV NinjaTrader / Grid');
    if (hsgError || ninjaError) throw new Error([hsgError,ninjaError].filter(Boolean).join('\n'));
    const trades = parseCsv(hsgText).map((trade,index) => ({ ...trade, id:`${Date.now()}-${index}` }));
    if (!trades.length || trades.some(trade => !Number.isFinite(trade.resultR))) throw new Error('CSV HSG Dataset: cada linha precisa ter um valor numérico em Result R.');
    const month = Number(data.month), year = Number(data.year); const summary = summarizeTrades(trades);
    const ninjaTableRows = parseCsvTable(ninjaText).rows.filter(row => row.some(cell => cell !== '')).length;
    const ninjaReport = parseNinjaReport(ninjaText);
    const ninjaRows = ninjaReport.tradeCount ?? ninjaTableRows;
    const staged = { id:crypto.randomUUID(), month, year, hunterVersion:String(data.hunterVersion).trim(), hsgConfig:String(data.hsgConfig).trim(), observations:String(data.observations || '').trim(), status:'processed', createdAt:new Date().toISOString(), importedAt:new Date().toISOString(), summary, trades, ninjaRows, ninjaSummary:ninjaReport, revision:1 };
    const existing = state.months.findIndex(block => block.month === month && block.year === year);
    if (existing >= 0) { closeModal(); openDuplicateDialog(staged, existing); return; }
    commitImport(staged); closeModal(); render(); showToast(`${months[month-1]} ${year} importado · ${trades.length} trades HSG e ${ninjaRows} operações Grid.`);
  } catch (error) { errorBox.textContent = error.message || 'Não foi possível processar os arquivos. Verifique o formato CSV.'; }
  finally { if (modalRoot.querySelector('#month-form')) { submit.disabled = false; form.querySelector('#import-progress').hidden = true; } }
}
function commitImport(block, index = -1, mode = 'new') {
  if (mode === 'revision' && index >= 0) block.revision = state.months[index].revision + 1;
  if (index >= 0) state.months[index] = block; else state.months.push(block);
  state.audit.unshift({ action:mode === 'revision' ? 'revision' : mode === 'update' ? 'update' : 'import', blockId:block.id, month:block.month, year:block.year, at:new Date().toISOString(), trades:block.summary.trades }); persist();
}
function openDuplicateDialog(block, index) {
  openModal(`<div class="modal-header"><div><span class="eyebrow">MÊS JÁ CADASTRADO</span><h2 id="modal-title">${months[block.month-1]} ${block.year}</h2><p>Já existe um bloco deste mês. Como quer prosseguir?</p></div><button class="icon-button" data-action="close-modal" aria-label="Fechar">×</button></div><div class="choice-list"><button class="choice-card" data-action="duplicate-update"><strong>Atualizar bloco</strong><span>Substitui os dados do mês pelo arquivo importado agora.</span></button><button class="choice-card" data-action="duplicate-revision"><strong>Criar revisão</strong><span>Registra uma nova revisão e mantém o número da revisão anterior no histórico de auditoria.</span></button></div><div class="modal-actions"><button class="button secondary" data-action="close-modal">Cancelar</button></div>`);
  modalRoot.querySelector('[data-action="duplicate-update"]').onclick = () => { commitImport(block,index,'update'); closeModal(); render(); showToast(`${months[block.month-1]} ${block.year} atualizado.`); };
  modalRoot.querySelector('[data-action="duplicate-revision"]').onclick = () => { commitImport(block,index,'revision'); closeModal(); render(); showToast(`Revisão ${block.revision} de ${months[block.month-1]} ${block.year} registrada.`); };
}
function openSnapshotForm() {
  openModal(`<form id="snapshot-form" novalidate><div class="modal-header"><div><span class="eyebrow">REGISTRO IMUTÁVEL</span><h2 id="modal-title">Congelar versão</h2><p>O snapshot será salvo para comparação posterior com OOS / Forward.</p></div><button type="button" class="icon-button" data-action="close-modal" aria-label="Fechar">×</button></div><div class="form-grid"><label class="full-width">Nome da versão<input name="version" placeholder="Hunter HSG V25 · RG6-A" required></label><label>Início do desenvolvimento<input name="start" type="month" required></label><label>Fim do desenvolvimento<input name="end" type="month" required></label><label class="full-width">Período OOS (opcional)<input name="oos" placeholder="Ex.: Out/2026 em diante"></label></div><div id="form-errors" class="form-errors" role="alert"></div><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Cancelar</button><button type="submit" class="button primary">Congelar versão</button></div></form>`);
  modalRoot.querySelector('#snapshot-form').addEventListener('submit', event => {
    event.preventDefault(); const form = event.currentTarget, data = Object.fromEntries(new FormData(form)); const errors = [];
    if (!data.version?.trim()) errors.push('Informe o nome da versão.');
    if (!data.start || !data.end) errors.push('Informe o período de desenvolvimento.');
    if (data.start && data.end && data.end < data.start) errors.push('O fim do desenvolvimento precisa ser posterior ao início.');
    if ([...seed.snapshots,...state.snapshots].some(snapshot => snapshot.version.toLowerCase() === data.version.trim().toLowerCase())) errors.push('Esse nome de versão já está congelado. Snapshots são imutáveis.');
    form.querySelector('#form-errors').innerHTML = errors.map(escapeHtml).join('<br>'); if (errors.length) return;
    const fmt = value => { const [y,m] = value.split('-'); return `${months[Number(m)-1].slice(0,3)}/${y}`; };
    const snapshot = { id:crypto.randomUUID(), version:data.version.trim(), date:new Intl.DateTimeFormat('pt-BR').format(new Date()), range:`${fmt(data.start)} → ${fmt(data.end)}`, oos:data.oos.trim() || '—', status:data.oos.trim() ? 'AGUARDANDO OOS' : 'BASE HISTÓRICA', frozenAt:new Date().toISOString(), sourceBlockIds:state.months.map(month => month.id) };
    state.snapshots.push(snapshot); state.audit.unshift({ action:'freeze', snapshotId:snapshot.id, at:snapshot.frozenAt }); persist(); closeModal(); render(); showToast(`${snapshot.version} congelada com sucesso.`);
  });
}

document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => setPage(item.dataset.page)));
document.querySelector('#create-month').addEventListener('click', openMonthForm);
document.querySelector('#menu-toggle').addEventListener('click', event => { const expanded = event.currentTarget.getAttribute('aria-expanded') === 'true'; event.currentTarget.setAttribute('aria-expanded', String(!expanded)); document.querySelector('#sidebar').classList.toggle('open', !expanded); });
document.addEventListener('click', event => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'create-month') openMonthForm();
  if (action === 'create-snapshot') openSnapshotForm();
  if (action === 'close-modal' || action === 'backdrop' && event.target === event.currentTarget) closeModal();
  if (action === 'backdrop' && event.target.classList.contains('modal-backdrop')) closeModal();
});
document.addEventListener('keydown', event => { if (event.key === 'Escape' && modalRoot.firstElementChild) closeModal(); });
render();
