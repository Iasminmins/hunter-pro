const AREAS = ['hsg', 'trader', 'performance'];
const KEYS = { hsg: 'hunter-hsg-state', trader: 'hunter-trader-state', performance: 'hunter-performance-state' };
const revisions = Object.fromEntries(AREAS.map(area => [area, 0]));
const queues = Object.fromEntries(AREAS.map(area => [area, Promise.resolve()]));
const latest = Object.fromEntries(AREAS.map(area => [area, null]));
const sequences = Object.fromEntries(AREAS.map(area => [area, 0]));
const dirty = Object.fromEntries(AREAS.map(area => [area, false]));
let statusHandler = () => {};

function parseLocal(area) {
  try {
    const value = JSON.parse(localStorage.getItem(KEYS[area]) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

function nonEmpty(area, payload) {
  if (!payload || typeof payload !== 'object') return false;
  const keys = area === 'hsg'
    ? ['months', 'historicalBases', 'historicalSlots', 'snapshots', 'audit']
    : area === 'trader' ? ['accounts', 'trades', 'movements', 'audit'] : ['datasets', 'audit'];
  return keys.some(key => Array.isArray(payload[key]) && payload[key].length > 0);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
  }
  return value;
}

function samePayload(left, right) {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options });
  let body = {};
  try { body = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(body.message || 'Não foi possível conectar ao servidor.');
    error.status = response.status;
    error.code = body.code;
    error.revision = body.revision;
    throw error;
  }
  return body;
}

export function setPersistenceStatusHandler(handler) {
  statusHandler = typeof handler === 'function' ? handler : () => {};
}

export async function checkSession() {
  try { return Boolean((await api('/api/auth/session')).authenticated); }
  catch { return false; }
}

export async function login(password) {
  await api('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
}

export async function logout() {
  await api('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
}

export async function initializePersistence() {
  const authenticated = await checkSession();
  if (!authenticated) return { authenticated: false };
  const entries = await Promise.all(AREAS.map(async area => [area, await api(`/api/state/${area}`)]));
  const remote = Object.fromEntries(entries);
  const local = Object.fromEntries(AREAS.map(area => [area, parseLocal(area)]));
  for (const area of AREAS) revisions[area] = remote[area].revision;
  const migration = AREAS.filter(area => nonEmpty(area, local[area]) && remote[area].revision === 0)
    .map(area => ({ area, local: local[area], remote: remote[area].payload, localExists: true, remoteExists: false }));
  const conflicts = AREAS.filter(area => nonEmpty(area, local[area]) && remote[area].revision > 0 && !samePayload(local[area], remote[area].payload))
    .map(area => ({ area, local: local[area], remote: remote[area].payload, localExists: true, remoteExists: true }));
  return { authenticated: true, hsg: remote.hsg, trader: remote.trader, performance: remote.performance, local, migration: [...migration, ...conflicts] };
}

export async function saveArea(area, payload) {
  if (!KEYS[area]) throw new Error('Área de dados inválida.');
  const sequence = ++sequences[area];
  payload = structuredClone(payload);
  latest[area] = payload;
  dirty[area] = true;
  try { localStorage.setItem(KEYS[area], JSON.stringify(payload)); }
  catch { statusHandler({ state: 'error', area, message: 'O navegador não conseguiu guardar a cópia de recuperação.' }); }
  const queued = queues[area].catch(() => {}).then(async () => {
    statusHandler({ state: 'saving', area });
    try {
      const saved = await api(`/api/state/${area}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schemaVersion: 1, expectedRevision: revisions[area], payload })
      });
      revisions[area] = saved.revision;
      if (sequences[area] === sequence) {
        dirty[area] = false;
        statusHandler({ state: 'saved', area });
      }
      return saved;
    } catch (error) {
      if (sequences[area] === sequence && error.status === 409) {
        statusHandler({ state: 'conflict', area, message: error.message });
      } else if (sequences[area] === sequence && error.status === 401) {
        statusHandler({ state: 'auth', area, message: error.message });
      } else if (sequences[area] === sequence) {
        statusHandler({ state: 'offline', area, message: error.message });
      }
      throw error;
    }
  });
  queues[area] = queued;
  return queued;
}

export async function importLocalState(area, payload) {
  return saveArea(area, payload);
}

export function useRemoteState(area, payload) {
  if (!KEYS[area]) return;
  try { localStorage.setItem(KEYS[area], JSON.stringify(payload || {})); }
  catch { statusHandler({ state: 'error', area, message: 'O navegador não conseguiu atualizar a cópia local de recuperação.' }); }
}

window.addEventListener('online', () => {
  for (const area of AREAS) {
    if (dirty[area] && latest[area]) saveArea(area, latest[area]).catch(() => {});
  }
});
