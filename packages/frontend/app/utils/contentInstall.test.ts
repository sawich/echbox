import { describe, expect, test } from 'bun:test'
import { downloadUrlFor, extensionForKind } from './contentInstall'

describe('contentInstall helpers', () => {
  test('extensionForKind maps kinds', () => {
    expect(extensionForKind('cards')).toBe('png')
    expect(extensionForKind('scenes')).toBe('png')
    expect(extensionForKind('clothes')).toBe('png')
    expect(extensionForKind('plugins')).toBe('zip')
    expect(extensionForKind('softmods')).toBe('zipmod')
  })

  test('downloadUrlFor builds original/download paths', () => {
    const api = 'http://localhost:3001'
    expect(downloadUrlFor(api, 'cards', 'c1', 'v1')).toBe(
      'http://localhost:3001/api/kk/cards/c1/versions/v1/image?original=1',
    )
    expect(downloadUrlFor(api, 'scenes', 's1', 'v1')).toBe(
      'http://localhost:3001/api/scenes/s1/versions/v1/image?original=1',
    )
    expect(downloadUrlFor(api, 'clothes', 'o1', 'v1')).toBe(
      'http://localhost:3001/api/clothes/o1/versions/v1/image?original=1',
    )
    expect(downloadUrlFor(api, 'plugins', 'p1', 'v1')).toBe(
      'http://localhost:3001/api/plugins/p1/versions/v1/download',
    )
    expect(downloadUrlFor(api, 'softmods', 'm1', 'v1')).toBe(
      'http://localhost:3001/api/softmods/m1/versions/v1/download',
    )
  })
})
