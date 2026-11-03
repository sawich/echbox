import { isValidSemver, parseSemver } from '@echbox/shared'

export function useSemverInput(initial = '') {
  const raw = ref(initial)
  const error = computed(() => {
    const v = raw.value.trim()
    if (!v) return 'Semver is required'
    if (!isValidSemver(v)) return 'Enter a valid semver (e.g. 1.0.0)'
    return null
  })
  const valid = computed(() => error.value === null)
  const canonical = computed(() => {
    if (!valid.value) return null
    try {
      return parseSemver(raw.value)
    }
    catch {
      return null
    }
  })

  function reset(value = '') {
    raw.value = value
  }

  return { raw, error, valid, canonical, reset }
}
