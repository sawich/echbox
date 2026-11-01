<script setup lang="ts">
import type { CardVoteValue } from '@echbox/shared'

const toast = useToast()

function ping() {
  toast.add({
    title: 'Saved',
    description: 'Toast feedback in the graphite theme',
    color: 'primary',
    icon: 'i-lucide-sparkles',
  })
}

const swatches = [
  { name: 'Primary', token: '--ed-primary', label: 'Ember' },
  { name: 'Secondary', token: '--ed-secondary', label: 'Iris' },
  { name: 'Tertiary', token: '--ed-tertiary', label: 'Jade' },
  { name: 'Error', token: '--ed-error', label: 'Crimson' },
  { name: 'Surface', token: '--ed-surface-container', label: 'Graphite' },
  { name: 'Outline', token: '--ed-outline', label: 'Graphite 400' },
]

const demoVote = ref<CardVoteValue | null>('like')
const demoLikes = computed(() => 41 + (demoVote.value === 'like' ? 1 : 0))
const demoDislikes = computed(() => 6 + (demoVote.value === 'dislike' ? 1 : 0))
const demoVersion = ref<number | null>(2)
const demoQuery = ref('')
const demoSort = ref<'recent' | 'top' | 'title'>('recent')
</script>

<template>
  <main class="mx-auto w-full max-w-5xl space-y-10 px-4 py-8 sm:px-6 sm:py-12">
    <header class="space-y-4">
      <EdLabel>echbox · uikit</EdLabel>
      <h1 class="ed-display-lg text-highlighted">
        Graphite <span class="ed-text-gradient">system</span>
      </h1>
      <p class="max-w-xl text-muted">
        Neutral graphite surfaces, an ember accent and Geist type. Light and dark themes
        follow the system preference and can be toggled from the header.
      </p>
    </header>

    <section class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <div
        v-for="swatch in swatches"
        :key="swatch.token"
        class="ed-card overflow-hidden"
      >
        <div
          class="h-16 border-b border-default"
          :style="{ background: `var(${swatch.token})` }"
        />
        <div class="space-y-0.5 p-3">
          <p class="text-sm font-medium text-highlighted">
            {{ swatch.label }}
          </p>
          <p class="font-mono text-[11px] text-dimmed">
            {{ swatch.token }}
          </p>
        </div>
      </div>
    </section>

    <SectionCard
      title="Actions"
      icon="i-lucide-mouse-pointer-click"
    >
      <div class="flex flex-wrap gap-3">
        <UButton
          icon="i-lucide-sparkles"
          @click="ping"
        >
          Primary
        </UButton>
        <UButton
          color="secondary"
          variant="soft"
        >
          Secondary
        </UButton>
        <UButton
          color="primary"
          variant="outline"
        >
          Outline
        </UButton>
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-download"
        >
          Neutral
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
        >
          Ghost
        </UButton>
        <UButton
          color="error"
          variant="soft"
          icon="i-lucide-trash-2"
        >
          Danger
        </UButton>
      </div>
      <div class="mt-4 flex flex-wrap gap-2">
        <UBadge
          color="neutral"
          variant="subtle"
        >
          character
        </UBadge>
        <UBadge
          color="primary"
          variant="subtle"
          icon="i-lucide-history"
        >
          3 versions
        </UBadge>
        <UBadge
          color="secondary"
          variant="subtle"
          icon="i-lucide-badge-check"
        >
          Author
        </UBadge>
        <UBadge color="primary">
          v4
        </UBadge>
      </div>
    </SectionCard>

    <div class="grid gap-6 lg:grid-cols-2">
      <SectionCard
        title="Rating"
        icon="i-lucide-thumbs-up"
      >
        <CardVoteControls
          :likes="demoLikes"
          :dislikes="demoDislikes"
          :my-vote="demoVote"
          interactive
          @vote="demoVote = $event"
        />
      </SectionCard>

      <SectionCard
        title="Versions"
        icon="i-lucide-history"
      >
        <VersionList
          v-model="demoVersion"
          :versions="[
            { version: 1, createdAt: '2026-03-02T10:00:00.000Z', notes: 'Initial release' },
            { version: 2, createdAt: '2026-09-14T18:30:00.000Z', notes: 'New outfit and hair' },
          ]"
        />
      </SectionCard>
    </div>

    <SectionCard
      title="Forms"
      icon="i-lucide-text-cursor-input"
    >
      <div class="space-y-5">
        <CatalogToolbar
          v-model:query="demoQuery"
          v-model:sort="demoSort"
        />
        <div class="grid gap-5 sm:grid-cols-2">
          <UFormField
            label="Title"
            hint="Optional"
          >
            <UInput
              placeholder="Character title"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="With error"
            error="That title is taken"
          >
            <UInput
              model-value="Sakura"
              class="w-full"
            />
          </UFormField>
        </div>
        <UFileUpload
          accept="image/png"
          icon="i-lucide-image-up"
          label="Drop PNG here"
          description="or click to browse"
          layout="list"
          class="min-h-32"
        />
      </div>
    </SectionCard>

    <div class="grid gap-6 lg:grid-cols-2">
      <UEmpty
        icon="i-lucide-images"
        title="No cards yet"
        description="Empty state for galleries."
        variant="soft"
      />
      <DangerZone subject="this demo item" />
    </div>
  </main>
</template>
