-- Hunter Pro initial database schema (PostgreSQL / Neon)
-- The application currently has one owner and no authentication layer.
-- Keep the workspace boundary explicit so future user isolation is possible.

CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO workspaces (id, slug, name)
VALUES ('00000000-0000-4000-8000-000000000001', 'hunter-pro', 'Hunter Pro')
ON CONFLICT (slug) DO NOTHING;

-- Exact serialized state lets the current browser UI move to server persistence
-- without losing fields that are not represented by normalized reporting tables.
CREATE TABLE IF NOT EXISTS app_state (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  area text NOT NULL CHECK (area IN ('hsg', 'trader')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, area)
);

CREATE TABLE IF NOT EXISTS hsg_months (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  month date NOT NULL CHECK (EXTRACT(DAY FROM month) = 1),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  source_name text NOT NULL DEFAULT '',
  trade_count integer NOT NULL DEFAULT 0 CHECK (trade_count >= 0),
  net_r numeric,
  imported_at timestamptz NOT NULL DEFAULT now(),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (workspace_id, month, revision)
);

CREATE TABLE IF NOT EXISTS hsg_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  month_id uuid NOT NULL REFERENCES hsg_months(id) ON DELETE CASCADE,
  source_row integer NOT NULL CHECK (source_row > 0),
  trade_date date,
  result_r numeric NOT NULL,
  outcome text CHECK (outcome IN ('W', 'L', 'BE') OR outcome IS NULL),
  filters text[] NOT NULL DEFAULT '{}',
  blocked_filters text[] NOT NULL DEFAULT '{}',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (month_id, source_row)
);
CREATE INDEX IF NOT EXISTS hsg_trades_workspace_date_idx ON hsg_trades (workspace_id, trade_date);
CREATE INDEX IF NOT EXISTS hsg_trades_filters_idx ON hsg_trades USING gin (filters);

CREATE TABLE IF NOT EXISTS hsg_historical_bases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  year integer NOT NULL,
  source_name text NOT NULL DEFAULT '',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name, year)
);

CREATE TABLE IF NOT EXISTS hsg_base_slots (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  base_id uuid NOT NULL REFERENCES hsg_historical_bases(id) ON DELETE CASCADE,
  year integer NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (workspace_id, base_id, year, month)
);

CREATE TABLE IF NOT EXISTS hsg_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  frozen_at timestamptz NOT NULL DEFAULT now(),
  development_end date,
  data jsonb NOT NULL,
  UNIQUE (workspace_id, name)
);

CREATE OR REPLACE FUNCTION prevent_hsg_snapshot_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'HSG snapshots are immutable; create a new snapshot instead';
END;
$$;
DROP TRIGGER IF EXISTS hsg_snapshots_immutable ON hsg_snapshots;
CREATE TRIGGER hsg_snapshots_immutable
BEFORE UPDATE OR DELETE ON hsg_snapshots
FOR EACH ROW EXECUTE FUNCTION prevent_hsg_snapshot_mutation();

CREATE TABLE IF NOT EXISTS hsg_oos_months (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  snapshot_id uuid NOT NULL REFERENCES hsg_snapshots(id) ON DELETE RESTRICT,
  month date NOT NULL CHECK (EXTRACT(DAY FROM month) = 1),
  source_name text NOT NULL DEFAULT '',
  trade_count integer NOT NULL DEFAULT 0 CHECK (trade_count >= 0),
  net_r numeric,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (snapshot_id, month)
);

CREATE TABLE IF NOT EXISTS trader_accounts (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  provider text NOT NULL DEFAULT '',
  platform text NOT NULL DEFAULT '',
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  initial_balance numeric(20, 6) NOT NULL CHECK (initial_balance >= 0),
  current_balance numeric(20, 6),
  balance_source text NOT NULL DEFAULT 'initial' CHECK (balance_source IN ('initial', 'manual')),
  start_date date,
  status text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'arquivada')),
  daily_limit numeric(20, 6),
  drawdown_limit numeric(20, 6),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS trader_trades (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id uuid NOT NULL,
  trade_date date NOT NULL,
  pnl numeric(20, 6) NOT NULL,
  fees numeric(20, 6) NOT NULL DEFAULT 0,
  external_id text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'csv')),
  created_at timestamptz NOT NULL DEFAULT now(),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  FOREIGN KEY (workspace_id, account_id) REFERENCES trader_accounts(workspace_id, id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS trader_trades_external_id_idx
  ON trader_trades (workspace_id, account_id, external_id) WHERE external_id <> '';
CREATE INDEX IF NOT EXISTS trader_trades_account_date_idx ON trader_trades (workspace_id, account_id, trade_date);

CREATE TABLE IF NOT EXISTS trader_movements (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id uuid NOT NULL,
  movement_date date NOT NULL,
  type text NOT NULL,
  amount numeric(20, 6) NOT NULL CHECK (amount >= 0),
  note text NOT NULL DEFAULT '',
  reverses_movement_id uuid REFERENCES trader_movements(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  FOREIGN KEY (workspace_id, account_id) REFERENCES trader_accounts(workspace_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS trader_movements_account_date_idx ON trader_movements (workspace_id, account_id, movement_date);

CREATE TABLE IF NOT EXISTS audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  area text NOT NULL CHECK (area IN ('hsg', 'trader', 'system')),
  action text NOT NULL,
  record_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_workspace_time_idx ON audit_log (workspace_id, created_at DESC);
