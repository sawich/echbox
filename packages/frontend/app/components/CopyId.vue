<script setup lang="ts">
const props = defineProps<{ value: string }>()

const { copy, copied } = useClipboard({ copiedDuring: 1500 })
</script>

<template>
  <button
    type="button"
    class="group inline-flex max-w-full items-center gap-1.5 rounded-[var(--radius-xs)] px-1.5 py-0.5 font-mono text-xs text-dimmed transition-colors hover:bg-[var(--ed-surface-container-high)] hover:text-highlighted"
    :title="copied ? 'Copied' : 'Copy ID'"
    @click="copy(props.value)"
  >
    <span class="truncate">{{ value }}</span>
    <UIcon
      :name="copied ? 'i-lucide-check' : 'i-lucide-copy'"
      class="size-3.5 shrink-0"
      :class="copied ? 'text-success' : 'opacity-60 group-hover:opacity-100'"
    />
  </button>
</template>
