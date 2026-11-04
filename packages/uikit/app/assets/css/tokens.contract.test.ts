import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync(join(import.meta.dir, 'tokens.css'), 'utf8')

const darkBlock = css.slice(css.indexOf('.dark {'))

describe('slate tokens', () => {
  for (const token of [
    '--ed-primary: #0f7fd1',
    '--ed-surface: #eef2f6',
    '--ed-on-surface: #1b2838',
    '--ed-sidebar: #e3e9ef',
    '--ed-sidebar-width: 15rem',
    '--ed-rail-width: 3.5rem',
    '--ed-gradient-primary:',
    '--font-display: "Geist"',
    '--font-sans: "Geist"',
    '--font-mono: "Geist Mono"',
  ]) {
    test(`defines ${token}`, () => {
      expect(css.includes(token)).toBe(true)
    })
  }

  test('defines dark (Steam-like) overrides', () => {
    expect(darkBlock.length).toBeGreaterThan(0)
    expect(darkBlock.includes('--ed-primary: #66c0f4')).toBe(true)
    expect(darkBlock.includes('--ed-surface: #1b2838')).toBe(true)
    expect(darkBlock.includes('--ed-on-surface: #dfe7ee')).toBe(true)
    expect(darkBlock.includes('--ed-sidebar: #171d25')).toBe(true)
  })

  test('uses a tight radius scale (no pill buttons)', () => {
    expect(css.includes('--radius-md: 0.25rem')).toBe(true)
    expect(css.includes('--radius-lg: 0.375rem')).toBe(true)
  })

  test('does not keep editorial palettes', () => {
    expect(css.includes('--color-vermilion-400')).toBe(false)
    expect(css.includes('Instrument Serif')).toBe(false)
  })

  test('distinct error from primary', () => {
    expect(css.includes('--ed-error: #0f7fd1')).toBe(false)
    expect(css.includes('--ed-error: #66c0f4')).toBe(false)
    expect(css.includes('--color-crimson-400')).toBe(true)
    expect(css.includes('--ed-error:')).toBe(true)
  })
})
