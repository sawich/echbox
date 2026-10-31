<script setup lang="ts">
import type { CardListItem, CardType } from '@echbox/shared'

const api = useApi()
const config = useRuntimeConfig()
const apiUrl = computed(() => String(config.public.apiUrl).replace(/\/$/, ''))

const filter = ref<'all' | CardType>('all')

const { data, error, status, refresh } = await useAsyncData(
  'gallery-cards',
  async () => {
    const query = filter.value === 'all' ? undefined : { type: filter.value }
    const { data, error: err } = await api.api.kk.cards.get(
      query ? { query } : {},
    )
    if (err) throw err
    return (data?.cards ?? []) as CardListItem[]
  },
  { watch: [filter] },
)

const cards = computed(() => data.value ?? [])
</script>

<template>
  <main class="mx-auto w-full max-w-6xl px-6 py-10">
    <header class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div class="space-y-2">
        <M3Label>Library</M3Label>
        <h1 class="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[var(--m3-on-surface)] sm:text-4xl">
          Cards
        </h1>
        <p class="m3-body-md max-w-xl text-[var(--m3-on-surface-variant)]">
          Character and scene cards from the seed gallery. Open a card to browse versions.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton
          size="sm"
          :variant="filter === 'all' ? 'solid' : 'ghost'"
          @click="filter = 'all'"
        >
          All
        </UButton>
        <UButton
          size="sm"
          color="secondary"
          :variant="filter === 'character' ? 'solid' : 'ghost'"
          @click="filter = 'character'"
        >
          Characters
        </UButton>
        <UButton
          size="sm"
          color="tertiary"
          :variant="filter === 'scene' ? 'solid' : 'ghost'"
          @click="filter = 'scene'"
        >
          Scenes
        </UButton>
      </div>
    </header>

    <div
      v-if="status === 'pending'"
      class="m3-body-md text-[var(--m3-on-surface-variant)]"
    >
      Loading cards…
    </div>

    <M3Surface
      v-else-if="error"
      :elev="2"
      class="space-y-3 p-6"
    >
      <p class="m3-title-md text-[var(--m3-error)]">
        Could not load gallery
      </p>
      <p class="m3-body-md text-[var(--m3-on-surface-variant)]">
        {{ error.message || 'Is the backend running on the API URL?' }}
      </p>
      <UButton
        size="sm"
        @click="refresh()"
      >
        Retry
      </UButton>
    </M3Surface>

    <p
      v-else-if="cards.length === 0"
      class="m3-body-md text-[var(--m3-on-surface-variant)]"
    >
      No cards for this filter.
    </p>

    <div
      v-else
      class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
    >
      <CardTile
        v-for="card in cards"
        :key="card.id"
        :card="card"
        :api-url="apiUrl"
      />
    </div>
  </main>
</template>
