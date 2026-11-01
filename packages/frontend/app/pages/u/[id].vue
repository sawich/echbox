<script setup lang="ts">
import type { UserProfile } from '@echbox/shared'

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

const joinedLabel = computed(() => {
  if (!data.value?.createdAt) return ''
  try {
    return new Date(data.value.createdAt).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }
  catch {
    return data.value.createdAt
  }
})
</script>

<template>
  <main class="mx-auto w-full max-w-6xl px-5 py-7 sm:px-6 sm:py-8">
    <div
      v-if="status === 'pending'"
      class="ed-body-md text-[var(--ed-on-surface-variant)]"
    >
      Loading profile…
    </div>

    <EdSurface
      v-else-if="error || !data"
      :elev="2"
      class="space-y-3 p-6"
    >
      <p class="ed-title-md text-[var(--ed-error)]">
        Profile unavailable
      </p>
      <p class="ed-body-md text-[var(--ed-on-surface-variant)]">
        {{ error?.message || 'User not found' }}
      </p>
      <UButton
        size="sm"
        @click="refresh()"
      >
        Retry
      </UButton>
    </EdSurface>

    <div
      v-else
      class="space-y-10"
    >
      <header class="flex flex-wrap items-center gap-5">
        <img
          v-if="data.avatar"
          :src="data.avatar"
          :alt="data.username"
          class="size-20 rounded-[var(--radius-sm)] object-cover ring-2 ring-[var(--ed-outline-variant)]"
        >
        <div
          v-else
          class="flex size-20 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--ed-surface-container-highest)] ed-title-md text-[var(--ed-on-surface-variant)]"
        >
          {{ data.username.slice(0, 1).toUpperCase() }}
        </div>
        <div class="space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[var(--ed-on-surface)]">
              {{ data.username }}
            </h1>
            <UBadge
              v-if="isOwnProfile"
              color="secondary"
              variant="soft"
            >
              You
            </UBadge>
          </div>
          <p class="ed-label-md text-[var(--ed-on-surface-variant)]">
            Joined {{ joinedLabel }}
          </p>
        </div>
      </header>

      <section class="grid gap-4 sm:grid-cols-3">
        <EdSurface
          :elev="1"
          class="space-y-1 p-4"
        >
          <p class="ed-label-md text-[var(--ed-on-surface-variant)]">
            Uploads
          </p>
          <p class="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--ed-on-surface)]">
            {{ data.stats.uploadCount }}
          </p>
        </EdSurface>
        <EdSurface
          :elev="1"
          class="space-y-1 p-4"
        >
          <p class="ed-label-md text-[var(--ed-on-surface-variant)]">
            Likes received
          </p>
          <p class="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--ed-on-surface)]">
            {{ data.stats.likesReceived }}
          </p>
        </EdSurface>
        <EdSurface
          :elev="1"
          class="space-y-1 p-4"
        >
          <p class="ed-label-md text-[var(--ed-on-surface-variant)]">
            Dislikes received
          </p>
          <p class="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--ed-on-surface)]">
            {{ data.stats.dislikesReceived }}
          </p>
        </EdSurface>
      </section>

      <section class="space-y-4">
        <div class="space-y-1">
          <h2 class="ed-title-md text-[var(--ed-on-surface)]">
            Uploaded characters
          </h2>
          <p class="ed-body-md text-[var(--ed-on-surface-variant)]">
            {{ isOwnProfile ? 'Your character cards on echbox.' : 'Character cards uploaded by this user.' }}
          </p>
        </div>

        <p
          v-if="data.cards.length === 0"
          class="ed-body-md text-[var(--ed-on-surface-variant)]"
        >
          No uploads yet.
        </p>

        <div
          v-else
          class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
        >
          <CardTile
            v-for="card in data.cards"
            :key="card.id"
            :card="card"
            :api-url="apiUrl"
          />
        </div>
      </section>
    </div>
  </main>
</template>
