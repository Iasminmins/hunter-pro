import { getPool } from './db.mjs';

const AREAS = new Set(['hsg', 'trader']);

export class RevisionConflictError extends Error {
  constructor(revision) {
    super('This state has changed in another session.');
    this.name = 'RevisionConflictError';
    this.code = 'REVISION_CONFLICT';
    this.revision = revision;
  }
}

export class SchemaUnavailableError extends Error {
  constructor() {
    super('Hunter Pro database schema is unavailable.');
    this.name = 'SchemaUnavailableError';
    this.code = 'SCHEMA_UNAVAILABLE';
  }
}

function assertArea(area) {
  if (!AREAS.has(area)) throw Object.assign(new Error('Unsupported state area.'), { code: 'INVALID_AREA' });
}

async function workspaceId(client) {
  const result = await client.query('SELECT id FROM workspaces WHERE slug = $1', ['hunter-pro']);
  if (!result.rows[0]) throw new SchemaUnavailableError();
  return result.rows[0].id;
}

export async function readArea(area) {
  assertArea(area);
  const client = await getPool().connect();
  try {
    const workspace = await workspaceId(client);
    const result = await client.query(
      'SELECT payload, revision FROM app_state WHERE workspace_id = $1 AND area = $2',
      [workspace, area]
    );
    return result.rows[0]
      ? { payload: result.rows[0].payload, revision: Number(result.rows[0].revision) }
      : { payload: {}, revision: 0 };
  } catch (error) {
    if (error.code === '42P01' || error.code === '42703') throw new SchemaUnavailableError();
    throw error;
  } finally {
    client.release();
  }
}

const isoDate = (date, fallback = null) => /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? date : fallback;
const monthDate = item => `${Number(item.year)}-${String(Number(item.month)).padStart(2, '0')}-01`;
const json = value => JSON.stringify(value ?? {});
const idOrUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '')) ? value : null;

