<script setup lang="ts">
import { DEFAULT_PAGE_LIMIT, type CardVoteValue, type TagCategory, type TagListItem } from '@echbox/shared'
import { normalizeTagDraft } from '~/utils/tag-filter'

useSeoMeta({ title: 'Tags · echbox' })

const api = useApi()
const { user, isAdmin, login } = useAuth()

const page = ref(1)
const query = ref('')
const debouncedQuery = refDebounced(query, 250)
const sort = ref<'top' | 'recent' | 'name'>('top')
const actionError = ref<string | null>(null)
const busyId = ref<string | null>(null)
const confirmDeleteId = ref<string | null>(null)

const showForm = ref(false)
const formMode = ref<'create' | 'edit'>('create')
const editing = ref<TagListItem | null>(null)

const aliasDrafts = reactive<Record<string, string>>({})
const aliasErrors = reactive<Record<string, string | null>>({})
const openTags = reactive<Record<string, boolean>>({})

const sortOptions = [
  { label: 'Top', value: 'top' as const, icon: 'i-lucide-flame' },
  { label: 'Recent', value: 'recent' as const, icon: 'i-lucide-clock' },
  { label: 'Name', value: 'name' as const, icon: 'i-lucide-arrow-down-a-z' },
]

watch([debouncedQuery, sort], () => {
  page.value = 1
})

const { data, error, status, refresh } = await useAsyncData(
  () => `tags-${page.value}-${debouncedQuery.value}-${sort.value}`,
  async () => {
    const { data: body, error: err } = await api.api.tags.get({
      query: {
        page: page.value,
        limit: DEFAULT_PAGE_LIMIT,
        sort: sort.value,
        ...(debouncedQuery.value.trim() ? { q: debouncedQuery.value.trim() } : {}),
      },
      fetch: { credentials: 'include' },
    })
    if (err) throw err
    if (!body || !('tags' in body)) throw new Error('Could not load tags')
    return {
      tags: (body.tags as TagListItem[]).map(tag => ({
        ...tag,
        aliases: tag.aliases ?? [],
      })),
      total: Number(body.total ?? 0),
    }
  },
  { watch: [page, debouncedQuery, sort] },
)

const tags = computed(() => data.value?.tags ?? [])
const total = computed(() => data.value?.total ?? 0)

function netScore(tag: TagListItem) {
  return tag.likes - tag.dislikes
}

function patchTag(id: string, patch: Partial<TagListItem>) {
  if (!data.value) return
  data.value = {
    ...data.value,
    tags: data.value.tags.map(tag => tag.id === id ? { ...tag, ...patch } : tag),
  }
}

function openCreate() {
  if (!user.value) {
    login()
    return
  }
  formMode.value = 'create'
  editing.value = null
  showForm.value = true
}

function openEdit(tag: TagListItem) {
  if (!user.value) {
    login()
    return
  }
  formMode.value = 'edit'
  editing.value = tag
  showForm.value = true
}

function onFormSaved(payload: { id: string, name: string, category: TagCategory, aliases: string[] }) {
  if (formMode.value === 'edit') {
    patchTag(payload.id, {
      name: payload.name,
      category: payload.category,
      aliases: payload.aliases,
    })
    return
  }
  void refresh()
}

async function vote(tag: TagListItem, next: CardVoteValue | null) {
  if (!user.value) {
    login()
    return
  }
  if (busyId.value) return
  busyId.value = tag.id
  actionError.value = null
  try {
    const { data: body, error: err } = await api.api.tags({ id: tag.id }).vote.put(
      { vote: next },
      { fetch: { credentials: 'include' } },
    )
    if (err || !body || !('likes' in body)) {
      const val = err?.value as { error?: string } | undefined
      actionError.value = val?.error || `Vote failed (${err?.status ?? 'unknown'})`
      return
    }
    patchTag(tag.id, {
      likes: body.likes as number,
      dislikes: body.dislikes as number,
      myVote: body.myVote as CardVoteValue | null,
    })
  }
  finally {
    busyId.value = null
  }
}

async function remove(tag: TagListItem) {
  if (!isAdmin.value || busyId.value) return
  if (confirmDeleteId.value !== tag.id) {
    confirmDeleteId.value = tag.id
    return
  }
  busyId.value = tag.id
  actionError.value = null
  try {
    const { error: err } = await api.api.tags({ id: tag.id }).delete(undefined, {
      fetch: { credentials: 'include' },
    })
    if (err) {
      const val = err.value as { error?: string } | undefined
      actionError.value = val?.error || (err.status === 403 ? 'Only admins can delete tags' : `Delete failed (${err.status})`)
      return
    }
    confirmDeleteId.value = null
    await refresh()
  }
  finally {
    busyId.value = null
  }
}

