# 上游工作台演进（maddogfinance/dsh-trading @ 7470117a）全量移植设计规格

**日期**：2026-11-19
**目标仓库**：`dsh-trading`（当前本地基线 `HEAD = f0eff78f`，`origin/main`；移植来源 `upstream/main = 7470117a` *The public workbench: a guided walkthrough, symbol naming, and a keyless feed*）
**状态**：待用户审阅确认（确认后进入 `writing-plans` 拆解实施计划）

---

## 1. 背景与目标

上游 `maddogfinance/dsh-trading` 在 commit `7470117a` 中把“聊天输出长篇分析报告 + 静态卡片”演进为“交互式图边讲解工作台”：

1. **命名与全局无密钥行情（L0/L1）**：在 `MarketDataProvider` 增加可选 `search(query)` 能力，新增 `@dsh-trading/provider-public`（Yahoo Finance 无密钥 K 线 + 1m–1w + 交易时段对齐 4h 聚合 + 中英/拼音/券商代码本地别名与远程搜索）。
2. **模型工具升级（L2）**：在 `@dsh-trading/tool-market` 新增 `resolve_symbol` 与 `walkthrough` 工具，模型按节以口语化短句分段讲解，每句可点名画圆、画线、高亮区域、点位标注与高亮成交量；所有数值由工具对照真实 K 线校验。
3. **预设演进**：将分析师人格改为 **先定框架、按节 `walkthrough`、结论先行** 的图边讲解工作流，并用 `ask` 按钮承接下一步追问。
4. **浏览器交互工作台（L3）**：
   - `ChartPanel` 从“只看 `latest`”升级为双端联动：用户发消息后 1 秒内通过 `symbols.ts` + RPC `search` 预切图表，模型结束或推进 `walkthrough` 时通过 `LessonLayer` 在画布上叠加 SVG 手绘笔迹动画、高亮带与脉冲指针；顶部新增「Ask about `<symbol>`」与播放控制条（Pause / Resume / Back / Show all / Dismiss）。
   - `WalkthroughCard` 逐句呈现节奏、高亮 `[[id|words]]` 词组（悬停高亮对应图元）、点击历史任意一句回放图表瞬间、底部渲染可点击追问气泡。
   - 聊天区 `ChartCard` 在右侧图表栏打开时折叠为单行回执（`show chart` 可按需展开），避免刷屏遮挡对话。

本分叉（`kim1232aa/dsh-trading`）已具备更先进的底层基建（DSH `0.2.0-rc.2` 槽位/会话体系、`klinecharts 10.1.0`、`provider-binance` + `provider-cn` + `provider-coinglass`、`client-frame` 0.2 四栏壳、29 个注册工具与 14+ 自定义技术指标），且与上游无共同 Git 祖先（`git merge-base HEAD upstream/main` 为空），无法直接 `git merge`。本次采用**按架构层级（L0→L4）全量垂直重构移植（方案一）**，100% 完整吸收上游全部新能力，同时全面保留现有加密货币/A股/衍生品/指标/资金/回测体系。

---

## 2. 已锁定的关键决策与运行环境约束

### 2.1 用户拍板决策

1. **双预设全量切换（Q1 = B）**：
   - 保留 `bundle/trading/cordis.patch.yml` 中两个预设（`preset-trading` 交易模式 与 `preset-analyst` Market Analyst）及其各自的源文件（`presets/trading/agent.cordis.yml`、`presets/analyst/agent.cordis.yml`、`presets/analyst/preset.yml`）。
   - 两者均升级为 **“`resolve_symbol` 查名 + `walkthrough` 分节图边讲解”** 主工作流：
     - `preset-trading` 保留全部加密货币衍生品（Binance/OKX 现货与永续 OI/费率/多空比/大户/爆仓/CVD/基差、CoinGlass 大单墙）、`find_swing_points` / `find_supply_demand_zones`、艾略特波浪、XABCD 谐波比率铁律及中文熟人口吻，改为用 `walkthrough` 先给结论再逐条画图讲解，保留 `annotate_chart` 用于用户显式要求持久画线/多周期结构留档场景。
     - `preset-analyst` 同步上游 `7470117a:presets/analyst/` 的研究型图边讲解工作流与文案风格（含 `preset.yml` 描述同步）。