async function mirrorHsg(client, workspace, payload) {
  const months = Array.isArray(payload.months) ? payload.months : [];
  for (const block of months) {
    const date = monthDate(block);
    if (!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(date)) continue;
    const revision = Math.max(1, Number(block.revision) || 1);
    const month = await client.query(
      `INSERT INTO hsg_months (workspace_id, month, revision, source_name, trade_count, net_r, data)
       VALUES ($1, $2::date, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (workspace_id, month, revision) DO UPDATE SET
         source_name = EXCLUDED.source_name, trade_count = EXCLUDED.trade_count,
         net_r = EXCLUDED.net_r, data = EXCLUDED.data
       RETURNING id`,
      [workspace, date, revision, block.sourceName || '', block.summary?.trades ?? block.trades?.length ?? 0,
       block.summary?.totalR ?? null, json(block)]
    );
    const monthId = month.rows[0].id;
    const trades = Array.isArray(block.trades) ? block.trades : [];
    await client.query('DELETE FROM hsg_trades WHERE month_id = $1', [monthId]);
    if (trades.length) {
      const rows = trades.map((trade, index) => {
        const filters = Array.isArray(trade.filterHits) ? trade.filterHits : String(trade.filterHits || '').split(/[,|;+\s]+/).filter(Boolean);
        const blocked = Array.isArray(trade.filterBlocks) ? trade.filterBlocks : String(trade.filterBlocks || '').split(/[,|;+\s]+/).filter(Boolean);
        const outcome = /^(w|win|winner|gain|vitoria|vitorioso)$/i.test(String(trade.outcome || '')) ? 'W'
          : /^(l|loss|loser|perda|perdedor)$/i.test(String(trade.outcome || '')) ? 'L'
            : String(trade.outcome || '').toUpperCase() === 'BE' || Number(trade.resultR) === 0 ? 'BE' : null;
        return { sourceRow: Number(trade.sourceRow) || index + 1, tradeDate: isoDate(String(trade.timestamp || '').slice(0, 10)), resultR: Number(trade.resultR) || 0, outcome, filters, blockedFilters: blocked, data: trade };
      });
      await client.query(
        `INSERT INTO hsg_trades (workspace_id, month_id, source_row, trade_date, result_r, outcome, filters, blocked_filters, data)
         SELECT $1, $2, (item->>'sourceRow')::integer, NULLIF(item->>'tradeDate', '')::date,
           (item->>'resultR')::numeric, item->>'outcome',
           ARRAY(SELECT jsonb_array_elements_text(item->'filters')),
           ARRAY(SELECT jsonb_array_elements_text(item->'blockedFilters')), item->'data'
         FROM jsonb_array_elements($3::jsonb) AS input_rows(item)`,
        [workspace, monthId, json(rows)]
      );
    }
  }

  const bases = Array.isArray(payload.historicalBases) ? payload.historicalBases : [];
  const baseIds = new Map();
  for (const base of bases) {
    const year = Number(base.year) || Number(String(base.importedAt || '').slice(0, 4)) || new Date().getUTCFullYear();
    const result = await client.query(
      `INSERT INTO hsg_historical_bases (workspace_id, name, year, source_name, data)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (workspace_id, name, year) DO UPDATE SET source_name = EXCLUDED.source_name, data = EXCLUDED.data
       RETURNING id`,
      [workspace, String(base.name || `Base ${year}`).slice(0, 240), year, base.source || '', json(base)]
    );
    if (base.id) baseIds.set(base.id, result.rows[0].id);
  }

  const slots = Array.isArray(payload.historicalSlots) ? payload.historicalSlots : [];
  for (const slot of slots) {
    const year = Number(slot.year);
    const month = Number(slot.month);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) continue;
    let baseId = baseIds.get(slot.baseId) || baseIds.get(payload.selectedHistoricalBaseId);
    if (!baseId) {
      const synthetic = await client.query(
        `INSERT INTO hsg_historical_bases (workspace_id, name, year, source_name, data)
         VALUES ($1, $2, $3, 'historical-slots', '{}'::jsonb)
         ON CONFLICT (workspace_id, name, year) DO UPDATE SET source_name = EXCLUDED.source_name
         RETURNING id`, [workspace, `Slots históricos ${year}`, year]
      );
      baseId = synthetic.rows[0].id;
    }
    await client.query(
      `INSERT INTO hsg_base_slots (workspace_id, base_id, year, month, data)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (workspace_id, base_id, year, month) DO UPDATE SET data = EXCLUDED.data`,
      [workspace, baseId, year, month, json(slot)]
    );
  }

  const snapshots = Array.isArray(payload.snapshots) ? payload.snapshots : [];
  for (const snapshot of snapshots) {
    const frozenAt = snapshot.frozenAt && !Number.isNaN(Date.parse(snapshot.frozenAt)) ? snapshot.frozenAt : new Date().toISOString();
    const result = await client.query(
      `INSERT INTO hsg_snapshots (workspace_id, name, frozen_at, development_end, data)
       VALUES ($1, $2, $3::timestamptz, $4::date, $5::jsonb)
       ON CONFLICT (workspace_id, name) DO NOTHING RETURNING id`,
      [workspace, String(snapshot.version || snapshot.name || snapshot.id).slice(0, 240), frozenAt,
       /^\d{4}-\d{2}$/.test(snapshot.developmentEnd || '') ? `${snapshot.developmentEnd}-01` : isoDate(snapshot.developmentEnd), json(snapshot)]
    );
    const snapshotId = result.rows[0]?.id;
    // OOS rows belong to the exact immutable snapshot version. A same-name
    // snapshot already in Neon must never receive OOS data from a replacement.
    if (!snapshotId) continue;
    for (const block of months) {
      const ym = `${block.year}-${String(block.month).padStart(2, '0')}`;
      if (!snapshot.developmentEnd || ym <= snapshot.developmentEnd || (snapshot.sourceBlockIds || []).includes(block.id)) continue;
      await client.query(
        `INSERT INTO hsg_oos_months (workspace_id, snapshot_id, month, source_name, trade_count, net_r, data)
         VALUES ($1, $2, $3::date, $4, $5, $6, $7::jsonb)
         ON CONFLICT (snapshot_id, month) DO UPDATE SET source_name = EXCLUDED.source_name,
           trade_count = EXCLUDED.trade_count, net_r = EXCLUDED.net_r, data = EXCLUDED.data`,
        [workspace, snapshotId, monthDate(block), block.sourceName || '', block.summary?.trades ?? block.trades?.length ?? 0,
       block.summary?.totalR ?? null, json(block)]
      );
    }
  }
}

