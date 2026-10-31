<script setup lang="ts">
import type { CardListItem } from '@echbox/shared'
import { galleryAspect } from '~/utils/gallery'

const props = defineProps<{
  card: CardListItem
  apiUrl: string
}>()

const imageSrc = computed(() => `${props.apiUrl}${props.card.imageUrl}`)
const aspectClass = computed(() => galleryAspect(props.card.type))
</script>

<template>
  <NuxtLink
    :to="`/cards/${card.id}`"
    class="group block focus-visible:outline-none"
  >
    <M3Surface
      :elev="2"
      class="overflow-hidden transition-[box-shadow,transform] duration-200 ease-[var(--ease-emphasized)] group-hover:-translate-y-0.5 group-hover:shadow-[0_0_28px_-10px_var(--m3-neon-glow)] group-focus-visible:ring-2 group-focus-visible:ring-[var(--m3-primary)]"
    >
      <div
        class="relative bg-[var(--m3-surface-container-highest)]"
        :class="aspectClass"
      >
        <img
          :src="imageSrc"
          :alt="card.title"
          class="h-full w-full object-cover"
          loading="lazy"
        >
        <div class="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          <UBadge
            color="neutral"
            variant="subtle"
            size="sm"
          >
            {{ card.type }}
          </UBadge>
          <UBadge
            v-if="card.versionCount > 1"
            color="primary"
            variant="solid"
            size="sm"
          >
            v{{ card.latestVersion }}
          </UBadge>
        </div>
      </div>
      <div class="space-y-1 p-4">
        <p class="m3-title-md truncate text-[var(--m3-on-surface)]">
          {{ card.title }}
        </p>
        <p class="m3-label-md text-[var(--m3-on-surface-variant)]">
          {{ card.slug }}
        </p>
      </div>
    </M3Surface>
  </NuxtLink>
</template>