2. **多源并存与自动路由（Q2 = A）**：
   - 保持 `defaultProvider: binance`（桌面端既有配置不破坏）。
   - 全量移植 `@dsh-trading/provider-public` 并纳入组合配置；为 `provider-binance` 与 `provider-cn` 补齐 `MarketDataProvider.search(query)`。
   - `MarketData.search`、`resolve_symbol` 与 `ChartPanel` 自动识别按 **`binance -> cn -> public`**（并兼容本地已注册自定义源）顺序分流与匹配：加密交易对走 `binance`，A股代码与中文A股别名走 `cn`，美股/港股/大宗/外汇/指数/券商前缀（`US.MU` / `HK.00700` / `SH.600519` / `SZ.300750`）及未命中前两者的名称/代码兜底走 `public`。
3. **图表列打开时聊天卡片默认折叠（Q3 = A）**：
   - 与上游一致：当右侧常驻图表栏宽度 `> 0`（`setColumnOpen(true)`）时，聊天流中的 `ChartCard`（`market_snapshot` / `get_ohlcv` / `annotate_chart`）默认折叠为一行回执（附「展开图表 / show chart」按钮），仍照常调用 `publishLatestChart` 更新右侧栏；当图表栏收起（`width === 0`）或未加载 `client-frame` 时自动完整展开。

### 2.2 本叉真实运行契约（已在代码与 `app.asar` 中核实）

设计必须贴合本叉运行环境，禁止照抄上游 `0.1.0-rc.6` 与 `klinecharts 9.8.12` 的旧接口：

1. **DSH `0.2.0-rc.2` Client 运行时差异**（核实自 `app.asar/node_modules/@deepseek-ai/dsh-client-ui-session` 与 `dsh-api-session-controller`）：
   - **发送后续追问**：上游 `0.1` 使用 `sessions.sessionOf(sessions.scope(sessionId)).prompt(..., 'queue')`。在 DSH `0.2` 中，`ISessions` 提供的接口为 `ctx.sessions.binding(sessionId)?.session.prompt([{ type: 'text', text }], 'queue')`（其中 `binding(id).session` 为 `SessionFace`，返回 `Promise<RemoteResult<{ accepted: true }>>`）。若会话已切换或未保留，需安全降级告警而不抛出未捕获异常。
   - **`SessionSnapshot` 结构变化**：上游 `0.1` 的 `useSession` 暴露 `state.nodes` 与 `state.queue`。在 DSH `0.2` 中，`SessionSnapshot` 仅含 `{ sessionId, pendingSubmissions, running, blank, promptAttempted, awaitingFirstTurn, ... }`，**不存在 `nodes` 或 `queue` 字段**：
     - 正在发送或刚入队的本地回显位于 `snapshot.pendingSubmissions`（`{ requestId, placement, time, text }`）。
     - 持久化的用户消息事件位于 `binding.eventSource`（`SessionEventSource = ObservableSnapshot<SessionEventWindow>`，通过 `entries` 中 `entry.type === 'event' && entry.event.type === 'user/message'` 获取，带 `seq`、`time`、`data: UserMessage`）。
     - 已入队待下一轮/下一步处理的消息位于 `binding.session.projections.faceOf('inbox')`（`InboxState` 的 `'next-turn'` 与 `'next-step'` 数组）。
   - **`Slot` 注入与 Hook 顺序要求**：`ui-renderer` 的 `SessionMaybeEntryBody` 在无会话与有会话之间切换时重新求值 `inject(sessionId)`；为严格遵守 React Hook 调用顺序与 `ui-slots` 不重名约束，`dsh-session.ts` 对可观测源在无会话时返回稳定哨兵空 `HostObservable`，保证单测无需真实 `app.asar` 即可通过结构化 fake 驱动。
