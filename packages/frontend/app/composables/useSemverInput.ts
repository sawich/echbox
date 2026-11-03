import { isValidSemver, parseSemver } from '@echbox/shared'

export function useSemverInput(initial = '') {
  const raw = ref(initial)
  const showError = ref(false)

  const error = computed(() => {
    const v = raw.value.trim()
    if (!v) return 'Version is required'
    if (!isValidSemver(v)) return 'Enter a valid version (for example 1.0.0)'
    return null
  })

  const valid = computed(() => error.value === null)

  /** Show invalid format immediately; show "required" after blur/submit. */
  const fieldError = computed(() => {
    if (!error.value) return undefined
    if (showError.value) return error.value
    if (raw.value.trim() && !isValidSemver(raw.value)) return error.value
    return undefined
  })

  const canonical = computed(() => {
    if (!valid.value) return null
    try {
      return parseSemver(raw.value)
    }
    catch {
      return null
    }
  })

  function markTried() {
    showError.value = true
  }

  function reset(value = '') {
    raw.value = value
    showError.value = false
  }

  return { raw, error, fieldError, valid, canonical, markTried, reset, showError }
}
