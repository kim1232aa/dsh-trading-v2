# 上游工作台演进（maddogfinance/dsh-trading @ 7470117a）全量移植实施计划

> **执行方式**：内联逐切片执行，严格 TDD（先写失败测试 -> 跑红灯 -> 最小实现 -> 跑绿灯 -> typecheck/audit -> 提交）。
**设计规格**：[2026-11-19-upstream-workbench-port-design.md](../specs/2026-11-19-upstream-workbench-port-design.md)

---

### Task 0（已完成）：工作区基线清理 (`e683a8e`)
- 将既有的 `zone-colors` 改动（`ChartCard.tsx`、`annotation-overlays.ts`、`test/zone-colors.test.ts`）通过单测与 typecheck 后独立提交归档；保持 5 个既有的嵌套 `pnpm-lock.yaml` 不纳入提交。

### Task 1（Slice A.1）：`@dsh-trading/market-data` `search()` 与 `searchWithProvider()`
- **文件**：`packages/market-data/src/types.ts`、`packages/market-data/src/index.ts`、`packages/market-data/test/search.test.ts`
- **TDD**：先在 `test/search.test.ts` 覆写 `MarketData.search` / `searchWithProvider`（显式源、`binance -> cn -> public` 固定优先序、去重、无 `search` 源降级、单源抛错隔离、显式不存在源抛错），验证红灯后实现 `types.ts` 与 `index.ts`，绿灯 + `market-data` typecheck 后提交。

### Task 2（Slice A.2）：`@dsh-trading/provider-public` 全量移植与边界登记
- **文件**：`packages/provider-public/{package.json,tsconfig.json,src/index.ts,test/aggregate.test.ts,test/search.test.ts}`、`scripts/boundary-check.mjs`
- **TDD**：移植上游 `aggregate.test.ts` 与 `search.test.ts` 并补充 `matchesSymbol` 边界用例（收美/港/大宗/外汇/指数/券商前缀，显式拒绝 `ETHUSDT`/`BTCUSDT`/`600519`/`sh600519`），先跑红灯再实现 `src/index.ts` 与注册 `LAYERS[@dsh-trading/provider-public]=1`；链接工作区后绿灯 + typecheck + `check:boundary` 提交。

### Task 3（Slice A.3）：`@dsh-trading/provider-binance` 与 `@dsh-trading/provider-cn` `search()`
- **文件**：`packages/provider-binance/{src/index.ts,test/search.test.ts}`、`packages/provider-cn/{src/index.ts,test/search.test.ts}`
- **TDD**：先写中英暗号/别名与代码归属搜素测试（确保币安不收 `腾讯`/`AAPL`，A 股不收 `BTC`/`AAPL`，网络失败优雅返回 `[]`），跑红灯后实现 `BinanceProvider.search`、`OkxMarketProvider.search`、`CnMarketProvider.search`，绿灯 + typecheck 后提交。

### Task 4（Slice B.1 + B.2）：`@dsh-trading/tool-market` `resolve_symbol` 与 `walkthrough`
- **文件**：`packages/tool-market/{src/walkthrough.ts,src/index.ts,test/walkthrough.test.ts}`
- **TDD**：移植上游 `walkthrough.test.ts` 并补充 `resolve_symbol` 多源展示与 `walkthrough` `resolveProvider` 自动路由测试，跑红灯后实现 `walkthrough.ts` 与两工具注册，绿灯 + `tool-market` typecheck + `check:tools` 后提交。

### Task 5（Slice C）：双预设升级与 `@dsh-trading/bundle` 组合接入
- **文件**：`presets/analyst/{preset.yml,agent.cordis.yml}`、`presets/trading/agent.cordis.yml`、`bundle/trading/{package.json,cordis.patch.yml}`
- **操作**：同步 `preset-trading` 与 `preset-analyst`（含 `bundle/trading/cordis.patch.yml` 嵌入文本），挂载 `market-data-provider-public`，跑 `audit:all` 提交。

### Task 6（Slice D.1）：`market-rpc.ts` & `market-client.ts` (`search` + `withLessonSeries`)
- **文件**：`packages/client-chart/src/market-rpc.ts`、`packages/client-chart/src/client/market-client.ts`、`packages/client-chart/test/market-rpc.test.ts`、`packages/client-chart/test/walkthrough-client.test.ts`
- **TDD**：先补 `ENDPOINTS.search` 与 `withLessonSeries` 时间对齐单测，跑红灯后实现，绿灯 + typecheck 提交。

### Task 7（Slice D.2）：DSH 0.2 会话适配 (`dsh-session.ts`) + `symbols.ts` + `latest.ts`
- **文件**：`packages/client-chart/src/client/{dsh-session.ts,symbols.ts,latest.ts}`、`packages/client-chart/test/{dsh-session.test.ts,symbols.test.ts,latest.test.ts}`
- **TDD**：用结构化 DSH 0.2 fake 测试 `sendReply`、`extractLatestUserPrompt`、`hasUserReplyAfter`、稳定空 `HostObservable`、`readSymbolCandidates`/`isSameInstrument`（含 `BTCUSDT`/`600519`/`US.MU`）与 `setColumnOpen`/`getColumnOpen`，跑红灯后实现，绿灯 + typecheck 提交。

### Task 8（Slice D.3）：`walkthrough.ts` + `lesson.ts` + `ink.ts` + `LessonLayer.tsx`
- **文件**：`packages/client-chart/src/client/{walkthrough.ts,lesson.ts,ink.ts,LessonLayer.tsx}`、`packages/client-chart/test/walkthrough.test.ts`
- **TDD**：先写入客户端讲解合同、节奏状态机（假定时器推进/暂停/回放/历史豁免/dismiss）、手绘路径确定性及 `MA/WMA` 自适应调节/恢复助手单测，跑红灯后实现四模块，绿灯 + typecheck 提交。

### Task 9（Slice D.4 + D.5）：`WalkthroughCard.tsx` + `ChartCard.tsx` + `ChartPanel.tsx` + `client/index.ts`
- **文件**：`packages/client-chart/src/client/{WalkthroughCard.tsx,ChartCard.tsx,ChartPanel.tsx,index.ts}`、`packages/client-chart/test/{chart-card-collapse.test.ts,panel-walkthrough.test.ts}`
- **TDD**：测试列开启时 `ChartCard` 默认折叠回执并允许展开、`forceChips=['rsi']` 走 `TM_RSI`、`ChartPanel` 联动与来源匹配；跑红灯后集成升级，跑全套 `client-chart` 单测与 `typecheck`/`build` 提交。

### Task 10（Slice E）：全仓链接、全量验证与交付前核对
- 在 `pnpm install --offline` 后全仓执行 `pnpm -r run typecheck`、`pnpm test`、`pnpm run audit:all`、`pnpm -r run build`，核对桌面软链与 `git status`（5 个嵌套锁文件不入库），并如实报告结果与需要重启/刷新的说明。
