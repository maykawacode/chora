import type { BrowserWindow } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface CapturedMenuItem {
  label?: string
  submenu?: CapturedMenuItem[]
  click?: () => void
}

const electron = vi.hoisted(() => ({
  template: null as CapturedMenuItem[] | null,
  buildFromTemplate: vi.fn((template: unknown) => {
    electron.template = template as CapturedMenuItem[]
    return { items: [] }
  }),
  setApplicationMenu: vi.fn()
}))

vi.mock('electron', () => ({
  app: { name: 'MapTool' },
  Menu: {
    buildFromTemplate: electron.buildFromTemplate,
    setApplicationMenu: electron.setApplicationMenu
  }
}))

import { buildMenu, setMainWindowForMenu } from './menu'

describe('Tools menu', () => {
  beforeEach(() => {
    electron.template = null
    electron.buildFromTemplate.mockClear()
    electron.setApplicationMenu.mockClear()
  })

  it('sends Transform Data to the Score window', () => {
    const send = vi.fn()
    setMainWindowForMenu({
      isDestroyed: () => false,
      webContents: { send }
    } as unknown as BrowserWindow)

    buildMenu()

    const tools = electron.template?.find(item => item.label === 'Tools')
    const transform = tools?.submenu?.find(item => item.label === 'Transform Data…')
    expect(transform).toBeDefined()

    transform?.click?.()

    expect(send).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledWith('menu:transform-data')
  })
})
