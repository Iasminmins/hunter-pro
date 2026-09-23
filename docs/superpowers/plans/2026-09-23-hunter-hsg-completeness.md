# Hunter HSG Completeness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Complete the local HSG control center with truthful data states, historical reference management, monthly operations, filter audit, RG exploration, OOS comparison, and local backup.

**Architecture:** Keep the dependency-free browser app and local persistence. Separate HSG data domains in the persisted state (`months`, `historicalBases`, `selectedHistoricalBaseId`, `snapshots`, `audit`), derive all operational metrics from imported records, and render distinct sections through the existing navigation. Keep trader-account storage independent.

**Tech Stack:** Vanilla JavaScript ES modules, HTML templates, CSS, browser `localStorage`, existing CSV parsers.

**Spec:** `docs/superpowers/specs/2026-09-23-hunter-hsg-completeness-design.md`

## Global Constraints

- CSV files remain local to the browser and are not uploaded.
- Historical reference trades remain separate from operational monthly trades.
- Hits and blocks follow the HSG fields present in the import; filters with no occurrences remain without data and are not approved.
- For a trade with multiple filters, preserve its full observed result for each filter row and identify overlap; do not divide its result.
- Do not report blocked wins/losses unless source columns explicitly support that interpretation.
- RG groups remain exploratory and OOS/Forward only compares actually imported later periods.
- Trader accounts retain their independent storage key and behavior.

## Review Focus

- Legacy `localStorage` state missing new fields must load without throwing or losing existing months and snapshots.
- Imported HSG rows missing optional filter fields must not be silently counted as approved filters.
- CSV headers with localized aliases and quoted delimiters must retain existing parser behavior.
- Duplicate month update/revision must not mutate an immutable snapshot's captured source.
- Historical and operational datasets with identical trades must remain in separate scopes and not be totaled together.

---

### Task 1: Normalize HSG state and derive truthful general metrics

**Files:**
- Modify: `src/app.mjs`
- Modify: `src/seed.mjs`
- Modify: `src/model.mjs`

**Interfaces:**
- Consumes existing `summarizeTrades(trades)` and persisted `{ months, snapshots, audit }` state.
- Produces normalized HSG state including `historicalBases` and `selectedHistoricalBaseId`; generalized metric derivation from imported trades only.

- [ ] Normalize old state on load by filling only missing collection fields and retaining existing records.
- [ ] Replace seed-backed operational KPIs, windows, monthly chart, health status, and RG data with imported-data-derived views and explicit empty states.
- [ ] Derive rolling six, three, and one month views using dated month blocks; show unavailable metrics when source data is insufficient.
- [ ] Render status labels from data sufficiency and actual validation instead of hardcoded “SAUDÁVEL”, “OK”, or approval labels.
- [ ] Review the Geral and Pesquisa RG code paths to confirm there are no operational fallbacks to `seed` values.

### Task 2: Add the Months workspace and weighted recent regime

**Files:**
- Modify: `index.html`
- Modify: `src/app.mjs`
- Modify: `styles.css`

**Interfaces:**
- Consumes normalized HSG state and existing month import, duplicate resolution, and revision flows.
- Produces a `meses` page with a year selector, 12 month cards, preserved-month list, and weighted recent summary.

- [ ] Add the Meses navigation item and page route without changing the independent Trader navigation.
- [ ] Render month cards for the selected year with empty/imported states and actions to create or inspect the corresponding month block.
- [ ] List imported operational blocks with version, config, HSG/Grid counts, and import status.
- [ ] Calculate the three most recent available monthly summaries using weights 50/30/20; renormalize available weights and disclose missing months.
- [ ] Keep existing duplicate month update/revision choices and audit entries reachable from this page.

### Task 3: Manage historical reference imports and monthly source slots

**Files:**
- Modify: `src/app.mjs`
- Modify: `src/model.mjs`
- Modify: `styles.css`

**Interfaces:**
- Consumes existing `csvHeaderError`, `csvTableError`, `parseCsv`, `parseNinjaReport`, and `summarizeTrades`.
- Produces historical-base records shaped as `{ id, name, importedAt, trades, summary, ninjaRows, ninjaSummary }` plus 12 independently tracked historical source slots.

