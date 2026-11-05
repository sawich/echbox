import { describe, expect, test } from 'bun:test'
import { contentLabel } from './content-label'

describe('contentLabel', () => {
  test('uses a collapsed description snippet', () => {
    expect(contentLabel('  hello   world  ', 'abcdefghijklmnop')).toBe('hello world')
  })

  test('truncates a long description', () => {
    const label = contentLabel('a'.repeat(90), 'id')
    expect(label.endsWith('…')).toBe(true)
    expect(label.length).toBeLessThanOrEqual(80)
    expect(label.startsWith('a')).toBe(true)
  })

  test('falls back to an id prefix when the description is blank', () => {
    expect(contentLabel('   ', 'abcdef1234567890')).toBe('abcdef12')
    expect(contentLabel(null, 'short')).toBe('short')
  })
})
