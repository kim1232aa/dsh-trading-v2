# Changelog

## 0.3.0 — 2026-11-25

- **Breaking — single-package consolidation (`dsh-trading`)**: merged all 16
  `@dsh-trading/*` workspace packages (`packages/*` and `bundle/trading`) into a
  single installable package `dsh-trading` (`src/`, `cordis.patch.yml`,
  `locale/*.json`, `src/client/index.ts`), enforcing internal L0–L4 layering
  via `scripts/boundary-check.mjs`.
- **DSH `0.2.3-alpha.2` & `DSH Tauri` adaptation**:
  - Updated `engines.dsh` (`>=0.2.2-rc.5 <0.3.0-0`), `engines.node`
    (`^24.22.3 || >=26.13.1`), `@deepseek-ai/cordis` (`~4.2.0-alpha.1`), and
    `@deepseek-ai/schemastery` (`~3.20.0-alpha.1`).
  - Adapted `TradingFrame`, `SessionSwitcher` (`retainedBy.mainView > 0`),
    `ThemePresenter`, `chart-view` (`ctx.inject(['tools', 'marketData'])`), and
    Tauri frame detection (`dshtf_frame`).
  - Shared `WatchlistStore` directly between `get_watchlist` /
    `add_to_watchlist` / `remove_from_watchlist` and `/dsh-trading-market` RPC.
- **Security & reliability hardening**:
  - Blocked path traversal in `CsvProvider.getOhlcv` and `readOhlcvRequest`,
    and stripped/rejected control characters in `readChartView`.
  - Fixed `ChartPanelInner` hook ordering when `width === 0`, synced `useDark`
    with in-app `data-ds-dark-theme` / `data-ds-theme-source`, enforced
    `providers.coinglass.enabled: false` and `watchlist.enabled: false`, and
    added `providers.binance.allowUnofficialMirrors`.

## 0.2.0 — 2026-08-19

- New package `@dsh-trading/verdict` — the evaluation harness, first
  slice of the back half (docs/EVALUATION-HARNESS-ROADMAP.md). Two tools:
  `audit_backtest` checks a backtest artifact (CONTRACTS §6) against real
  candles from the market-data seam — fill validation inside the true bar
  range, trade-independence (duplicates/overlaps collapse to effective
  samples), a seeded random-entry baseline ranked on close-to-close SHADOW
  returns (optimistic intrabar fills can't buy a percentile; the
  self-reported vs shadow gap is its own check), sample-size power on both
  the win-rate and mean-return dimensions, win-rate plausibility, and cost
  declaration — and `lint_strategy_code` scans sources for lookahead-leak
  patterns (`shift(-n)`, `center=True`, backfill, full-data scaler fits;
  comment-line hits downgrade to warnings). Verdicts are deterministic
  (fixed seed, plain code, no LLM grading) and tri-state: DEFECTS_FOUND /
  NOT_PROVEN / NO_DEFECTS_FOUND — a skipped substantive check caps the
  verdict at NOT_PROVEN, and every report prints the harness's own blind
  spots (in-sample selection, omitted trades, intrabar fills). Hardened by
  an adversarial review before release: candle fetches pad by whole bars so
  the first trade's entry bar is never cropped; times beyond the data window
  are flagged, not silently validated against the last bar. Wired into the
  bundle; remove the `verdict` row to opt out.

- `@dsh-trading/tool-market` — two `get_ohlcv` contract fixes: requested
  indicator columns (`sma`, `rsi`) now enter the chart payload rounded to the
  same reporting precision as the regime series, so a requested `rsi14` is
  byte-identical to the frozen v1 column instead of a full-precision shadow
  of it (CONTRACTS §2.1: rounded once, producer-side); and `limit` is capped
  at 2000 bars per call — the CSV block is model-facing text, and an uncapped
  limit let a single call crowd out the analysis it was fetched for.
  `roundSeries` is now exported.

## 0.1.1 — 2026-08-17

- `@dsh-trading/client-chart`: fix the scenario reader to match the published
  v1 contract — `stance` is required, `triggerPrice`/`invalidationPrice` are
  preserved so scenario trigger/invalidation lines render on the chart, and
  legacy `weight`-shaped scenarios are dropped gracefully. Restores strict
  client type checking via klinecharts public types. Contributed by
  [@abigfatstone](https://github.com/abigfatstone) in
  [#1](https://github.com/maddogfinance/dsh-trading/pull/1) — this project's
  first outside contribution.
- All packages: add npm keywords for ecosystem discovery.

## 0.1.0 — 2026-08-17

First public release. Five packages plus the profile bundle, published as
`@dsh-trading/*` on npm.

- `@dsh-trading/market-data` — the typed `ctx.marketData` seam: one candle/symbol
  interface, any provider behind it.
- `@dsh-trading/provider-csv` — bring-your-own-data reference provider (local
  CSV files).
- `@dsh-trading/tool-market` — `list_symbols`, `get_ohlcv`, `market_snapshot`
  (multi-timeframe indicator regime in one call), `render_chart` (deterministic
  SVG), and `annotate_chart` — model-authored levels/zones/paths behind a trust
  gate: mandatory provenance sources, prices hard-validated against the real
  candle window (projection roles get a wider band), path times window-checked,
  scenarios restricted to base/alternative hypotheses with triggers and
  invalidations. Chart payloads ride `presentationMeta` on the durable session
  log: model-invisible, replay-safe.
- `@dsh-trading/risk-guard` — refuses execution-shaped tool names from any
  plugin at dsh's `tools/pre-execute` gate.
- `@dsh-trading/client-chart` — interactive candlestick cards in `dsh web`:
  chip-toggled indicator panes drawn from the exact per-bar series the model
  read, timeframe tabs, annotation overlays with a provenance levels table and
  scenario strips, plus an open renderer registry
  (`registerAnnotationRenderer`) for ecosystem annotation types.
- `CONTRACTS.md` — the versioned open contracts: chart payload schema, open
  annotation envelope, pure-renderer draw primitives, frozen v1 names.
- Pinned against dsh `0.1.0-rc.6`.
