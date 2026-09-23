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
  if (months.length < 3) return null;
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
    ? `Estimativa calculada com ${months.length} mês(es) fechado(s) com operações: média mensal ± desvio histórico. Os cenários não são probabilidades.`
    : `Há ${months.length} mês(es) fechado(s) com operações selecionadas; são necessários pelo menos 3 para estimar a variação. Preencha os cenários manualmente.`;

  return `<section class="panel projection-panel"><div class="panel-heading"><div><h2>Planejador de expansão</h2><p class="panel-description">Simule quanto caixa poderá separar para abrir contas, preservando uma reserva.</p></div></div>
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

export function bindProjection(view, state, save, render) {
  const root = view.querySelector('.projection-panel');
  if (!root) return;
  root.addEventListener('change', event => {
    const field = event.target.closest('[data-projection-field]');
    const accountToggle = event.target.closest('[data-projection-account]');
    if (field) {
      const key = field.dataset.projectionField;
      if (key === 'source' || key === 'currency') state.projection[key] = field.value;
      else if (key === 'historyMonths' || key === 'horizonMonths') state.projection[key] = Number(field.value);
      else state.projection[key] = Number(field.value);
      if (key.startsWith('manual')) state.projection.source = 'manual';
      if (key === 'currency') state.projection.accountIds = null;
    } else if (accountToggle) {
      const currency = state.projection.currency || state.accounts.find(account => account.status === 'ativa')?.currency || 'USD';
      const matchingAccounts = state.accounts.filter(account => account.status === 'ativa' && account.currency === currency);
      const selected = Array.isArray(state.projection.accountIds)
        ? new Set(state.projection.accountIds)
        : new Set(matchingAccounts.map(account => account.id));
      if (accountToggle.checked) selected.add(accountToggle.dataset.projectionAccount);
      else selected.delete(accountToggle.dataset.projectionAccount);
      state.projection.accountIds = [...selected];
    } else return;
    save();
    render(view);
  });
}
