<script setup lang="ts">
import type { CardVoteValue } from '@echbox/shared'
import { approvalPercent } from '~/utils/format'

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

const approval = computed(() => approvalPercent(props.likes, props.dislikes))

function onVote(value: CardVoteValue) {
  if (!props.interactive || props.busy) return
  emit('vote', props.myVote === value ? null : value)
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
    <div
      class="inline-flex items-center rounded-full border border-default bg-elevated p-0.5"
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

    <div
      v-if="approval !== null"
      class="flex items-center gap-2 text-xs text-muted"
    >
      <div class="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--ed-surface-container-highest)]">
        <div
          class="h-full rounded-full bg-gradient-to-r from-[var(--ed-primary)] to-[var(--ed-secondary)] transition-[width] duration-500"
          :style="{ width: `${approval}%` }"
        />
      </div>
      <span class="tabular-nums">{{ approval }}% liked</span>
    </div>
  </div>
</template>