2. **`klinecharts 10.1.0` API 差异**（核实自 `packages/client-chart/src/client/kline-v10.ts`）：
   - `overrideIndicator` 在 10.x 不再接收第二位置参数 `'candle_pane'`，必须使用 `kline-v10.ts` 的 `overrideIndicator(chart, { name, calcParams }, 'candle_pane')` 或 `chart.overrideIndicator({ name, calcParams, paneId: 'candle_pane' })`。
   - `ChartCard` 主图默认均线指标是自定义 `WMA`（默认 `[60, 100, 200]`），而非内建 `MA`。`LessonLayer` 根据 section 周期（周线 `[20, 50, 200]`，非周线 `[20, 50]`）需要避免远处 200 均线压缩纵轴时，应通过 `kline-v10.ts` 的 `hasIndicator` / `overrideIndicator` 探测画布当前挂载的是 `MA` 还是 `WMA`：若存在 `MA` 则调节 `MA`，若挂载了 `WMA` 且其处于默认超长周期（如包含 `>= 200`）则在非周线讲解期间记录原 `WMA` 参数并临时缩窄，讲解结束或组件卸载时恢复用户原有参数。
   - `createIndicator` 在 `Kline` 中统一走 `kline-v10.ts` 的 `createIndicatorInPane` / `syncIndicatorInPane`，其返回的 `paneId` 字符串存入 `PaneIds` 供 `LessonLayer` 定位副图坐标。
3. **边界与代码审计守卫**：
   - `scripts/boundary-check.mjs` 严格强制 `L0 (market-data) -> L1 (providers/subsystems) -> L2 (tool-market/verdict/tasks-schedule) -> L3 (client-frame/client-chart) -> L4 (bundle)`。`provider-public` 属于 L1，只能依赖 `@dsh-trading/market-data`、`@deepseek-ai/cordis`、`@deepseek-ai/schemastery`。
   - `scripts/tools-audit.mjs` 要求 `defineTool` 工具名 `snake_case`、描述长度 >= 8 且全局唯一；`resolve_symbol` 与 `walkthrough` 必须满足。
   - `scripts/home-guard.mjs` 禁止硬编码用户目录路径；所有新增测试与脚本严格遵守相对路径。
   - 既有未提交文件与 5 个未跟踪嵌套 `pnpm-lock.yaml`（`client-frame`、`market-data`、`provider-binance`、`provider-coinglass`、`tool-market`）：在基线阶段优先核查并处理现有已构建的 `zone-colors` 本地改动，保持 5 个嵌套 `pnpm-lock.yaml` 不纳入提交。

---

## 3. 系统架构与数据流

```
用户提问 ("讲讲特斯拉" / "看看大饼 15m")
   │
   ├─[快路径 ~50ms：ChartPanel 语义嗅探]
   │    useSession(pendingSubmissions) + sessionEvents(user/message) + inbox
   │      └─> symbols.ts: readSymbolCandidates(text)
   │             ├─ kind="symbol" (如 BTCUSDT / 0700.HK / AAPL / US.MU->MU) ──> market.getPayload()
   │             └─ kind="text"|"query" (如 "特斯拉" / "tesla") ──> RPC ENDPOINTS.search
   │                   └─> MarketData.search(q, explicitProvider?) [按 binance -> cn -> public 路由]
   │                         └─> isSameInstrument() 校验后立即加载对应数据源 K 线
   │
   └─[慢路径：Agent 分析与图边讲解]
        1. resolve_symbol(query) -> 锁定精确 { provider, symbol }
        2. market_snapshot / get_ohlcv / large_orders / find_swing_points -> 数据与指标
             └─> Chat 中 ChartCard：右侧栏开启时折叠为单行回执，同时 publishLatestChart()
        3. walkthrough(symbol, timeframe, section, marks, lines, ask)
             ├─> 服务端 resolveWalkthrough(args, candles, provider.id)
             │     校验时间/价位/指标值误差 -> 生成带 window, series, marks, lines 的 WalkthroughPayload
             └─> 客户端 WalkthroughCard 注入 lesson.ts (LessonPlayer 单例)
                   ├─ 对话区：按打字+阅读节奏逐句显现，支持 [[markId|词]] 悬停、点击任意句回放、ask 点击追问
                   └─ 图表栏：ChartPanel 切换至 board 对应品种/周期，merged 暂时让位，
                              ChartBody 传入 forceChips + overlay(LessonLayer SVG 手绘层 + 脉冲指针 + 高亮量柱)
```

---

## 4. 模块设计与接口契约（按五个切片组织）

### 切片 A：基线梳理 + L0 `market-data` + L1 `provider-public` / `provider-binance` / `provider-cn`

