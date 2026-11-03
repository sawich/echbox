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

const showVotes = computed(
  () => props.card.type === 'character' && typeof props.card.likes === 'number',
)
</script>

<template>
  <MediaTile
    :to="`/cards/${card.id}`"
    :image-src="`${apiUrl}${card.imageUrl}`"
    :title="card.title"
    :subtitle="card.slug"
    :aspect-class="galleryAspect(card.type)"
    :kind="card.type"
    :semver="card.versionCount > 1 ? card.latestSemver : null"
    :likes="showVotes ? card.likes : null"
    :dislikes="showVotes ? card.dislikes : null"
  />
</template>
