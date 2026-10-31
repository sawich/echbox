<script setup lang="ts">
import type { CardListItem, CardType } from '@echbox/shared'

const props = defineProps<{
  type: CardType
  title: string
  description: string
}>()

const api = useApi()
const config = useRuntimeConfig()
const apiUrl = computed(() => String(config.public.apiUrl).replace(/\/$/, ''))

const { data, error, status, refresh } = await useAsyncData(
  () => `gallery-${props.type}`,
  async () => {
    const { data: body, error: err } = await api.api.kk.cards.get({
      query: { type: props.type },
    })
    if (err) throw err
    return (body?.cards ?? []) as CardListItem[]
  },
  { watch: [() => props.type] },
)

const cards = computed(() => data.value ?? [])

const gridClass = computed(() =>
  props.type === 'scene'
    ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'
    : 'grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4',
)
</script>

<template>
  <main class="mx-auto w-full max-w-6xl px-6 py-10">
    <header class="mb-8 space-y-2">
      <M3Label>Library</M3Label>
      <h1 class="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[var(--m3-on-surface)] sm:text-4xl">
        {{ title }}
      </h1>
      <p class="m3-body-md max-w-xl text-[var(--m3-on-surface-variant)]">
        {{ description }}
      </p>
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
      No cards yet.
    </p>

    <div
      v-else
      :class="gridClass"
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