async function addAlias(tag: TagListItem) {
  if (!user.value) {
    login()
    return
  }
  const alias = normalizeTagDraft(aliasDrafts[tag.id] ?? '')
  if (!alias) {
    aliasErrors[tag.id] = 'Enter an alias'
    return
  }
  if (alias === tag.name || (tag.aliases ?? []).includes(alias)) {
    aliasErrors[tag.id] = 'That alias is already on this tag'
    return
  }
  busyId.value = tag.id
  aliasErrors[tag.id] = null
  actionError.value = null
  try {
    const { error: err } = await api.api.tags({ id: tag.id }).aliases.post(
      { alias },
      { fetch: { credentials: 'include' } },
    )
    if (err) {
      const val = err.value as { error?: string } | undefined
      aliasErrors[tag.id] = val?.error || (err.status === 409 ? 'That alias is already taken' : `Could not add alias (${err.status})`)
      return
    }
    aliasDrafts[tag.id] = ''
    patchTag(tag.id, {
      aliases: [...(tag.aliases ?? []), alias].sort((a, b) => a.localeCompare(b)),
    })
  }
  finally {
    busyId.value = null
  }
}

async function removeAlias(tag: TagListItem, alias: string) {
  if (!user.value) {
    login()
    return
  }
  const next = (tag.aliases ?? []).filter(item => item !== alias)
  busyId.value = tag.id
  aliasErrors[tag.id] = null
  actionError.value = null
  try {
    const { data: body, error: err } = await api.api.tags({ id: tag.id }).patch(
      { aliases: next },
      { fetch: { credentials: 'include' } },
    )
    if (err) {
      const val = err.value as { error?: string } | undefined
      aliasErrors[tag.id] = val?.error || `Could not remove alias (${err.status})`
      return
    }
    patchTag(tag.id, {
      aliases: body && 'aliases' in body && Array.isArray(body.aliases)
        ? body.aliases as string[]
        : next,
    })
  }
  finally {
    busyId.value = null
  }
}
</script>

