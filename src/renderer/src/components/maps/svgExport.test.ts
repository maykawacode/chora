import { describe, expect, it } from 'vitest'
import {
  EXPORT_SCALE,
  alphabeticShift,
  exportLayoutSize,
  splitHexAlpha,
  withExportFont
} from './svgExport'

describe('exportLayoutSize', () => {
  it('keeps a wide window within the slide width', () => {
    expect(exportLayoutSize(1600, 800)).toEqual({ width: 1040, height: 520 })
  })

  it('keeps a tall window within the slide height', () => {
    expect(exportLayoutSize(600, 900)).toEqual({ width: 390, height: 585 })
  })

  it('fills a 16:9 slide exactly from a 16:9 window', () => {
    const { width, height } = exportLayoutSize(1920, 1080)
    expect(Math.round(width * EXPORT_SCALE)).toBe(1280)
    expect(Math.round(height * EXPORT_SCALE)).toBe(720)
  })
})

describe('withExportFont', () => {
  it('puts a 13px label at 13pt on the slide, in Arial', () => {
    const font = withExportFont('13px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif')
    expect(font).toMatch(/px Arial$/)
    expect(parseFloat(font) * EXPORT_SCALE * 0.75).toBeCloseTo(13, 2)
  })

  it('keeps weight', () => {
    expect(withExportFont('bold 14px -apple-system, sans-serif')).toMatch(/^bold [\d.]+px Arial$/)
  })
})

describe('splitHexAlpha', () => {
  it('splits an eight-digit hex color into color and opacity', () => {
    expect(splitHexAlpha('#3366cc99')).toEqual({ color: '#3366cc', opacity: 0.6 })
  })

  it('leaves six-digit colors alone', () => {
    expect(splitHexAlpha('#3366cc')).toBeNull()
  })
})

describe('alphabeticShift', () => {
  it('moves centered text down and bottom-aligned text up', () => {
    expect(alphabeticShift('central')).toBeGreaterThan(0)
    expect(alphabeticShift('text-after-edge')).toBeLessThan(0)
  })

  it('leaves other baselines alone', () => {
    expect(alphabeticShift('alphabetic')).toBeNull()
  })
})
