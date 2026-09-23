const DEFAULT_PROJECTION = {
  currency: '',
  accountIds: null,
  source: 'history',
  historyMonths: 6,
  horizonMonths: 12,
  availableCapital: 0,
  reserve: 0,
  openingCost: 0,
  monthlyAccountFee: 0,
  existingMonthlyCosts: 0,
  monthlyContribution: 0,
  payoutPercent: 80,
  manualConservative: 0,
  manualBase: 0,
  manualOptimistic: 0
};

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const money = (value, currency) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
const numberValue = value => Number.isFinite(Number(value)) ? Number(value) : 0;

let importDraft = null;

function normalizedHeader(value) { return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function detectColumn(headers, names) { return headers.findIndex(value => names.includes(normalizedHeader(value))); }
function validDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
function localDate(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  const text = String(value ?? '').trim();
  let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match && validDate(Number(match[1]), Number(match[2]), Number(match[3]))) return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[3])).padStart(2, '0')}`;
  match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (match && validDate(Number(match[3]), Number(match[2]), Number(match[1]))) return `${match[3]}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[1])).padStart(2, '0')}`;
  if (/^\d+(\.\d+)?$/.test(text) && globalThis.XLSX?.SSF) {
    const parts = globalThis.XLSX.SSF.parse_date_code(Number(text));
    if (parts) return `${parts.y}-${String(parts.m).padStart(2, '0')}-${String(parts.d).padStart(2, '0')}`;
  }
  match = text.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (match && validDate(Number(match[1]), Number(match[2]), 1)) return match[1] + '-' + String(Number(match[2])).padStart(2, '0') + '-01';
  match = text.match(/^(\d{1,2})[-/.](\d{4})$/);
  if (match && validDate(Number(match[2]), Number(match[1]), 1)) return match[2] + '-' + String(Number(match[1])).padStart(2, '0') + '-01';
  const namedMonth = text.toLocaleLowerCase('pt-BR').match(/^([a-zç]+)[ /-]+(\d{4})$/);
  if (namedMonth) {
    const names = [['jan','january'],['fev','february'],['mar','march'],['abr','april'],['mai','may'],['jun','june'],['jul','july'],['ago','august'],['set','september'],['out','october'],['nov','november'],['dez','december']];
    const index = names.findIndex(pair => pair.some(name => name.startsWith(namedMonth[1]) || namedMonth[1].startsWith(name)));
    if (index >= 0) return namedMonth[2] + '-' + String(index + 1).padStart(2, '0') + '-01';
  }
  return '';
}
function localizedNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const original = String(value ?? '').trim();
  const negative = /^\(.*\)$/.test(original);
  const text = original.replace(/\s/g, '').replace(/[^\d,.-]/g, '');
  if (!text) return null;
  const parsed = Number(text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text);
  return Number.isFinite(parsed) ? (negative ? -Math.abs(parsed) : parsed) : null;
}
function selectMarkup(name, headers, selected) {
  return `<select data-projection-import="${name}">${headers.map((header, index) => `<option value="${index}" ${index === selected ? 'selected' : ''}>${esc(header || `Coluna ${index + 1}`)}</option>`).join('')}</select>`;
}
function importMarkup(state) {
  const draft = importDraft;
  const accounts = state.accounts.filter(account => account.status === 'ativa');
  const accountValue = draft?.accountId || '__new';
  const headers = draft?.sheets?.[draft.sheetIndex]?.headers || [];
  const accountOptions = `<option value="__new" ${accountValue === '__new' ? 'selected' : ''}>Criar nova conta com esta planilha</option>${accounts.map(account => `<option value="${esc(account.id)}" ${accountValue === account.id ? 'selected' : ''}>${esc(account.name)} · ${esc(account.currency)}</option>`).join('')}`;
  const preview = draft?.preview;
  const sheetPicker = draft?.sheets?.length > 1 ? `<label>Aba da planilha<select data-projection-import="sheet">${draft.sheets.map((item, index) => `<option value="${index}" ${index === draft.sheetIndex ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></label>` : '';
  const mapping = draft && headers.length ? `<div class="trader-form-grid projection-import-mapping">${sheetPicker}<label>Coluna de data${selectMarkup('date-column', headers, draft.dateColumn)}</label><label>Coluna de resultado / lucro líquido${selectMarkup('pnl-column', headers, draft.pnlColumn)}</label></div><div class="trader-form-grid projection-import-mapping"><label>Destino dos dados<select data-projection-import="account">${accountOptions}</select></label>${accountValue === '__new' ? `<label>Nome da conta<input data-projection-import="account-name" value="${esc(draft.accountName || draft.fileName.replace(/\.[^.]+$/, ''))}" maxlength="80"></label><label>Moeda<select data-projection-import="currency"><option ${draft.currency === 'USD' ? 'selected' : ''}>USD</option><option ${draft.currency === 'BRL' ? 'selected' : ''}>BRL</option></select></label>` : ''}</div><div class="projection-import-actions"><button class="button secondary" type="button" data-projection-import-action="preview">Conferir planilha</button>${preview ? `<span>${preview.accepted.length} linhas válidas · ${preview.duplicates} duplicadas · ${preview.rejected.length} rejeitadas</span>` : ''}</div>${draft.error ? `<p class="projection-import-error" role="alert">${esc(draft.error)}</p>` : ''}${preview ? `<p class="projection-note">${preview.monthCount} mês(es) com resultado · ${preview.accepted.slice(0, 3).map(row => `${row.date}: ${money(row.pnl, draft.currency || 'USD')}`).join(' · ') || 'nenhuma linha pronta para importar'}${preview.rejected.length ? `<br>Linhas ignoradas: ${preview.rejected.slice(0, 3).map(row => `${row.line} (${esc(row.reason)})`).join(' · ')}` : ''}</p><div class="projection-import-actions"><button class="button primary" type="button" data-projection-import-action="confirm" ${preview.accepted.length ? '' : 'disabled'}>Importar e projetar</button><button class="button secondary" type="button" data-projection-import-action="cancel">Cancelar</button></div>` : ''}` : '';
  return `<section class="projection-import"><div><h3>Importar planilha de resultados</h3><p>Envie um Excel ou CSV com uma coluna de data e outra de lucro ou prejuízo. Os resultados serão vinculados a uma conta e usados na projeção.</p></div><label class="projection-file">Selecionar planilha<input type="file" data-projection-file accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"></label>${draft ? `<p class="table-hint">Arquivo: ${esc(draft.fileName)}</p>${mapping}${draft.error && !headers.length ? `<p class="projection-import-error" role="alert">${esc(draft.error)}</p>` : ''}` : ''}</section>`;
}

function monthKey(date) {
  const match = String(date || '').match(/^(\d{4})-(\d{2})-/);
  return match && Number(match[2]) >= 1 && Number(match[2]) <= 12 ? `${match[1]}-${match[2]}` : null;
}

function historyMonths(trades, accountIds, monthsBack) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const grouped = new Map();
  for (const trade of trades) {
    if (!accountIds.has(trade.accountId)) continue;
    const key = monthKey(trade.date);
    const pnl = Number(trade.pnl);
    if (!key || key >= currentMonth || !Number.isFinite(pnl)) continue;
    grouped.set(key, (grouped.get(key) || 0) + pnl);
  }
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-monthsBack).map(([month, pnl]) => ({ month, pnl }));
}

