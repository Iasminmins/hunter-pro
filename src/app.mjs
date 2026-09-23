import { csvHeaderError, csvTableError, parseCsv, parseCsvTable, parseNinjaReport, summarizeTrades, validateMonthlyInput } from './model.mjs';
import { initializeTraderState, renderTrader } from './trader.mjs';
import { initializePerformanceState, renderPerformanceLab } from './performance-lab.mjs';
import { renderHsgPage } from './hsg-views.mjs';
import { exportHsgBackup, parseHsgBackup } from './backup.mjs';
import { initializePersistence, importLocalState, login, logout, saveArea, setPersistenceStatusHandler, useRemoteState } from './persistence.mjs';

const pages = {
  geral: ['Saúde do Hunter', 'Visão consolidada do comportamento recente do sistema'],
  filtros: ['Filtros HSG', 'Hits, overlaps e resultado por filtro'],
  pesquisa: ['Pesquisa RG', 'Hipóteses sobre padrões que continuam passando'],
  versoes: ['Versões', 'Histórico congelado e comparação OOS / Forward'],
  meses: ['Meses', 'Fechamentos operacionais e regime recente'],
  trader: ['Contas de trader', 'Gestão independente das suas contas de trading'],
  performance: ['Performance Lab', 'Histórico NinjaTrader e simulações configuráveis']
};
const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
const view = document.querySelector('#view');
const modalRoot = document.querySelector('#modal-root');
const authRoot = document.querySelector('#auth-root');
let page = 'geral';
let toastTimer;
const syncStates = { hsg: 'saved', trader: 'saved', performance: 'saved' };
let state = loadState();
let performanceState = initializePerformanceState();
let pendingRestore = null;