<template>
  <main class="ed-page-enter mx-auto w-full max-w-3xl space-y-6 px-5 py-6 sm:px-8 sm:py-7">
    <PageHeader
      eyebrow="Catalog"
      icon="i-lucide-tags"
      title="Tags"
      description="Expand a tag to manage aliases, ratings, and edits."
      :count="data ? total : null"
    >
      <template
        v-if="user"
        #actions
      >
        <UButton
          icon="i-lucide-plus"
          color="primary"
          @click="openCreate"
        >
          Create tag
        </UButton>
      </template>
    </PageHeader>

    <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
      <UInput
        v-model="query"
        placeholder="Search tags…"
        icon="i-lucide-search"
        class="w-full sm:max-w-sm"
      />
      <div
        class="ed-segment ed-chrome w-fit sm:ml-auto"
        role="group"
        aria-label="Sort tags"
      >
        <button
          v-for="option in sortOptions"
          :key="option.value"
          type="button"
          class="ed-segment-item"
          :aria-pressed="sort === option.value"
          @click="sort = option.value"
        >
          <UIcon
            :name="option.icon"
            class="size-3.5"
          />
          {{ option.label }}
        </button>
      </div>
    </div>

    <GallerySkeleton
      v-if="status === 'pending' && !data"
      variant="row"
      :count="6"
    />

    <LoadError
      v-else-if="error"
      title="Could not load tags"
      :message="error.message"
      @retry="refresh()"
    />

    <UEmpty
      v-else-if="tags.length === 0"
      icon="i-lucide-tags"
      :title="query.trim() ? 'Nothing matches' : 'No tags yet'"
      :description="query.trim() ? `Nothing matches “${query}”.` : 'Tags appear when someone creates them.'"
      variant="soft"
      class="py-16"
    />

    <UAlert
      v-if="actionError"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="actionError"
    />

    <ul
      v-if="tags.length > 0"
      class="ed-stagger space-y-3"
    >
      <li
        v-for="tag in tags"
        :key="tag.id"
      >
        <UCollapsible
          v-model:open="openTags[tag.id]"
          class="ed-card overflow-hidden"
        >
          <button
            type="button"
            class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--ed-surface-container-high)] sm:px-5"
          >
            <span class="min-w-0 flex-1 space-y-1">
              <span class="flex flex-wrap items-center gap-2">
                <span class="truncate font-medium text-highlighted">{{ tag.name }}</span>
                <UBadge
                  color="neutral"
                  variant="subtle"
                  size="sm"
                  class="capitalize"
                >
                  {{ tag.category }}
                </UBadge>
              </span>
              <span class="block text-xs text-dimmed tabular-nums">
                Score {{ netScore(tag) }}
                <span v-if="typeof tag.usageCount === 'number'"> · used {{ tag.usageCount }}</span>
                <span> · {{ (tag.aliases ?? []).length }} alias{{ (tag.aliases ?? []).length === 1 ? '' : 'es' }}</span>
              </span>
            </span>
            <UIcon
              name="i-lucide-chevron-down"
              class="size-5 shrink-0 text-dimmed transition-transform duration-200"
              :class="openTags[tag.id] ? 'rotate-180' : ''"
            />
          </button>

          <template #content>
            <div class="space-y-4 border-t border-default bg-[var(--ed-surface-container-low)] px-4 py-4 sm:px-5">
              <div class="space-y-2">
                <div class="flex items-center justify-between gap-2">
                  <h3 class="text-xs font-semibold tracking-wide text-dimmed uppercase">
                    Aliases
                  </h3>
                </div>

                <ul
                  v-if="(tag.aliases ?? []).length > 0"
                  class="flex flex-wrap gap-1.5"
                >
                  <li
                    v-for="alias in tag.aliases"
                    :key="alias"
                    class="inline-flex items-center gap-0.5 rounded-full bg-elevated py-0.5 pe-0.5 ps-2 text-xs font-medium text-highlighted"
                  >
                    <span class="font-mono">{{ alias }}</span>
                    <UButton
                      v-if="user"
                      type="button"
                      color="neutral"
                      variant="link"
                      size="xs"
                      icon="i-lucide-x"
                      :aria-label="`Remove ${alias}`"
                      :disabled="busyId === tag.id"
                      @click="removeAlias(tag, alias)"
                    />
                  </li>
                </ul>
                <p
                  v-else
                  class="text-sm text-muted"
                >
                  No aliases yet.
                </p>

                <div
                  v-if="user"
                  class="flex gap-2"
                >
                  <UInput
                    v-model="aliasDrafts[tag.id]"
                    placeholder="Add alias…"
                    class="w-full font-mono"
                    size="sm"
                    :disabled="busyId === tag.id"
                    @keydown.enter.prevent="addAlias(tag)"
                  />
                  <UButton
                    type="button"
                    color="neutral"
                    variant="outline"
                    size="sm"
                    :loading="busyId === tag.id"
                    :disabled="!(aliasDrafts[tag.id] ?? '').trim()"
                    @click="addAlias(tag)"
                  >
                    Add
                  </UButton>
                </div>
                <p
                  v-if="aliasErrors[tag.id]"
                  class="text-sm text-error"
                >
                  {{ aliasErrors[tag.id] }}
                </p>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <CardVoteControls
                  :likes="tag.likes"
                  :dislikes="tag.dislikes"
                  :my-vote="tag.myVote ?? null"
                  :interactive="Boolean(user)"
                  :busy="busyId === tag.id"
                  size="sm"
                  @vote="vote(tag, $event)"
                />
                <div class="ms-auto flex flex-wrap items-center gap-2">
                  <UButton
                    v-if="user"
                    size="sm"
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-pencil"
                    :disabled="busyId === tag.id"
                    @click="openEdit(tag)"
                  >
                    Edit
                  </UButton>
                  <UButton
                    v-if="isAdmin"
                    size="sm"
                    color="error"
                    :variant="confirmDeleteId === tag.id ? 'solid' : 'ghost'"
                    :icon="confirmDeleteId === tag.id ? 'i-lucide-trash-2' : 'i-lucide-trash'"
                    :loading="busyId === tag.id"
                    @click="remove(tag)"
                  >
                    {{ confirmDeleteId === tag.id ? 'Confirm delete' : 'Delete' }}
                  </UButton>
                </div>
              </div>
            </div>
          </template>
        </UCollapsible>
      </li>
    </ul>

    <p
      v-if="data && !user"
      class="text-sm text-muted"
    >
      <button
        type="button"
        class="font-medium text-primary underline-offset-2 hover:underline"
        @click="login"
      >
        Sign in
      </button>
      to create, edit, or vote on tags.
    </p>

    <div
      v-if="data && total > DEFAULT_PAGE_LIMIT"
      class="flex justify-center pt-2"
    >
      <UPagination
        v-model:page="page"
        :total="total"
        :items-per-page="DEFAULT_PAGE_LIMIT"
      />
    </div>

    <TagFormModal
      v-model:open="showForm"
      :mode="formMode"
      :tag-id="editing?.id"
      :initial-name="editing?.name ?? ''"
      :initial-category="editing?.category ?? 'general'"
      :initial-aliases="editing?.aliases ?? []"
      @saved="onFormSaved"
    />
  </main>
</template>