#### A.0 工作区基线整理
- 先检查当前工作区既有改动（`ChartCard.tsx`、`annotation-overlays.ts`、`test/zone-colors.test.ts`），确认测试通过后单独提交归档，避免与移植改动混杂；5 个既有未跟踪嵌套 `pnpm-lock.yaml` 全程排除于 `git add` 之外。

#### A.1 `@dsh-trading/market-data`（L0）
- `packages/market-data/src/types.ts`：
  - 为 `MarketDataProvider` 增加可选方法 `search?(query: string): Promise<InstrumentInfo[]>`（`InstrumentInfo` 在 HEAD 已包含 `name?: string` 与 `assetClass?: string`，保持不变）。
- `packages/market-data/src/index.ts`：
  - `MarketData` 保留既有 `resolveProvider(symbol, explicitId)` 等全部能力。
  - 新增 `search(query: string, providerId?: string): Promise<InstrumentInfo[]>` 与多源归属查询 helper `searchWithProvider(query: string, providerId?: string): Promise<Array<{ providerId: string; item: InstrumentInfo }>>`：
    - 若传入 `providerId`，仅查询该 provider（无 `search` 方法则返回 `[]`）。
    - 若未传 `providerId`，按 **确定性优先级** 汇聚已注册 provider 的搜索结果：优先 `binance`，其次 `cn`，其次 `public`，其余已注册 provider 按注册序追加；单一 provider 抛错或超时不应拖垮其余 provider（记录继续，除非显式指定了 `providerId`）。按 `providerId:symbol` 去重。
- 单测：覆盖显式 provider、自动路由顺序、provider 无 `search` 方法时安全返回 `[]`、单源异常降级。

#### A.2 `@dsh-trading/provider-public`（L1，全新包）
- 移植上游 `7470117a:packages/provider-public/` 全量代码、配置与单测，并同步适配本叉依赖版本（`@deepseek-ai/cordis: ^4.0.4`、`@deepseek-ai/schemastery: ^3.18.1`）：
  - `Config`：`id='public'`、`baseURL='https://query1.finance.yahoo.com'`、`cacheMs=20_000`、`dailyCacheMs=300_000`。
  - `TIMEFRAMES`：`['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w']`（Yahoo 原生支持集 + 本地按交易所开盘时段对齐的 `4h` 聚合 `aggregate(candles, 4, sessionOf(meta, symbol))`，以及盘中平坦零成交量回声 K 线折叠 `foldEchoes`）。
  - `normaliseSymbol`：支持 `/` 转 `-`、`*USDT` 转 `*-USD`、`BTC/ETH/SOL...` 别名、6 位已知法币对转 `XXXYYY=X`。
  - `NAME_ALIASES` + `byContainment` + `byName`：覆盖美/港/A股常用中文名、拼音、英文名（含词边界约束避免 `gold` 误匹配 `goldman`，最长匹配优先避免 `茅台` 抢占 `贵州茅台`）及 `US.MU` / `HK.00700` / `SH.600519` / `SZ.300750` 券商前缀归一化。
  - `search(query)`：先查本地别名与目录，未命中再请求 Yahoo `/v1/finance/search`（60 秒缓存 + 429 冷却期保护，429/网络异常时优雅返回 `[]`）。
  - **边界守卫登记**：同步在 `scripts/boundary-check.mjs` 的 `LAYERS` 表新增 `'@dsh-trading/provider-public': 1`，确保 `L4 -> L1` 依赖校验与包盘点全绿。
  - **多源路由兼容 `matchesSymbol(symbol: string): boolean`**：识别带 `.HK/.SS/.SZ/.TW/.T` 后缀、`^` 指数、`=F/=X` 期货/外汇、`-USD` 加密对、券商前缀 `US./HK./SH./SZ.`，以及纯字母美股代码（如 `AAPL`、`NVDA`、`BRK-B`）；**显式拒绝** 纯 6 位 A 股数字/`sh/sz/bj` 代码及常见加密 `USDT/USDC/FDUSD/BTC/ETH/BNB` 交易对，防止与 `provider-cn` 和 `provider-binance` 在 `resolveProvider` 时冲突。

