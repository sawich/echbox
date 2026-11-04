<script setup lang="ts">
import { formatRelativeTime, formatShortDate } from '~/utils/format'

useSeoMeta({ title: 'Settings · echbox' })

type ApiKeyRow = {
  id: string
  name: string
  prefix: string
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

const config = useRuntimeConfig()
const apiUrl = computed(() => String(config.public.apiUrl).replace(/\/$/, ''))
const { user, initialized, login } = useAuth()

watch(
  [initialized, user],
  ([ready, u]) => {
    if (!ready) return
    if (!u) {
      login()
    }
  },
  { immediate: true },
)

const keys = ref<ApiKeyRow[]>([])
const listError = ref<string | null>(null)
const listPending = ref(true)

async function refreshKeys() {
  if (!user.value) {
    keys.value = []
    listPending.value = false
    return
  }
  listPending.value = true
  listError.value = null
  try {
    const res = await $fetch<{ keys: ApiKeyRow[] }>(`${apiUrl.value}/api/me/api-keys`, {
      credentials: 'include',
    })
    keys.value = res.keys ?? []
  }
  catch (err) {
    listError.value = err instanceof Error ? err.message : 'Failed to load API keys'
    keys.value = []
  }
  finally {
    listPending.value = false
  }
}

watch(user, () => {
  void refreshKeys()
}, { immediate: true })

const showCreate = ref(false)
const createName = ref('')
const createBusy = ref(false)
const createError = ref<string | null>(null)
const createdSecret = ref<string | null>(null)
const copied = ref(false)

function openCreate() {
  createName.value = ''
  createError.value = null
  createdSecret.value = null
  copied.value = false
  showCreate.value = true
}

watch(showCreate, (open) => {
  if (!open) {
    createName.value = ''
    createError.value = null
    createdSecret.value = null
    copied.value = false
  }
})

async function submitCreate() {
  const name = createName.value.trim()
  if (!name || createBusy.value) return
  createBusy.value = true
  createError.value = null
  try {
    const res = await $fetch<{
      id: string
      name: string
      prefix: string
      key: string
      createdAt: string
    }>(`${apiUrl.value}/api/me/api-keys`, {
      method: 'POST',
      credentials: 'include',
      body: { name },
    })
    createdSecret.value = res.key
    await refreshKeys()
  }
  catch (err) {
    createError.value = err instanceof Error ? err.message : 'Failed to create key'
  }
  finally {
    createBusy.value = false
  }
}

async function copySecret() {
  if (!createdSecret.value) return
  try {
    await navigator.clipboard.writeText(createdSecret.value)
    copied.value = true
  }
  catch {
    copied.value = false
  }
}

const revokeBusyId = ref<string | null>(null)
const revokeError = ref<string | null>(null)

async function revokeKey(id: string) {
  if (revokeBusyId.value) return
  revokeBusyId.value = id
  revokeError.value = null
  try {
    await $fetch(`${apiUrl.value}/api/me/api-keys/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    await refreshKeys()
  }
  catch (err) {
    revokeError.value = err instanceof Error ? err.message : 'Failed to revoke key'
  }
  finally {
    revokeBusyId.value = null
  }
}

const activeKeys = computed(() => keys.value.filter(k => !k.revokedAt))
const revokedKeys = computed(() => keys.value.filter(k => k.revokedAt))
</script>

<template>
  <main class="ed-page-enter mx-auto w-full max-w-3xl space-y-6 px-5 py-6 sm:px-8 sm:py-7">
    <div
      v-if="!initialized || !user"
      class="space-y-4"
      aria-busy="true"
    >
      <USkeleton class="h-8 w-48" />
      <USkeleton class="h-40 w-full rounded-[var(--radius-lg)]" />
    </div>

    <template v-else>
      <PageHeader
        eyebrow="Account"
        icon="i-lucide-settings"
        title="Settings"
        description="Manage API keys for uploading content from your own apps."
      />

      <SectionCard
        title="API keys"
        icon="i-lucide-key-round"
        description="Keys act as your account against the same upload endpoints the app uses."
      >
        <template #actions>
          <UButton
            color="primary"
            size="sm"
            icon="i-lucide-plus"
            @click="openCreate"
          >
            New key
          </UButton>
        </template>

        <div class="space-y-4">
          <p class="text-sm text-muted">
            Send
            <code class="rounded-[var(--radius-xs)] bg-[var(--ed-surface-container-high)] px-1.5 py-0.5 font-mono text-xs text-highlighted">Authorization: Bearer &lt;key&gt;</code>
            to
            <code class="font-mono text-xs">/api/kk/cards</code>,
            <code class="font-mono text-xs">/api/clothes</code>,
            <code class="font-mono text-xs">/api/scenes</code>,
            <code class="font-mono text-xs">/api/plugins</code> and
            <code class="font-mono text-xs">/api/softmods</code>.
            Full reference:
            <a
              :href="`${apiUrl}/openapi`"
              target="_blank"
              rel="noopener noreferrer"
              class="font-medium text-primary underline-offset-2 hover:underline"
            >OpenAPI docs</a>.
          </p>

          <p
            v-if="listError"
            class="text-sm text-error"
          >
            {{ listError }}
          </p>
          <p
            v-if="revokeError"
            class="text-sm text-error"
          >
            {{ revokeError }}
          </p>

          <div
            v-if="listPending"
            class="space-y-2"
          >
            <USkeleton
              v-for="n in 2"
              :key="n"
              class="h-16 w-full rounded-[var(--radius-md)]"
            />
          </div>

          <UEmpty
            v-else-if="activeKeys.length === 0"
            icon="i-lucide-key-round"
            title="No API keys"
            description="Create a key for a script or app that uploads content."
            variant="soft"
          />

          <ul
            v-else
            class="ed-list overflow-hidden rounded-[var(--radius-md)] border border-[var(--ed-outline-variant)] bg-[var(--ed-surface-container-low)]"
          >
            <li
              v-for="key in activeKeys"
              :key="key.id"
              class="flex flex-wrap items-center gap-3 px-4 py-3"
            >
              <span class="grid size-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[color-mix(in_oklab,var(--ed-primary)_14%,transparent)] text-primary">
                <UIcon
                  name="i-lucide-key-round"
                  class="size-4"
                />
              </span>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-highlighted">
                  {{ key.name }}
                </p>
                <p class="mt-0.5 truncate font-mono text-xs text-muted">
                  {{ key.prefix }}…
                </p>
                <p class="mt-1 text-xs text-dimmed">
                  Created
                  <time :datetime="key.createdAt">{{ formatShortDate(key.createdAt) }}</time>
                  <template v-if="key.lastUsedAt">
                    · Last used
                    <time
                      :datetime="key.lastUsedAt"
                      :title="formatShortDate(key.lastUsedAt)"
                    >{{ formatRelativeTime(key.lastUsedAt) }}</time>
                  </template>
                  <template v-else>
                    · Never used
                  </template>
                </p>
              </div>
              <UButton
                color="error"
                variant="soft"
                size="sm"
                :loading="revokeBusyId === key.id"
                @click="revokeKey(key.id)"
              >
                Revoke
              </UButton>
            </li>
          </ul>

          <div
            v-if="revokedKeys.length > 0"
            class="pt-2"
          >
            <h3 class="ed-eyebrow mb-2 text-dimmed">
              Revoked
            </h3>
            <ul class="space-y-1 text-sm text-dimmed">
              <li
                v-for="key in revokedKeys"
                :key="key.id"
                class="flex justify-between gap-2"
              >
                <span class="truncate">{{ key.name }} ({{ key.prefix }}…)</span>
                <span class="shrink-0">revoked</span>
              </li>
            </ul>
          </div>
        </div>
      </SectionCard>
    </template>

    <UModal
      v-model:open="showCreate"
      :title="createdSecret ? 'Copy your API key' : 'New API key'"
      :description="createdSecret
        ? 'This secret is shown only once. Store it somewhere safe.'
        : 'Name the app or script that will use this key.'"
      :ui="{ content: 'sm:max-w-md' }"
    >
      <span class="hidden" />
      <template #body>
        <template v-if="!createdSecret">
          <UFormField
            label="Name"
            name="name"
          >
            <UInput
              v-model="createName"
              placeholder="My uploader"
              autofocus
              class="w-full"
              @keydown.enter.prevent="submitCreate"
            />
          </UFormField>
          <p
            v-if="createError"
            class="mt-2 text-sm text-error"
          >
            {{ createError }}
          </p>
        </template>
        <div
          v-else
          class="rounded-[var(--radius-md)] border border-[var(--ed-outline-variant)] bg-[var(--ed-surface-container-low)] p-3"
        >
          <code class="block break-all font-mono text-xs text-highlighted">
            {{ createdSecret }}
          </code>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <template v-if="!createdSecret">
            <UButton
              color="neutral"
              variant="ghost"
              @click="showCreate = false"
            >
              Cancel
            </UButton>
            <UButton
              color="primary"
              :loading="createBusy"
              :disabled="!createName.trim()"
              @click="submitCreate"
            >
              Create
            </UButton>
          </template>
          <template v-else>
            <UButton
              color="neutral"
              variant="soft"
              :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
              @click="copySecret"
            >
              {{ copied ? 'Copied' : 'Copy' }}
            </UButton>
            <UButton
              color="primary"
              @click="showCreate = false"
            >
              Done
            </UButton>
          </template>
        </div>
      </template>
    </UModal>
  </main>
</template>