function historicalScenarios(months) {
  if (!months.length) return null;
  const values = months.map(month => month.pnl);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const deviation = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
  return { conservative: mean - deviation, base: mean, optimistic: mean + deviation };
}

function projectionRows(config, scenarios, horizon) {
  const initial = Math.max(0, numberValue(config.availableCapital));
  const reserve = Math.max(0, numberValue(config.reserve));
  const existingCosts = Math.max(0, numberValue(config.existingMonthlyCosts));
  const contribution = numberValue(config.monthlyContribution);
  const payout = Math.min(100, Math.max(0, numberValue(config.payoutPercent))) / 100;
  const openingCost = Math.max(0, numberValue(config.openingCost));
  const monthlyFee = Math.max(0, numberValue(config.monthlyAccountFee));

  return Object.fromEntries(Object.entries(scenarios).map(([scenario, monthlyProfit]) => {
    let cash = initial;
    const rows = [{ month: 0, cash, affordable: affordableAccounts(cash, reserve, openingCost, monthlyFee, horizon) }];
    for (let month = 1; month <= horizon; month++) {
      cash += monthlyProfit * payout + contribution - existingCosts;
      rows.push({ month, cash, affordable: affordableAccounts(cash, reserve, openingCost, monthlyFee, horizon - month + 1) });
    }
    return [scenario, rows];
  }));
}

