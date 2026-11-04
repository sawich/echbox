<script setup lang="ts">
import type { UserProfile } from '@echbox/shared'
import { formatShortDate } from '~/utils/format'

const route = useRoute()
const api = useApi()
const config = useRuntimeConfig()
const apiUrl = computed(() => String(config.public.apiUrl).replace(/\/$/, ''))
const { user } = useAuth()

const id = computed(() => String(route.params.id))
const isOwnProfile = computed(() => user.value?.id === id.value)

const { data, error, status, refresh } = await useAsyncData(
  () => `user-${id.value}`,
  async () => {
    const { data: profile, error: err } = await api.api.users({ id: id.value }).get({
      fetch: { credentials: 'include' },
    })
    if (err) throw err
    if (!profile || !('stats' in profile)) throw new Error('User not found')
    return profile as UserProfile
  },
  { watch: [id] },
)

const joinedLabel = computed(() => formatShortDate(data.value?.createdAt))

const tabs = computed(() => {
  const profile = data.value
  if (!profile) return []
  return [
    { label: 'Characters', icon: 'i-lucide-user-round', slot: 'cards' as const, value: 'cards', badge: profile.cards.length },
    { label: 'Scenes', icon: 'i-lucide-clapperboard', slot: 'scenes' as const, value: 'scenes', badge: profile.scenes.length },
    { label: 'Clothes', icon: 'i-lucide-shirt', slot: 'clothes' as const, value: 'clothes', badge: profile.clothes.length },
    { label: 'Plugins', icon: 'i-lucide-puzzle', slot: 'plugins' as const, value: 'plugins', badge: profile.plugins.length },
    { label: 'Softmods', icon: 'i-lucide-package', slot: 'softmods' as const, value: 'softmods', badge: profile.softmods.length },
  ]
})

// Open the first tab that actually has uploads
const activeTab = ref<string>('cards')
watch(tabs, (items) => {
  const firstFilled = items.find(item => item.badge > 0)
  if (firstFilled) activeTab.value = firstFilled.value
}, { immediate: true })

const stats = computed(() => {
  const profile = data.value
  if (!profile) return []
  return [
    { label: 'Uploads', value: profile.stats.uploadCount, icon: 'i-lucide-upload' },
    { label: 'Likes received', value: profile.stats.likesReceived, icon: 'i-lucide-thumbs-up' },
    { label: 'Dislikes received', value: profile.stats.dislikesReceived, icon: 'i-lucide-thumbs-down' },
  ]
})
</script>

