import { describe, expect, it } from 'vitest'
import { assignAnnotationColors, resolveAnnotationColor } from '../../src/client/ChartCard.js'
import { createAnnotationOverlays } from '../../src/client/annotation-overlays.js'
import type { ChartAnnotation } from '../../src/client/payload.js'

const DARK_PALETTE = {
  text: '#c9d1d9',
  faint: '#768390',
  line: '#30363d',
  up: '#3ddc97',
  down: '#f47067',
  neckline: '#d4a72c',
  target: '#539bf5',
  invalidation: '#b083f0',
}

describe('multi-zone distinct color assignment', () => {
  it('keeps the first support and resistance zone on the base palette colour', () => {
    expect(resolveAnnotationColor({ type: 'zone', role: 'support' }, DARK_PALETTE, 0)).toBe('#3ddc97')
    expect(resolveAnnotationColor({ type: 'zone', role: 'resistance' }, DARK_PALETTE, 0)).toBe('#f47067')
  })

  it('assigns distinct 6-digit hex colours to all 7 multi-timeframe zones across roles', () => {
    const annotations: ChartAnnotation[] = [
      { type: 'zone', low: 1816.59, high: 1838.14, role: 'target', label: '[1W/1D] 周线二档极值底' },
      { type: 'zone', low: 1850.00, high: 1863.67, role: 'support', label: '[1D] 日线一档主抄底区' },
      { type: 'zone', low: 1889.50, high: 1896.94, role: 'support', label: '[5m/15m] 缠论二买回踩带' },
      { type: 'zone', low: 1906.79, high: 1915.43, role: 'neckline', label: '[5m/15m] 缠论中枢ZG' },
      { type: 'zone', low: 1923.52, high: 1936.49, role: 'resistance', label: '[15m/1H] Fib 0.382' },
      { type: 'zone', low: 1956.50, high: 1965.33, role: 'resistance', label: '[1H/2H] Fib 0.618' },
      { type: 'zone', low: 2002.91, high: 2028.12, role: 'resistance', label: '[4H] 4H主跌波段0.5-0.618' },
    ]
    const colors = assignAnnotationColors(annotations, DARK_PALETTE)
    expect(colors).toHaveLength(7)
    for (const c of colors) {
      expect(c).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
    expect(new Set(colors).size).toBe(7)
  })

  it('honours an explicit #rrggbb color on an annotation', () => {
    expect(resolveAnnotationColor({ type: 'zone', role: 'support', color: '#12abef' }, DARK_PALETTE, 2)).toBe('#12abef')
  })

  it('renders tm_region with stroke_fill and a dashed border in the zone colour', () => {
    const region = createAnnotationOverlays('sans-serif', t => t.length * 7).find(o => o.name === 'tm_region')!
    const figures = region.createPointFigures!({
      coordinates: [{ x: 0, y: 40 }, { x: 0, y: 80 }],
      bounding: { width: 600, height: 300, left: 0, right: 600, top: 0, bottom: 300 },
      overlay: { extendData: { label: '[4H] 强压带', lane: 0, color: '#ec4899' } },
    } as never)
    const list = Array.isArray(figures) ? figures : [figures]
    const rect = list.find(f => f.type === 'rect')!
    expect(rect.styles).toMatchObject({
      style: 'stroke_fill',
      color: '#ec489928',
      borderColor: '#ec489999',
      borderSize: 1,
      borderStyle: 'dashed',
    })
  })
})
