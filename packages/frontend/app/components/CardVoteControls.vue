<script setup lang="ts">
import type { CardVoteValue } from '@echbox/shared'

const props = withDefaults(defineProps<{
  likes: number
  dislikes: number
  myVote?: CardVoteValue | null
  interactive?: boolean
  size?: 'sm' | 'md'
  busy?: boolean
}>(), {
  myVote: null,
  interactive: false,
  size: 'md',
  busy: false,
})

const emit = defineEmits<{
  vote: [value: CardVoteValue | null]
}>()

function onVote(value: CardVoteValue) {
  if (!props.interactive || props.busy) return
  emit('vote', props.myVote === value ? null : value)
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <UButton
      :size="size"
      :variant="myVote === 'like' ? 'solid' : 'soft'"
      :color="myVote === 'like' ? 'primary' : 'neutral'"
      icon="i-lucide-thumbs-up"
      :disabled="!interactive || busy"
      @click.stop="onVote('like')"
    >
      {{ likes }}
    </UButton>
    <UButton
      :size="size"
      :variant="myVote === 'dislike' ? 'solid' : 'soft'"
      :color="myVote === 'dislike' ? 'error' : 'neutral'"
      icon="i-lucide-thumbs-down"
      :disabled="!interactive || busy"
      @click.stop="onVote('dislike')"
    >
      {{ dislikes }}
    </UButton>
  </div>
</template>
