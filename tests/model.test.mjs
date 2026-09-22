import test from 'node:test';
import assert from 'node:assert/strict';
import { csvHeaderError, parseCsv, validateMonthlyInput, summarizeTrades } from '../src/model.mjs';

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
