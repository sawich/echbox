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
  <EdSurface
    :elev="1"
    class="flex flex-col gap-3 p-4 ring-1 ring-[var(--ed-outline-variant)] transition-[ring-color] duration-200 hover:ring-[color-mix(in_oklab,var(--ed-primary)_35%,var(--ed-outline-variant))] sm:flex-row sm:items-center sm:justify-between"
  >
    <div class="min-w-0 flex-1 space-y-1.5">
      <div class="flex flex-wrap items-center gap-2">
        <NuxtLink
          :to="detailTo"
          class="ed-title-md truncate text-[var(--ed-on-surface)] underline-offset-2 hover:text-[var(--ed-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ed-primary)]"
        >
          {{ item.title }}
        </NuxtLink>
        <UBadge
          v-if="item.versionCount > 1"
          color="primary"
          variant="subtle"
          size="sm"
        >
          v{{ item.latestVersion }}
        </UBadge>
        <UBadge
          v-if="packageVersion"
          color="neutral"
          variant="subtle"
          size="sm"
        >
          pkg {{ packageVersion }}
        </UBadge>
      </div>
      <p class="ed-label-md truncate text-[var(--ed-on-surface-variant)]">
        {{ item.id }}
      </p>
      <p
        v-if="description"
        class="ed-body-md line-clamp-2 text-[var(--ed-on-surface-variant)]"
      >
        {{ description }}
      </p>
      <div class="flex flex-wrap gap-x-4 gap-y-1 ed-label-md text-[var(--ed-on-surface-variant)]">
        <span>
          Uploader:
          <NuxtLink
            :to="`/u/${item.uploader.id}`"
            class="text-[var(--ed-primary)] underline-offset-2 hover:underline"
          >
            {{ item.uploader.username }}
          </NuxtLink>
        </span>
        <span v-if="modAuthor">
          Author: {{ modAuthor }}
        </span>
      </div>
      <div class="flex items-center gap-3 ed-label-md text-[var(--ed-on-surface-variant)]">
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
      </div>
    </div>
    <div class="flex shrink-0 flex-wrap items-center gap-2">
      <UButton
        :to="detailTo"
        variant="soft"
        color="neutral"
        size="sm"
      >
        Details
      </UButton>
      <UButton
        :href="downloadHref"
        external
        download
        variant="solid"
        color="primary"
        size="sm"
        icon="i-lucide-download"
      >
        Download
      </UButton>
    </div>
  </EdSurface>
</template>
