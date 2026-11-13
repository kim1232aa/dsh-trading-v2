import { describe, expect, it, vi } from 'vitest'
import { initialChartMount, observeNearViewport } from '../src/client/viewport-lifecycle.js'

interface FakeTarget {
  getBoundingClientRect: () => { height: number }
}

describe('tool-card chart viewport lifecycle', () => {
  it('starts as a light placeholder with observer support, but mounts in older browsers', () => {
    expect(initialChartMount(true)).toBe(false)
    expect(initialChartMount(false)).toBe(true)
  })

  it('parks a far chart with its measured height and remounts it near the viewport', () => {
    const target: FakeTarget = { getBoundingClientRect: () => ({ height: 873.5 }) }
    const changes: { near: boolean; height?: number }[] = []
    let observed: unknown
    let callback: ((entries: { target: unknown; isIntersecting: boolean }[]) => void) | undefined
    const disconnect = vi.fn()

    const stop = observeNearViewport(
      target,
      (near, height) => changes.push(height === undefined ? { near } : { near, height }),
      (cb, options) => {
        callback = cb
        expect(options).toEqual({ root: null, rootMargin: '1500px 0px', threshold: 0 })
        return { observe: value => { observed = value }, disconnect }
      },
    )

    expect(observed).toBe(target)
    callback?.([{ target, isIntersecting: false }])
    callback?.([{ target, isIntersecting: true }])
    expect(changes).toEqual([{ near: false, height: 873.5 }, { near: true }])

    stop()
    expect(disconnect).toHaveBeenCalledOnce()
  })

  it('keeps charts mounted when IntersectionObserver is unavailable', () => {
    const target: FakeTarget = { getBoundingClientRect: () => ({ height: 480 }) }
    const changes: boolean[] = []
    const stop = observeNearViewport(target, near => changes.push(near), null)
    expect(changes).toEqual([true])
    expect(() => stop()).not.toThrow()
  })

  it('ignores observer entries for a different element', () => {
    const target: FakeTarget = { getBoundingClientRect: () => ({ height: 700 }) }
    const other: FakeTarget = { getBoundingClientRect: () => ({ height: 1 }) }
    const changes: boolean[] = []
    let callback: ((entries: { target: unknown; isIntersecting: boolean }[]) => void) | undefined
    observeNearViewport(target, near => changes.push(near), cb => {
      callback = cb
      return { observe: () => {}, disconnect: () => {} }
    })
    callback?.([{ target: other, isIntersecting: false }])
    expect(changes).toEqual([])
  })
})
