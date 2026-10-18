// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { installDomStubs } from '../../test/dom'
import { DEFAULT_PREFERENCES, type Preferences } from '../lib/preferences'
import { SettingsSections } from './PreferencesDialog'
import { setHostCapabilities } from '../lib/host'

// The Settings sections built from the settings table: which sections show,
// and that each kind of control writes its preference.

let latest: Preferences = DEFAULT_PREFERENCES

function Harness(): React.JSX.Element {
  const [values, setValues] = useState<Preferences>({ ...DEFAULT_PREFERENCES, lastFilePath: '/notes/study.chora' })
  latest = values
  return <SettingsSections values={values} update={change => setValues(change)} />
}

beforeAll(installDomStubs)
afterEach(cleanup)

describe('Settings sections', () => {
  const shared = ['New Maps', 'Elements', 'Data', 'Map Labels & Marks', 'Dimension-to-color Gradient']
  const titles = (): (string | null)[] => screen.getAllByRole('heading').map(h => h.textContent)

  it('shows the startup section, with the last file, only where the host offers it', () => {
    render(<Harness />)
    expect(titles()).toEqual(['Startup & Windows', ...shared])
    expect(screen.getByText('Last: study.chora')).toBeTruthy()
    cleanup()

    setHostCapabilities({ startupSettings: false })
    try {
      render(<Harness />)
      expect(titles()).toEqual(shared)
    } finally {
      setHostCapabilities({ startupSettings: true })
    }
  })

  it('writes each kind of setting', () => {
    render(<Harness />)
    fireEvent.click(screen.getByLabelText('Show labels by default'))
    expect(latest.defaultShowLabels).toBe(!DEFAULT_PREFERENCES.defaultShowLabels)

    fireEvent.change(screen.getByLabelText('Marks'), { target: { value: 'element' } })
    expect(latest.defaultMarks).toBe('element')
    expect([...screen.getByLabelText('Default shape').querySelectorAll('option')].map(o => o.textContent))
      .toEqual(['circle', 'square', 'triangle', 'diamond'])

    fireEvent.change(screen.getByLabelText('High end'), { target: { value: '#123456' } })
    expect(latest.dimColorHigh).toBe('#123456')
  })

  it('keeps sizes within their range', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText(/Element labels/), { target: { value: '40' } })
    expect(latest.elementLabelSize).toBe(24)
    fireEvent.change(screen.getByLabelText(/Default mark radius/), { target: { value: '1' } })
    expect(latest.dotDefaultSize).toBe(3)
  })
})
