const aliases = {
  timestamp: ['timestamp','datetime','date','time','data','datahora'], signalId: ['signalid','id'], symbol: ['symbol','ticker','ativo'],
  direction: ['direction','side','direcao','lado'], entryType: ['entrytype','entry_type','tipoentrada'],
  outcome: ['outcome','result','resultado','status'], resultR: ['resultr','result_r','r','pnlr'],
  filterHits: ['filterhits','filters','filtros'], filterBlocks: ['filterblocks','blockedfilters','filtersblocked','bloqueios','filtrosbloqueados'], gapSize: ['gapsize','gap','gap_size'], session: ['session','sessao']
};
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

function parseMatrix(text, preferredDelimiter) {
  const input = String(text ?? '').replace(/^\uFEFF/, '');
  const lines = input.split(/\r?\n/);
  const candidates = [...new Set([preferredDelimiter, ...[';', ',', '\t'].sort((a,b) => (lines[0].split(b).length - lines[0].split(a).length))].filter(Boolean))];
  const delimiter = candidates.sort((a,b) => (lines[0].split(b).length - lines[0].split(a).length))[0] || ',';
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
  return { delimiter, matrix };
}

const headerFields = row => row.map(normalize);
const hasResultColumn = headers => headers.some(header => aliases.resultR.includes(header));
const findHeader = (matrix, required = hasResultColumn) => {
  const index = matrix.findIndex(row => required(headerFields(row)));
  return index < 0 ? null : { headers: headerFields(matrix[index]), rows: matrix.slice(index + 1), index };
};

export function parseCsvTable(text) {
  const { delimiter, matrix } = parseMatrix(text);
  const table = findHeader(matrix);
  if (!table) return { headers: [], rows: [], delimiter };
  return { ...table, delimiter };
}

export function parseCsv(text) {
  const { headers, rows } = parseCsvTable(text);
  if (!rows.length) return [];
  return rows.map(cells => Object.fromEntries(Object.entries(aliases).map(([key, options]) => {
    const index = headers.findIndex(header => options.includes(header));
    const raw = index < 0 ? '' : cells[index] ?? '';
    return [key, key === 'resultR' ? Number(String(raw).replace(',', '.')) : raw];
  }))).filter(item => Object.values(item).some(value => value !== '' && !Number.isNaN(value))).map(item => ({
    ...item,
    filterBlocksAvailable: headers.some(header => aliases.filterBlocks.includes(header)),
    outcome: item.outcome || (Number.isFinite(item.resultR) ? item.resultR > 0 ? 'W' : item.resultR < 0 ? 'L' : 'BE' : '')
  }));
}

export function csvTableError(text, label) {
  const report = parseNinjaReport(text);
  if (report.tradeCount !== null && report.netProfit !== null && report.profitFactor !== null) return '';
  const { headers, rows } = parseCsvTable(text);
  if (!headers.length) return `${label}: não encontrei um relatório de desempenho NinjaTrader completo nem uma tabela com Result_R. Confira o arquivo exportado.`;
  const validRows = rows.filter(row => row.some(cell => cell !== ''));
  if (!validRows.length) return `${label}: encontrei o cabeçalho, mas não há linhas de operações abaixo dele.`;
  return '';
}

