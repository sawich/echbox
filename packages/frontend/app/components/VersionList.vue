<script setup lang="ts">
import { formatRelativeTime, formatShortDate } from '~/utils/format'

type VersionEntry = {
  version: number
  createdAt: string
  notes?: string
  packageVersion?: string
}

const props = defineProps<{
  versions: VersionEntry[]
}>()

const selected = defineModel<number | null>({ required: true })

// Newest first reads more naturally in a timeline
const ordered = computed(() => [...props.versions].sort((a, b) => b.version - a.version))
const latest = computed(() => ordered.value[0]?.version)
</script>

<template>
  <ol class="relative space-y-1">
    <li
      v-for="ver in ordered"
      :key="ver.version"
    >
      <button
        type="button"
        class="group relative flex w-full items-start gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left transition-colors"
        :class="selected === ver.version
          ? 'bg-[color-mix(in_oklab,var(--ed-primary)_10%,transparent)]'
          : 'hover:bg-[var(--ed-surface-container-high)]'"
        :aria-current="selected === ver.version ? 'true' : undefined"
        @click="selected = ver.version"
      >
        <span
          class="mt-1.5 size-2.5 shrink-0 rounded-full ring-4 transition-colors"
          :class="selected === ver.version
            ? 'bg-[var(--ed-primary)] ring-[color-mix(in_oklab,var(--ed-primary)_20%,transparent)]'
            : 'bg-[var(--ed-outline)] ring-transparent'"
        />
        <span class="min-w-0 flex-1 space-y-0.5">
          <span class="flex flex-wrap items-center gap-2">
            <span
              class="font-mono text-sm font-medium"
              :class="selected === ver.version ? 'text-primary' : 'text-highlighted'"
            >v{{ ver.version }}</span>
            <UBadge
              v-if="ver.version === latest"
              size="sm"
              color="neutral"
              variant="subtle"
            >
              latest
            </UBadge>
            <span
              v-if="ver.packageVersion"
              class="font-mono text-xs text-dimmed"
            >pkg {{ ver.packageVersion }}</span>
            <time
              :datetime="ver.createdAt"
              :title="formatShortDate(ver.createdAt)"
              class="ml-auto text-xs text-dimmed"
            >{{ formatRelativeTime(ver.createdAt) }}</time>
          </span>
          <span
            v-if="ver.notes"
            class="block text-sm text-pretty text-muted"
          >{{ ver.notes }}</span>
        </span>
      </button>
    </li>
  </ol>
</template>