function loadState(source = null) {
  const empty = { months: [], historicalBases: [], historicalSlots: [], selectedHistoricalBaseId: '', snapshots: [], audit: [] };
  try {
    const saved = source ?? JSON.parse(localStorage.getItem('hunter-hsg-state') || '{}');
    const state = { ...empty, ...(saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}) };
    for (const key of ['months','historicalBases','historicalSlots','snapshots','audit']) if (!Array.isArray(state[key])) state[key] = [];
    state.months = state.months.map(block => ({ ...block, trades:Array.isArray(block.trades)?block.trades:[], summary:summarizeTrades(Array.isArray(block.trades)?block.trades:[]) }));
    state.historicalBases = state.historicalBases.map(base => ({ ...base, trades:Array.isArray(base.trades)?base.trades:[], summary:summarizeTrades(Array.isArray(base.trades)?base.trades:[]) }));
    state.historicalSlots = state.historicalSlots.map(slot => ({ ...slot, trades:Array.isArray(slot.trades)?slot.trades:[], summary:summarizeTrades(Array.isArray(slot.trades)?slot.trades:[]) }));
    return state;
  } catch { return empty; }
}
function persist() {
  try { localStorage.setItem('hunter-hsg-state', JSON.stringify(state)); }
  catch { showToast('O navegador não conseguiu guardar a cópia local de recuperação.', 'error'); }
  saveArea('hsg', state).catch(() => {});
}
function showToast(message, type = 'success') {
  const toast = document.querySelector('#toast'); toast.textContent = message; toast.dataset.type = type; toast.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('visible'), 4500);
}
function setPage(next) {
  page = next; document.querySelector('#page-title').textContent = pages[next][0]; document.querySelector('#page-subtitle').textContent = pages[next][1];
  document.querySelectorAll('.nav-item').forEach(item => item.setAttribute('aria-current', item.dataset.page === next ? 'page' : 'false'));
  document.querySelector('.breadcrumb').innerHTML = next === 'trader' ? 'CONTAS DE TRADER <span>/</span> GESTÃO FINANCEIRA' : next === 'performance' ? 'PERFORMANCE LAB <span>/</span> ANÁLISE E SIMULAÇÃO' : 'HSG <span>/</span> MONITORAMENTO ESTATÍSTICO';
  document.querySelector('#create-month').hidden = ['trader','performance','versoes','meses'].includes(next);
  document.querySelector('.health-pill').hidden = next === 'trader' || next === 'performance';
  document.querySelector('.health-pill').innerHTML = `<span>●</span> ${state.months.some(block => block.trades?.length) ? 'AUDITORIA PENDENTE' : 'AGUARDANDO DADOS'}`;
  document.querySelector('#sidebar-status').textContent = next === 'trader' ? 'Neon · Contas de trader' : next === 'performance' ? 'Neon · Performance Lab' : 'Neon · HSG';
  document.querySelector('#mobile-title').textContent = next === 'trader' ? 'CONTAS DE TRADER' : next === 'performance' ? 'PERFORMANCE LAB' : 'HUNTER HSG';
  document.querySelector('#sidebar').classList.remove('open'); document.querySelector('#menu-toggle').setAttribute('aria-expanded', 'false'); render();
}
function render() {
  if (page === 'trader') { renderTrader(view); return; }
  if (page === 'performance') { renderPerformanceLab(view,performanceState,next=>{performanceState=next;saveArea('performance',next).catch(()=>{});}); return; }
  document.querySelector('.health-pill').innerHTML = `<span>●</span> ${state.months.some(block => block.trades?.length) ? 'AUDITORIA PENDENTE' : 'AGUARDANDO DADOS'}`;
  view.innerHTML = renderHsgPage(page,state);
  if (page === 'meses') view.querySelector('#month-year')?.addEventListener('change', event => { state.selectedMonthYear=Number(event.target.value); persist(); render(); });
  if (page === 'versoes') {
    view.querySelector('#history-year')?.addEventListener('change', event => { state.historicalYear=Number(event.target.value); persist(); render(); });
    view.querySelector('#historical-base')?.addEventListener('change', event => { state.selectedHistoricalBaseId=event.target.value; persist(); render(); });
    view.querySelector('#backup-file')?.addEventListener('change', event => previewBackup(event.target.files?.[0]));
  }
}
function closeModal() { modalRoot.innerHTML = ''; document.body.classList.remove('modal-open'); }
function openModal(content) {
  modalRoot.innerHTML = `<div class="modal-backdrop" data-action="backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">${content}</section></div>`;
  document.body.classList.add('modal-open'); modalRoot.querySelector('input,select,button')?.focus();
}
function openMonthForm(defaultMonth = '', defaultYear = new Date().getFullYear()) {
  openModal(`<form id="month-form" novalidate><div class="modal-header"><div><span class="eyebrow">IMPORTAÇÃO DE DADOS</span><h2 id="modal-title">Bloco de importação mensal</h2><p>Os arquivos são lidos localmente e não são enviados a um servidor.</p></div><button type="button" class="icon-button" data-action="close-modal" aria-label="Fechar">×</button></div><div class="form-grid"><label>Mês<select name="month" required><option value="">Selecione</option>${months.map((m,i) => `<option value="${i+1}">${m}</option>`).join('')}</select></label><label>Ano<input name="year" type="number" min="2000" max="2100" value="${new Date().getFullYear()}" required></label><label>Versão Hunter<input name="hunterVersion" placeholder="V24" required></label><label>Configuração HSG<input name="hsgConfig" value="F2 + F4 + F6 + F7 + RG1" required></label><label class="file-field"><span>CSV HSG Dataset <b>*</b></span><input name="hsgFile" type="file" accept=".csv,text/csv" required><small>Aceita Result_R. Se não houver Outcome, W/L/BE é inferido pelo sinal de R.</small></label><label class="file-field"><span>CSV NinjaTrader / Grid <b>*</b></span><input name="ninjaFile" type="file" accept=".csv,text/csv" required><small>Aceita relatório de desempenho ou tabela de operações com Result_R.</small></label><label class="full-width">Observação <input name="observations" placeholder="Ex.: RG5-A ativo"></label></div><div id="form-errors" class="form-errors" role="alert"></div><div id="import-progress" class="progress-message" hidden><span class="spinner"></span> Validando arquivos e processando linhas…</div><div class="modal-actions"><button class="button secondary" type="button" data-action="close-modal">Fechar</button><button class="button primary" type="submit">Importar este mês</button></div></form>`);
  modalRoot.querySelector('#month-form').addEventListener('submit', submitMonth);
  if (defaultMonth) modalRoot.querySelector('[name="month"]').value = String(defaultMonth);
  modalRoot.querySelector('[name="year"]').value = String(defaultYear);
}
function openHistoricalImport(month = '', year = '') {
  const slotMode = Boolean(month && year);
  openModal(`<form id="history-form" novalidate><div class="modal-header"><div><span class="eyebrow">BASE HISTÓRICA</span><h2 id="modal-title">${slotMode ? `Importar ${months[Number(month)-1]} ${year}` : 'Importar base consolidada'}</h2><p>Os dois arquivos são lidos localmente e permanecem separados dos fechamentos operacionais.</p></div><button type="button" class="icon-button" data-action="close-modal">×</button></div><div class="form-grid">${slotMode ? '' : '<label class="full-width">Nome da base<input name="name" placeholder="Histórico 2025–2026" required></label>'}<label class="file-field"><span>CSV HSG Dataset <b>*</b></span><input name="hsgFile" type="file" accept=".csv,text/csv" required></label><label class="file-field"><span>CSV NinjaTrader / Grid <b>*</b></span><input name="ninjaFile" type="file" accept=".csv,text/csv" required></label></div><div id="form-errors" class="form-errors" role="alert"></div><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Cancelar</button><button type="submit" class="button primary">${slotMode?'Importar mês histórico':'Importar base'}</button></div></form>`);
  modalRoot.querySelector('#history-form').addEventListener('submit', async event => {
    event.preventDefault(); const form=event.currentTarget, data=Object.fromEntries(new FormData(form)), errors=[];
    if (!slotMode && !String(data.name||'').trim()) errors.push('Informe o nome da base histórica.');
    for (const [key,label] of [['hsgFile','CSV HSG Dataset'],['ninjaFile','CSV NinjaTrader / Grid']]) if (!data[key] || !data[key].name.toLowerCase().endsWith('.csv')) errors.push(`Envie um arquivo .csv para ${label}.`);
    const errorBox=form.querySelector('#form-errors'); errorBox.textContent=errors.join('\n'); if(errors.length)return;
    const submit=form.querySelector('[type=submit]');submit.disabled=true;
    try {
      const [hsgText,ninjaText]=await Promise.all([data.hsgFile.text(),data.ninjaFile.text()]);
      const hsgError=csvHeaderError(hsgText,'CSV HSG Dataset'), ninjaError=csvTableError(ninjaText,'CSV NinjaTrader / Grid');
      if(hsgError||ninjaError)throw new Error([hsgError,ninjaError].filter(Boolean).join('\n'));
      const trades=parseCsv(hsgText).map((trade,index)=>({...trade,id:crypto.randomUUID(),sourceRow:index+1}));
      if(!trades.length||trades.some(trade=>!Number.isFinite(trade.resultR)))throw new Error('CSV HSG Dataset: cada linha precisa ter um valor numérico em Result R.');
      const ninjaTableRows=parseCsvTable(ninjaText).rows.filter(row=>row.some(cell=>cell!=='')).length;
      const ninjaSummary=parseNinjaReport(ninjaText), ninjaRows=ninjaSummary.tradeCount??ninjaTableRows;
      if(slotMode){
        const existing=state.historicalSlots.findIndex(slot=>slot.month===Number(month)&&slot.year===Number(year));
        if(existing>=0&&!confirm(`Substituir os arquivos históricos de ${months[Number(month)-1]} ${year}?`))return;
        const slot={id:crypto.randomUUID(),month:Number(month),year:Number(year),trades,summary:summarizeTrades(trades),ninjaRows,ninjaSummary,importedAt:new Date().toISOString()};
        if(existing>=0)state.historicalSlots[existing]=slot;else state.historicalSlots.push(slot);
        state.audit.unshift({action:'historical-slot-import',month:Number(month),year:Number(year),trades:trades.length,at:new Date().toISOString()});
      } else {
        if(state.historicalBases.some(base=>base.name.toLocaleLowerCase('pt-BR')===String(data.name).trim().toLocaleLowerCase('pt-BR')))throw new Error('Já existe uma base histórica com esse nome.');
        const base={id:crypto.randomUUID(),name:String(data.name).trim(),importedAt:new Date().toISOString(),trades,summary:summarizeTrades(trades),ninjaRows,ninjaSummary,source:'direct'};
        state.historicalBases.push(base);state.selectedHistoricalBaseId=base.id;
        state.audit.unshift({action:'historical-base-import',baseId:base.id,trades:trades.length,at:base.importedAt});
      }
      persist();closeModal();render();showToast(slotMode?'Mês histórico importado.':'Base histórica importada.');
    } catch(error){errorBox.textContent=error.message||'Não foi possível processar os arquivos.';}
    finally{if(modalRoot.querySelector('#history-form'))submit.disabled=false;}
  });
}
function consolidateHistoricalSlots() {
  const selectedIds=[...view.querySelectorAll('.slot-select:checked')].map(input=>input.value);
  const slots=state.historicalSlots.filter(slot=>selectedIds.includes(slot.id));
  if(!slots.length){showToast('Marque pelo menos um mês histórico para consolidar.','error');return;}
  const name=prompt('Nome da base histórica consolidada:'); if(!name?.trim())return;
  const trades=slots.flatMap(slot=>slot.trades||[]).map(trade=>({...trade}));
  const base={id:crypto.randomUUID(),name:name.trim(),importedAt:new Date().toISOString(),trades,summary:summarizeTrades(trades),ninjaRows:slots.reduce((sum,slot)=>sum+(Number(slot.ninjaRows)||0),0),ninjaSummary:null,source:'historical-slots',sourceSlotIds:slots.map(slot=>slot.id)};
  state.historicalBases.push(base);state.selectedHistoricalBaseId=base.id;state.audit.unshift({action:'historical-base-consolidate',baseId:base.id,sourceSlotIds:base.sourceSlotIds,at:base.importedAt});persist();render();showToast(`${base.name} criada com ${trades.length} trades.`);
}
function downloadBackup() {
  const blob=new Blob([exportHsgBackup(state)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=`hunter-hsg-backup-${new Date().toISOString().slice(0,10)}.json`;link.click();URL.revokeObjectURL(url);
}
async function previewBackup(file) {
  if(!file)return;
  const parsed=parseHsgBackup(await file.text());
  if(parsed.errors.length){showToast(parsed.errors.join(' '),'error');return;}
  pendingRestore=parsed.state;
  const counts=`${pendingRestore.months.length} fechamentos, ${pendingRestore.historicalBases.length} bases históricas, ${pendingRestore.snapshots.length} snapshots e ${pendingRestore.audit.length} eventos de auditoria`;
  openModal(`<div class="modal-header"><div><span class="eyebrow">RESTAURAR BACKUP</span><h2 id="modal-title">Substituir os dados HSG locais?</h2><p>O arquivo contém ${counts}. Contas de trader não serão alteradas.</p></div><button class="icon-button" data-action="close-modal">×</button></div><div class="modal-actions"><button class="button secondary" data-action="close-modal">Cancelar</button><button class="button primary" data-action="restore-backup">Substituir dados HSG</button></div>`);
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
    if (state.snapshots.some(snapshot => snapshot.version.toLowerCase() === data.version.trim().toLowerCase())) errors.push('Esse nome de versão já está congelado. Snapshots são imutáveis.');
    form.querySelector('#form-errors').innerHTML = errors.map(escapeHtml).join('<br>'); if (errors.length) return;
    const fmt = value => { const [y,m] = value.split('-'); return `${months[Number(m)-1].slice(0,3)}/${y}`; };
    const sourceBlocks = state.months.filter(month => `${month.year}-${String(month.month).padStart(2,'0')}` >= data.start && `${month.year}-${String(month.month).padStart(2,'0')}` <= data.end);
    const frozenTrades = sourceBlocks.flatMap(month => month.trades || []).map(trade => ({ ...trade }));
    const selectedBase=state.historicalBases.find(base=>base.id===state.selectedHistoricalBaseId);
    const snapshot = { id:crypto.randomUUID(), version:data.version.trim(), date:new Intl.DateTimeFormat('pt-BR').format(new Date()), range:`${fmt(data.start)} → ${fmt(data.end)}`, developmentStart:data.start, developmentEnd:data.end, oos:data.oos.trim() || '—', status:'AGUARDANDO OOS', frozenAt:new Date().toISOString(), sourceBlockIds:sourceBlocks.map(month => month.id), frozenTrades, frozenSummary:frozenTrades.length ? summarizeTrades(frozenTrades) : null, historicalBaseId:selectedBase?.id || null, historicalBaseSummary:selectedBase ? {...selectedBase.summary} : null };
    state.snapshots.push(snapshot); state.audit.unshift({ action:'freeze', snapshotId:snapshot.id, at:snapshot.frozenAt }); persist(); closeModal(); render(); showToast(`${snapshot.version} congelada com sucesso.`);
  });
}

