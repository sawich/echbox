<script setup lang="ts">
import type { PageTagCount } from '~/utils/page-tags'

const props = defineProps<{
  tags: PageTagCount[]
  selected?: string[]
}>()

const emit = defineEmits<{
  select: [name: string]
}>()

const selectedSet = computed(() => new Set(props.selected ?? []))

function onSelect(name: string) {
  if (selectedSet.value.has(name)) return
  emit('select', name)
}
</script>

<template>
  <aside
    class="sticky top-20 space-y-3"
    aria-label="Tags on this page"
  >
    <h2 class="text-xs font-semibold tracking-wide text-dimmed uppercase">
      On this page
    </h2>
    <ul class="space-y-1">
      <li
        v-for="tag in tags"
        :key="tag.name"
      >
        <button
          type="button"
          class="flex w-full items-center justify-between gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-left text-sm transition-colors hover:bg-elevated"
          :class="selectedSet.has(tag.name) ? 'bg-elevated text-highlighted' : 'text-default'"
          :disabled="selectedSet.has(tag.name)"
          :aria-pressed="selectedSet.has(tag.name)"
          @click="onSelect(tag.name)"
        >
          <span class="min-w-0 truncate">
            <span class="font-medium">{{ tag.name }}</span>
            <span class="ms-1 text-xs text-dimmed capitalize">{{ tag.category }}</span>
          </span>
          <span class="shrink-0 tabular-nums text-xs text-dimmed">{{ tag.count }}</span>
        </button>
      </li>
    </ul>
  </aside>
</template>
