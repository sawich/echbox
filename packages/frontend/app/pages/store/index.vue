<script setup lang="ts">
import type { GameListItem } from '@echbox/shared'

const api = useApi()
const config = useRuntimeConfig()
const apiUrl = computed(() => String(config.public.apiUrl).replace(/\/$/, ''))
const { isAdmin } = useAuth()
const { isDesktop, listInstalledGames, installGame } = useLocalInstalls()
const router = useRouter()

const installed = ref<Set<string>>(new Set())
const busyId = ref<string | null>(null)
const actionError = ref<string | null>(null)

const showCreate = ref(false)
const createTitle = ref('')
const createSlug = ref('')
const createDescription = ref('')
const createBusy = ref(false)
const createError = ref<string | null>(null)

const { data, error, status, refresh } = await useAsyncData('store-games', async () => {
  const { data: body, error: err } = await api.api.games.get()
  if (err) throw err
  return (body?.games ?? []) as GameListItem[]
})

const games = computed(() => data.value ?? [])

async function refreshInstalled() {
  if (!isDesktop.value) {
    installed.value = new Set()
    return
  }
  installed.value = new Set(await listInstalledGames())
}

onMounted(() => {
  void refreshInstalled()
})

async function onInstall(game: GameListItem) {
  if (!isDesktop.value) {
    actionError.value = 'Install is only available in the desktop app'
    return
  }
  busyId.value = game.id
  actionError.value = null
  try {
    await installGame(game.id)
    await refreshInstalled()
  }
  catch (err) {
    actionError.value = err instanceof Error ? err.message : 'Install failed'
  }
  finally {
    busyId.value = null
  }
}

async function onOpen(game: GameListItem) {
  await router.push(`/library/${game.id}`)
}

async function submitCreate() {
  if (!createTitle.value.trim() || createBusy.value) return
  createBusy.value = true
  createError.value = null
  try {
    const body: { title: string, slug?: string, description?: string | null } = {
      title: createTitle.value.trim(),
      description: createDescription.value.trim() || null,
    }
    const slug = createSlug.value.trim()
    if (slug) body.slug = slug

    const res = await fetch(`${apiUrl.value}/api/games`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    })
    const payload = await res.json().catch(() => null) as { error?: string, id?: string } | null
    if (!res.ok) {
      createError.value = payload?.error || `Create failed (${res.status})`
      return
    }
    showCreate.value = false
    createTitle.value = ''
    createSlug.value = ''
    createDescription.value = ''
    await refresh()
  }
  catch (err) {
    createError.value = err instanceof Error ? err.message : 'Create failed'
  }
  finally {
    createBusy.value = false
  }
}
</script>

<template>
  <main class="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 sm:py-12">
    <PageHeader
      eyebrow="Store"
      icon="i-lucide-store"
      title="Store"
      description="Browse games and install them into your local library."
      :count="status === 'success' ? games.length : null"
    >
      <template #actions>
        <UModal
          v-if="isAdmin"
          v-model:open="showCreate"
          title="Add game"
          description="Admin-only. Creates a catalog entry users can install."
          :ui="{ content: 'sm:max-w-lg' }"
        >
          <UButton
            icon="i-lucide-plus"
            color="primary"
            size="lg"
          >
            Add game
          </UButton>
          <template #body>
            <form
              id="create-game-form"
              class="grid gap-4"
              @submit.prevent="submitCreate"
            >
              <UFormField
                label="Title"
                required
              >
                <UInput
                  v-model="createTitle"
                  required
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="Slug"
                hint="Optional"
              >
                <UInput
                  v-model="createSlug"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="Description"
                hint="Optional"
              >
                <UTextarea
                  v-model="createDescription"
                  :rows="3"
                  class="w-full"
                />
              </UFormField>
              <UAlert
                v-if="createError"
                color="error"
                variant="subtle"
                :title="createError"
              />
            </form>
          </template>
          <template #footer="{ close }">
            <div class="flex w-full justify-end gap-2">
              <UButton
                variant="ghost"
                color="neutral"
                @click="close()"
              >
                Cancel
              </UButton>
              <UButton
                type="submit"
                form="create-game-form"
                color="primary"
                :loading="createBusy"
                :disabled="!createTitle.trim()"
              >
                Create
              </UButton>
            </div>
          </template>
        </UModal>
      </template>
    </PageHeader>

    <UAlert
      v-if="!isDesktop"
      color="neutral"
      variant="subtle"
      icon="i-lucide-monitor"
      title="Install requires the desktop app"
      description="You can browse the store in the browser; installing games writes ~/.echbox on desktop."
    />

    <UAlert
      v-if="actionError"
      color="error"
      variant="subtle"
      :title="actionError"
    />

    <GallerySkeleton
      v-if="status === 'pending'"
      variant="landscape"
      :count="4"
    />
    <LoadError
      v-else-if="error"
      title="Could not load store"
      :message="error.message"
      @retry="refresh()"
    />
    <UEmpty
      v-else-if="games.length === 0"
      icon="i-lucide-store"
      title="No games yet"
      :description="isAdmin ? 'Add the first game.' : 'Check back later.'"
      variant="soft"
      class="py-16"
    />
    <div
      v-else
      class="ed-stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <article
        v-for="game in games"
        :key="game.id"
        class="ed-card flex flex-col gap-4 p-5"
      >
        <div class="space-y-1">
          <h2 class="text-lg font-semibold text-highlighted">
            {{ game.title }}
          </h2>
          <p class="text-xs font-mono text-dimmed">
            {{ game.slug }}
          </p>
          <p
            v-if="game.description"
            class="text-sm text-muted"
          >
            {{ game.description }}
          </p>
        </div>
        <div class="mt-auto flex flex-wrap gap-2">
          <UButton
            v-if="installed.has(game.id)"
            color="primary"
            @click="onOpen(game)"
          >
            Open in Library
          </UButton>
          <UButton
            v-else
            color="primary"
            :loading="busyId === game.id"
            :disabled="!isDesktop"
            @click="onInstall(game)"
          >
            {{ isDesktop ? 'Install' : 'Desktop only' }}
          </UButton>
        </div>
      </article>
    </div>
  </main>
</template>
