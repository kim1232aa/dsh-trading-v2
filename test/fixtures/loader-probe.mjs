// Test-only probe loaded through the real dsh Loader by loader-boot.e2e.test.ts.
// Prints one marker line naming which dsh-trading tools, providers, clientModules,
// and layout entries activated.
export const name = 'dsh-trading-loader-probe'
export const inject = ['tools']
export function apply(ctx) {
  ctx.effect(() => {
    const t = setTimeout(() => {
      const expectedTools = [
        'list_symbols', 'resolve_symbol', 'get_ohlcv', 'market_snapshot',
        'render_chart', 'annotate_chart', 'run_backtest', 'screen_market',
        'run_custom_indicator', 'find_swing_points', 'walkthrough',
        'find_supply_demand_zones', 'large_orders',
        'lint_strategy_code', 'audit_backtest',
        'get_holdings', 'stage_trade', 'commit_trade', 'discard_trade', 'list_trades',
        'get_watchlist', 'add_to_watchlist', 'remove_from_watchlist',
        'record_thesis', 'query_theses', 'update_thesis_status',
        'check_trade_authority',
        'list_scheduled_tasks', 'create_scheduled_task', 'remove_scheduled_task',
        'run_scheduled_task_now', 'get_scheduled_task_logs',
        'get_chart_view',
      ]
      const tools = expectedTools.filter(n => ctx.tools.get(n))
      const md = ctx.get('marketData')
      const providers = md?.list?.() ?? null
      const cm = ctx.get('clientModules')
      const clientEntries = cm?.graph?.()?.entries?.map(e => e.id) ?? []
      const uiLayout = [...(ctx.loader?.entries?.() ?? [])].find(e => e.options?.id === 'ui-layout')
      const uiLayoutDisabled = uiLayout ? Boolean(uiLayout.disabled) : null
      console.log('DSH_TRADING_PROBE ' + JSON.stringify({ tools, providers, clientEntries, uiLayoutDisabled }))
    }, 2000)
    return () => clearTimeout(t)
  })
}
