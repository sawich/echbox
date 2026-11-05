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

const aliasTarget = ref<TagListItem | null>(null)
const aliasTargetQuery = ref('')
const aliasValue = ref('')
const aliasBusy = ref(false)
const aliasError = ref<string | null>(null)
const aliasSuggestions = ref<TagListItem[]>([])
let aliasSuggestToken = 0

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
      tags: body.tags as TagListItem[],
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

function onFormSaved(payload: { id: string, name: string, category: TagCategory }) {
  if (formMode.value === 'edit') {
    patchTag(payload.id, { name: payload.name, category: payload.category })
    return
  }
  void refresh()
}

function selectAliasTarget(tag: TagListItem) {
  aliasTarget.value = tag
  aliasTargetQuery.value = tag.name
  aliasSuggestions.value = []
  aliasError.value = null
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
    if (aliasTarget.value?.id === tag.id) aliasTarget.value = null
    await refresh()
  }
  finally {
    busyId.value = null
  }
}

watch(aliasTargetQuery, async (raw) => {
  const token = ++aliasSuggestToken
  const needle = normalizeTagDraft(raw) ?? raw.trim().toLowerCase()
  if (!needle || (aliasTarget.value && aliasTarget.value.name === needle)) {
    aliasSuggestions.value = []
    return
  }
  const { data: body, error: err } = await api.api.tags.get({
    query: { q: needle, limit: 8, sort: 'name' },
    fetch: { credentials: 'include' },
  })
  if (token !== aliasSuggestToken) return
  if (err || !body || !('tags' in body)) {
    aliasSuggestions.value = []
    return
  }
  aliasSuggestions.value = (body.tags as TagListItem[]).filter(tag => tag.name !== aliasTarget.value?.name)
})

async function submitAlias() {
  if (!user.value) {
    login()
    return
  }
  if (!aliasTarget.value) {
    aliasError.value = 'Pick a tag first'
    return
  }
  const alias = normalizeTagDraft(aliasValue.value)
  if (!alias) {
    aliasError.value = 'Enter an alias'
    return
  }
  aliasBusy.value = true
  aliasError.value = null
  try {
    const { error: err } = await api.api.tags({ id: aliasTarget.value.id }).aliases.post(
      { alias },
      { fetch: { credentials: 'include' } },
    )
    if (err) {
      const val = err.value as { error?: string } | undefined
      aliasError.value = val?.error || (err.status === 409 ? 'That alias is already taken' : `Could not add alias (${err.status})`)
      return
    }
    aliasValue.value = ''
  }
  finally {
    aliasBusy.value = false
  }
}
</script>

<template>
  <main class="ed-page-enter mx-auto w-full max-w-5xl space-y-6 px-5 py-6 sm:px-8 sm:py-7">
    <PageHeader
      eyebrow="Catalog"
      icon="i-lucide-tags"
      title="Tags"
      description="Rate tags, edit metadata, and add aliases."
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

    <div class="lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-6">
      <div class="min-w-0 space-y-4">
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
            class="ed-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
          >
            <div class="min-w-0 flex-1 space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="truncate font-medium text-highlighted">{{ tag.name }}</span>
                <UBadge
                  color="neutral"
                  variant="subtle"
                  size="sm"
                  class="capitalize"
                >
                  {{ tag.category }}
                </UBadge>
              </div>
              <p class="text-xs text-dimmed tabular-nums">
                Score {{ netScore(tag) }}
                <span v-if="typeof tag.usageCount === 'number'"> · used {{ tag.usageCount }}</span>
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
              <UButton
                v-if="user"
                size="sm"
                color="neutral"
                variant="ghost"
                icon="i-lucide-pencil"
                @click="openEdit(tag)"
              >
                Edit
              </UButton>
              <UButton
                v-if="user"
                size="sm"
                color="neutral"
                variant="ghost"
                icon="i-lucide-link"
                @click="selectAliasTarget(tag)"
              >
                Alias
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
      </div>

      <aside
        class="ed-card sticky top-20 mt-6 space-y-4 p-4 lg:mt-0"
        aria-label="Add alias"
      >
        <div>
          <h2 class="text-sm font-semibold text-highlighted">
            Add alias
          </h2>
          <p class="mt-1 text-xs text-dimmed">
            Point a new name at an existing tag without renaming it.
          </p>
        </div>

        <UFormField label="Target tag">
          <div class="relative">
            <UInput
              v-model="aliasTargetQuery"
              placeholder="Search tag…"
              class="w-full font-mono"
              :disabled="!user || aliasBusy"
            />
            <ul
              v-if="aliasSuggestions.length > 0"
              class="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-[var(--radius-md)] bg-default py-1 shadow-lg ring-1 ring-inset ring-accented"
            >
              <li
                v-for="item in aliasSuggestions"
                :key="item.id"
              >
                <button
                  type="button"
                  class="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-elevated"
                  @mousedown.prevent="selectAliasTarget(item)"
                >
                  <span class="truncate font-medium">{{ item.name }}</span>
                  <span class="text-xs text-dimmed capitalize">{{ item.category }}</span>
                </button>
              </li>
            </ul>
          </div>
          <p
            v-if="aliasTarget"
            class="mt-1 text-xs text-dimmed"
          >
            Selected: <span class="font-mono text-highlighted">{{ aliasTarget.name }}</span>
          </p>
        </UFormField>

        <UFormField label="Alias">
          <UInput
            v-model="aliasValue"
            placeholder="blonde hair"
            class="w-full font-mono"
            :disabled="!user || aliasBusy"
            @keydown.enter.prevent="submitAlias"
          />
        </UFormField>

        <UAlert
          v-if="aliasError"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="aliasError"
        />

        <UButton
          block
          color="primary"
          :loading="aliasBusy"
          :disabled="!user"
          @click="submitAlias"
        >
          {{ user ? 'Add alias' : 'Sign in to add' }}
        </UButton>
      </aside>
    </div>

    <TagFormModal
      v-model:open="showForm"
      :mode="formMode"
      :tag-id="editing?.id"
      :initial-name="editing?.name ?? ''"
      :initial-category="editing?.category ?? 'general'"
      @saved="onFormSaved"
    />
  </main>
</template>
