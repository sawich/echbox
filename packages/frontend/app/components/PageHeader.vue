<script setup lang="ts">
defineProps<{
  eyebrow?: string
  title: string
  description?: string
  icon?: string
  count?: number | null
}>()
</script>

<template>
  <header class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
    <div class="min-w-0 space-y-1.5">
      <div
        v-if="eyebrow || icon"
        class="flex items-center gap-1.5 text-primary"
      >
        <UIcon
          v-if="icon"
          :name="icon"
          class="size-3.5"
        />
        <span
          v-if="eyebrow"
          class="ed-eyebrow"
        >{{ eyebrow }}</span>
      </div>
      <h1 class="ed-headline-md flex items-center gap-2.5 text-highlighted">
        {{ title }}
        <span
          v-if="typeof count === 'number'"
          class="rounded-full bg-[var(--ed-surface-container-high)] px-2 py-0.5 font-mono text-xs font-medium tracking-normal text-muted tabular-nums ring-1 ring-[var(--ed-outline-variant)]"
        >{{ count }}</span>
      </h1>
      <p
        v-if="description"
        class="max-w-2xl text-sm text-pretty text-muted"
      >
        {{ description }}
      </p>
    </div>
    <div
      v-if="$slots.actions"
      class="flex shrink-0 items-center gap-2"
    >
      <slot name="actions" />
    </div>
  </header>
</template>
