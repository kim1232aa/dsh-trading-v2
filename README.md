# dsh-trading

A trading **research** workbench built as plugins for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`). No fork, no patched core — just a bundle you stack on the stock `web` or `headless` profile.

> **Status: early scaffold.** dsh itself is in developer preview and moves fast; expect breaking changes on both sides.

## The workbench

Under `dsh web` with the optional shell frame, the app becomes chart-first: a
persistent, live chart column on the left, the conversation on the right.

```
┌──┬────────────────────────────────────┬─────────────────────────┐
│  │  CC.BTCUSDT  1m 3m [15m] … 1d 1M   │  ⌄ Market Analyst       │
│▸ │  ┌──────────────────────────────┐  │                         │
│  │  │        ╱╲    ╱╲              │  │  MU is coiling under    │
│s │  │  ╱╲   ╱  ╲__╱  ╲_ ── 118,400 │  │  118.4k; the 15m ADX …  │
│e │  │ ╱  ╲_╱          ╲ ── 116,900 │  │                         │
│s │  │▁▂▃▁▂▄▃▁▂▃▅▂▁▃▂▁▄▃▁▂▃         │  │  ▸ annotate_chart       │
│s │  └──────────────────────────────┘  │    ✎ 6 marks — Show     │
│  │  ● live · 15m · 5:05:10 PM   📌    │                         │
└──┴────────────────────────────────────┴─────────────────────────┘
   rail        the chart you drive          the agent you talk to
```

The column is **yours**: type a symbol, pick a timeframe, and it fetches over a
loopback channel without going through the model at all. It also **follows the
conversation** — when the agent charts something, the column loads that
instrument *live* rather than mirroring the agent's frozen snapshot. Touching
the chart at all — a symbol, a timeframe — **pins** it, and a 📌 chip says so;
from then on the agent's drawings arrive as a **Show** offer on a pill instead
of taking the chart out from under you. Click the chip to start following
again.

Drawings work the same way in both directions. `annotate_chart` levels, zones
and paths land on the live column; the *prose* half of the same analysis —
the level table, the bull/bear scenario cards — stays in chat, where reading
text belongs. And the loop closes: the panel publishes what it is showing back
to the host, so the agent can read your chart (`get_chart_view`, plus a
one-line context injection each turn) instead of asking you to screenshot it.

## Demo

![The chart column is pinned to Micron while the agent's marks are for Bitcoin, so nothing lands; a pill offers them, and one click loads that chart with its six marks](media/workbench-preview.gif)

The column is pinned to Micron. The agent's six marks are for Bitcoin — a
different instrument, so the predicate refuses the merge and **nothing lands
on the wrong chart**. They are offered on a pill instead; one click loads that
chart with its marks. The clock in the top-right corner is a live feed off a
local OpenD, ticking through the whole clip.

▶ **[Watch the full 90-second demo with narration](https://www.youtube.com/watch?v=ULeROBoBGTc)** —
the loop above is one beat of it. The full cut also walks the shell, the
symbol box and the timeframe row, the agent drawing on the live column, and
the per-turn context line that lets it read your chart without asking for a
screenshot.

None of it is a mockup: the footage is 1920x1080 Playwright captures of a real
session against a live Futu OpenD, and the chart keeps ticking through every
shot.

<details>
<summary>The earlier v0.2 demo — chart cards in the chat feed</summary>

▶ **[80-second demo with narration on YouTube](https://www.youtube.com/watch?v=9KLpy-jPtKY)**

Recorded before the chart-first shell existed, and still how the `web`
surface behaves when `tradingFrame: false` is set in `dsh-trading` config:
the agent answers with an interactive chart card, chips draw indicator panes
from the exact per-bar series the model read, and `annotate_chart` puts
levels on the chart through a trust gate — mandatory provenance, prices
validated against the real candle window.

[![Interactive chart cards in dsh web: chips toggle indicator panes drawn from the model's own numbers; annotate_chart draws provenance-gated levels](media/demo-preview.gif)](https://www.youtube.com/watch?v=9KLpy-jPtKY)

</details>

## Design

One unified DSH plugin package (`dsh-trading`) with clean internal module boundaries enforced by `pnpm run check:boundary`:

```
src/tools/          model-facing tools (list_symbols, get_ohlcv,
                    market_snapshot, annotate_chart, walkthrough,
                    find_swing_points, find_supply_demand_zones,
                    large_orders, screen_market, run_backtest,
                    run_custom_indicator, render_chart) + indicator library
        │  consumes
        ▼