- [ ] Add an import form for base name, HSG CSV, and NinjaTrader/Grid CSV using existing validations.
- [ ] Add January–December historical source slots for a selected year; each slot accepts the HSG and NinjaTrader/Grid pair and records its own validation/import state.
- [ ] Allow selected historical source slots to be consolidated into a named historical reference, and also allow direct import of a consolidated pair.
- [ ] Store successful base imports in `historicalBases` and add an audit record; do not append them to monthly `state.months`.
- [ ] Add a selector and base summary for net R, win rate, profit factor, and drawdown with truthful empty states.
- [ ] Use the selected historical base as the reference in history-versus-recent comparisons while keeping operational month totals separate.
- [ ] Show NinjaTrader/Grid counts and summary as a separately sourced report unless a verified trade mapping exists.

### Task 4: Make filter audit reflect CSV evidence

**Files:**
- Modify: `src/app.mjs`
- Modify: `src/model.mjs`

**Interfaces:**
- Consumes normalized `trade.filterHits`, `trade.outcome`, and `trade.resultR` fields from imported HSG CSV.
- Produces per-filter records with `{ code, hits, exclusive, overlap, winsObserved, lossesObserved, resultR, status }`.

- [ ] Extract a pure per-filter aggregation from imported trades, counting a multi-filter trade once in each matching filter and marking it as overlap.
- [ ] Aggregate wins/losses only as observed outcomes; keep “bloqueados/evitados” unavailable unless an explicit source field represents blocked outcome.
- [ ] Display discovered filter codes and configured/known filter codes with no occurrences as “SEM DADOS”, never approved.
- [ ] Remove the demonstrative filter table from operational results and explain the CSV field basis and overlap counting rule.

### Task 5: Keep RG clusters exploratory and sample-aware

**Files:**
- Modify: `src/app.mjs`
- Modify: `src/seed.mjs`

**Interfaces:**
- Consumes imported trades and filter aggregation from Task 4.
- Produces residual grouping summaries marked exploratory, with sample counts and explicit validation state.

- [ ] Remove seed-based clusters, residual counts, mean R, and overfitting risk from the operational page.
- [ ] Group residual imported trades by available direction/session/gap fields and display only fields present in the CSV.
- [ ] Show sample size and minimum-recommended guidance as guidance; do not label a cluster approved or overfitting risk calculated.
- [ ] Distinguish no residuals, no data, and insufficient data states.

### Task 6: Compare frozen versions with later imported periods

**Files:**
- Modify: `src/app.mjs`
- Modify: `src/model.mjs`

**Interfaces:**
- Consumes snapshot development range and immutable `sourceBlockIds`, plus operational monthly blocks imported later.
- Produces OOS/Forward summaries scoped to each snapshot, or an explicit pending state.

- [ ] Preserve snapshot source IDs and freeze-time data so later month updates cannot rewrite the frozen comparison baseline.
- [ ] Identify candidate OOS blocks strictly after the snapshot development end and exclude blocks present in the frozen source IDs.
- [ ] Display later period, trade count, R result, win rate, and PF when calculable; otherwise state why comparison is pending/unavailable.
- [ ] Do not infer filter approval or system health from the comparison alone.

### Task 7: Add local HSG backup and restore

**Files:**
- Modify: `index.html`
- Modify: `src/app.mjs`
- Create: `src/backup.mjs`
- Modify: `styles.css`

**Interfaces:**
- Consumes normalized HSG state only.
- Produces `exportHsgBackup(state): string` and `parseHsgBackup(text): { state, errors }`; never reads or writes `hunter-trader-state`.

- [ ] Add export action that downloads a versioned JSON backup containing HSG months, history bases, snapshots, and audit entries.
- [ ] Add restore action with preview of imported record counts and validation before replacing current HSG state.
- [ ] Require an explicit user choice to replace current HSG state and reject malformed/unsupported backup versions without partial writes.
- [ ] Keep trader account storage untouched.

### Task 8: Update documentation and inspect the complete interface

**Files:**
- Modify: `README.md`
- Review: `index.html`, `src/app.mjs`, `src/model.mjs`, `src/backup.mjs`, `styles.css`

- [ ] Document historical versus operational scopes, CSV interpretation, OOS conditions, backup/restore, and local-only persistence.
- [ ] Inspect each HSG page with no imports and confirm it shows empty states instead of demo metrics.
- [ ] Inspect each HSG page with representative imported data and confirm metrics name their source and scope.
- [ ] Inspect malformed CSV and backup error states and ensure no partial persistence occurs.
- [ ] Review the final diff for stale seed-backed user-facing metrics and unintended trader-area changes.