#### A.3 `@dsh-trading/provider-binance` 与 `@dsh-trading/provider-cn` 搜索补全（L1）
- `provider-binance`：实现 `search(query)`。维护主流币种中文/英文/简称别名表（如 比特币/大饼→`BTCUSDT`、以太坊/以太/ETH→`ETHUSDT`、SOL/索拉纳→`SOLUSDT`、BNB/XRP/DOGE/ADA/AVAX/LINK/LTC 等，附带 `name` 与 `assetClass: 'crypto'`）并结合 `this.symbols` 前缀/子串匹配及 `normalizeSymbol` 校验（仅当规范化结果存在于 `this.symbols` 且不含美股/A股数字前缀时命中）。
- `provider-cn`：实现 `search(query)`。支持：(1) 直接 6 位代码或 `sh600519` / `sz300750` / `600519.SS` / `SH.600519` 归一；(2) 本地常见指数与龙头中文别名表（如 上证/上证指数→`sh000001`、深证成指→`sz399001`、创业板指→`sz399006`、科创50→`sh000688`、沪深300→`sh000300`、贵州茅台/茅台→`600519`、宁德时代→`300750`、比亚迪→`002594`、中芯国际→`688981` 等）；(3) 未命中本地表时，若查询含中文或 A 股关键词，可选请求东财公共搜索建议接口（短超时 + 缓存，失败静默返回 `[]`），仅筛选 `sh/sz/bj` A 股与指数。

---

### 切片 B：L2 `@dsh-trading/tool-market`（`resolve_symbol` + `walkthrough`）

#### B.1 `resolve_symbol` 工具
- 注册于 `packages/tool-market/src/index.ts`：
  - 参数：`query: string`（必填）、`provider?: string`（可选）。
  - 行为：若指定 `provider`，仅查该 provider；若未指定，调用多源汇聚查询，输出携带 `{ symbol, name?, assetClass?, provider }`（当 `provider` 未指定时，每一条结果显式标出推荐数据源如 `binance` / `cn` / `public`，确保模型在多源并存环境如 `BTC` -> `binance:BTCUSDT` vs `public:BTC-USD` 时能够准确调用后续工具）。
  - `isConcurrencySafe: () => true`；严格满足 `tools-audit.mjs`。

#### B.2 `walkthrough` 工具与校验核心
- 新增 `packages/tool-market/src/walkthrough.ts`（从上游 `7470117a:packages/tool-market/src/walkthrough.ts` 全量移植并扩展适配本叉）：
  - **支持字段（`WALK_FIELDS`）**：`open, high, low, close, volume, rsi14, stoch_k, stoch_d, adx, plus_di, minus_di, macd, macd_signal, macd_hist, mfi14, sma20, sma50, sma200, ema20, bb_upper, bb_middle, bb_lower`。
  - **支持副图（`WALK_PANES`）**：`rsi, stoch, adx, macd, mfi`（通过 `PANE_COLUMNS` 映射到 `regimeSeries` 列名）。
  - **图元类型（`WALK_MARK_TYPES`）**：`circle`、`level`（需可核验 `source` 或 `why` + `priceGate` 范围校验）、`zone`（`low < high` + `why`）、`path` / `arrow`（2–8 点，先真实 bar 点后可选 `ahead: 1..30` 投射点，全点同 pane）、`span`。
  - **强校验机制（防幻觉核心）**：
    - `anchor` 将 ISO 时间或 `YYYY-MM-DD` 日期解析为真实 K 线索引；若模型填了 `value`，通过 `matches()` 核对实测数值，不符则抛出包含真实数值与匹配栏位的精准纠错报错，驱动模型自修正。
    - `checkSource` 对 `level` 的 `{ field, time | stat: 'min'|'max', from, to }` 进行算术核验。
    - 每条 `mark` 必须至少被某一行 `line.draw` 引用；`lines` 1–12 条，`marks` 1–16 条，`ask` 0–3 条。
  - **源解析健壮性**：`execute(args)` 使用 `ctx.marketData.resolveProvider(args.symbol, args.provider)` 解析 provider（模型仅传 `symbol: '600519'` 或 `'AAPL'` 省略 `provider` 时也能精确命中对应数据源）；拉取 `limit: 400` 根 K 线，返回 `{ summary, walkthrough: payload }`，`presentationMeta: (_args, value) => value.walkthrough`，`isConcurrencySafe: () => true`。
- 保持现有 29 个工具及其参数/输出契约 100% 不变。