src/market-data/    the seam: ctx.marketData — typed candle/symbol interface
        ▲  implements
        │
src/providers/
  ├── csv.ts        local CSV files (<dataDir>/<symbol>/<timeframe>.csv)
  ├── cn.ts         A-share bars, money flow, quotes (Eastmoney/Sina/Tencent)
  ├── binance.ts    crypto bars & derivatives (Binance + OKX public APIs)
  ├── coinglass/    large-order walls (ctx.coinglass)
  └── futu/         opt-in broker gateway (HK / US / A-share / crypto via OpenD)

src/risk-guard/     independent: refuses execution-shaped tool names
                    from any plugin, at dsh's tools/pre-execute gate

src/verdict/        the evaluation harness: audit_backtest validates
                    fills against real candles, runs a seeded
                    random baseline and sample-size power check;
                    lint_strategy_code hunts lookahead leaks.
                    Verdicts may honestly be NOT PROVEN.

src/client/         web-only cards + the persistent chart column and
                    the loopback channel that feeds it; paired with
                    src/chart-view.ts (get_chart_view tool and per-turn
                    context line) + chart-first TradingFrame shell
                    (replaces stock ui-layout when tradingFrame !== false:
                    sidebar | chart | main | rightbar, 70/30 default split,
                    declaring the trading.chart seat)

Research-desk modules (registered on ctx.tools from src/index.ts):
src/holdings/       ledger: stage_trade / commit_trade / discard_trade,
                    get_holdings, list_trades (records, never executes)
src/watchlist/      add_to_watchlist / remove_from_watchlist / get_watchlist
                    (shared WatchlistStore with /dsh-trading-market RPC)
src/knowledge/      thesis store: record_thesis, query_theses,
                    update_thesis_status
src/authority/      check_trade_authority: fail-closed Ed25519 grant check
src/tasks-schedule/ scheduled research tasks (create/list/remove/
                    run_scheduled_task_now, get_scheduled_task_logs);
                    reads ctx.marketData only when present
