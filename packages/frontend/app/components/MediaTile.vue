<script setup lang="ts">
const props = defineProps<{
  to: string
  imageSrc: string
  title: string
  subtitle?: string
  aspectClass: string
  kind: string
  /** Shown as a badge when the item has more than one version. */
  semver?: string | null
  likes?: number | null
  dislikes?: number | null
}>()

const showVotes = computed(() => typeof props.likes === 'number')
</script>

<template>
  <NuxtLink
    :to="to"
    class="group block rounded-[var(--radius-xl)] focus-visible:outline-offset-4"
  >
    <article class="ed-card ed-card-interactive relative overflow-hidden">
      <div
        class="relative overflow-hidden bg-[var(--ed-surface-container-highest)]"
        :class="aspectClass"
      >
        <img
          :src="imageSrc"
          :alt="title"
          class="size-full object-cover transition-transform duration-500 ease-[var(--ed-ease-emphasized)] group-hover:scale-[1.04]"
          loading="lazy"
          decoding="async"
        >

        <div class="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

        <div class="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2.5">
          <span class="rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-medium text-white/90 capitalize backdrop-blur-md">
            {{ kind }}
          </span>
          <span
            v-if="semver"
            class="rounded-full bg-[var(--ed-primary)] px-2 py-0.5 font-mono text-[11px] font-medium text-[var(--ed-on-primary)] shadow-sm"
          >
            v{{ semver }}
          </span>
        </div>

        <div class="absolute inset-x-0 bottom-0 space-y-1 p-3 text-white">
          <h3 class="truncate text-[15px] leading-tight font-semibold tracking-tight">
            {{ title }}
          </h3>
          <div class="flex items-center justify-between gap-2 text-xs text-white/70">
            <span
              v-if="subtitle"
              class="truncate font-mono"
            >{{ subtitle }}</span>
            <span
              v-if="showVotes"
              class="ml-auto inline-flex shrink-0 items-center gap-2.5 tabular-nums"
            >
              <span class="inline-flex items-center gap-1">
                <UIcon
                  name="i-lucide-thumbs-up"
                  class="size-3.5"
                />
                {{ likes ?? 0 }}
              </span>
              <span class="inline-flex items-center gap-1">
                <UIcon
                  name="i-lucide-thumbs-down"
                  class="size-3.5"
                />
                {{ dislikes ?? 0 }}
              </span>
            </span>
          </div>
        </div>
      </div>
    </article>
  </NuxtLink>
</template>