---

### 切片 C：双预设升级（`preset-trading` 与 `preset-analyst`）

- 同步更新四处声明源：
  - `presets/trading/agent.cordis.yml` 与 `bundle/trading/cordis.patch.yml` 中的 `preset-trading`。
  - `presets/analyst/agent.cordis.yml`、`presets/analyst/preset.yml` 与 `bundle/trading/cordis.patch.yml` 中的 `preset-analyst`。
- **`preset-analyst`**：
  - 完整采用上游 `7470117a:presets/analyst/preset.yml` 与 `agent.cordis.yml` 的工作流规范：`resolve_symbol` 先查名 -> 范围不清先问框架 -> `market_snapshot` / `get_ohlcv` 取数 -> `walkthrough` 分节图边讲解（结论先行 + `keep: true` 关键区 + `[[id|词]]` + 数值来自工具回执）-> `ask` 收尾并结束回合；保留无图表栏时的 `render_chart` 与研究边界。
- **`preset-trading`**：
  - 保留中文交易搭档风格（短句、先给结论、熟人口吻）与全套专业纪律：币安/OKX 现货与永续衍生品口径、CoinGlass `large_orders` 挂单墙、`find_swing_points` + `find_supply_demand_zones` 检验规则、艾略特 5-3 铁律、XABCD 谐波比率铁律、`screen_market` / `run_backtest`。
  - **升级主工作流**：非标准符号先调 `resolve_symbol` 拿 `{ symbol, provider }`；盘面分析讲解优先采用 `walkthrough` 分节图边讲解（结论先行 + 逐句高亮拐点/供需区/放量 K + `ask` 追问收尾），不在聊天里重复堆砌长报表；用户显式要求在主图留档持久趋势线/支撑阻力/场景推演时使用 `annotate_chart`。

---

### 切片 D：L3 `@dsh-trading/client-chart`（RPC + DSH 0.2 会话适配 + 讲解层 + 折叠卡片）

#### D.1 服务端 RPC 与 `MarketClient`（`market-rpc.ts` + `market-client.ts`）
- `packages/client-chart/src/market-rpc.ts`：
  - `ENDPOINTS` 增加 `search: 'search'`（保留现有全部 13 个端点）。
  - 新增 `SearchResponse { providerId: string; query: string; items: Array<InstrumentInfo & { providerId?: string }> }` 与 `readSearchRequest(payload)`（校验非空字符串且长度 `<= 64`）。
  - `serveMarketEndpoint` 处理 `ENDPOINTS.search`：若传 `providerId` 查指定源，否则走 `marketData.searchWithProvider`（或兼容仅提供 `provider()` 的测试 fake），每条命中附带归属 `providerId`。
- `packages/client-chart/src/client/market-client.ts`：
  - `PanelInstrument` 增加可选 `providerId?: string`。
  - `MarketClient` 新增 `search(query: string, signalOrOpts?: AbortSignal | { providerId?: string; signal?: AbortSignal }): Promise<PanelInstrument[]>`。
  - 新增 `withLessonSeries(payload, series)`：严格按 K 线开盘时间戳（`Date.parse(c.time)`）将 `walkthrough` 的指标列对齐到右侧栏实盘 K 线序列。

#### D.2 DSH `0.2.0-rc.2` 会话与订阅适配层（`dsh-session.ts`）
- 新增 `packages/client-chart/src/client/dsh-session.ts`，隔离所有 DSH 0.2 会话接口：
  - `sendReply(ctx, sessionId, text)`：调用 `ctx.get('sessions')?.binding(sessionId)?.session.prompt([{ type: 'text', text }], 'queue')`，失败仅告警不抛未捕获异常。
  - `extractLatestUserPrompt({ pendingSubmissions, inbox, events })`：按 `inbox`（`next-turn` / `next-step`） -> `pendingSubmissions` -> `eventSource` 倒序 `user/message` 读取最新用户提问文本与时间，配合 `SNIFF_FRESH_MS = 60_000` 避免切换旧会话误切图表。
  - `hasUserReplyAfter({ events, pendingSubmissions, inbox }, callBlockSeq)`：判定工具调用序号之后是否已有新用户回复或待发送消息，驱动 `WalkthroughCard` 隐藏过期 `ask` 气泡。
  - `createSessionFeedObservable(ctx, sessionId)`：合成单一稳定的 `HostObservable`（或订阅器），在无会话时返回稳定哨兵空观察器，确保 `ChartPanel` 即使从无会话过渡到有会话也严格保持 React Hook 调用顺序。
