<script setup lang="ts">
import type { ClothesListItem } from '@echbox/shared'
import { galleryAspect } from '~/utils/gallery'

defineProps<{
  clothes: ClothesListItem
  apiUrl: string
}>()
</script>

<template>
  <MediaTile
    :to="`/clothes/${clothes.id}`"
    :image-src="clothes.imageUrl ? `${apiUrl}${clothes.imageUrl}` : ''"
    :title="clothes.title"
    :subtitle="clothes.slug"
    :aspect-class="galleryAspect('clothes')"
    kind="clothes"
    :semver="clothes.versionCount > 1 ? clothes.latestSemver : null"
    :likes="clothes.likes ?? 0"
    :dislikes="clothes.dislikes ?? 0"
  />
</template>
