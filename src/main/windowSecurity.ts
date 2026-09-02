// ── Window navigation policy ──────────────────────────────────────────────────
//
// Chora never navigates. Both window types load one local document and stay on
// it for the life of the window: there is no router, no in-app browsing, and no
// embedded content. Anything that tries to navigate or open a window is
// therefore either a link the user clicked — which belongs in their browser,
// not inside the app — or something the app did not intend at all.
//
// This module states that rule once and applies it to every window, so a new
// window type cannot quietly be created without it.

import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * URLs that may be handed to the operating system.
 *
 * https only. `shell.openExternal` will launch whatever the OS has registered
 * for a scheme — `file:`, `smb:`, and any third-party application scheme
 * included — so passing an unchecked URL to it turns any stray link into "open
 * an arbitrary thing on this Mac". The app's own outbound links (the repository
 * and the releases and discussions pages) are all https, so nothing legitimate
 * is lost by refusing the rest.
 */
function isBrowsableUrl(rawUrl: string): boolean {
  try {
    return new URL(rawUrl).protocol === 'https:'
  } catch {
    return false
  }
}

/** The renderer bundle's own directory, as a file:// prefix. */
function rendererRoot(): string {
  return pathToFileURL(join(__dirname, '../renderer/')).href
}

/**
 * True for the documents this app is allowed to be showing: its own bundled
 * renderer, or the dev server while running unpackaged.
 */
function isInternalUrl(rawUrl: string): boolean {
  const devServer = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devServer && rawUrl.startsWith(devServer)) return true
  return rawUrl.startsWith(rendererRoot())
}

/**
 * Applies the navigation policy to one window. Call this immediately after
 * constructing any BrowserWindow.
 */
export function applyWindowSecurity(win: BrowserWindow): void {
  // window.open, target="_blank", and anything else that asks for a new window.
  // Chora never wants Electron to spawn one; an https link goes to the user's
  // browser and everything else is dropped.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isBrowsableUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // In-place navigation away from the app's own document. Nothing in Chora does
  // this deliberately, so it is refused; an https target is still honored by
  // handing it to the browser, which is what such a link meant anyway.
  win.webContents.on('will-navigate', (event, url) => {
    if (isInternalUrl(url)) return
    event.preventDefault()
    if (isBrowsableUrl(url)) void shell.openExternal(url)
  })

  // Chora embeds no <webview>. Refusing them here means a future one has to be
  // enabled deliberately rather than by an oversight.
  win.webContents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })
}
