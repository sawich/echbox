<script setup lang="ts">
withDefaults(
  defineProps<{
    /** Editorial tonal elevation (dark: higher = lighter). */
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
    class="rounded-[var(--radius-md)]"
    :class="`ed-elev-${elev}`"
  >
    <slot />
  </component>
</template>
