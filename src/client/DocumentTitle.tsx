/** Browser title selection follows the active main panel without subscribing the frame. */
import { useEffect } from 'react'

export interface DocumentTitleProps {
  productTitle: string
  usePanelInfo?: <T>(select: (info: { activePanelId: string | null }) => T) => T
  useSessions?: <T>(select: (state: {
    byId: Record<string, { id?: string; title?: string; retainedBy?: { mainView?: number } } | undefined>
  }) => T) => T
}

export function DocumentTitle({ useSessions, usePanelInfo, productTitle }: DocumentTitleProps): null {
  const showSessionTitle = usePanelInfo?.(info => info.activePanelId === null) ?? true
  const title = useSessions?.((state) => {
    const current = Object.values(state.byId)
      .find(session => (session?.retainedBy?.mainView ?? 0) > 0)?.id
    return !showSessionTitle || current === undefined ? undefined : state.byId[current]?.title
  })
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.title = title === undefined ? productTitle : `${title} — ${productTitle}`
    return () => { document.title = productTitle }
  }, [productTitle, title])
  return null
}
