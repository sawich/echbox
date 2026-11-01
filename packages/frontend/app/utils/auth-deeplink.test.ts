import { describe, expect, test } from 'bun:test'
import { parseClaimToken } from './auth-deeplink'

describe('parseClaimToken', () => {
  test('extracts token from echbox auth callback deep link', () => {
    expect(parseClaimToken('echbox://auth/callback?token=abc123')).toBe('abc123')
  })

  test('returns null for unrelated urls', () => {
    expect(parseClaimToken('https://example.com/')).toBeNull()
    expect(parseClaimToken('echbox://other?token=abc')).toBeNull()
    expect(parseClaimToken('echbox://auth/callback')).toBeNull()
  })
})
