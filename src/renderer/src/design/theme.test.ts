import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { themeVariables, uiTheme } from './theme'

const rendererRoot = resolve(process.cwd(), 'src/renderer/src')
const rawColor = /#[0-9a-f]{3,8}\b|rgba?\(/i

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

describe('interface theme', () => {
  it('exposes semantic CSS variables for every token', () => {
    const variables = themeVariables()
    const tokenCount = Object.values(uiTheme).reduce(
      (count, group) => count + Object.keys(group).length,
      0
    )

    expect(Object.keys(variables)).toHaveLength(tokenCount)
    expect(variables['--color-surface-app']).toBe(uiTheme.color.surfaceApp)
    expect(variables['--font-family-ui']).toBe(uiTheme.fontFamily.ui)
    expect(variables['--motion-duration-enter']).toBe(uiTheme.motion.durationEnter)
  })

  it('keeps raw presentation colors out of styles and map painters', () => {
    const cssFiles = filesUnder(rendererRoot).filter(path => path.endsWith('.css'))
    const canvasFiles = [
      'MapApp.tsx',
      'components/maps/MapPanel.tsx',
      'components/maps/color.ts',
      'components/maps/cartesian/drawCartesian.ts',
      'components/maps/semantic/drawSemantic.ts',
      'components/maps/shape.ts'
    ].map(path => join(rendererRoot, path))

    const violations = [...cssFiles, ...canvasFiles].flatMap(path =>
      readFileSync(path, 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          rawColor.test(line)
            ? [`${relative(rendererRoot, path)}:${index + 1}`]
            : []
        )
    )

    expect(violations).toEqual([])
  })
})
