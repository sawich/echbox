<script setup lang="ts">
import type { SoftmodListItem } from '@echbox/shared'

defineProps<{
  item: SoftmodListItem
  apiUrl: string
}>()
</script>

<template>
  <MediaTile
    :to="`/softmods/${item.id}`"
    :image-src="item.previewUrls[0] ? `${apiUrl}${item.previewUrls[0]}` : ''"
    aspect-class="aspect-video"
    kind="softmod"
    :semver="item.versionCount > 1 ? item.latestSemver : null"
    :likes="item.likes"
    :dislikes="item.dislikes"
  />
</template>
