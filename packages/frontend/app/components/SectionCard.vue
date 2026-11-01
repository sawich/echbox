<script setup lang="ts">
defineProps<{
  title: string
  description?: string
  icon?: string
  eyebrow?: string
}>()
</script>

<template>
  <section class="ed-card p-5 sm:p-6">
    <header class="mb-4 flex items-start gap-3">
      <span
        v-if="icon"
        class="grid size-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[var(--ed-surface-container-high)] text-muted"
      >
        <UIcon
          :name="icon"
          class="size-4.5"
        />
      </span>
      <div class="min-w-0 flex-1 space-y-0.5">
        <p
          v-if="eyebrow"
          class="ed-eyebrow text-primary"
        >
          {{ eyebrow }}
        </p>
        <h2 class="text-base font-semibold text-highlighted">
          {{ title }}
        </h2>
        <p
          v-if="description"
          class="text-sm text-muted"
        >
          {{ description }}
        </p>
      </div>
      <slot name="actions" />
    </header>
    <slot />
  </section>
</template>