document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => setPage(item.dataset.page)));
document.querySelector('#create-month').addEventListener('click', () => openMonthForm());
document.querySelector('#menu-toggle').addEventListener('click', event => { const expanded = event.currentTarget.getAttribute('aria-expanded') === 'true'; event.currentTarget.setAttribute('aria-expanded', String(!expanded)); document.querySelector('#sidebar').classList.toggle('open', !expanded); });
document.addEventListener('click', event => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'create-month') openMonthForm(event.target.closest('[data-month]')?.dataset.month || '', event.target.closest('[data-year]')?.dataset.year || new Date().getFullYear());
  if (action === 'create-snapshot') openSnapshotForm();
  if (action === 'historical-slot') openHistoricalImport(event.target.closest('[data-month]')?.dataset.month, event.target.closest('[data-year]')?.dataset.year);
  if (action === 'import-history') openHistoricalImport();
  if (action === 'consolidate-history') consolidateHistoricalSlots();
  if (action === 'export-backup') downloadBackup();
  if (action === 'restore-backup' && pendingRestore) {
    state = pendingRestore; pendingRestore = null; persist(); closeModal(); render(); showToast('Backup HSG restaurado.');
  }
  if (action === 'close-modal' || action === 'backdrop' && event.target === event.currentTarget) closeModal();
  if (action === 'backdrop' && event.target.classList.contains('modal-backdrop')) closeModal();
});
document.addEventListener('keydown', event => { if (event.key === 'Escape' && modalRoot.firstElementChild) closeModal(); });