```

- **`src/market-data/`** defines the seam (`ctx.marketData`) behind which every `MarketDataProvider` sits.
- **`src/providers/csv.ts`** is the *bring-your-own-data* template: local `<root>/<symbol>/<timeframe>.csv` files. Copy or add a provider behind `MarketDataProvider` — tools upstream never change.
- **`src/providers/futu/`** is an opt-in broker gateway provider: HK / US / A-share equities and crypto pairs (`CC.BTCUSDT`), the last being the only instrument that keeps moving at 3am, which makes it the honest way to check that "live" is live. It reads `Qot_GetKL` rather than `Qot_RequestHistoryKL` on purpose: GetKL rides the subscription quota and serves the most recent bars (≤1000), while RequestHistoryKL spends a scarce historical quota OpenD rations by account assets. The trade is stated in the provider's own `description` and honoured in its behaviour — `start` / `end` **filter** the fetched window, they do not seek, so a query for an older range returns honestly empty rather than quietly wrong. See [Live data](#live-data-futu-opend) for setup; note that OpenD is an account-bound personal gateway, which is a licensing fact, not a configuration one.

  `futu-api` is an optional **peer** dependency, deliberately unpinned. The SDK's version is coupled to the OpenD *you* have installed, not to this package, and Futu states outright that its package versions follow its own scheme rather than semver — so no range expresses "compatible" and the two must be aligned by hand. Install the `futu-api` matching your OpenD (`10.9.x` SDK for a `10.9.x` OpenD). The provider checks this itself at connect, via `GetGlobalState`, and logs a warning naming both versions if the protocol lines differ — a skew otherwise surfaces as a rejected handshake or an empty decode, with nothing to point at.
- **`src/tools/`** registers read-only analysis tools on `ctx.tools`. `market_snapshot` returns a whole multi-timeframe indicator regime in one call (RSI, slow stochastic, ADX/DI, MACD, MFI, ATR, SMA/EMA posture, Bollinger) with coarse state labels; `get_ohlcv` serves raw bars when structure matters. The indicator math is pure and deterministic — textbook definitions with Wilder smoothing where Wilder defined it — so values reconcile against any charting platform and a session-log replay recomputes identical model-visible numbers.
- **`src/client/` (chart & cards)** draws the charts, and drives them from two independent ends. The model's `market_snapshot` / `annotate_chart` / `walkthrough` results render as cards through the `tool.call.toolview` seam. The USER drives the persistent column directly: a symbol box and timeframe row talk to `ctx.marketData` over a loopback RPC channel (`/dsh-trading-market`) published by `src/index.ts`. That second path is the point — a workbench whose only input is "hope the agent calls the right tool" stops working the moment the agent would rather chat, which is exactly what happens in practice. The channel exposes the read verbs of `MarketDataProvider`, watchlist read/write, and chart-state reporting; it never touches order execution, so `risk-guard`'s execution gate is neither weakened nor bypassed.

  The column **follows the conversation rather than mirroring it**. When the agent charts an instrument the panel loads that symbol and timeframe *for itself* — adopting the agent's payload verbatim would pin a frozen ≤200-bar snapshot on screen, which is precisely the "why isn't it moving?" bug this replaced. It refuses to refetch a series it already holds (one analysis calls `annotate_chart` dozens of times on the same chart), and a **pinned** column stops following entirely: the agent's chart becomes a `Show` offer on a pill, not a takeover mid-read. The decision is a pure function with its own test suite, because a policy buried in a `useEffect` is a policy nobody can pin.

  Marks ride separately from candles. The agent's drawings are matched to the panel's series by a strict predicate — same instrument, same timeframe, prices inside the visible range — so a level drawn on the 1h chart never silently appears on the 5m one, and marks that fall outside are reported as dropped rather than clamped. They survive a reload via per-tab `sessionStorage`, since the card that published them may be virtualized away by the time the page comes back. Captions are laid out in three lanes with a minimum gap so ten levels inside a narrow band read as ten levels instead of one smear; past three collisions the line still draws and the caption is dropped.

  The panel also **publishes what it is showing** back to the host, and the host feeds that to the model two ways: a one-line context injection each turn, and a `get_chart_view` tool for the same facts on demand. This closes a loop that was conspicuously open — the panel's data path bypasses the tool layer by design, so nothing about the user's chart reached the agent on its own, and the agent would ask the user to screenshot a chart it was rendering two columns away. The injection costs nothing while the panel is idle (empty text is no contribution), the published value is validated on arrival (it lands in a model's context, which makes it a prompt-injection surface as much as a correctness one), and it expires after 30s so an abandoned second tab cannot make the model confidently name the wrong symbol.

  The chart stays **live**: it re-reads the last few bars once a second and merges them by open time, so a forming bar is replaced in place and a new one is appended — append blindly and a live chart grows a duplicate candle every poll. Updates go through `updateData` on the existing plot rather than a rebuild, so the canvas never flickers. A poll rather than a push, deliberately: the host channel is unary, and a chart seconds old is worth far less engineering than a streaming transport. When the tape stops moving — eight polls that taught it nothing — the panel backs off to once every five seconds and springs back the moment a bar moves, which is cheaper and more honest than shipping a market calendar. A hidden tab backs off the same way rather than stopping: some embedded browsers report `hidden` while the user is plainly watching, and a kill-switch there is indistinguishable from the bug it looks like.
- **`src/client/` (TradingFrame shell)** is the layout half. dsh's shell is one plugin row (`ui-layout`) that occupies the built-in `root` slot and declares the stock 0.2 seats (`sidebar` / `main` / `rightbar` / `shell.bottom` / `shell.leading` / `shell.overlay`) inside it. Slot core permits exactly **one declarer per seat**, so a frame cannot sit beside the stock one — `cordis.patch.yml` disables `ui-layout` whenever `dsh-trading` is enabled and `tradingFrame !== false`, and `dsh-trading/client` re-declares those seats *under the same names* plus `trading.chart`. `ui-sidebar` and `ui-conversation` register by name (`conversation` mounts into the keyed `main` seat), so dsh's real sidebar and its real conversation surface mount into `TradingFrame` unchanged; disabling `dsh-trading` or setting `tradingFrame: false` automatically restores stock `ui-layout`.

  Its defaults differ from the stock shell on purpose. The chart takes **70% of the free width** and the conversation 30 — stored as a *ratio*, not a pixel width, because "the chart takes 70%" has to survive a window resize to mean anything. The conversation floor drops from dsh's 640px to 420, since here it is a side column rather than the whole app; holding 640 would make the split impossible on a laptop. The sidebar starts collapsed to its rail: a permanent session-history column is a poor trade against chart width, so the frame contributes a session switcher to `conversation.session.header.utilities` instead — the route to your sessions lives in the conversation's own top-right, next to the thing it switches.
- **`cordis.patch.yml`** mounts the single `dsh-trading` entry plus the two official `@deepseek-ai/dsh-agent-preset` entries (`trading` / `analyst`). All providers (CSV, CN, Binance+OKX, CoinGlass) and workbench modules (`verdict`, `riskGuard`, `holdings`, `watchlist`, `knowledge`, `authority`, `tasksSchedule`, `chartPanel`) are active by default and configurable under `dsh-trading` `config` in your profile's `cordis.patch.yml`:

  ```yaml
  - id: dsh-trading
    config:
      tradingFrame: true     # set false to keep stock ui-layout (cards-only mode; restarts plugin when changed)
      dataDir: ./data
      chartDir: ./charts
      providers:
        cn:
          timeoutMs: 8000
        binance:
          enabled: true
          registerOkx: true
          allowUnofficialMirrors: true   # set false to disable fallback to third-party domestic mirrors
  ```

  > **Network endpoints note:** Official Binance/OKX APIs (`data-api.binance.vision`, `api.binance.com`, `fapi.binance.com`, `aws.okx.com`, `www.okx.com`) are queried first. When `providers.binance.allowUnofficialMirrors` is `true` (default), third-party domestic failover mirrors (`usnbweb.red`, `btmrvkxwhpn.com`, `ouyi.fit`) are tried only if official endpoints fail; set `allowUnofficialMirrors: false` to restrict requests strictly to official hosts.

### Timeframes

Chart buttons, market-RPC, and agent tools share one vocabulary:

`1m` `3m` `5m` `15m` `30m` `1h` `2h` `4h` `6h` `8h` `12h` `1d` `3d` `1w` `1M`

(`1M` is a calendar month; `1m` is one minute — case is load-bearing.)

Venue coverage:

| Venue | Notes |
| --- | --- |
| **Binance** | Full set above |
| **OKX** | Same set **except `8h`** (OKX has no 8h candle). `listSymbols` and the chart hide/reject `8h` when the source is OKX |
| **Gate** (Binance failover) | `1m` `5m` `15m` `30m` `1h` `4h` `8h` `1d` `1w` `1M` only — unsupported intervals fail clearly, never silent remap |
| **CN / Futu / CSV** | Their own subsets; providers reject what they cannot serve |

## Why this and not another finance plugin?

Data plugins hard-wire one source; dsh-trading defines the seam they can all plug
into. Quant toolkits ship one tool per indicator; `market_snapshot` returns the
whole multi-timeframe regime in one call, with state labels computed from the
rounded reported values so chart and number never disagree. And everyone else's
"research only" is a README sentence — ours is a `tools/pre-execute` gate you can
test.

## Hard boundary: research only

This project deliberately has **no order-execution capability and no execution seam**. Tools read data and compute; nothing places, routes, or simulates-then-forwards orders. Contributions adding live trading execution are out of scope. Nothing here is investment advice.

`src/risk-guard/` extends that stance over plugins this project does not ship: it refuses order-execution and fund-movement tool names at dsh's `tools/pre-execute` gate, so mounting a broker plugin in a `trading` profile does not quietly gain the ability to trade. Name matching is a heuristic and cannot be complete — the guard is defense in depth, not the guarantee. The guarantee is structural: there is no execution seam to reach.

## Data format (CSV provider)

```
data/
  AAPL/
    1d.csv        # header: time,open,high,low,close,volume
  BTC-USDT/
    1h.csv        # ISO-8601 UTC bar-open times, ascending
