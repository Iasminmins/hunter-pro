# Hunter Pro Performance Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add a polished Performance Lab area with Geral, Aprovação, and Saque, powered by separately persisted NinjaTrader summary and Grid datasets.

**Architecture:** Keep the Lab state under its own `performance` persistence area. Add focused parsing/calculation and rendering modules, then connect them to existing navigation, Neon state storage, and styling. Grid operations remain the source for order-dependent metrics and simulations; summary reports remain an independent source for aggregate Geral metrics.

**Tech Stack:** Browser ES modules, HTML template rendering, CSS, PostgreSQL/Neon migrations and the existing Node persistence API.

**Spec:** `docs/superpowers/specs/2026-09-23-performance-lab-design.md`

## Global Constraints

- Keep HSG and trader state/payloads independent from Performance Lab.
- Do not combine aggregate summary totals with Grid operations automatically.
- Process CSV files in the browser and show a reviewable preview before persistence.
- Mark order-dependent results unavailable when the trade sequence cannot be established.
- Use configurable rules only; do not imply that a prop-firm evaluation or withdrawal is guaranteed.
- Do not show demo values as live operational results.

## Review Focus

- Locale-formatted numeric values (`1.234,56`, `$1,234.56`, parentheses, blank cells) parse without silently changing sign or scale.
- Same-day trades with timestamps sort chronologically; ambiguous date-only records do not claim a reliable intraday drawdown.
- Aggregate summary and overlapping Grid files never double-count in Geral.
- Time-zone boundaries for daily loss are explicit in the configured profile and do not shift a trade into the wrong session silently.
- Empty, malformed, or partially valid CSVs leave stored datasets unchanged until the user confirms a valid preview.

## File Map

- `index.html`: add Performance Lab to the primary navigation.
- `src/app.mjs`: route the new area, load/save its independent state, set page chrome and call its renderer.
- `src/performance-model.mjs` (new): CSV profiles, localized parsing, duplicate/overlap inspection, metric calculation and configurable simulation functions.
- `src/performance-lab.mjs` (new): Performance Lab state defaults, rendering, import preview/confirmation, tab interactions and profile editing.
- `styles.css`: responsive Lab layout, charts, summary cards, import status and simulation states matching the Hunter theme.
- `src/persistence.mjs`: add the local key, initialization read, migration/conflict handling and reconnect queue for `performance`.
- `src/server/state-repository.mjs`: include `performance` in the supported state areas; existing JSON persistence/audit path can store it without a new relational mirror.
- `src/server/api.mjs`: include `performance` in the state route allowlist.
- `migrations/002_performance_area.sql` (new): update the `app_state.area` constraint to allow `performance`.
- `README.md`: document supported CSV inputs, state separation and configured estimate limitations.

## Task 1: Add isolated Performance Lab persistence

**Files:**
- Create: `migrations/002_performance_area.sql`
- Modify: `src/persistence.mjs`
- Modify: `src/server/state-repository.mjs`
- Modify: `src/server/api.mjs`

**Interfaces:**
- Consume: existing `initializePersistence`, `saveArea(area, payload)`, revision conflict handling, and state repository area checks.
- Produce: persistence operations accepting `hsg`, `trader`, and `performance` while retaining revision checks per area.

- [ ] Add `performance` to `KEYS`, revisions, queues, latest payloads, sequences, dirty state, initialization reads, local/remote maps, migration/conflict iteration and reconnect handling in `src/persistence.mjs`.
- [ ] Add `performance` to `AREAS` in `src/server/state-repository.mjs` and `ALLOWED_AREAS` in `src/server/api.mjs`; retain the existing HSG-only relational mirror.
- [ ] Add a migration that drops `app_state_area_check` if present and recreates it to allow `hsg`, `trader`, and `performance`.
- [ ] Confirm state loading, local conflict import and `saveArea('performance', payload)` use the new area without changing the HSG/trader payload shape.

## Task 2: Implement CSV parsing and metrics

**Files:**
- Create: `src/performance-model.mjs`
- Modify only if shared parsing support is required: `src/model.mjs`

