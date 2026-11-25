/**
 * Frame stylesheet, injected once per document under a plugin-owned tag id.
 * Aligned with DSH 0.2.3-alpha.2 `ui-layout` (Windows caption titlebar, macOS
 * vibrancy, drawer sidebar, shell.bottom, shell.leading, rightbar overlay/track).
 */

const TAG_ID = 'dsh-trading/frame.css'

const CSS = `
.dshtf_frame {
  background: var(--dsw-alias-bg-base);
  height: 100%;
  box-sizing: border-box;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  position: relative;
  overflow: hidden;
}
.dshtf_frame[data-animating] {
  transition: grid-template-columns var(--ds-transition-duration-slow) var(--ds-ease-in-out);
}
.dshtf_frame[data-dragging] { transition: none; }
@media (prefers-reduced-motion: reduce) {
  .dshtf_frame[data-animating] { transition: none; }
}

[data-windows-titlebar] .dshtf_frame {
  --dsh-windows-content-radius: 16px;
  box-sizing: border-box;
  padding-top: var(--dsh-windows-titlebar-height);
  background: var(--dsw-specific-sidebar-fill);
}
[data-windows-titlebar] .dshtf_frame::before {
  content: "";
  position: absolute;
  inset: 0 0 auto;
  height: var(--dsh-windows-titlebar-height);
  background: var(--dsw-specific-sidebar-fill);
  -webkit-app-region: drag;
}
[data-windows-titlebar] .dshtf_chartCol {
  background: var(--dsw-alias-bg-base);
  border-radius: var(--dsh-windows-content-radius) 0 0 0;
}
[data-windows-titlebar] .dshtf_centerCol {
  background: var(--dsw-alias-bg-base);
}
[data-windows-titlebar] .dshtf_frame[data-chart-collapsed] .dshtf_centerCol {
  border-radius: var(--dsh-windows-content-radius) 0 0 0;
}
[data-windows-titlebar] .dshtf_sidebarCol {
  border-right: none;
}

html[data-platform='darwin'] {
  --dsh-frame-top-clearance: 48px;
}
html[data-windows-titlebar] {
  --dsh-frame-top-clearance: var(--dsh-windows-titlebar-height);
  --dsh-frame-chrome-top: var(--dsh-windows-titlebar-height);
}
html[data-platform='darwin'],
html[data-windows-titlebar] {
  --dsh-frame-overlay-top: calc(var(--dsh-frame-top-clearance) + 20px);
}
html[data-platform='darwin'][data-fullscreen],
html[data-windows-titlebar][data-fullscreen] {
  --dsh-frame-overlay-top: 20px;
  --dsh-frame-chrome-top: 0px;
}

[data-platform='darwin'] .dshtf_frame { background: transparent; }
[data-platform='darwin'] .dshtf_frame:not([data-sidebar-drawer]) .dshtf_sidebarCol {
  background:
    linear-gradient(
      to bottom,
      var(--dsw-specific-sidebar-wash-top),
      var(--dsw-specific-sidebar-wash-top-clear) 35%,
      var(--dsw-specific-sidebar-wash-bottom-clear) 68%,
      var(--dsw-specific-sidebar-wash-bottom)
    ),
    var(--dsw-specific-sidebar-tint);
  border-right: none;
}
@media (prefers-reduced-transparency: reduce) {
  [data-platform='darwin'] .dshtf_frame:not([data-sidebar-drawer]) .dshtf_sidebarCol {
    background: color-mix(in srgb, var(--dsw-specific-sidebar-fill) 90%, transparent);
  }
}
[data-platform='darwin'] .dshtf_chartCol,
[data-platform='darwin'] .dshtf_centerCol,
[data-platform='darwin'] .dshtf_detailsCol {
  background: var(--dsw-alias-bg-base);
}
[data-platform='darwin'] .dshtf_frame[data-sidebar-collapsed] {
  --dsh-frame-leading-clearance: 160px;
}
[data-platform='darwin'][data-fullscreen] .dshtf_frame[data-sidebar-collapsed] {
  --dsh-frame-leading-clearance: 84px;
}
[data-platform='darwin'][data-fullscreen] .dshtf_leadingSeat {
  left: 12px;
}

.dshtf_sidebarCol {
  grid-column: 1;
  grid-row: 1;
  background: var(--dsw-specific-sidebar-fill);
  border-right: 0.5px solid var(--dsw-alias-border-l3);
  min-width: 0;
  overflow: hidden;
}
.dshtf_chartCol {
  grid-column: 2;
  grid-row: 1;
  border-right: 1px solid var(--dsw-alias-border-l2);
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}
.dshtf_frame[data-chart-collapsed] .dshtf_chartCol { border-right: none; }

.dshtf_chartEmpty {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 0 24px;
  text-align: center;
  color: var(--dsw-alias-text-3);
  font-size: 13px;
}
.dshtf_chartEmptyHint { font-size: 12px; opacity: 0.75; }

.dshtf_centerCol {
  grid-column: 3;
  grid-row: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}
.dshtf_mainPanel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
}
.dshtf_detailsCol {
  grid-column: 4;
  grid-row: 1;
  position: relative;
  min-width: 0;
  overflow: visible;
}

.dshtf_handle {
  position: absolute;
  grid-area: 1 / 1 / 2 / -1;
  top: 0;
  bottom: 0;
  width: 8px;
  margin-left: -4px;
  cursor: col-resize;
  z-index: 11;
  touch-action: none;
}
.dshtf_frame[data-animating] .dshtf_handle {
  transition: left var(--ds-transition-duration-slow) var(--ds-ease-in-out);
}
.dshtf_frame[data-dragging] .dshtf_handle,
.dshtf_frame[data-rightbar-fullscreen],
.dshtf_frame[data-rightbar-fullscreen] .dshtf_handle,
.dshtf_frame[data-rightbar-instant],
.dshtf_frame[data-rightbar-instant] .dshtf_handle {
  transition: none;
}
@media (prefers-reduced-motion: reduce) {
  .dshtf_frame[data-animating] .dshtf_handle { transition: none; }
}

.dshtf_handle[data-side="chart"]::after,
.dshtf_handle[data-side="details"]::after {
  content: "";
  box-sizing: border-box;
  background: var(--dsw-alias-button-floating-fill);
  border: 1px solid var(--dsw-alias-border-l2-darkmode-thin);
  opacity: 0;
  width: 12px;
  height: 32px;
  border-radius: 10px;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  transition: opacity var(--ds-transition-duration-slow) var(--ds-ease-in-out),
    background var(--ds-transition-duration-slow) var(--ds-ease-in-out);
}
.dshtf_detailsCol:hover ~ .dshtf_handle[data-side="details"]::after,
.dshtf_chartCol:hover ~ .dshtf_handle[data-side="chart"]::after,
.dshtf_handle[data-side="chart"]:hover::after,
.dshtf_handle[data-side="chart"][data-dragging="true"]::after,
.dshtf_handle[data-side="details"]:hover::after,
.dshtf_handle[data-side="details"][data-dragging="true"]::after { opacity: 1; }
.dshtf_handle[data-side="chart"]:hover::after,
.dshtf_handle[data-side="chart"][data-dragging="true"]::after,
.dshtf_handle[data-side="details"]:hover::after,
.dshtf_handle[data-side="details"][data-dragging="true"]::after {
  background: var(--dsw-alias-button-floating-hover);
  border-color: var(--dsw-alias-border-l3);
}

.dshtf_frame[data-sidebar-drawer] {
  --dsh-frame-leading-clearance: 84px;
  overflow: clip;
}
html:not([data-platform]) .dshtf_frame[data-sidebar-drawer] {
  --dsh-frame-leading-clearance: 48px;
}
.dshtf_frame[data-sidebar-drawer] .dshtf_mainPanel[data-global-panel] {
  padding-top: max(0px, calc(48px - var(--dsh-frame-top-clearance, 0px)));
}
.dshtf_frame[data-sidebar-drawer] .dshtf_sidebarCol {
  position: absolute;
  grid-area: auto;
  inset: 0 auto 0 0;
  z-index: 71;
  box-sizing: border-box;
  border-right: none;
  transform: translateX(0);
  visibility: visible;
  transition: transform var(--ds-transition-duration-slow) var(--ds-ease-in-out);
}
.dshtf_frame[data-sidebar-drawer][data-sidebar-collapsed] .dshtf_sidebarCol {
  transform: translateX(-100%);
  visibility: hidden;
  transition:
    transform var(--ds-transition-duration-slow) var(--ds-ease-in-out),
    visibility 0s linear var(--ds-transition-duration-slow);
}
.dshtf_frame[data-sidebar-drawer][data-sidebar-instant] .dshtf_sidebarCol {
  transition: none;
}
.dshtf_drawerMask {
  position: absolute;
  inset: var(--dsh-frame-chrome-top, 0px) 0 0;
  z-index: 70;
  background: var(--dsw-alias-bg-mask-1);
  backdrop-filter: var(--dsw-mask-blur);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--ds-transition-duration-slow) var(--ds-ease-in-out);
}
.dshtf_frame[data-sidebar-drawer]:not([data-sidebar-collapsed]) .dshtf_drawerMask {
  opacity: 1;
  pointer-events: auto;
}
.dshtf_frame[data-sidebar-drawer] .dshtf_leadingSeat {
  top: 11px;
  left: 12px;
}
[data-platform='darwin'] .dshtf_frame[data-sidebar-drawer] {
  --dsh-frame-leading-clearance: 160px;
}
[data-platform='darwin'] .dshtf_frame[data-sidebar-drawer] .dshtf_leadingSeat {
  left: 88px;
}
[data-platform='darwin'][data-fullscreen] .dshtf_frame[data-sidebar-drawer] {
  --dsh-frame-leading-clearance: 84px;
}
[data-platform='darwin'][data-fullscreen] .dshtf_frame[data-sidebar-drawer] .dshtf_leadingSeat {
  left: 12px;
}
@media (prefers-reduced-motion: reduce) {
  .dshtf_frame[data-sidebar-drawer] .dshtf_sidebarCol,
  .dshtf_frame[data-sidebar-drawer][data-sidebar-collapsed] .dshtf_sidebarCol,
  .dshtf_drawerMask {
    transition: none;
  }
}

.dshtf_leadingSeat {
  position: absolute;
  top: 11px;
  left: 88px;
  z-index: 15;
  display: flex;
  align-items: center;
  -webkit-app-region: no-drag;
}

.dshtf_bottomRow {
  grid-column: 1 / -1;
  grid-row: 2;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  background: var(--dsw-alias-bg-base);
}

.dshtf_switcher { position: relative; display: inline-flex; }
.dshtf_switcherTrigger {
  background: transparent;
  color: var(--dsw-alias-text-2, inherit);
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3));
  border-radius: 6px;
  padding: 3px 10px;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
}
.dshtf_switcherTrigger:hover { border-color: var(--dsw-alias-border-l3, rgba(128,128,128,0.6)); color: var(--dsw-alias-text-1, inherit); }
.dshtf_switcherItem {
  display: block;
  width: 100%;
  text-align: left;
  background: transparent;
  color: var(--dsw-alias-text-1, inherit);
  border: none;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 12.5px;
  font-family: inherit;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dshtf_switcherItem:hover { background: var(--dsw-alias-bg-hover, rgba(128,128,128,0.14)); }
.dshtf_switcherItem[data-current] { color: var(--dsw-alias-text-brand, inherit); font-weight: 600; }
.dshtf_switcherEmpty { padding: 8px 10px; font-size: 12px; color: var(--dsw-alias-text-3, rgba(128,128,128,0.9)); }

.dshtf_overlayLayer { z-index: 20; pointer-events: none; position: absolute; inset: 0; }
.dshtf_overlayLayer > * { pointer-events: auto; }
`

export function installFrameStyles(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-plugin-css=${JSON.stringify(TAG_ID)}]`) !== null) return
  const tag = document.createElement('style')
  tag.dataset['plugin'] = 'dsh-trading'
  tag.dataset['pluginCss'] = TAG_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
}

export const styles = {
  frame: 'dshtf_frame',
  sidebarCol: 'dshtf_sidebarCol',
  chartCol: 'dshtf_chartCol',
  chartEmpty: 'dshtf_chartEmpty',
  chartEmptyHint: 'dshtf_chartEmptyHint',
  centerCol: 'dshtf_centerCol',
  mainPanel: 'dshtf_mainPanel',
  detailsCol: 'dshtf_detailsCol',
  handle: 'dshtf_handle',
  drawerMask: 'dshtf_drawerMask',
  leadingSeat: 'dshtf_leadingSeat',
  bottomRow: 'dshtf_bottomRow',
  overlayLayer: 'dshtf_overlayLayer',
  switcher: 'dshtf_switcher',
  switcherTrigger: 'dshtf_switcherTrigger',
  switcherItem: 'dshtf_switcherItem',
  switcherEmpty: 'dshtf_switcherEmpty',
} as const