async function mirrorTrader(client, workspace, payload) {
  const accounts = Array.isArray(payload.accounts) ? payload.accounts : [];
  for (const account of accounts) {
    if (!idOrUuid(account.id)) continue;
    await client.query(
      `INSERT INTO trader_accounts (id, workspace_id, name, provider, platform, currency, initial_balance,
        current_balance, balance_source, start_date, status, daily_limit, drawdown_limit, created_at, updated_at, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::date, $11, $12, $13, $14::timestamptz, $15::timestamptz, $16::jsonb)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, provider = EXCLUDED.provider, platform = EXCLUDED.platform,
        current_balance = EXCLUDED.current_balance, balance_source = EXCLUDED.balance_source, start_date = EXCLUDED.start_date,
        status = EXCLUDED.status, daily_limit = EXCLUDED.daily_limit, drawdown_limit = EXCLUDED.drawdown_limit,
        updated_at = EXCLUDED.updated_at, data = EXCLUDED.data`,
      [account.id, workspace, String(account.name || '').slice(0, 240), account.provider || '', account.platform || '',
       /^[A-Z]{3}$/.test(account.currency || '') ? account.currency : 'USD', Math.max(0, Number(account.initialBalance) || 0),
       Number.isFinite(Number(account.currentBalance)) ? Number(account.currentBalance) : null, account.balanceSource === 'manual' ? 'manual' : 'initial',
       isoDate(account.startDate), account.status === 'arquivada' ? 'arquivada' : 'ativa',
       Number.isFinite(Number(account.dailyLimit)) ? Number(account.dailyLimit) : null,
       Number.isFinite(Number(account.drawdownLimit)) ? Number(account.drawdownLimit) : null,
       account.createdAt || new Date().toISOString(), account.updatedAt || account.createdAt || new Date().toISOString(), json(account)]
    );
  }
  const accountIds = new Set(accounts.map(item => item.id).filter(idOrUuid));
  const trades = (Array.isArray(payload.trades) ? payload.trades : []).filter(trade =>
    idOrUuid(trade.id) && accountIds.has(trade.accountId) && isoDate(trade.date)
  );
  if (trades.length) {
    await client.query(
      `INSERT INTO trader_trades (id, workspace_id, account_id, trade_date, pnl, fees, external_id, note, source, created_at, data)
       SELECT (item->>'id')::uuid, $1, (item->>'accountId')::uuid, (item->>'date')::date,
         COALESCE(NULLIF(item->>'pnl', '')::numeric, 0), COALESCE(NULLIF(item->>'fees', '')::numeric, 0),
         COALESCE(item->>'externalId', ''), COALESCE(item->>'note', ''),
         CASE WHEN item->>'source' = 'csv' THEN 'csv' ELSE 'manual' END,
         COALESCE(NULLIF(item->>'createdAt', '')::timestamptz, now()), item
       FROM jsonb_array_elements($2::jsonb) AS input_rows(item)
       ON CONFLICT (id) DO UPDATE SET trade_date = EXCLUDED.trade_date, pnl = EXCLUDED.pnl, fees = EXCLUDED.fees,
         external_id = EXCLUDED.external_id, note = EXCLUDED.note, source = EXCLUDED.source, data = EXCLUDED.data`,
      [workspace, json(trades)]
    );
  }
  const movements = (Array.isArray(payload.movements) ? payload.movements : []).filter(movement =>
    idOrUuid(movement.id) && accountIds.has(movement.accountId) && isoDate(movement.date)
  );
  if (movements.length) {
    await client.query(
      `INSERT INTO trader_movements (id, workspace_id, account_id, movement_date, type, amount, note, created_at, data)
       SELECT (item->>'id')::uuid, $1, (item->>'accountId')::uuid, (item->>'date')::date,
         COALESCE(item->>'type', 'ajuste'), GREATEST(COALESCE(NULLIF(item->>'amount', '')::numeric, 0), 0),
         COALESCE(item->>'note', ''), COALESCE(NULLIF(item->>'createdAt', '')::timestamptz, now()), item
       FROM jsonb_array_elements($2::jsonb) AS input_rows(item)
       ON CONFLICT (id) DO UPDATE SET movement_date = EXCLUDED.movement_date, type = EXCLUDED.type,
         amount = EXCLUDED.amount, note = EXCLUDED.note, data = EXCLUDED.data`,
      [workspace, json(movements)]
    );
  }
}

export async function writeArea(area, payload, expectedRevision) {
  assertArea(area);
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const workspace = await workspaceId(client);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`hunter-pro:${area}`]);
    const current = await client.query(
      'SELECT revision FROM app_state WHERE workspace_id = $1 AND area = $2 FOR UPDATE', [workspace, area]
    );
    const revision = Number(current.rows[0]?.revision || 0);
    if (revision !== Number(expectedRevision)) throw new RevisionConflictError(revision);
    const nextRevision = revision + 1;
    await client.query(
      `INSERT INTO app_state (workspace_id, area, payload, revision, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, now())
       ON CONFLICT (workspace_id, area) DO UPDATE SET payload = EXCLUDED.payload,
         revision = EXCLUDED.revision, updated_at = now()`,
      [workspace, area, json(payload), nextRevision]
    );
    if (area === 'hsg') await mirrorHsg(client, workspace, payload);
    else await mirrorTrader(client, workspace, payload);
    await client.query(
      `INSERT INTO audit_log (workspace_id, area, action, details)
       VALUES ($1, $2, 'state-save', $3::jsonb)`,
      [workspace, area, JSON.stringify({ revision: nextRevision })]
    );
    await client.query('COMMIT');
    return { revision: nextRevision };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error.code === '42P01' || error.code === '42703') throw new SchemaUnavailableError();
    throw error;
  } finally {
    client.release();
  }
}
