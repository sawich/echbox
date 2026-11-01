<script setup lang="ts">
withDefaults(
  defineProps<{
    /** Tonal elevation (higher = more contrast against the page). */
    elev?: 0 | 1 | 2 | 3 | 4
    as?: string
  }>(),
  {
    elev: 1,
    as: 'div',
  },
)
</script>

<template>
  <component
    :is="as"
    class="rounded-[var(--radius-xl)] border border-[var(--ed-outline-variant)]"
    :class="`ed-elev-${elev}`"
  >
    <slot />
  </component>
</template>