function showSyncStatus(status) {
  const indicator = document.querySelector('#sync-indicator');
  if (!indicator) return;
  if (status.area) syncStates[status.area] = status.state;
  const state = ['conflict', 'auth', 'error', 'offline', 'saving'].find(item => Object.values(syncStates).includes(item)) || 'saved';
  const areaMessage = status.message && status.state === state ? status.message : '';
  const labels = { saving:'Salvando no Neon…', saved:'Sincronizado com o Neon', offline:'Sem conexão · alterações preservadas neste navegador', conflict:'Conflito de versão · recarregue para evitar sobrescrever dados', auth:'Sessão encerrada · entre novamente', error:'Falha ao salvar a cópia local' };
  indicator.textContent = areaMessage ? `${labels[state] || state} · ${areaMessage}` : (labels[state] || state);
  indicator.dataset.state = state;
  const reload = document.querySelector('#reload-conflict');
  if (reload) reload.hidden = state !== 'conflict';
}

function showLogin(message = '') {
  document.body.classList.add('auth-locked');
  authRoot.innerHTML = `<main class="auth-card"><span class="eyebrow">HUNTER PRO · ACESSO PRIVADO</span><h1>Entrar no Hunter Pro</h1><p>Use a senha configurada para acessar seus dados sincronizados no Neon.</p><form id="login-form"><label>Senha<input name="password" type="password" autocomplete="current-password" minlength="8" required></label><div class="auth-error" role="alert">${escapeHtml(message)}</div><button class="button primary" type="submit">Entrar</button></form></main>`;
  authRoot.querySelector('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      await login(new FormData(form).get('password'));
      const result = await initializePersistence();
      await finishStartup(result);
    } catch (error) {
      form.querySelector('.auth-error').textContent = error.message || 'Não foi possível entrar.';
      button.disabled = false;
    }
  });
}

