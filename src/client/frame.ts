/**
 * Browser trading frame helper: installs frame styles, registers `layout` service
 * + `'root'` slot (`TradingFrame`), `ThemePresenter`, `SessionSwitcher`, and
 * `sidebar.left.toggle` shortcut.
 */
import type {} from './slots.js'
import { LayoutController } from './service.js'
import { createLayoutStore } from './stores.js'
import { installFrameStyles } from './styles.js'
import { SessionSwitcher } from './SessionSwitcher.js'
import { ThemePresenter } from './theme-presenter.js'
import { TradingFrame } from './TradingFrame.js'

export { LayoutController } from './service.js'
export type { ILayout } from './service.js'
export type { ChartOwnerProps, RightbarOwnerProps, SidebarOwnerProps } from './slots.js'

const SHORTCUT_LABELS = {
  zh: { toggle: '展开／收起左侧栏' },
  en: { toggle: 'Toggle left sidebar' },
  ja: { toggle: '左サイドバーを切り替え' },
  es: { toggle: 'Alternar barra lateral izquierda' },
  fr: { toggle: 'Basculer la barre latérale gauche' },
  de: { toggle: 'Linke Seitenleiste umschalten' },
  ru: { toggle: 'Переключить левую боковую панель' },
  pt: { toggle: 'Alternar barra lateral esquerda' },
}

export const SESSION_SWITCHER_LABELS = {
  zh: { sessions: '会话', switchSession: '切换会话', noOtherSessions: '暂无其他会话。' },
  en: { sessions: 'Sessions', switchSession: 'Switch session', noOtherSessions: 'No other sessions yet.' },
  ja: { sessions: 'セッション', switchSession: 'セッションを切り替え', noOtherSessions: '他のセッションはありません。' },
  es: { sessions: 'Sesiones', switchSession: 'Cambiar sesión', noOtherSessions: 'Aún no hay otras sesiones.' },
  fr: { sessions: 'Sessions', switchSession: 'Changer de session', noOtherSessions: 'Aucune autre session pour le moment.' },
  de: { sessions: 'Sitzungen', switchSession: 'Sitzung wechseln', noOtherSessions: 'Noch keine weiteren Sitzungen.' },
  ru: { sessions: 'Сессии', switchSession: 'Переключить сессию', noOtherSessions: 'Других сессий пока нет.' },
  pt: { sessions: 'Sessões', switchSession: 'Trocar sessão', noOtherSessions: 'Ainda não há outras sessões.' },
}

export function mountTradingFrame(ctx: any): void {
  installFrameStyles()

  ctx.effect(() => {
    const query = typeof matchMedia === 'function'
      ? matchMedia('(device-posture: folded) and (orientation: landscape)')
      : undefined
    const foldedLandscape = {
      getSnapshot: () => query?.matches ?? false,
      subscribe: (listener: () => void) => {
        query?.addEventListener('change', listener)
        return () => { query?.removeEventListener('change', listener) }
      },
    }

    const handle = createLayoutStore()
    const instance = handle.create()
    const store = { ...handle, create: () => instance }
    const actions = instance.actions as any

    const mainKeys = (): string[] =>
      ctx.slots.entries('main').flatMap((e: any) => (e.options.key === undefined ? [] : [e.options.key]))
    const retainMainPanels = () => actions.retainMainPanels(mainKeys())

    const layout = new LayoutController(
      actions,
      (id) => mainKeys().includes(id),
      {
        getSnapshot: () => instance.getSnapshot().panelInfo,
        subscribe: (listener) => instance.subscribe(listener),
      },
    )

    const hasLocale = (() => {
      try { return ctx.get('locale') !== undefined } catch { return false }
    })()

    const disposePanelInfo = ctx.slots.provideRoot({ hooks: { panelInfo: layout.panelInfo } })
    const disposeService = ctx.reflect.provide('layout', layout)
    const disposeRegistration = ctx.slots.register(
      {
        name: 'root',
        ...(hasLocale ? { locale: 'common' } : {}),
        children: {
          'sidebar': { kind: 'single', scope: 'root' },
          'trading.chart': { kind: 'single', scope: 'session-maybe' },
          'main': { kind: 'keyed', scope: 'root' },
          'rightbar': { kind: 'single', scope: 'root' },
          'shell.bottom': { kind: 'single', scope: 'root' },
          'shell.overlay': { kind: 'list', scope: 'root' },
          'shell.leading': { kind: 'single', scope: 'root' },
        },
        store,
        inject: () => ({ hooks: { foldedLandscape } }),
      },
      TradingFrame,
    )
    const disposePanels = ctx.slots.subscribe('main', retainMainPanels)
    retainMainPanels()

    return () => {
      layout.dispose()
      disposePanels()
      disposeRegistration()
      disposePanelInfo()
      disposeService()
    }
  }, 'dsh-trading: layout service + root frame')

  ctx.inject(['shortcuts'], (sub: any) => {
    let toggleLabel = () => 'Toggle left sidebar'
    if (typeof sub.get === 'function' && sub.get('locale') !== undefined) {
      sub.effect(() => sub.locale.register('shortcuts.layout', SHORTCUT_LABELS), 'dsh-trading: shortcut labels')
      const t = sub.locale.bind('shortcuts.layout')
      toggleLabel = () => t('toggle')
    }
    sub.effect(() => sub.shortcuts.register({
      id: 'sidebar.left.toggle',
      label: toggleLabel,
      aliases: ['sidebar', 'toggle left sidebar'],
      defaults: {
        'desktop:macos': { code: 'KeyB', modifiers: ['primary'] },
        'desktop:windows': { code: 'KeyB', modifiers: ['primary'] },
        'desktop:linux': { code: 'KeyB', modifiers: ['primary'] },
        'web:macos': { code: 'KeyB', modifiers: ['primary', 'alt'] },
        'web:windows': { code: 'KeyB', modifiers: ['primary', 'alt'] },
      },
      regions: ['page', 'editable'],
      modals: ['sidebar'],
      resolve: ({ modal }: { modal: string | null }) =>
        modal !== null && modal !== 'sidebar'
          ? { status: 'pass' }
          : { status: 'handled', run: () => { sub.get('layout')?.toggleSidebar?.() } },
    }), 'dsh-trading: sidebar toggle shortcut')
  })

  ctx.inject(['uiWorkspace'], (sub: any) => {
    let switcherT: ((key: string) => string) | undefined
    if (typeof sub.get === 'function' && sub.get('locale') !== undefined) {
      sub.effect(() => sub.locale.register('dsh-trading.sessionSwitcher', SESSION_SWITCHER_LABELS), 'dsh-trading: session switcher labels')
      switcherT = sub.locale.bind('dsh-trading.sessionSwitcher')
    }
    sub.slots.inject('conversation.session.header.utilities', () => [
      sub.slots.register(
        {
          name: 'conversation.session.header.utilities',
          id: 'trading-session-switcher',
          registrant: 'dsh-trading',
          inject: () => ({
            open: (id: string) => sub.uiWorkspace.openSession(id),
            ...(switcherT !== undefined ? { t: switcherT } : {}),
          }),
        },
        SessionSwitcher,
      ),
    ])
  })

  ctx.effect(() => {
    const presenter = new ThemePresenter()
    presenter.start()
    presenter.apply(ctx.theme.getTheme())
    const off = ctx.on('theme/change', (snapshot: any) => presenter.apply(snapshot))
    return () => {
      off()
      presenter.dispose()
    }
  }, 'dsh-trading: theme presenter')
}
