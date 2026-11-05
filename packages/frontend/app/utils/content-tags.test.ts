import { describe, expect, test } from 'bun:test'
import { postCreateFollowUp, uploadSoftmodPreviews } from './content-tags'

describe('postCreateFollowUp', () => {
  test('navigates when tag and preview steps were skipped or succeeded', () => {
    expect(postCreateFollowUp([])).toEqual({ navigate: true, error: null })
    expect(postCreateFollowUp([null, null])).toEqual({ navigate: true, error: null })
  })

  test('stays on the upload form when a follow-up step fails', () => {
    expect(postCreateFollowUp([null, 'Preview upload failed (400)'])).toEqual({
      navigate: false,
      error: 'Published, but extras were not saved: Preview upload failed (400)',
    })
  })
})

describe('uploadSoftmodPreviews', () => {
  test('stops at the first failed preview and reports how many were stored', async () => {
    const calls: string[] = []
    const original = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input))
      if (calls.length === 2) {
        return new Response(JSON.stringify({ error: 'bad image' }), { status: 400 })
      }
      return new Response('{}', { status: 201 })
    }) as typeof fetch

    try {
      const result = await uploadSoftmodPreviews('http://api', 'sm1', [
        new File(['a'], 'a.png'),
        new File(['b'], 'b.png'),
        new File(['c'], 'c.png'),
      ])
      expect(result).toEqual({ error: 'bad image', uploaded: 1 })
      expect(calls).toHaveLength(2)
    }
    finally {
      globalThis.fetch = original
    }
  })
})