function migrationCounts(area, payload = {}) {
  if (area === 'hsg') return `${payload.months?.length || 0} fechamentos, ${payload.historicalBases?.length || 0} bases, ${payload.historicalSlots?.length || 0} slots, ${payload.snapshots?.length || 0} snapshots e ${payload.audit?.length || 0} eventos`;
  if (area === 'performance') return `${payload.datasets?.length || 0} conjuntos, ${payload.audit?.length || 0} eventos`;
  return `${payload.accounts?.length || 0} contas, ${payload.trades?.length || 0} operações, ${payload.movements?.length || 0} movimentações e ${payload.audit?.length || 0} eventos`;
}

function renderMigration(result) {
  const rows = result.migration.map(item => `<section class="migration-area"><h2>${item.area === 'hsg' ? 'Dados HSG' : item.area === 'performance' ? 'Performance Lab' : 'Contas de trader'}</h2><p>Navegador: ${migrationCounts(item.area, item.local)}${item.remoteExists ? `<br>Neon: ${migrationCounts(item.area, item.remote)}` : '<br>Neon: vazio'}</p><label><input type="radio" name="${item.area}" value="local"> Importar dados do navegador para o Neon</label><label><input type="radio" name="${item.area}" value="remote"> Usar os dados do Neon${item.remoteExists ? '' : ' (manter vazio)'}</label></section>`).join('');
  authRoot.innerHTML = `<main class="auth-card auth-card-wide"><span class="eyebrow">MIGRAÇÃO SEGURA</span><h1>Escolha quais dados manter</h1><p>Os dados locais continuarão preservados até o Neon confirmar a importação. Para cada área, escolha a origem antes de continuar.</p><form id="migration-form">${rows}<div class="auth-error" role="alert"></div><button class="button primary" type="submit">Aplicar escolhas e abrir o app</button><button class="button secondary" type="button" id="migration-reload">Recarregar estado do banco</button></form></main>`;
  authRoot.querySelector('#migration-reload').addEventListener('click', async () => {
    try { await logout(); showLogin('Sessão encerrada. Entre novamente para carregar o estado atualizado.'); }
    catch (error) { authRoot.querySelector('.auth-error').textContent = error.message; }
  });
  authRoot.querySelector('#migration-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    const choices = Object.fromEntries(new FormData(form));
    if (result.migration.some(item => !choices[item.area])) {
      form.querySelector('.auth-error').textContent = 'Escolha uma origem para cada área antes de continuar.';
      return;
    }
    button.disabled = true;
    try {
      const selected = { hsg: result.hsg.payload, trader: result.trader.payload, performance: result.performance.payload };
      for (const item of result.migration) {
        if (choices[item.area] === 'local') {
          await importLocalState(item.area, item.local);
          selected[item.area] = item.local;
        } else {
          selected[item.area] = item.remote;
          useRemoteState(item.area, item.remote);
        }
      }
      await openApplication(selected);
    } catch (error) {
      form.querySelector('.auth-error').textContent = error.message || 'A importação não foi concluída. Os dados locais foram mantidos.';
      button.disabled = false;
    }
  });
}

