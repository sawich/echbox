<script setup lang="ts">
import type { PluginListItem } from '@echbox/shared'

const props = defineProps<{
  item: PluginListItem
  apiUrl: string
  showInstall?: boolean
  installed?: boolean
  installDisabled?: boolean
  installLoading?: boolean
  installLabel?: string
}>()

const emit = defineEmits<{
  install: []
}>()

const downloadHref = computed(() => `${props.apiUrl}${props.item.downloadUrl}`)

const description = computed(() => {
  const d = props.item.description
  return typeof d === 'string' && d.trim() ? d.trim() : null
})
</script>

<template>
  <article class="ed-card ed-card-interactive group relative flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
    <span class="grid size-11 shrink-0 place-items-center rounded-[var(--radius-md)] bg-gradient-to-br from-[color-mix(in_oklab,var(--ed-secondary)_22%,transparent)] to-[color-mix(in_oklab,var(--ed-secondary)_6%,transparent)] text-secondary ring-1 ring-[var(--ed-outline-variant)]">
      <UIcon
        name="i-lucide-puzzle"
        class="size-5"
      />
    </span>

    <div class="min-w-0 flex-1 space-y-1.5">
      <div class="flex flex-wrap items-center gap-2">
        <NuxtLink
          :to="`/plugins/${item.id}`"
          class="truncate text-[15px] font-semibold text-highlighted after:absolute after:inset-0 after:rounded-[var(--radius-lg)] after:content-[''] focus-visible:outline-none group-hover:text-primary"
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
          v{{ item.latestSemver }}
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

    <div class="relative z-10 flex shrink-0 flex-wrap gap-2 self-start sm:self-center">
      <UButton
        v-if="showInstall"
        size="sm"
        :color="installed ? 'neutral' : 'primary'"
        :variant="installed ? 'outline' : 'solid'"
        :loading="installLoading"
        :disabled="installDisabled"
        @click="emit('install')"
      >
        {{ installLabel || (installed ? 'Uninstall' : 'Install') }}
      </UButton>
      <UButton
        :href="downloadHref"
        external
        download
        variant="soft"
        color="neutral"
        icon="i-lucide-download"
      >
        Download
      </UButton>
    </div>
  </article>
</template>