```

## Try it with dsh

One command — installs the single unified `dsh-trading` plugin and its `cordis.patch.yml` (host + client + TradingFrame + CN/Binance/CSV/CoinGlass providers + presets):

```sh
dsh plugin --profile trading add dsh-trading
```

<details>
<summary>Or from a local checkout (for developing on the plugin)</summary>

```sh
pnpm install && pnpm build
node examples/generate-sample-data.mjs

dsh plugin --profile trading add .
```

</details>

Add `"@deepseek-ai/dsh-headless"` (or `"@deepseek-ai/dsh-web-app"`) after
`@deepseek-ai/dsh-base` in the profile's `dsh.profile.bundles` list
(`$DSH_HOME/profiles/trading/package.json`) to pick a surface, configure a model
key (environment `DEEPSEEK_API_KEY`, or the Models page under `dsh web`), and
run from any directory whose `./data` holds candles in the layout above:

```sh
cd examples && dsh --profile trading "pull DEMO-EQ daily candles with sma20/sma50 and describe the trend"
```

Verify the composed layers any time with `dsh --profile trading --dump-config`.

### Live data: Futu OpenD

Install and run [Futu OpenD](https://openapi.futunn.com/futu-api-doc/) with its
**websocket** listener enabled — that is a separate port from `api_port`, and
`websocket_key_md5` is **mandatory** for JavaScript clients (without it OpenD
answers the handshake with a bare `retType: -1` and no message). In
`OpenD.xml` / `OpenD.ini`:

```ini
websocket_port = 33333
websocket_key_md5 = <md5 of your key>
```

Then install the matching SDK and enable `providers.futu` under `dsh-trading`
in your profile's `cordis.patch.yml`:

```sh
npm i futu-api@10.9   # must match your OpenD's version line
```

```yaml
- id: dsh-trading
  config:
    providers:
      futu:
        enabled: true
        host: 127.0.0.1
        port: 33333       # the websocket port — NOT api_port (11111)
        symbols:
          - CC.BTCUSDT    # crypto: the one that moves 24/7
          - HK.00700
          - US.MU
