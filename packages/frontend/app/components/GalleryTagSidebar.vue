<script setup lang="ts">
import { groupPageTagsByCategory, type PageTagCount } from '~/utils/page-tags'

const props = defineProps<{
  tags: PageTagCount[]
  selected?: string[]
}>()

const emit = defineEmits<{
  select: [name: string]
}>()

const selectedSet = computed(() => new Set(props.selected ?? []))
const groups = computed(() => groupPageTagsByCategory(props.tags))

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
    <div class="space-y-4">
      <section
        v-for="group in groups"
        :key="group.category"
        class="space-y-1"
      >
        <h3 class="px-2 text-xs font-semibold tracking-wide text-dimmed capitalize">
          {{ group.category }}
        </h3>
        <ul class="space-y-1">
          <li
            v-for="tag in group.tags"
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
              <span class="min-w-0 truncate font-medium">{{ tag.name }}</span>
              <span class="shrink-0 tabular-nums text-xs text-dimmed">{{ tag.count }}</span>
            </button>
          </li>
        </ul>
      </section>
    </div>
  </aside>
</template>
