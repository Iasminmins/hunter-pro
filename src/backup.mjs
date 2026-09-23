import { summarizeTrades } from './model.mjs';

const BACKUP_VERSION = 1;
const collections = ['months','historicalBases','historicalSlots','snapshots','audit'];

export function exportHsgBackup(state) {
  const hsgState = Object.fromEntries(collections.map(key => [key, Array.isArray(state[key]) ? state[key] : []]));
  hsgState.selectedHistoricalBaseId = state.selectedHistoricalBaseId || '';
  hsgState.historicalYear = Number(state.historicalYear) || null;
  hsgState.selectedMonthYear = Number(state.selectedMonthYear) || null;
  return JSON.stringify({ application:'hunter-hsg-control-center', version:BACKUP_VERSION, exportedAt:new Date().toISOString(), state:hsgState }, null, 2);
}

export function parseHsgBackup(text) {
  try {
    const payload = JSON.parse(String(text));
    if (payload?.application !== 'hunter-hsg-control-center' || payload.version !== BACKUP_VERSION || !payload.state || typeof payload.state !== 'object') return { state:null, errors:['Arquivo não é um backup HSG compatível.'] };
    for (const key of collections) if (!Array.isArray(payload.state[key])) return { state:null, errors:[`Backup inválido: campo ${key} ausente ou inválido.`] };
    if (payload.state.months.some(item => !Number.isInteger(item.month) || item.month < 1 || item.month > 12 || !Array.isArray(item.trades))) return { state:null, errors:['Backup inválido: há fechamento mensal incompleto.'] };
    if (payload.state.historicalSlots.some(item => !Number.isInteger(item.month) || item.month < 1 || item.month > 12 || !Number.isInteger(item.year) || !Array.isArray(item.trades))) return { state:null, errors:['Backup inválido: há slot histórico incompleto.'] };
    if (payload.state.historicalBases.some(item => !String(item.name || '').trim() || !Array.isArray(item.trades))) return { state:null, errors:['Backup inválido: há base histórica incompleta.'] };
    if (payload.state.snapshots.some(item => !item || typeof item.version !== 'string')) return { state:null, errors:['Backup inválido: há snapshot incompleto.'] };
    const state = {
      ...payload.state,
      months:payload.state.months.map(item=>({...item,summary:summarizeTrades(item.trades)})),
      historicalSlots:payload.state.historicalSlots.map(item=>({...item,summary:summarizeTrades(item.trades)})),
      historicalBases:payload.state.historicalBases.map(item=>({...item,summary:summarizeTrades(item.trades)})),
      selectedHistoricalBaseId:payload.state.selectedHistoricalBaseId || '',
      historicalYear:payload.state.historicalYear || null,
      selectedMonthYear:payload.state.selectedMonthYear || null
    };
    if (!state.historicalBases.some(item=>item.id===state.selectedHistoricalBaseId)) state.selectedHistoricalBaseId='';
    return { state, errors:[] };
  } catch { return { state:null, errors:['Não foi possível ler o JSON do backup.'] }; }
}
