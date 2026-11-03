<script setup lang="ts">
import { compareSemver } from '@echbox/shared'
import { formatRelativeTime, formatShortDate } from '~/utils/format'

type VersionEntry = {
  id: string
  semver: string
  createdAt: string
  notes?: string
}

const props = defineProps<{
  versions: VersionEntry[]
  latestVersionId?: string | null
}>()

const selected = defineModel<string | null>({ required: true })

const ordered = computed(() =>
  [...props.versions].sort((a, b) => compareSemver(b.semver, a.semver)),
)

const latestId = computed(
  () => props.latestVersionId ?? ordered.value[0]?.id ?? null,
)
</script>

<template>
  <ol class="relative space-y-1">
    <li
      v-for="ver in ordered"
      :key="ver.id"
    >
      <button
        type="button"
        class="group relative flex w-full items-start gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left transition-colors"
        :class="selected === ver.id
          ? 'bg-[color-mix(in_oklab,var(--ed-primary)_10%,transparent)]'
          : 'hover:bg-[var(--ed-surface-container-high)]'"
        :aria-current="selected === ver.id ? 'true' : undefined"
        @click="selected = ver.id"
      >
        <span
          class="mt-1.5 size-2.5 shrink-0 rounded-full ring-4 transition-colors"
          :class="selected === ver.id
            ? 'bg-[var(--ed-primary)] ring-[color-mix(in_oklab,var(--ed-primary)_20%,transparent)]'
            : 'bg-[var(--ed-outline)] ring-transparent'"
        />
        <span class="min-w-0 flex-1 space-y-0.5">
          <span class="flex flex-wrap items-center gap-2">
            <span
              class="font-mono text-sm font-medium"
              :class="selected === ver.id ? 'text-primary' : 'text-highlighted'"
            >{{ ver.semver }}</span>
            <UBadge
              v-if="ver.id === latestId"
              size="sm"
              color="neutral"
              variant="subtle"
            >
              latest
            </UBadge>
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
