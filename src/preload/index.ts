import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  openFile:       (): Promise<string | null>          => ipcRenderer.invoke('dialog:open'),
  showSaveDialog: (): Promise<string | null>          => ipcRenderer.invoke('dialog:save'),
  readFile:       (path: string): Promise<string>     => ipcRenderer.invoke('file:read', path),
  writeFile:      (path: string, data: string): Promise<void> => ipcRenderer.invoke('file:write', path, data),

  onMenuAction: (cb: (action: string) => void): (() => void) => {
    const actions = ['menu:new', 'menu:open', 'menu:save', 'menu:save-as',
                     'menu:create-cartesian', 'menu:create-semantic',
                     'menu:dim-to-weight', 'menu:weight-to-dim', 'menu:dim-to-gray',
                     'menu:toggle-labels', 'menu:update-maps']
    const handlers = actions.map(channel => {
      const handler = (): void => cb(channel.replace('menu:', ''))
      ipcRenderer.on(channel, handler)
      return { channel, handler }
    })
    return () => handlers.forEach(({ channel, handler }) => ipcRenderer.removeListener(channel, handler))
  }
})