function parseLocalizedNumber(value) {
  const text = String(value ?? '').replace(/[^\d,.-]/g, '').trim();
  if (!text) return null;
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export function parseNinjaReport(text) {
  const { matrix } = parseMatrix(text, ';');
  const values = new Map(matrix.filter(row => row.length > 1).map(row => [normalize(row[0]), row.slice(1)]));
  const get = (...labels) => {
    for (const label of labels) {
      const row = values.get(normalize(label));
      const value = row?.find(cell => String(cell).trim() !== '');
      if (value !== undefined) return parseLocalizedNumber(value);
    }
    return null;
  };
  return {
    tradeCount: get('# total de negociações', 'total de negociações', 'total trades'),
    netProfit: get('lucro líquido total', 'net profit'),
    profitFactor: get('fator de lucro', 'profit factor'),
    winRate: get('porcentagem de lucro', 'percent profitable')
  };
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

export function aggregateFilters(trades, knownCodes = []) {
  const codes = new Map();
  const emptyRow = code => ({ code, hits: 0, blocks: 0, blockRate: null, exclusive: 0, overlap: 0, winsObserved: 0, lossesObserved: 0, winsBlocked: 0, lossesBlocked: 0, resultR: 0 });
  for (const code of knownCodes) codes.set(String(code).toUpperCase(), emptyRow(String(code).toUpperCase()));
  for (const trade of trades) {
    const hits = [...new Set(String(trade.filterHits || '').split(/[,|;+\s]+/).map(code => code.trim().toUpperCase()).filter(Boolean))];
    const blocks = [...new Set(String(trade.filterBlocks || '').split(/[,|;+\s]+/).map(code => code.trim().toUpperCase()).filter(Boolean))];
    const wins = /^(w|win|winner|gain|vitoria|vitorioso)$/i.test(String(trade.outcome || '').trim());
    const losses = /^(l|loss|loser|perda|perdedor)$/i.test(String(trade.outcome || '').trim());
    for (const code of new Set([...hits,...blocks])) {
      const row = codes.get(code) || emptyRow(code);
      if (hits.includes(code)) {
        row.hits++;
        if (hits.length === 1) row.exclusive++; else row.overlap++;
        if (wins) row.winsObserved++;
        if (losses) row.lossesObserved++;
        row.resultR += Number(trade.resultR) || 0;
      }
      if (blocks.includes(code)) {
        row.blocks++;
        if (wins) row.winsBlocked++;
        if (losses) row.lossesBlocked++;
      }
      codes.set(code, row);
    }
  }
  const blockDataComplete = trades.length > 0 && trades.every(trade => trade.filterBlocksAvailable === true);
  return [...codes.values()].map(row => ({ ...row, blocks: blockDataComplete ? row.blocks : null, winsBlocked: blockDataComplete ? row.winsBlocked : null, lossesBlocked: blockDataComplete ? row.lossesBlocked : null, blockRate: blockDataComplete && row.hits ? row.blocks / row.hits : null, status: row.hits || row.blocks ? 'OCORRÊNCIA' : 'SEM DADOS' })).sort((a, b) => a.code.localeCompare(b.code));
}

export function weightedRecentMonths(blocks, weights = [0.5, 0.3, 0.2]) {
  const recent = [...blocks].sort((a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month)).slice(0, 3);
  if (!recent.length) return { months: [], trades: 0, totalR: null, winRate: null, profitFactor: null, weightsUsed: [] };
  const weightsUsed = recent.map((block, index) => ({ block, weight: weights[index] }));
  const totalWeight = weightsUsed.reduce((sum, item) => sum + item.weight, 0);
  const combine = key => weightsUsed.reduce((sum, item) => sum + (Number(item.block.summary?.[key]) || 0) * item.weight, 0) / totalWeight;
  const tradeCount = recent.reduce((sum, block) => sum + (Number(block.summary?.trades) || 0), 0);
  return { months: recent, trades: tradeCount, totalR: combine('totalR'), winRate: combine('winRate'), profitFactor: combine('profitFactor'), weightsUsed: weightsUsed.map(item => ({ month: item.block.month, year: item.block.year, weight: item.weight / totalWeight })) };
}

export function csvHeaderError(text, label) {
  const { headers } = parseCsvTable(text);
  if (!headers.length) {
    const { matrix } = parseMatrix(text);
    const firstHeaders = headerFields(matrix[0] || []);
    if (firstHeaders.some(header => ['outcome','result','resultado','status'].includes(header))) return `${label}: inclua uma coluna de resultado R (Result R, Result_R ou PnL R).`;
    return `${label}: não encontrei uma tabela com cabeçalho de operações e a coluna Result_R.`;
  }
  if (!parseCsv(text).length) return `${label}: o CSV precisa ter pelo menos uma linha de dados válida.`;
  if (!hasResultColumn(headers)) return `${label}: inclua uma coluna de resultado R (Result R, Result_R ou PnL R).`;
  return '';
}
