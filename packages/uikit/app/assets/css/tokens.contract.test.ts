import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync(join(import.meta.dir, 'tokens.css'), 'utf8')

const darkBlock = css.slice(css.indexOf('.dark {'))

describe('graphite tokens', () => {
  for (const token of [
    '--ed-primary: #e0381a',
    '--ed-surface: #f7f7f8',
    '--ed-on-surface: #17171b',
    '--font-display: "Geist"',
    '--font-sans: "Geist"',
    '--font-mono: "Geist Mono"',
  ]) {
    test(`defines ${token}`, () => {
      expect(css.includes(token)).toBe(true)
    })
  }

  test('defines dark theme overrides', () => {
    expect(darkBlock.length).toBeGreaterThan(0)
    expect(darkBlock.includes('--ed-primary: #ff6f52')).toBe(true)
    expect(darkBlock.includes('--ed-surface: #0b0b0d')).toBe(true)
    expect(darkBlock.includes('--ed-on-surface: #f2f2f4')).toBe(true)
  })

  test('does not keep editorial palettes', () => {
    expect(css.includes('--color-vermilion-400')).toBe(false)
    expect(css.includes('Instrument Serif')).toBe(false)
  })

  test('distinct error from primary', () => {
    expect(css.includes('--ed-error: #e0381a')).toBe(false)
    expect(css.includes('--ed-error: #ff6f52')).toBe(false)
    expect(css.includes('--color-crimson-400')).toBe(true)
    expect(css.includes('--ed-error:')).toBe(true)
  })
})