function affordableAccounts(cash, reserve, openingCost, monthlyFee, remainingMonths) {
  const requiredPerAccount = openingCost + monthlyFee * Math.max(0, remainingMonths);
  if (requiredPerAccount <= 0) return null;
  return Math.max(0, Math.floor(Math.max(0, cash - reserve) / requiredPerAccount));
}

function field(label, name, value, options = {}) {
  const { min = '0', max = '', step = '0.01', hint = '' } = options;
  return `<label>${label}<input type="number" data-projection-field="${name}" value="${esc(value)}" min="${min}" ${max ? `max="${max}"` : ''} step="${step}">${hint ? `<small>${hint}</small>` : ''}</label>`;
}

function renderAccountPicker(accounts, selectedIds) {
  if (!accounts.length) return '<p class="projection-muted">Nenhuma conta ativa nesta moeda. Você ainda pode fazer uma projeção manual.</p>';
  return `<fieldset class="projection-account-picker"><legend>Contas usadas como base</legend><div>${accounts.map(account => `<label><input type="checkbox" data-projection-account="${esc(account.id)}" ${selectedIds.has(account.id) ? 'checked' : ''}><span>${esc(account.name)} <small>${esc(account.provider || account.platform || '')}</small></span></label>`).join('')}</div></fieldset>`;
}