async function openApplication(selected) {
  if (selected.hsg) useRemoteState('hsg', selected.hsg);
  if (selected.trader) useRemoteState('trader', selected.trader);
  if (selected.performance) useRemoteState('performance', selected.performance);
  state = loadState(selected.hsg || {});
  performanceState = initializePerformanceState(selected.performance || {});
  initializeTraderState(selected.trader || {});
  authRoot.innerHTML = '';
  document.body.classList.remove('auth-locked');
  showSyncStatus({ state: 'saved' });
  render();
  if (document.querySelector('#logout')) document.querySelector('#logout').onclick = async () => {
    try { await logout(); location.reload(); }
    catch (error) { showToast(error.message || 'Não foi possível encerrar a sessão.', 'error'); }
  };
  document.querySelector('#reload-conflict')?.addEventListener('click', () => location.reload(), { once: true });
}

async function finishStartup(result) {
  if (!result.authenticated) { showLogin(); return; }
  if (result.migration.length) { renderMigration(result); return; }
  await openApplication({ hsg: result.hsg.payload, trader: result.trader.payload, performance: result.performance.payload });
}

setPersistenceStatusHandler(showSyncStatus);
showLogin();
initializePersistence().then(finishStartup).catch(error => {
  showLogin(`Não foi possível carregar os dados do Neon: ${error.message || 'erro de conexão'}`);
});
