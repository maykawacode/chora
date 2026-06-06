import { ipcMain, dialog } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { getMainWindow } from './index'

export function registerIpcHandlers(): void {
  ipcMain.handle('dialog:open', async () => {
    const win = getMainWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      filters: [{ name: 'MapTool Session', extensions: ['mtda'] }],
      properties: ['openFile']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('dialog:save', async () => {
    const win = getMainWindow()
    if (!win) return null
    const result = await dialog.showSaveDialog(win, {
      filters: [{ name: 'MapTool Session', extensions: ['mtda'] }],
      defaultPath: 'Untitled.mtda'
    })
    return result.canceled ? null : result.filePath
  })

  ipcMain.handle('dialog:openCsv', async () => {
    const win = getMainWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      filters: [{ name: 'Spreadsheet', extensions: ['tsv', 'csv', 'txt'] }],
      properties: ['openFile']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('dialog:saveCsv', async () => {
    const win = getMainWindow()
    if (!win) return null
    const result = await dialog.showSaveDialog(win, {
      filters: [{ name: 'Tab-separated values', extensions: ['tsv'] }],
      defaultPath: 'maptool-export.tsv'
    })
    return result.canceled ? null : result.filePath
  })

  ipcMain.handle('file:read', async (_event, filePath: string) => {
    return readFile(filePath, 'utf-8')
  })

  ipcMain.handle('file:write', async (_event, filePath: string, data: string) => {
    await writeFile(filePath, data, 'utf-8')
  })
}
