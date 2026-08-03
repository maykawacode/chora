import { describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
  send: vi.fn(),
  sendSync: vi.fn()
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: electron.exposeInMainWorld },
  ipcRenderer: {
    invoke: electron.invoke,
    on: electron.on,
    removeListener: electron.removeListener,
    send: electron.send,
    sendSync: electron.sendSync
  }
}))

import './index'

interface ExposedApi {
  onMenuAction: (callback: (action: string) => void) => () => void
}

describe('preload menu relay', () => {
  it('registers, strips, and cleans up the Transform Data action', () => {
    const exposed = electron.exposeInMainWorld.mock.calls.find(([name]) => name === 'api')
    expect(exposed).toBeDefined()
    const api = exposed?.[1] as ExposedApi
    const callback = vi.fn()

    const cleanup = api.onMenuAction(callback)
    const registration = electron.on.mock.calls.find(([channel]) => channel === 'menu:transform-data')
    expect(registration).toBeDefined()

    const handler = registration?.[1] as () => void
    handler()
    expect(callback).toHaveBeenCalledOnce()
    expect(callback).toHaveBeenCalledWith('transform-data')

    cleanup()
    expect(electron.removeListener).toHaveBeenCalledWith('menu:transform-data', handler)
  })
})
