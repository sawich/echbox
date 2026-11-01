import { describe, expect, test } from 'bun:test'
import { approvalPercent, formatShortDate, formatRelativeTime } from './format'

describe('formatShortDate', () => {
  test('empty input', () => {
    expect(formatShortDate(null)).toBe('')
  })

  test('invalid input is returned as-is', () => {
    expect(formatShortDate('not a date')).toBe('not a date')
  })

  test('formats a valid ISO string', () => {
    expect(formatShortDate('2026-01-15T12:00:00.000Z')).toContain('2026')
  })
})

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-06-10T12:00:00.000Z')

  test('days ago', () => {
    expect(formatRelativeTime('2026-06-07T12:00:00.000Z', now)).toMatch(/3/)
  })

  test('just now', () => {
    expect(formatRelativeTime('2026-06-10T11:59:50.000Z', now)).not.toBe('')
  })
})

describe('approvalPercent', () => {
  test('no votes', () => {
    expect(approvalPercent(0, 0)).toBeNull()
  })

  test('rounds share of likes', () => {
    expect(approvalPercent(2, 1)).toBe(67)
  })
})
