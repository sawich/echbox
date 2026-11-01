export function parseClaimToken(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'echbox:') return null

    const hostPath = `${parsed.hostname}${parsed.pathname}`.replace(/\/+$/, '')
    if (hostPath !== 'auth/callback') return null

    const token = parsed.searchParams.get('token')
    return token && token.length > 0 ? token : null
  }
  catch {
    return null
  }
}