export function renderProjection(state) {
  state.projection = { ...DEFAULT_PROJECTION, ...(state.projection || {}) };
  const config = state.projection;
  const activeAccounts = state.accounts.filter(account => account.status === 'ativa');
  const currencies = [...new Set(['USD', 'BRL', ...activeAccounts.map(account => String(account.currency || '').toUpperCase()).filter(value => /^[A-Z]{3}$/.test(value))])];
  const currency = currencies.includes(config.currency) ? config.currency : (activeAccounts[0]?.currency || 'USD');
  const matchingAccounts = activeAccounts.filter(account => account.currency === currency);
  const selectedIds = Array.isArray(config.accountIds)
    ? new Set(config.accountIds.filter(id => matchingAccounts.some(account => account.id === id)))
    : new Set(matchingAccounts.map(account => account.id));
  const months = historyMonths(state.trades, selectedIds, Number(config.historyMonths) || 6);
  const history = historicalScenarios(months);
  const mode = config.source === 'manual' || !history ? 'manual' : 'history';
  const scenarios = mode === 'history' ? history : {
    conservative: numberValue(config.manualConservative),
    base: numberValue(config.manualBase),
    optimistic: numberValue(config.manualOptimistic)
  };
  const horizon = Math.min(24, Math.max(3, Number(config.horizonMonths) || 12));
  const rows = projectionRows(config, scenarios, horizon);
  const currencyOptions = currencies.map(value => `<option value="${value}" ${value === currency ? 'selected' : ''}>${value}</option>`).join('');
  const historyMonthsOptions = [3, 6, 12].map(value => `<option value="${value}" ${Number(config.historyMonths) === value ? 'selected' : ''}>${value} meses</option>`).join('');
  const horizonOptions = [3, 6, 12, 24].map(value => `<option value="${value}" ${horizon === value ? 'selected' : ''}>${value} meses</option>`).join('');
  const names = { conservative: 'Conservador', base: 'Base', optimistic: 'Otimista' };
  const manualFields = mode === 'manual' ? `<div class="trader-form-grid projection-scenarios">${field('Resultado mensal · conservador', 'manualConservative', config.manualConservative, { min: '-100000000' })}${field('Resultado mensal · base', 'manualBase', config.manualBase, { min: '-100000000' })}${field('Resultado mensal · otimista', 'manualOptimistic', config.manualOptimistic, { min: '-100000000' })}</div>` : '';
  const summaryCards = Object.entries(rows).map(([key, values]) => {
    const end = values.at(-1);
    return `<article class="kpi"><div class="kpi-label">Cenário ${names[key]}</div><div class="kpi-value">${money(end.cash, currency)}</div><div class="kpi-help">Caixa no mês ${horizon} · ${end.affordable === null ? 'informe o custo da conta' : `${end.affordable} nova(s) conta(s) caberiam`}</div></article>`;
  }).join('');
  const tableRows = Array.from({ length: horizon + 1 }, (_, month) => `<tr><td>${month === 0 ? 'Hoje' : `Mês ${month}`}</td>${Object.entries(rows).map(([key, values]) => {
    const row = values[month];
    return `<td>${money(row.cash, currency)}<div class="table-hint">${row.affordable === null ? 'Defina o custo por conta' : `${row.affordable} conta(s) cabem`}</div></td>`;
  }).join('')}</tr>`).join('');
  const historyLabel = history
    ? months.length < 3
      ? `Estimativa inicial com ${months.length} mês(es) fechado(s). Com menos de 3 meses, a variação ainda é incerta e os cenários ficam iguais à média observada.`
      : `Estimativa calculada com ${months.length} mês(es) fechado(s): média mensal ± desvio histórico. Os cenários não são probabilidades.`
    : 'Ainda não há mês fechado com resultado para projetar. Importe operações de meses encerrados ou informe valores manualmente.';

  return `<section class="panel projection-panel"><div class="panel-heading"><div><h2>Planejador de expansão</h2><p class="panel-description">Simule quanto caixa poderá separar para abrir contas, preservando uma reserva.</p></div></div>
    ${importMarkup(state)}
    <div class="trader-form-grid projection-controls">
      <label>Moeda da projeção<select data-projection-field="currency">${currencyOptions}</select></label>
      <label>Usar resultado mensal<select data-projection-field="source"><option value="history" ${mode === 'history' ? 'selected' : ''}>Histórico das contas</option><option value="manual" ${mode === 'manual' ? 'selected' : ''}>Estimativa manual</option></select></label>
      ${mode === 'history' ? `<label>Janela do histórico<select data-projection-field="historyMonths">${historyMonthsOptions}</select></label>` : ''}
      <label>Horizonte<select data-projection-field="horizonMonths">${horizonOptions}</select></label>
      ${field('Caixa disponível hoje', 'availableCapital', config.availableCapital, { hint: 'Dinheiro separado para custos de novas contas, não o saldo nominal de uma prop firm.' })}
      ${field('Reserva mínima', 'reserve', config.reserve)}
      ${field('Custo inicial por conta nova', 'openingCost', config.openingCost)}
      ${field('Mensalidade por conta nova', 'monthlyAccountFee', config.monthlyAccountFee)}
      ${field('Custos mensais atuais', 'existingMonthlyCosts', config.existingMonthlyCosts)}
      ${field('Aporte mensal externo', 'monthlyContribution', config.monthlyContribution, { min: '-100000000' })}
      ${field('Percentual do resultado que vira caixa', 'payoutPercent', config.payoutPercent, { max: '100', step: '1' })}
    </div>
    ${renderAccountPicker(matchingAccounts, selectedIds)}
    ${manualFields}
    <p class="projection-note">${mode === 'history' ? historyLabel : 'Informe a expectativa mensal antes do percentual de repasse. Os resultados negativos também reduzem o caixa projetado.'}</p>
    ${mode === 'history' ? `<p class="table-hint">Contas selecionadas: ${selectedIds.size || 'nenhuma'} · ${months.length} mês(es) fechado(s) com operações.</p>` : ''}
    <div class="kpi-grid projection-summary">${summaryCards}</div>
    <section class="projection-table"><div class="panel-heading"><h3>Caixa projetado e capacidade de abertura</h3><span class="panel-tag">Por cenário · ${horizon} meses</span></div><div class="table-scroll"><table><thead><tr><th>Período</th><th>Conservador</th><th>Base</th><th>Otimista</th></tr></thead><tbody>${tableRows}</tbody></table></div></section>
    <div class="info-strip"><span>ⓘ</span><p>A quantidade de novas contas considera o custo inicial e reserva o custo mensal de cada uma até o fim do horizonte. Custos mensais atuais são descontados mês a mês. É uma simulação com os valores informados; não garante resultados nem aprovação em prop firms. Nenhuma conta real é criada ou alterada.</p></div>
  </section>`;
}

