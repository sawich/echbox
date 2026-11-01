<script setup lang="ts">
import type { PluginListItem, SoftmodListItem } from '@echbox/shared'

const props = defineProps<{
  modKind: 'plugin' | 'softmod'
  item: PluginListItem | SoftmodListItem
  apiUrl: string
}>()

const detailTo = computed(() =>
  props.modKind === 'plugin'
    ? `/plugins/${props.item.id}`
    : `/softmods/${props.item.id}`,
)

const downloadHref = computed(() => `${props.apiUrl}${props.item.downloadUrl}`)

const modAuthor = computed(() =>
  props.modKind === 'softmod'
    ? (props.item as SoftmodListItem).modAuthor
    : null,
)

const packageVersion = computed(() =>
  props.modKind === 'softmod'
    ? (props.item as SoftmodListItem).packageVersion
    : null,
)

const description = computed(() => {
  const d = props.item.description
  return typeof d === 'string' && d.trim() ? d.trim() : null
})
</script>

<template>
  <article class="ed-card ed-card-interactive group relative flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
    <span
      class="grid size-12 shrink-0 place-items-center rounded-[var(--radius-lg)] bg-gradient-to-br"
      :class="modKind === 'plugin'
        ? 'from-[color-mix(in_oklab,var(--ed-secondary)_22%,transparent)] to-[color-mix(in_oklab,var(--ed-secondary)_6%,transparent)] text-secondary'
        : 'from-[color-mix(in_oklab,var(--ed-primary)_22%,transparent)] to-[color-mix(in_oklab,var(--ed-primary)_6%,transparent)] text-primary'"
    >
      <UIcon
        :name="modKind === 'plugin' ? 'i-lucide-puzzle' : 'i-lucide-package'"
        class="size-5.5"
      />
    </span>

    <div class="min-w-0 flex-1 space-y-1.5">
      <div class="flex flex-wrap items-center gap-2">
        <NuxtLink
          :to="detailTo"
          class="truncate text-base font-semibold text-highlighted after:absolute after:inset-0 after:rounded-[var(--radius-xl)] after:content-[''] focus-visible:outline-none group-hover:text-primary"
        >
          {{ item.title }}
        </NuxtLink>
        <UBadge
          v-if="item.versionCount > 1"
          color="primary"
          variant="subtle"
          size="sm"
          class="font-mono"
        >
          v{{ item.latestVersion }}
        </UBadge>
        <UBadge
          v-if="packageVersion"
          color="neutral"
          variant="subtle"
          size="sm"
          class="font-mono"
        >
          pkg {{ packageVersion }}
        </UBadge>
      </div>

      <p
        v-if="description"
        class="line-clamp-2 text-sm text-pretty text-muted"
      >
        {{ description }}
      </p>

      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-dimmed">
        <NuxtLink
          :to="`/u/${item.uploader.id}`"
          class="relative z-10 inline-flex items-center gap-1 transition-colors hover:text-highlighted"
        >
          <UIcon
            name="i-lucide-upload"
            class="size-3.5"
          />
          {{ item.uploader.username }}
        </NuxtLink>
        <span
          v-if="modAuthor"
          class="inline-flex items-center gap-1"
        >
          <UIcon
            name="i-lucide-pen-tool"
            class="size-3.5"
          />
          {{ modAuthor }}
        </span>
        <span class="inline-flex items-center gap-2.5 tabular-nums">
          <span class="inline-flex items-center gap-1">
            <UIcon
              name="i-lucide-thumbs-up"
              class="size-3.5"
            />
            {{ item.likes }}
          </span>
          <span class="inline-flex items-center gap-1">
            <UIcon
              name="i-lucide-thumbs-down"
              class="size-3.5"
            />
            {{ item.dislikes }}
          </span>
        </span>
      </div>
    </div>

    <UButton
      :href="downloadHref"
      external
      download
      variant="soft"
      color="neutral"
      icon="i-lucide-download"
      class="relative z-10 shrink-0 self-start sm:self-center"
    >
      Download
    </UButton>
  </article>
</template>