<template>
  <main class="ed-page-enter w-full px-5 py-6 sm:px-8 sm:py-7">
    <div
      v-if="status === 'pending'"
      class="space-y-8"
      aria-busy="true"
      aria-label="Loading"
    >
      <div class="flex items-center gap-5">
        <USkeleton class="size-24 rounded-full" />
        <div class="space-y-3">
          <USkeleton class="h-9 w-56" />
          <USkeleton class="h-4 w-32" />
        </div>
      </div>
      <div class="grid gap-4 sm:grid-cols-3">
        <USkeleton
          v-for="n in 3"
          :key="n"
          class="h-24 rounded-[var(--radius-xl)]"
        />
      </div>
      <GallerySkeleton :count="5" />
    </div>

    <LoadError
      v-else-if="error || !data"
      title="Profile unavailable"
      :message="error?.message || 'User not found'"
      @retry="refresh()"
    />

    <div
      v-else
      class="space-y-10"
    >
      <header class="flex flex-wrap items-center gap-5 sm:gap-6">
        <div class="relative">
          <div class="absolute -inset-1 rounded-full bg-gradient-to-br from-[var(--ed-primary)] to-[var(--ed-secondary)] opacity-80 blur-md" />
          <UAvatar
            :src="data.avatar ?? undefined"
            :alt="data.username"
            :text="data.username.slice(0, 1).toUpperCase()"
            class="relative size-24 text-3xl ring-4 ring-[var(--ed-surface)]"
          />
        </div>
        <div class="min-w-0 space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="ed-headline-md truncate text-highlighted">
              {{ data.username }}
            </h1>
            <UBadge
              v-if="isOwnProfile"
              color="secondary"
              variant="subtle"
            >
              You
            </UBadge>
          </div>
          <p class="inline-flex items-center gap-1.5 text-sm text-muted">
            <UIcon
              name="i-lucide-calendar"
              class="size-4"
            />
            Joined {{ joinedLabel }}
          </p>
        </div>
      </header>

      <section class="grid gap-4 sm:grid-cols-3">
        <div
          v-for="stat in stats"
          :key="stat.label"
          class="ed-card flex items-center gap-4 p-5"
        >
          <span class="grid size-11 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[var(--ed-surface-container-high)] text-muted">
            <UIcon
              :name="stat.icon"
              class="size-5"
            />
          </span>
          <div>
            <p class="text-2xl font-semibold tracking-tight text-highlighted tabular-nums">
              {{ stat.value }}
            </p>
            <p class="text-sm text-muted">
              {{ stat.label }}
            </p>
          </div>
        </div>
      </section>

      <UTabs
        v-model="activeTab"
        :items="tabs"
        variant="link"
        color="primary"
        :ui="{ list: 'overflow-x-auto [scrollbar-width:none]', trigger: 'shrink-0', content: 'pt-6' }"
      >
        <template #cards>
          <UEmpty
            v-if="data.cards.length === 0"
            icon="i-lucide-images"
            title="No characters yet"
            :description="isOwnProfile ? 'Character cards you upload will show up here.' : 'This user has not uploaded any character cards.'"
            variant="soft"
          />
          <div
            v-else
            class="ed-stagger grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
          >
            <CardTile
              v-for="card in data.cards"
              :key="card.id"
              :card="card"
              :api-url="apiUrl"
            />
          </div>
        </template>

        <template #scenes>
          <UEmpty
            v-if="data.scenes.length === 0"
            icon="i-lucide-clapperboard"
            title="No scenes yet"
            :description="isOwnProfile ? 'Studio scenes you upload will show up here.' : 'This user has not uploaded any scenes.'"
            variant="soft"
          />
          <div
            v-else
            class="ed-stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
          >
            <SceneTile
              v-for="scene in data.scenes"
              :key="scene.id"
              :scene="scene"
              :api-url="apiUrl"
            />
          </div>
        </template>

        <template #clothes>
          <UEmpty
            v-if="data.clothes.length === 0"
            icon="i-lucide-shirt"
            title="No clothes yet"
            :description="isOwnProfile ? 'Outfit cards you upload will show up here.' : 'This user has not uploaded any clothes.'"
            variant="soft"
          />
          <div
            v-else
            class="ed-stagger grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
          >
            <ClothesTile
              v-for="item in data.clothes"
              :key="item.id"
              :clothes="item"
              :api-url="apiUrl"
            />
          </div>
        </template>

        <template #plugins>
          <UEmpty
            v-if="data.plugins.length === 0"
            icon="i-lucide-puzzle"
            title="No plugins yet"
            :description="isOwnProfile ? 'BepInEx plugins you upload will show up here.' : 'This user has not uploaded any plugins.'"
            variant="soft"
          />
          <div
            v-else
            class="ed-stagger space-y-3"
          >
            <ModRow
              v-for="plugin in data.plugins"
              :key="plugin.id"
              mod-kind="plugin"
              :item="plugin"
              :api-url="apiUrl"
            />
          </div>
        </template>

        <template #softmods>
          <UEmpty
            v-if="data.softmods.length === 0"
            icon="i-lucide-package"
            title="No softmods yet"
            :description="isOwnProfile ? 'Softmod packages you upload will show up here.' : 'This user has not uploaded any softmods.'"
            variant="soft"
          />
          <div
            v-else
            class="ed-stagger space-y-3"
          >
            <ModRow
              v-for="softmod in data.softmods"
              :key="softmod.id"
              mod-kind="softmod"
              :item="softmod"
              :api-url="apiUrl"
            />
          </div>
        </template>
      </UTabs>
    </div>
  </main>
</template>