- `packages/client-chart/src/client/index.ts`：
  - `inject` 维持 `['slots', 'connection']`（可选读 `ctx.get('sessions')`）。
  - 在 `tool.call.toolview` 增注册 `key: 'walkthrough'` -> `WalkthroughCard`（注入 `ask` 与 `useSessionFeed` / `hasReplyAfter`）。
  - 在 `trading.chart` 注入 `market`、`ask`（无 `sessionId` 时为 `undefined`）与 `sessionFeed`。

#### D.3 讲解状态机与手绘 SVG 层（`walkthrough.ts` + `lesson.ts` + `ink.ts` + `LessonLayer.tsx`）
- `walkthrough.ts`：移植 `readWalkthrough`、`parseSay`、`plainSay`。
- `lesson.ts`：移植 `LessonPlayer`、`lesson` 单例、`boardAt`、`LIVE_WINDOW_MS` 及 `hurry / pause / resume / replay / backToLive / skipAll / dismiss / answer / setHot`。
- `ink.ts`：移植确定性手绘笔迹生成器（`rng`, `seedOf`, `stroke`, `loop`, `polyline`, `arrowHead`）。
- `LessonLayer.tsx`：
  - 放置在 `Kline` 内与 `<div ref={el} style={{ position: 'absolute', left: drawBarW, right: 0, top: 0, bottom: 0 }} />` **同级且共享同一 `left: drawBarW` 包装容器内**，彻底避免 Pro 绘图工具栏展开/收起导致手绘标线水平错位。
  - 均线防挤压兼容：检查 `hasIndicator(chart, 'candle_pane', 'MA')` 与 `'WMA'`；通过 `kline-v10.ts` 的 `overrideIndicator(chart, { name, calcParams }, 'candle_pane')` 仅调整存在的均线并记录恢复用户原有的 `WMA` 设置。
  - 支持 `onScroll` / `onZoom` 区分程序镜头移动与用户拖拽并调用 `onUserMove()` 暂停讲解。

#### D.4 `WalkthroughCard.tsx`、`ChartCard.tsx` 与 `latest.ts`
- `latest.ts`：新增 `setColumnOpen`、`subscribeColumn`、`getColumnOpen`。
- `WalkthroughCard.tsx`：渲染分段讲解行、绿条当前指示、`[[id|词]]` 荧光笔下划线与悬停联动、点击任意行回放图表、未播完脉动圆点点击加速、`Continue` / `Back to where we were` / `ask` 追问胶囊。
- `ChartCard.tsx`：
  - 导出 `useDark()` 与 `KlineReady { chart: Chart; panes: PaneIds }`。
  - `Kline` 与 `ChartBody` 新增可选 `forceChips?: string[]` 与 `overlay?: (ready: KlineReady) => ReactNode`，在不影响用户自选 `EDITABLE` / `ChartChrome` / `VOL_TIER` / `CVD_FLOW` / `LARGE_WALLS` 的前提下，确保 `forceChips` 指定的讲解指标（`rsi` / `macd` / `stoch` / `adx` / `mfi`）挂载并把对应 `paneId` 写入 `PaneIds` 供 `LessonLayer` 定位；**特别处理 `rsi`**：HEAD 中 `CHIP_DEFS` 的 `'rsi'` 默认映射到双面板 `RSI_GRID`，因此当 `forceChips` 显式点名 `'rsi'` 时必须挂载单序列 `TM_RSI`（读 `withLessonSeries` 写入的 `rsi14` 列，落到 `pane_rsi`）并记录 `panes.rsi = 'pane_rsi'`，与 `LessonLayer` 副图坐标严格对齐。
  - `ChartCard` 读取 `getColumnOpen()`：保持 `publishLatestChart` 在折叠判断之前执行；列开且未点展开时渲染紧凑单行回执（带「展开图表」按钮展开 `ViewportChartCard`）。

