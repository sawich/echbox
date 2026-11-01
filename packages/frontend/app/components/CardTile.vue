<script setup lang="ts">
import type { CardListItem, CardVoteValue } from '@echbox/shared'
import { galleryAspect } from '~/utils/gallery'

type GalleryCard = CardListItem & {
  likes?: number
  dislikes?: number
  myVote?: CardVoteValue | null
}

const props = defineProps<{
  card: GalleryCard
  apiUrl: string
}>()

const imageSrc = computed(() => `${props.apiUrl}${props.card.imageUrl}`)
const aspectClass = computed(() => galleryAspect(props.card.type))
const showVotes = computed(
  () => props.card.type === 'character' && typeof props.card.likes === 'number',
)
</script>

<template>
  <NuxtLink
    :to="`/cards/${card.id}`"
    class="group block focus-visible:outline-none"
  >
    <EdSurface
      :elev="2"
      class="overflow-hidden ring-1 ring-[var(--ed-outline-variant)] transition-[transform,opacity,ring-color] duration-200 ease-[var(--ed-ease-emphasized)] group-hover:-translate-y-0.5 group-hover:ring-[color-mix(in_oklab,var(--ed-primary)_45%,var(--ed-outline-variant))] group-focus-visible:ring-2 group-focus-visible:ring-[var(--ed-primary)]"
    >
      <div
        class="relative bg-[var(--ed-surface-container-highest)]"
        :class="aspectClass"
      >
        <img
          :src="imageSrc"
          :alt="card.title"
          class="h-full w-full object-cover"
          loading="lazy"
        >
        <div class="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2">
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
      <div class="space-y-1.5 p-3">
        <div class="space-y-0.5">
          <p class="ed-title-md truncate text-[var(--ed-on-surface)]">
            {{ card.title }}
          </p>
          <p class="ed-label-md text-[var(--ed-on-surface-variant)]">
            {{ card.slug }}
          </p>
        </div>
        <div
          v-if="showVotes"
          class="flex items-center gap-3 ed-label-md text-[var(--ed-on-surface-variant)]"
        >
          <span class="inline-flex items-center gap-1">
            <UIcon
              name="i-lucide-thumbs-up"
              class="size-3.5"
            />
            {{ card.likes ?? 0 }}
          </span>
          <span class="inline-flex items-center gap-1">
            <UIcon
              name="i-lucide-thumbs-down"
              class="size-3.5"
            />
            {{ card.dislikes ?? 0 }}
          </span>
        </div>
      </div>
    </EdSurface>
  </NuxtLink>
</template>
