<script setup lang="ts">
import type { CardDetail } from '@echbox/shared'
import { galleryAspect } from '~/utils/gallery'

const route = useRoute()
const api = useApi()
const config = useRuntimeConfig()
const apiUrl = computed(() => String(config.public.apiUrl).replace(/\/$/, ''))

const id = computed(() => String(route.params.id))

const { data, error, status } = await useAsyncData(
  () => `card-${id.value}`,
  async () => {
    const { data: card, error: err } = await api.api.kk.cards({ id: id.value }).get()
    if (err) throw err
    if (!card || !('versions' in card)) throw new Error('Card not found')
    return card as CardDetail
  },
  { watch: [id] },
)

const selectedVersion = ref<number | null>(null)

watch(
  data,
  (card) => {
    if (!card) return
    selectedVersion.value = card.latestVersion
  },
  { immediate: true },
)

const active = computed(() => {
  const card = data.value
  if (!card) return null
  const version = selectedVersion.value ?? card.latestVersion
  return card.versions.find((v) => v.version === version) ?? card.versions.at(-1) ?? null
})

const imageSrc = computed(() => {
  if (!active.value) return ''
  return `${apiUrl.value}${active.value.imageUrl}`
})

const previewAspect = computed(() =>
  data.value ? galleryAspect(data.value.type) : galleryAspect('character'),
)

const galleryBackTo = computed(() =>
  data.value?.type === 'scene' ? '/scenes' : '/',
)
</script>

<template>
  <main class="mx-auto w-full max-w-5xl px-6 py-10">
    <div class="mb-6">
      <UButton
        :to="galleryBackTo"
        variant="ghost"
        color="neutral"
        size="sm"
        icon="i-lucide-arrow-left"
      >
        Gallery
      </UButton>
    </div>

    <div
      v-if="status === 'pending'"
      class="m3-body-md text-[var(--m3-on-surface-variant)]"
    >
      Loading card…
    </div>

    <M3Surface
      v-else-if="error || !data"
      :elev="2"
      class="space-y-3 p-6"
    >
      <p class="m3-title-md text-[var(--m3-error)]">
        Card unavailable
      </p>
      <p class="m3-body-md text-[var(--m3-on-surface-variant)]">
        {{ error?.message || 'Not found' }}
      </p>
    </M3Surface>

    <div
      v-else
      class="grid gap-8 lg:grid-cols-[minmax(0,280px)_1fr]"
    >
      <M3Surface
        :elev="2"
        class="overflow-hidden"
      >
        <img
          :src="imageSrc"
          :alt="data.title"
          class="w-full object-cover"
          :class="previewAspect"
        >
      </M3Surface>

      <div class="space-y-6">
        <header class="space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge
              color="neutral"
              variant="subtle"
            >
              {{ data.type }}
            </UBadge>
            <UBadge
              v-if="data.versions.length > 1"
              color="primary"
            >
              {{ data.versions.length }} versions
            </UBadge>
          </div>
          <h1 class="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[var(--m3-on-surface)]">
            {{ data.title }}
          </h1>
          <p class="m3-label-md text-[var(--m3-on-surface-variant)]">
            {{ data.slug }} · {{ data.id }}
          </p>
        </header>

        <section class="space-y-3">
          <h2 class="m3-title-md text-[var(--m3-on-surface)]">
            Versions
          </h2>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="ver in data.versions"
              :key="ver.version"
              size="sm"
              :variant="selectedVersion === ver.version ? 'solid' : 'outline'"
              @click="selectedVersion = ver.version"
            >
              v{{ ver.version }}
            </UButton>
          </div>
          <p
            v-if="active?.notes"
            class="m3-body-md text-[var(--m3-on-surface-variant)]"
          >
            {{ active.notes }}
          </p>
          <p class="m3-label-md text-[var(--m3-on-surface-variant)]">
            {{ active?.createdAt }}
          </p>
        </section>

        <M3Surface
          :elev="1"
          class="space-y-2 overflow-x-auto p-4"
        >
          <h2 class="m3-title-md text-[var(--m3-on-surface)]">
            Summary
          </h2>
          <pre class="m3-body-md max-h-80 overflow-auto font-mono text-xs text-[var(--m3-on-surface-variant)]">{{ JSON.stringify(active?.summary ?? {}, null, 2) }}</pre>
        </M3Surface>
      </div>
    </div>
  </main>
</template>
