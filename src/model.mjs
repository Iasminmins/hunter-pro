const aliases = {
  timestamp: ['timestamp','datetime','date','time','data','datahora'], symbol: ['symbol','ticker','ativo'],
  direction: ['direction','side','direcao','lado'], entryType: ['entrytype','entry_type','tipoentrada'],
  outcome: ['outcome','result','resultado','status'], resultR: ['resultr','result_r','r','pnlr'],
  filterHits: ['filterhits','filters','filtros'], gapSize: ['gapsize','gap','gap_size'], session: ['session','sessao']
};
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function parseCsv(text) {
  const input = String(text ?? '').replace(/^\uFEFF/, '');
  const delimiter = (input.split(/\r?\n/, 1)[0].match(/;/g) || []).length > (input.split(/\r?\n/, 1)[0].match(/,/g) || []).length ? ';' : ',';
  const matrix = []; let row = []; let cell = ''; let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"' && quoted && input[i + 1] === '"') { cell += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && input[i + 1] === '\n') i++; row.push(cell.trim()); if (row.some(Boolean)) matrix.push(row); row = []; cell = ''; }
    else cell += char;
  }
  row.push(cell.trim()); if (row.some(Boolean)) matrix.push(row);
  if (matrix.length < 2) return [];
  const headers = matrix.shift().map(normalize);
  return matrix.map(cells => Object.fromEntries(Object.entries(aliases).map(([key, options]) => {
    const index = headers.findIndex(header => options.includes(header));
    const raw = index < 0 ? '' : cells[index] ?? '';
    return [key, key === 'resultR' ? Number(String(raw).replace(',', '.')) : raw];
  }))).filter(item => Object.values(item).some(value => value !== '' && !Number.isNaN(value)));
}

export function validateMonthlyInput(input) {
  const errors = [];
  if (!Number.isInteger(Number(input.month)) || Number(input.month) < 1 || Number(input.month) > 12) errors.push('Selecione um mês válido.');
  if (!Number.isInteger(Number(input.year)) || Number(input.year) < 2000 || Number(input.year) > 2100) errors.push('Informe um ano entre 2000 e 2100.');
  if (!String(input.hunterVersion ?? '').trim()) errors.push('Informe a versão Hunter.');
  if (!String(input.hsgConfig ?? '').trim()) errors.push('Informe a configuração HSG.');
  for (const [key, label] of [['hsgFile','CSV HSG Dataset'],['ninjaFile','CSV NinjaTrader / Grid']]) {
    const file = input[key];
    if (!file) errors.push(`Envie o ${label}.`);
    else if (!String(file.name).toLowerCase().endsWith('.csv')) errors.push(`${label}: selecione um arquivo .csv.`);
  }
  return errors;
}

export function summarizeTrades(trades) {
  const wins = trades.filter(t => /^(w|win|winner|gain|vitoria|vitorioso)$/i.test(String(t.outcome).trim())).length;
  const losses = trades.filter(t => /^(l|loss|loser|perda|perdedor)$/i.test(String(t.outcome).trim())).length;
  const grossWins = trades.reduce((sum,t) => sum + (t.resultR > 0 ? t.resultR : 0), 0);
  const grossLosses = Math.abs(trades.reduce((sum,t) => sum + (t.resultR < 0 ? t.resultR : 0), 0));
  let equity = 0, peak = 0, drawdown = 0;
  for (const trade of trades) { equity += Number(trade.resultR) || 0; peak = Math.max(peak, equity); drawdown = Math.min(drawdown, equity - peak); }
  const totalR = trades.reduce((sum,t) => sum + (Number(t.resultR) || 0), 0);
  return { trades: trades.length, wins, losses, breakeven: trades.length - wins - losses, winRate: trades.length ? wins / trades.length : 0, profitFactor: grossLosses ? grossWins / grossLosses : grossWins ? Infinity : 0, totalR, drawdown };
}

export function csvHeaderError(text, label) {
  const parsed = parseCsv(text);
  if (!parsed.length) return `${label}: o CSV precisa ter cabeçalho e pelo menos uma linha de dados válida.`;
  const normalized = normalize(text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0]);
  if (!/(outcome|result|resultado|status)/.test(normalized) || !/(resultr|result_r|pnlr|,r|;r)/.test(normalized)) return `${label}: inclua colunas de resultado (Outcome/Resultado) e resultado R (Result R).`;
  return '';
}
