/**
 * Global theme DOM applier aligned with DSH 0.2.3-alpha.2 `ui-layout`:
 * - `html { color-scheme }`
 * - `html[data-ds-theme-source]` (`light` | `dark` | `system`) for desktop native theme mirroring
 * - `body[data-ds-dark-theme]`
 * - `--dsh-content-font-size`, `--dsh-code-font-size`, `--dsh-terminal-font-size`
 * - `--dsh-font-family-text`, `--dsh-font-family-code`, `--dsh-font-family-terminal`
 * - active theme's `--dsw-*` alias tokens on `body`
 * - `meta[name="theme-color"]` synced via MutationObserver when `<style>` tags update
 */

export const DARK_ATTRIBUTE = 'data-ds-dark-theme'
export const THEME_SOURCE_ATTRIBUTE = 'data-ds-theme-source'
export const CONTENT_FONT_SIZE_VARIABLE = '--dsh-content-font-size'

const FONT_SIZE_VARIABLES = {
  text: CONTENT_FONT_SIZE_VARIABLE,
  code: '--dsh-code-font-size',
  terminal: '--dsh-terminal-font-size',
} as const

const FONT_FAMILY_VARIABLES = {
  text: '--dsh-font-family-text',
  code: '--dsh-font-family-code',
  terminal: '--dsh-font-family-terminal',
} as const

export interface ThemeSnapshotLike {
  preference?: 'light' | 'dark' | 'system' | string
  fontSizes?: Partial<Record<'text' | 'code' | 'terminal', number>>
  fontFamilies?: Partial<Record<'text' | 'code' | 'terminal', string>>
  active: {
    colorScheme: 'light' | 'dark'
    tokens: Record<string, string>
  }
}

export class ThemePresenter {
  #appliedTokens: string[] = []
  readonly #themeColorMeta: HTMLMetaElement
  #styleObserver: MutationObserver | undefined

  constructor() {
    this.#themeColorMeta = document.createElement('meta')
    this.#themeColorMeta.name = 'theme-color'
  }

  start(): void {
    if (this.#styleObserver !== undefined || typeof MutationObserver === 'undefined') return
    this.#styleObserver = new MutationObserver((changes) => {
      const isStyle = (node: Node) => node.nodeName === 'STYLE'
      if (changes.some(change =>
        isStyle(change.target)
        || change.target.parentNode?.nodeName === 'STYLE'
        || [...change.addedNodes, ...change.removedNodes].some(isStyle))) {
        this.refreshThemeColor()
      }
    })
    this.#styleObserver.observe(document.head, { childList: true, subtree: true, characterData: true })
  }

  apply(snapshot: ThemeSnapshotLike): void {
    const scheme = snapshot.active.colorScheme
    document.documentElement.style.colorScheme = scheme
    document.documentElement.setAttribute(
      THEME_SOURCE_ATTRIBUTE,
      snapshot.preference === 'system' ? 'system' : scheme,
    )
    const body = document.body
    if (scheme === 'dark') body.setAttribute(DARK_ATTRIBUTE, '')
    else body.removeAttribute(DARK_ATTRIBUTE)

    if (snapshot.fontSizes !== undefined) {
      for (const [role, name] of Object.entries(FONT_SIZE_VARIABLES)) {
        const px = snapshot.fontSizes[role as keyof typeof FONT_SIZE_VARIABLES]
        if (typeof px === 'number' && Number.isFinite(px)) body.style.setProperty(name, `${px}px`)
      }
    }
    if (snapshot.fontFamilies !== undefined) {
      for (const [kind, name] of Object.entries(FONT_FAMILY_VARIABLES)) {
        const list = snapshot.fontFamilies[kind as keyof typeof FONT_FAMILY_VARIABLES]
        if (list === undefined || list === '') body.style.removeProperty(name)
        else body.style.setProperty(name, list)
      }
    }

    for (const name of this.#appliedTokens) body.style.removeProperty(name)
    this.#appliedTokens = []
    for (const [name, value] of Object.entries(snapshot.active.tokens)) {
      body.style.setProperty(name, value)
      this.#appliedTokens.push(name)
    }
    this.refreshThemeColor()
  }

  private refreshThemeColor(): void {
    this.#themeColorMeta.content = getComputedStyle(document.body).backgroundColor
    if (!this.#themeColorMeta.isConnected) document.head.append(this.#themeColorMeta)
  }

  dispose(): void {
    this.#styleObserver?.disconnect()
    this.#styleObserver = undefined
    document.documentElement.style.removeProperty('color-scheme')
    document.documentElement.removeAttribute(THEME_SOURCE_ATTRIBUTE)
    const body = document.body
    body.removeAttribute(DARK_ATTRIBUTE)
    for (const name of Object.values(FONT_SIZE_VARIABLES)) body.style.removeProperty(name)
    for (const name of Object.values(FONT_FAMILY_VARIABLES)) body.style.removeProperty(name)
    for (const name of this.#appliedTokens) body.style.removeProperty(name)
    this.#appliedTokens = []
    this.#themeColorMeta.remove()
  }
}
