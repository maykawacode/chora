import { beforeEach, describe, expect, it, vi } from 'vitest'

const downloads: { name: string; text: string; type: string }[] = []
vi.mock('./download', () => ({
  downloadText: (name: string, text: string, type: string) => { downloads.push({ name, text, type }) }
}))

import { useAppStore } from '../store/appStore'
import { history } from '../store/history'
import { downloadDocument, downloadSpreadsheet } from './documentWorkflows'

describe('browser download workflows', () => {
  beforeEach(() => {
    downloads.length = 0
    history.start()
    useAppStore.getState().resetToEmpty()
  })

  it('downloads an unsaved study as Untitled.chora and marks it saved', () => {
    useAppStore.setState({ isDirty: true })
    expect(downloadDocument()).toBe('Untitled.chora')
    expect(downloads[0]).toMatchObject({ name: 'Untitled.chora', type: 'application/json' })
    expect(JSON.parse(downloads[0].text)).toBeTypeOf('object')
    expect(useAppStore.getState().isDirty).toBe(false)
    expect(useAppStore.getState().filePath).toBe('browser:/download/Untitled.chora')
  })

  it('keeps an opened file name and its path, renaming legacy .mtda to .chora', () => {
    useAppStore.setState({ filePath: 'browser:/3/study.mtda', isDirty: true })
    expect(downloadDocument()).toBe('study.chora')
    expect(useAppStore.getState().filePath).toBe('browser:/3/study.mtda')
    expect(useAppStore.getState().isDirty).toBe(false)
  })

  it('exports the spreadsheet as TSV without touching saved state', () => {
    useAppStore.setState({ isDirty: true })
    expect(downloadSpreadsheet()).toBe('chora-export.tsv')
    expect(downloads[0].type).toBe('text/tab-separated-values')
    expect(useAppStore.getState().isDirty).toBe(true)
  })
})
