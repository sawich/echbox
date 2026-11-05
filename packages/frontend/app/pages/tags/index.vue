<script setup lang="ts">
import { DEFAULT_PAGE_LIMIT, type CardVoteValue, type TagListItem } from '@echbox/shared'

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

async function vote(tag: TagListItem, next: CardVoteValue | null) {
  if (!user.value) {
    login()
    return
  }
  if (busyId.value) return
  busyId.value = tag.id
  actionError.value = null
  try {
    const { error: err } = await api.api.tags({ id: tag.id }).vote.put(
      { vote: next },
      { fetch: { credentials: 'include' } },
    )
    if (err) {
      const val = err.value as { error?: string } | undefined
      actionError.value = val?.error || `Vote failed (${err.status})`
      return
    }
    await refresh()
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
</script>

<template>
  <main class="ed-page-enter mx-auto w-full max-w-3xl space-y-6 px-5 py-6 sm:px-8 sm:py-7">
    <PageHeader
      eyebrow="Catalog"
      icon="i-lucide-tags"
      title="Tags"
      description="Rate tags so useful ones rise and junk can be removed."
      :count="status === 'success' ? total : null"
    />

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
      v-if="status === 'pending'"
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
      :description="query.trim() ? `Nothing matches “${query}”.` : 'Tags appear when someone attaches them to content.'"
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
      v-if="status === 'success' && tags.length > 0"
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
      v-if="status === 'success' && !user"
      class="text-sm text-muted"
    >
      <button
        type="button"
        class="font-medium text-primary underline-offset-2 hover:underline"
        @click="login"
      >
        Sign in
      </button>
      to like or dislike tags.
    </p>

    <div
      v-if="status === 'success' && total > DEFAULT_PAGE_LIMIT"
      class="flex justify-center pt-2"
    >
      <UPagination
        v-model:page="page"
        :total="total"
        :items-per-page="DEFAULT_PAGE_LIMIT"
      />
    </div>
  </main>
</template>
