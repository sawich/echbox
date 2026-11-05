<script setup lang="ts">
import type { TaggableContentKind } from '@echbox/shared'
import { contentTagsPath } from '~/utils/content-tags'
import { normalizeTagDraft } from '~/utils/tag-filter'

const props = withDefaults(defineProps<{
  kind: TaggableContentKind
  contentId?: string
  readonly?: boolean
}>(), {
  readonly: false,
})

const tags = defineModel<string[]>({ default: () => [] })

const api = useApi()
const config = useRuntimeConfig()
const apiUrl = computed(() => String(config.public.apiUrl).replace(/\/$/, ''))
const { user, login } = useAuth()

const draft = ref('')
const suggestions = ref<{ name: string, category: string }[]>([])
const activeIndex = ref(-1)
const error = ref<string | null>(null)
const busy = ref(false)
const showCreate = ref(false)
const createSeed = ref('')
let suggestToken = 0

async function load() {
  if (!props.contentId) return
  error.value = null
  const res = await fetch(`${apiUrl.value}${contentTagsPath(props.kind, props.contentId)}`, {
    credentials: 'include',
  })
  const body = await res.json().catch(() => null) as { tags?: { name: string }[], error?: string } | null
  if (!res.ok) {
    error.value = body?.error || `Could not load tags (${res.status})`
    return
  }
  tags.value = (body?.tags ?? []).map(tag => tag.name)
}

watch(() => [props.kind, props.contentId] as const, () => {
  void load()
}, { immediate: true })

async function commit(next: string[]) {
  const unique = [...new Set(next)]
  if (!props.contentId) {
    tags.value = unique
    return
  }
  busy.value = true
  error.value = null
  try {
    const res = await fetch(`${apiUrl.value}${contentTagsPath(props.kind, props.contentId)}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tags: unique }),
    })
    const body = await res.json().catch(() => null) as { tags?: { name: string }[], error?: string } | null
    if (!res.ok) {
      error.value = body?.error || `Could not update tags (${res.status})`
      return
    }
    tags.value = (body?.tags ?? []).map(tag => tag.name)
  }
  finally {
    busy.value = false
  }
}

function add(name: string) {
  const normalized = normalizeTagDraft(name)
  draft.value = ''
  suggestions.value = []
  activeIndex.value = -1
  if (!normalized || tags.value.includes(normalized) || props.readonly || busy.value) return
  void commit([...tags.value, normalized])
}

function remove(name: string) {
  if (props.readonly || busy.value) return
  void commit(tags.value.filter(tag => tag !== name))
}

function openCreate() {
  if (!user.value) {
    login()
    return
  }
  createSeed.value = normalizeTagDraft(draft.value) ?? draft.value.trim()
  showCreate.value = true
}

function onCreated(payload: { name: string }) {
  add(payload.name)
}

function onEnter() {
  const highlighted = suggestions.value[activeIndex.value]
  if (highlighted) {
    add(highlighted.name)
    return
  }
  if (!draft.value.trim()) return
  const normalized = normalizeTagDraft(draft.value)
  const exact = suggestions.value.find(tag => tag.name === normalized)
  if (exact) {
    add(exact.name)
    return
  }
  openCreate()
}

function moveActive(step: number) {
  if (suggestions.value.length === 0) return
  const last = suggestions.value.length - 1
  if (activeIndex.value < 0) {
    activeIndex.value = step > 0 ? 0 : last
    return
  }
  activeIndex.value = (activeIndex.value + step + suggestions.value.length) % suggestions.value.length
}

watch(() => normalizeTagDraft(draft.value) ?? '', async (needle) => {
  const token = ++suggestToken
  if (!needle || props.readonly) {
    suggestions.value = []
    activeIndex.value = -1
    return
  }
  const { data, error: err } = await api.api.tags.suggest.get({
    query: {
      q: needle,
      ...(tags.value.length > 0 ? { exclude: tags.value.join(',') } : {}),
    },
    fetch: { credentials: 'include' },
  })
  if (token !== suggestToken) return
  if (err || !data || !('tags' in data)) {
    suggestions.value = []
    return
  }
  const listed = data.tags as { name: string, category: string }[]
  suggestions.value = listed
    .filter(tag => !tags.value.includes(tag.name))
    .map(tag => ({ name: tag.name, category: tag.category }))
})
</script>

<template>
  <div class="space-y-2">
    <div
      v-if="tags.length === 0 && readonly"
      class="text-sm text-muted"
    >
      No tags yet.
    </div>
    <div
      v-else
      class="relative"
    >
      <div class="flex min-h-10 flex-wrap items-center gap-1.5">
        <span
          v-for="tag in tags"
          :key="tag"
          class="inline-flex items-center gap-0.5 rounded-full bg-elevated py-0.5 ps-2 text-xs font-medium text-highlighted"
          :class="readonly ? 'pe-2' : 'pe-0.5'"
        >
          {{ tag }}
          <UButton
            v-if="!readonly"
            type="button"
            color="neutral"
            variant="link"
            size="xs"
            icon="i-lucide-x"
            :aria-label="`Remove ${tag}`"
            :disabled="busy"
            @click="remove(tag)"
          />
        </span>
        <input
          v-if="!readonly"
          v-model="draft"
          type="text"
          role="combobox"
          class="min-w-32 flex-1 bg-transparent py-1 text-sm text-highlighted outline-none placeholder:text-dimmed"
          placeholder="Add a tag…"
          :aria-expanded="suggestions.length > 0"
          aria-autocomplete="list"
          aria-label="Content tags"
          :disabled="busy"
          @keydown.enter.prevent="onEnter"
          @keydown.down.prevent="moveActive(1)"
          @keydown.up.prevent="moveActive(-1)"
          @keydown.escape="suggestions = []"
        >
      </div>
      <ul
        v-if="suggestions.length > 0"
        role="listbox"
        class="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-[var(--radius-md)] bg-default py-1 shadow-lg ring-1 ring-inset ring-accented"
      >
        <li
          v-for="(item, index) in suggestions"
          :key="item.name"
          role="option"
          :aria-selected="index === activeIndex"
        >
          <button
            type="button"
            class="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm hover:bg-elevated"
            :class="index === activeIndex ? 'bg-elevated' : ''"
            @mousedown.prevent="add(item.name)"
          >
            <span class="truncate font-medium text-highlighted">{{ item.name }}</span>
            <span class="shrink-0 text-xs text-dimmed capitalize">{{ item.category }}</span>
          </button>
        </li>
      </ul>
    </div>
    <div
      v-if="!readonly"
      class="flex flex-wrap items-center gap-2"
    >
      <p class="text-xs text-dimmed">
        Only existing tags can be attached. Create new ones with a category first.
      </p>
      <UButton
        type="button"
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-plus"
        :disabled="busy"
        @click="openCreate"
      >
        Create tag…
      </UButton>
    </div>
    <p
      v-if="error"
      class="text-sm text-error"
    >
      {{ error }}
    </p>

    <TagFormModal
      v-model:open="showCreate"
      mode="create"
      :initial-name="createSeed"
      @saved="onCreated"
    />
  </div>
</template>
