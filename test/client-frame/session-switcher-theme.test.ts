import { describe, expect, it } from 'vitest'
import { activeSessionId } from '../../src/client/SessionSwitcher.js'
import { computeColumns, CHART_RATIO_DEFAULT, SIDEBAR_COLLAPSED } from '../../src/client/columns.js'
import { styles } from '../../src/client/styles.js'

describe('SessionSwitcher & columns (0.2.3-alpha.2)', () => {
  it('identifies active session via retainedBy.mainView > 0 without snapshot.current', () => {
    const id = activeSessionId({
      ids: ['s1', 's2'],
      byId: {
        s1: { id: 's1', displayTitle: 'First', retainedBy: { mainView: 0 } },
        s2: { id: 's2', displayTitle: 'Active Trading', retainedBy: { mainView: 1 } },
      },
    })
    expect(id).toBe('s2')
  })

  it('falls back to legacy snapshot.current only if retainedBy.mainView is absent', () => {
    const id = activeSessionId({
      ids: ['s1'],
      byId: { s1: { id: 's1', displayTitle: 'Legacy' } },
      current: 's1',
    })
    expect(id).toBe('s1')
  })

  it('supports collapsedWidth = 0 for Windows titlebar / macOS desktop / drawer', () => {
    const winCols = computeColumns(1600, 0, CHART_RATIO_DEFAULT, 0, 0)
    expect(winCols.sidebar).toBe(0)
    expect(winCols.chart + winCols.center).toBe(1600)

    const railCols = computeColumns(1600, 0, CHART_RATIO_DEFAULT, 0, SIDEBAR_COLLAPSED)
    expect(railCols.sidebar).toBe(SIDEBAR_COLLAPSED)
    expect(railCols.sidebar + railCols.chart + railCols.center).toBe(1600)
  })

  it('uses _frame / _sidebarCol / _centerCol suffixes expected by DSH Tauri host readiness checks', () => {
    expect(styles.frame).toMatch(/_frame$/)
    expect(styles.sidebarCol).toMatch(/_sidebarCol$/)
    expect(styles.centerCol).toMatch(/_centerCol$/)
  })
})