```

`symbols` is the catalogue `list_symbols` reports; any symbol OpenD knows can
still be typed straight into the chart column.

### Agent presets (交易模式 / Market Analyst)

Installing `dsh-trading` ships two **Agent 预设** as ordinary
`@deepseek-ai/dsh-agent-preset` rows in [cordis.patch.yml](./cordis.patch.yml)
(ids `trading` and `analyst`). Pick them in the session's preset menu — no copy
into `$DSH_HOME/.agent-presets/` (that directory is legacy and dsh no longer
reads it).

| Preset id | Menu name | What it adds |
|-----------|-----------|--------------|
| `trading` | 交易模式 | Chinese trading-partner voice + full technical-analysis persona (`prefix` / `suffix` on `@deepseek-ai/dsh-persona`) |
| `analyst` | Market Analyst | English structured multi-timeframe analysis persona (scope first, then levels / regime / scenarios) |

Under the default **standard** (or **minimal**) preset, idle chat keeps the
coding persona: the trading voice and the chart-panel `systemPrompt.context`
line do **not** apply. Tools from `dsh-trading` stay registered either way —
that is the cost of selecting the trading profile, not a per-topic inject.

Persona prose also lives under `presets/trading/` and `presets/analyst/` as
human-editable mirrors (`prefix`, not the retired `text` field). The ship path
is [cordis.patch.yml](./cordis.patch.yml); edit both when changing the voice.

The analyst persona holds the research boundary in prose the way `risk-guard`
holds it in code: report what the data shows, never recommend a position or an
entry. It also decides *where* an analysis lands — `annotate_chart` draws on
the reader's live column, and `render_chart` is reserved for exporting an image
file.

### Chart cards in `dsh web`

**First, pick a workspace.** A fresh `dsh web` has no selected workspace, and
the session composer stays disabled until you choose one (dsh's
[user guide](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/user/guide/index.md)).
Open the printed URL, click **Choose workspace**, add the directory you started
`dsh` from (the one whose `./data` holds your candles), select it, then start a
session.

Under the `web` surface, `market_snapshot` and `get_ohlcv` results render as
interactive candlestick cards (`src/client/ChartCard.tsx`): K-line + volume +
SMA20/50/200, timeframe tabs, and a chip strip that both shows the exact
indicator values the model read and toggles panes for them (RSI, slow
stochastic, ADX/DI, MACD, MFI, plus Bollinger as a price overlay). Every pane
is plotted from the *same per-bar series the model was given*, not recomputed
in the browser — which is why the card can never contradict the analysis text
beside it. The chart data rides the durable `tool/result` event's presentation
metadata: it never enters the model's context (zero token cost) and it replays
with the session log.

The card renderers are web-only; under a headless profile dsh falls back to the
generic text card and the loopback channel never appears. When `chartPanel.enabled`
is `false`, `applyChartHost` is skipped (so `get_chart_view` and the per-turn
context line do not register either). Otherwise `get_chart_view` and the context
line register wherever `ctx.tools` and `ctx.systemPrompt` exist, and report a
closed panel when no chart is open.

## Development

Requirements: **Node >=24.22.3** (matching DSH `0.2.3-alpha.2`) and `pnpm`.

```sh
pnpm install
pnpm typecheck
pnpm build
pnpm run audit:all
pnpm test
```

`pnpm test` includes `test/loader-boot.e2e.test.ts`: a keyless smoke that boots a
real `dsh web` under a throwaway `DSH_HOME` and loads the **built** single
`dsh-trading` plugin through dsh's Loader (run `pnpm build` first; it
self-skips without `dsh` on PATH or without `lib/`). It is what catches a stray
`export default` or Cordis inject mismatch.

## Roadmap

- [x] Single-package `dsh-trading` bundle + `cordis.patch.yml` for DSH `0.2.3-alpha.2`
- [x] Chart cards in `dsh web` (`src/client/ChartCard.tsx`): `market_snapshot` / `get_ohlcv` render as interactive candlesticks with chip-toggled indicator panes
- [x] Live panel chips: client `enrichChartTimeframe` computes regime series locally (MACD/Stoch/ADX/MFI/BB) when the payload has no agent series
- [ ] `ENTRY_SIGNAL`（多空观察信号）is **experimental / 未验证** — SuperTrend observer only; off by default in 指标参数
- [x] `annotate_chart` / `walkthrough`: model-authored levels/zones/paths with mandatory provenance and a hard price-range gate, plus base/alternative scenarios — rendered on the card with a levels table
- [x] Open contracts for ecosystem builders ([CONTRACTS.md](./CONTRACTS.md)): chart payload, open annotation envelope, pure-renderer registry
- [x] Chart-first shell (`src/client/TradingFrame.tsx`) and a persistent live column the user drives, with the agent's drawings landing on it
- [ ] Chart panel deepening: user-drawing feedback to the agent, `@Remote` host service for pan-back data
- [ ] Watch/alert contract (notify-only), standalone contracts export, conformance fixtures
- [ ] Research-journal session events (hypotheses, signals — replayable)
- [ ] Deterministic backtest runner as a `ctx.commands` CLI command (never model-executed)
- [ ] More providers: Parquet, ClickHouse, CCXT

## License

MIT
