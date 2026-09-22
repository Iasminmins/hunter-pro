import test from 'node:test';
import assert from 'node:assert/strict';
import { csvHeaderError, csvTableError, parseCsv, parseCsvTable, parseNinjaReport, validateMonthlyInput, summarizeTrades } from '../src/model.mjs';

test('CSV parser handles quoted commas and normalizes headers', () => {
  const rows = parseCsv('Timestamp,Symbol,Direction,Outcome,Result R\n"2026-09-01 10:00",ES,BUY,WIN,1.5');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].symbol, 'ES');
  assert.equal(rows[0].resultR, 1.5);
});

test('monthly form requires both CSV files and a valid month', () => {
  assert.deepEqual(validateMonthlyInput({ month: '13', year: '2026', hunterVersion: 'V24', hsgConfig: 'F2', hsgFile: null, ninjaFile: null }), ['Selecione um mês válido.', 'Envie o CSV HSG Dataset.', 'Envie o CSV NinjaTrader / Grid.']);
});

test('trade summary calculates win rate, profit factor and drawdown', () => {
  const result = summarizeTrades([{ outcome:'WIN', resultR:2 }, { outcome:'LOSS', resultR:-1 }, { outcome:'BE', resultR:0 }]);
  assert.equal(result.trades, 3);
  assert.equal(result.winRate, 1 / 3);
  assert.equal(result.profitFactor, 2);
  assert.equal(result.drawdown, -1);
});

test('trade summary recognizes W, L and BE outcomes from trading exports', () => {
  const result = summarizeTrades([{ outcome:'W', resultR:1 }, { outcome:'L', resultR:-1 }, { outcome:'BE', resultR:0 }]);
  assert.deepEqual([result.wins, result.losses, result.breakeven], [1, 1, 1]);
});

test('HSG CSV header validation accepts common localized column names', () => {
  assert.equal(csvHeaderError('Data,Resultado,Result R\n2026-09-01,W,1.5', 'HSG'), '');
  assert.match(csvHeaderError('Data,Resultado\n2026-09-01,W', 'HSG'), /resultado R/);
});

test('HSG dataset accepts semicolon Result_R and infers outcome from R', () => {
  const csv = 'SignalId;Data;Direcao;Result_R\nA;2025-09-01;BUY;2.5\nB;2025-09-02;SELL;-1\nC;2025-09-03;BUY;0';
  const trades = parseCsv(csv);
  assert.equal(csvHeaderError(csv, 'HSG'), '');
  assert.deepEqual(trades.map(trade => trade.outcome), ['W', 'L', 'BE']);
  assert.deepEqual(trades.map(trade => trade.resultR), [2.5, -1, 0]);
});

test('NinjaTrader performance report finds the operations table after summary rows', () => {
  const csv = 'Desempenho;Todas as negociações;Long;Short;\nLucro líquido;$ 1.234,50;$ 500;$ 734,50;\nFator de lucro;2,5;2;3;\nSignalId;Data;Hora;Direcao;Result_R\nA;2025-09-01;08:00:00;BUY;1.5\nB;2025-09-02;09:00:00;SELL;-1';
  assert.equal(csvTableError(csv, 'Ninja'), '');
  assert.deepEqual(parseCsvTable(csv).headers.slice(0, 3), ['signalid', 'data', 'hora']);
  assert.equal(parseCsvTable(csv).rows.length, 2);
  assert.deepEqual(parseCsv(csv).map(trade => trade.resultR), [1.5, -1]);
  assert.match(csvTableError('Desempenho;Tudo\nLucro;10', 'Ninja'), /não encontrei um relatório/);
});

test('NinjaTrader grid summary report is accepted without an operations table', () => {
  const csv = 'Desempenho;Todas as negociações;Long;Short;\nLucro líquido total;$ 3325,50;$ 526,50;$ 2799,00;\nFator de lucro;6,11;2,30;12,33;\n# total de negociações;44;20;24;\nPorcentagem de lucro;58,33%;50,00%;62,50%;';
  assert.equal(csvTableError(csv, 'Ninja'), '');
  assert.deepEqual(parseNinjaReport(csv), { tradeCount: 44, netProfit: 3325.5, profitFactor: 6.11, winRate: 58.33 });
});