function sheetDescription(name, worksheet) {
  const grid = globalThis.XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: '', blankrows: false });
  let at = grid.findIndex(row => row.some(value => String(value ?? '').trim()));
  if (at < 0) return null;
  const detected = grid.slice(at, at + 12).findIndex(row => detectColumn(row, ['date','data','timestamp','datetime','datahora','datafechamento','tradedate','closedat','month','mes','competencia','period','periodo']) >= 0 && detectColumn(row, ['pnl','netpnl','lucro','resultado','resultadoli quido'.Replace(' ',''),'profit','profitloss','netprofit','lucroliquido']) >= 0);
  if (detected >= 0) at += detected;
  const headers = (grid[at] || []).map((value, index) => String(value ?? '').trim() || `Coluna ${index + 1}`);
  return { name, headers, rows: grid.slice(at + 1), headerRow: at + 1 };
}
async function loadProjectionFile(file) {
  if (!file) return null;
  if (file.size > 25 * 1024 * 1024) throw new Error('A planilha deve ter até 25 MB.');
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error('Envie um arquivo Excel (.xlsx/.xls) ou CSV.');
  if (!globalThis.XLSX) throw new Error('O leitor de planilhas não carregou. Atualize a página e tente novamente.');
  const workbook = globalThis.XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const sheets = workbook.SheetNames.map(name => sheetDescription(name, workbook.Sheets[name])).filter(Boolean);
  if (!sheets.length) throw new Error('Não encontrei uma tabela com cabeçalhos na planilha.');
  const first = sheets[0];
  const dateColumn = detectColumn(first.headers, ['date','data','timestamp','datetime','datahora','datafechamento','tradedate','closedat','month','mes','competencia','period','periodo']);
  const pnlColumn = detectColumn(first.headers, ['pnl','netpnl','lucro','resultado','resultadoli quido'.Replace(' ',''),'profit','profitloss','netprofit','lucroliquido']);
  return { fileName: file.name, sheets, sheetIndex: 0, dateColumn: Math.max(0,dateColumn), pnlColumn: Math.max(0,pnlColumn), accountId: '__new', accountName: file.name.replace(/\.[^.]+$/, ''), currency: 'USD', preview: null, error: '' };
}
function preparePreview(draft, state) {
  const sheet = draft.sheets[draft.sheetIndex];
  const accountId = draft.accountId === '__new' ? '' : draft.accountId;
  const known = new Set(accountId ? state.trades.filter(trade => trade.accountId === accountId).map(trade => `${trade.date}|${Number(trade.pnl)}`) : []);
  const accepted = [], rejected = [];
  let duplicates = 0;
  sheet.rows.forEach((row, index) => {
    if (!row.some(value => String(value ?? '').trim())) return;
    const date = localDate(row[draft.dateColumn]);
    const pnl = localizedNumber(row[draft.pnlColumn]);
    if (!date || !Number.isFinite(pnl)) { rejected.push({ line: index + sheet.headerRow + 1, reason: !date ? 'data inválida' : 'resultado inválido' }); return; }
    const key = `${date}|${pnl}`;
    if (known.has(key)) { duplicates++; return; }
    known.add(key);
    accepted.push({ date, pnl });
  });
  draft.preview = { accepted, rejected, duplicates, monthCount: new Set(accepted.map(row => row.date.slice(0, 7))).size };
  draft.error = '';
}
function commitPreview(draft, state, save, render) {
  if (!draft?.preview?.accepted?.length) return;
  let account = draft.accountId === '__new' ? null : state.accounts.find(item => item.id === draft.accountId && item.status === 'ativa');
  if (draft.accountId !== '__new' && !account) { draft.error = 'A conta escolhida não está mais ativa. Selecione outra.'; render(); return; }
  const dates = draft.preview.accepted.map(row => row.date).sort();
  const now = new Date().toISOString();
  if (!account) {
    const name = String(draft.accountName || '').trim();
    if (!name) { draft.error = 'Informe o nome da conta para continuar.'; render(); return; }
    account = { id: crypto.randomUUID(), name, provider: 'Importado de planilha', platform: 'Planilha', currency: draft.currency || 'USD', initialBalance: 0, startDate: dates[0], currentBalance: null, balanceSource: 'initial', updatedAt: null, status: 'ativa', dailyLimit: null, drawdownLimit: null, createdAt: now };
    state.accounts.push(account);
  }
  const imported = draft.preview.accepted.map(row => ({ id: crypto.randomUUID(), accountId: account.id, date: row.date, pnl: row.pnl, fees: 0, externalId: '', note: `Importado de ${draft.fileName}`, createdAt: now, source: 'spreadsheet' }));
  state.trades.push(...imported);
  state.audit.unshift({ action: 'spreadsheet-import', at: now, accountId: account.id, fileName: draft.fileName, count: imported.length, duplicates: draft.preview.duplicates, rejected: draft.preview.rejected.length });
  state.projection.currency = account.currency;
  state.projection.accountIds = [account.id];
  state.projection.source = 'history';
  importDraft = null;
  save();
  render();
}
export function bindProjection(view, state, save, render) {
  const root = view.querySelector('.projection-panel');
  if (!root) return;
  root.addEventListener('change', async event => {
    const fileInput = event.target.closest('[data-projection-file]');
    if (fileInput) {
      try { importDraft = await loadProjectionFile(fileInput.files?.[0]); }
      catch (error) { importDraft = { fileName: fileInput.files?.[0]?.name || '', sheets: [], error: error.message, accountId: '__new', currency: 'USD' }; }
      render(view);
      return;
    }
    const importField = event.target.closest('[data-projection-import]');
    if (importField && importDraft) {
      const key = importField.dataset.projectionImport;
      if (key === 'sheet') {
        importDraft.sheetIndex = Number(importField.value);
        const headers = importDraft.sheets[importDraft.sheetIndex].headers;
        importDraft.dateColumn = Math.max(0, detectColumn(headers, ['date','data','timestamp','datetime','datahora','datafechamento','tradedate','closedat','month','mes','competencia','period','periodo']));
        importDraft.pnlColumn = Math.max(0, detectColumn(headers, ['pnl','netpnl','lucro','resultado','resultadoli quido'.Replace(' ',''),'profit','profitloss','netprofit','lucroliquido']));
      } else if (key === 'date-column') importDraft.dateColumn = Number(importField.value);
      else if (key === 'pnl-column') importDraft.pnlColumn = Number(importField.value);
      else if (key === 'account') { importDraft.accountId = importField.value; importDraft.currency = state.accounts.find(account => account.id === importField.value)?.currency || importDraft.currency; }
      else if (key === 'currency') importDraft.currency = importField.value;
      importDraft.preview = null;
      render(view);
      return;
    }
    const field = event.target.closest('[data-projection-field]');
    const accountToggle = event.target.closest('[data-projection-account]');
    if (field) {
      const key = field.dataset.projectionField;
      if (key === 'source' || key === 'currency') state.projection[key] = field.value;
      else state.projection[key] = Number(field.value);
      if (key.startsWith('manual')) state.projection.source = 'manual';
      if (key === 'currency') state.projection.accountIds = null;
    } else if (accountToggle) {
      const currency = state.projection.currency || state.accounts.find(account => account.status === 'ativa')?.currency || 'USD';
      const matchingAccounts = state.accounts.filter(account => account.status === 'ativa' && account.currency === currency);
      const selected = Array.isArray(state.projection.accountIds) ? new Set(state.projection.accountIds) : new Set(matchingAccounts.map(account => account.id));
      if (accountToggle.checked) selected.add(accountToggle.dataset.projectionAccount);
      else selected.delete(accountToggle.dataset.projectionAccount);
      state.projection.accountIds = [...selected];
    } else return;
    save();
    render(view);
  });
  root.addEventListener('input', event => {
    if (event.target.matches('[data-projection-import="account-name"]') && importDraft) importDraft.accountName = event.target.value;
  });
  root.addEventListener('click', event => {
    const action = event.target.closest('[data-projection-import-action]')?.dataset.projectionImportAction;
    if (action === 'preview' && importDraft) {
      const sheet = importDraft.sheets[importDraft.sheetIndex];
      if (!sheet || importDraft.dateColumn === importDraft.pnlColumn || !sheet.headers.length) importDraft.error = 'Selecione colunas diferentes para data e resultado.';
      else preparePreview(importDraft, state);
      render(view);
    } else if (action === 'confirm') commitPreview(importDraft, state, save, () => render(view));
    else if (action === 'cancel') { importDraft = null; render(view); }
  });
}
