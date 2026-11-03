<script setup lang="ts">
import type { SceneListItem } from '@echbox/shared'
import { galleryAspect } from '~/utils/gallery'

defineProps<{
  scene: SceneListItem
  apiUrl: string
}>()
</script>

<template>
  <MediaTile
    :to="`/scenes/${scene.id}`"
    :image-src="scene.imageUrl ? `${apiUrl}${scene.imageUrl}` : ''"
    :title="scene.title"
    :subtitle="scene.slug"
    :aspect-class="galleryAspect('scene')"
    kind="scene"
    :semver="scene.versionCount > 1 ? scene.latestSemver : null"
    :likes="scene.likes ?? 0"
    :dislikes="scene.dislikes ?? 0"
  />
</template>
