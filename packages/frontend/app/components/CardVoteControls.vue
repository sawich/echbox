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
  <div class="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
    <div
      class="inline-flex shrink-0 items-center rounded-[var(--radius-md)] border border-[var(--ed-outline-variant)] bg-[var(--ed-surface-container-high)] p-0.5"
      role="group"
      aria-label="Rate"
    >
      <UButton
        :size="size"
        :variant="myVote === 'like' ? 'soft' : 'ghost'"
        :color="myVote === 'like' ? 'primary' : 'neutral'"
        icon="i-lucide-thumbs-up"
        :aria-pressed="myVote === 'like'"
        :disabled="!interactive || busy"
        class="tabular-nums disabled:opacity-100"
        @click.stop="onVote('like')"
      >
        {{ likes }}
      </UButton>
      <span class="mx-0.5 h-5 w-px bg-[var(--ed-outline-variant)]" />
      <UButton
        :size="size"
        :variant="myVote === 'dislike' ? 'soft' : 'ghost'"
        :color="myVote === 'dislike' ? 'error' : 'neutral'"
        icon="i-lucide-thumbs-down"
        :aria-pressed="myVote === 'dislike'"
        :disabled="!interactive || busy"
        class="tabular-nums disabled:opacity-100"
        @click.stop="onVote('dislike')"
      >
        {{ dislikes }}
      </UButton>
    </div>
  </div>
</template>