**Interfaces:**
- Produce `parsePerformanceCsv(text, filename)` returning `{ kind, headers, records, summary, warnings, errors }`; `kind` is `summary` or `grid`.
- Produce `previewPerformanceImports(existingSets, parsedFiles)` returning accepted records, rejected rows, duplicate signatures, overlapping date ranges and blocking warnings.
- Produce `summarizePerformanceTrades(trades)` returning trade count, net profit, gross wins/losses, profit factor, win rate, equity curve, max drawdown, and per-day/per-direction aggregates when columns exist.
- Produce `simulateEvaluation(trades, profile)` and `estimateWithdrawal(trades, profile)` with explicit status, per-rule progression, violated trade IDs, assumptions, and unavailable reasons.

- [ ] Add summary-report aliases for total trades, net profit, profit factor, win percentage, and drawdown; parse currency-formatted values without depending on one locale.
- [ ] Add Grid aliases requiring a per-trade Profit and date; preserve source filename/row and parse optional time, side, symbol, fees, and trade ID.
- [ ] Sort by complete timestamp; use source row as deterministic tie-breaker. If only a date is available and multiple files overlap intraday, set `sequenceReliable=false` and make order-dependent outputs unavailable.
- [ ] Compare duplicate trade IDs first and stable row signatures second; report period overlap separately because overlapping periods do not prove every row is a duplicate.
- [ ] Calculate PnL metrics from Grid separately from summary values. Calculate cumulative equity/drawdown only when sequence is reliable.
- [ ] Implement configurable evaluation fields from the spec (target, daily loss, static/trailing maximum drawdown, minimum days, optional consistency), returning the first violating trade for each breached rule.
- [ ] Implement configurable withdrawal estimates from the spec, returning gross eligible profit, configured buffer, split, limits, net estimate, and any unconfigured assumptions.
- [ ] Keep parser decisions explicit for commas/semicolons, locale currency, duplicate IDs, missing time, empty files and daily session boundaries; surface ambiguous cases as warnings/unavailable values instead of guessing.

## Task 3: Build Performance Lab state and interface

**Files:**
- Create: `src/performance-lab.mjs`
- Modify: `index.html`
- Modify: `src/app.mjs`
- Modify: `styles.css`

**Interfaces:**
- Consume the model interfaces from Task 2 and `saveArea('performance', payload)` from Task 1.
- Produce `initializePerformanceState(source)` and `renderPerformanceLab(view, state, persist)`; state contains imported datasets, active dataset ID, evaluation profile, withdrawal profile, active subtab and import audit.

- [ ] Add the primary nav item and page metadata for Performance Lab; route it without changing existing HSG and trader navigation behavior.
- [ ] Add a hero/header with active dataset, imported date range, trade count and an import action; show “sem dados” until a real dataset is selected.
- [ ] Add internal tabs Geral, Aprovação and Saque with accessible selected states and persisted active tab.
- [ ] In Geral, render sourced metric cards, a responsive equity/drawdown chart for reliable Grid data, a separate aggregate summary when available, plus direction and period tables only when supported.
- [ ] In Aprovação, render editable profile fields, a rule-by-rule progress view, a clear breach state and a guided missing-Grid empty state.
- [ ] In Saque, render editable assumptions, gross/buffer/split/net estimate breakdown and pending states for missing parameters.
- [ ] Add multi-file import preview with accepted/rejected/duplicate/overlap counts; only commit state after explicit confirmation. Never merge summary and Grid totals automatically.
- [ ] Style desktop and narrow layouts, focus states, alert colors and chart containers; verify no chart receives zero/invalid dimensions and no horizontal overflow occurs outside tables.
- [ ] Check each area against empty state, summary-only, Grid-only, reliable sequence, ambiguous sequence, invalid CSV and overlapping-file scenarios.

## Task 4: Finish documentation and integration review

**Files:**
- Modify: `README.md`
- Review: all files listed above and `docs/superpowers/specs/2026-09-23-performance-lab-design.md`

- [ ] Document supported CSV columns, how summary and Grid sources differ, and how simulation assumptions are configured.
- [ ] Review every metric label for a visible source and scope; verify no default profile is presented as an official prop-firm rule.
- [ ] Confirm Performance Lab state persists and reloads independently, while the existing HSG and trader areas retain their prior state.
- [ ] Compare the finished UI against the visual direction in the spec and fix responsive layout or clarity issues before completion.