#### D.5 `ChartPanel.tsx` 融合升级
- 保留既有数据源选择器、自选/热门栏、衍生品/大单墙/资金流/盘口/基本面条带、`startPanelPolling`、`panelSeriesKey`、`combineMarks`。
- 融入：(1) 读 DSH 0.2 最新用户消息并按 `symbols.ts` + `market.search` 1 秒内预切品种及对应数据源；(2) `talking` 时接管系列加载、暂停 `decideFollow` 与旧标注显示（`!lessonOn`），渲染 `LessonLayer` 与顶部讲解控制条（Pause / Resume / Back / Show all / ×）；(3) 顶栏增加「讲讲 `<symbol>` / Ask about `<symbol>`」按钮；(4) 通过 `useEffect` 上报 `setColumnOpen(width > 0)`；(5) 更新输入框占位示例覆盖加密/A股/美股/港股。

---

### 切片 E：TDD 测试补全、本地集成配置与全仓验证

1. **新增与扩展测试**：
   - `packages/market-data/test/search.test.ts`：多源优先路由顺序、显式指定、单源缺失/异常隔离。
   - `packages/provider-public/test/aggregate.test.ts`、`search.test.ts`（含 `matchesSymbol` 不抢占 `ETHUSDT`/`600519`）。
   - `packages/provider-binance/test/search.test.ts`、`packages/provider-cn/test/search.test.ts`。
   - `packages/tool-market/test/walkthrough.test.ts`（全量移植 + `resolve_symbol` + `resolveProvider` 自动路由测试）。
   - `packages/client-chart/test/`：新增 `walkthrough.test.ts`、`symbols.test.ts`、`dsh-session.test.ts`；扩展 `market-rpc.test.ts`、`latest.test.ts`、`chart-card.test.ts`。
2. **组合挂载与守卫校验**：
   - 在 `bundle/trading/package.json` 与 `bundle/trading/cordis.patch.yml`（或按 L4 `boundary-check.mjs` 规则确认可插入性）及桌面运行配置方案中接入 `@dsh-trading/provider-public`，保证与 `provider-binance`、`provider-cn` 共存且保持 `binance` 默认首选。
   - `pnpm install --offline` 仅更新根工作区软链与根锁（不提交 5 个嵌套 `pnpm-lock.yaml`）。
3. **全仓交付门槛**：
   - `pnpm run typecheck` 全绿；
   - `pnpm test` 全仓全绿；
   - `pnpm run audit:all`（`check:deps`、`check:boundary`、`check:tools`、`check:home`）全绿；
   - `pnpm run build` 全量编译（含 `client-chart/lib/client.js` 与 `provider-public/lib/index.js`）无误；
   - 如涉及新增插件包或后端工具，提示用户重启 DSH / 刷新页面验收。

---

## 5. 风险与边界保护

| 风险项 | 缓解措施 |
| :--- | :--- |
| DSH 0.2 运行时 API 与上游 0.1 不一致导致 `ask` 或消息嗅探静默失效 | 已实机核对 `app.asar` 中 `dsh-api-session-controller` 与 `dsh-client-ui-session` 源码；所有 0.2 会话交互收敛在独立模块 `dsh-session.ts` 并配完整单测 |
| `provider-public` 与 `provider-binance` / `provider-cn` 在 `resolveProvider` 时抢占符号 | `provider-public.matchesSymbol` 显式排除 6 位 A 股及常见 `USDT/USDC` 币对；`MarketData.search` 与 `resolve_symbol` 按 `binance -> cn -> public` 顺序优先匹配 |
| `LessonLayer` SVG 坐标系与 `ChartCard` 左侧绘图工具栏（`drawBarW`）错位 | 将 `LessonLayer` 严格放入与 `<div ref={el}>` 同级且共享 `left: drawBarW` 的画布包装盒内，并与 `chart.getDom(id, 'main')` 对齐 |
| 讲解期间修改主均线压扁 K 线或覆盖用户 `WMA` 自选参数 | 在 `LessonLayer` 中通过 `kline-v10.ts` 安全探测 `MA`/`WMA`，仅在活跃时临时调整并在卸载/退出讲解时恢复原参数 |
| 历史未提交文件（`zone-colors`）与 5 个嵌套 `pnpm-lock.yaml` 混入移植提交 | 实施阶段 Slice A 第一步先清点隔离既有改动；所有 `git add` 明确按文件路径暂存 |
