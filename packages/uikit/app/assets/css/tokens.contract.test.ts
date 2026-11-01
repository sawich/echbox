import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync(join(import.meta.dir, 'tokens.css'), 'utf8')

describe('editorial tokens', () => {
  for (const token of [
    '--ed-primary: #e25a45',
    '--ed-surface: #0c0b0a',
    '--ed-on-surface: #ece7e1',
    '--font-display: "Instrument Serif"',
    '--font-sans: "Figtree"',
  ]) {
    test(`defines ${token}`, () => {
      expect(css.includes(token)).toBe(true)
    })
  }

  test('does not keep neon primary seed', () => {
    expect(css.includes('--color-neon-400')).toBe(false)
  })
})
