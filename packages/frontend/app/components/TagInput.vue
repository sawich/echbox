<script setup lang="ts">
import {
  TAG_FILTER_DEBOUNCE_MS,
  commitTagChip,
  emptyTagFilter,
  enterTagFilter,
  forceApply,
  normalizeTagDraft,
  removeTagChip,
  typeTagDraft,
  type TagFilterSnapshot,
} from '~/utils/tag-filter'

const props = withDefaults(defineProps<{
  placeholder?: string
}>(), {
  placeholder: 'Filter by tags…',
})

const tags = defineModel<string[]>('tags', { required: true })

const emit = defineEmits<{
  apply: [tags: string[]]
}>()

const api = useApi()

const filter = ref<TagFilterSnapshot>({
  ...emptyTagFilter(),
  selected: [...tags.value],
})
const quiet = ref(0)
const debouncedQuiet = refDebounced(quiet, TAG_FILTER_DEBOUNCE_MS)
const suggestions = ref<{ name: string, category: string, matchedAlias: string | null }[]>([])
const activeIndex = ref(-1)
let suggestToken = 0

function sameTags(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((tag, index) => tag === b[index])
}

function publish(next: TagFilterSnapshot) {
  filter.value = next
  if (!sameTags(tags.value, next.selected)) {
    tags.value = [...next.selected]
  }
}

function arm() {
  quiet.value += 1
}

watch(debouncedQuiet, () => {
  if (filter.value.applyAt === null) return
  const next = forceApply(filter.value)
  filter.value = next
  emit('apply', [...next.applied])
})

watch(tags, (next) => {
  if (sameTags(next, filter.value.selected)) return
  filter.value = {
    ...filter.value,
    selected: [...next],
    applyAt: Date.now() + TAG_FILTER_DEBOUNCE_MS,
  }
  arm()
})

function onInput(event: Event) {
  const value = (event.target as HTMLInputElement).value
  publish(typeTagDraft(filter.value, value, Date.now()))
  activeIndex.value = -1
  arm()
}

async function resolveCanonical(normalized: string): Promise<string> {
  const listed = suggestions.value.find(
    tag => tag.name === normalized || tag.matchedAlias === normalized,
  )
  if (listed) return listed.name

  const { data, error } = await api.api.tags({ id: normalized }).get({
    fetch: { credentials: 'include' },
  })
  if (!error && data && 'name' in data && typeof data.name === 'string') {
    return data.name
  }
  return normalized
}

function pick(name: string) {
  publish(commitTagChip(filter.value, Date.now(), name))
  suggestions.value = []
  activeIndex.value = -1
  arm()
}

function remove(name: string) {
  publish(removeTagChip(filter.value, name, Date.now()))
  arm()
}

async function onEnter() {
  const highlighted = suggestions.value[activeIndex.value]
  if (highlighted) {
    pick(highlighted.name)
    return
  }

  const current = filter.value
  if (current.draft.trim() === '') {
    const next = enterTagFilter(current, Date.now())
    publish(next)
    emit('apply', [...next.applied])
    return
  }

  const normalized = normalizeTagDraft(current.draft)
  if (!normalized) return

  publish(commitTagChip(current, Date.now(), normalized))
  suggestions.value = []
  activeIndex.value = -1
  arm()

  const canonical = await resolveCanonical(normalized)
  if (canonical === normalized) return
  if (!filter.value.selected.includes(normalized)) return
  const rest = filter.value.selected.filter(tag => tag !== normalized)
  publish({
    ...filter.value,
    selected: rest.includes(canonical) ? rest : [...rest, canonical],
  })
}

function onFocusOut(event: FocusEvent) {
  const next = event.relatedTarget
  const current = event.currentTarget
  if (next instanceof Node && current instanceof Node && current.contains(next)) return
  suggestions.value = []
  activeIndex.value = -1
}

function onBackspace() {
  if (filter.value.draft !== '') return
  const last = filter.value.selected.at(-1)
  if (last) remove(last)
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

watch(() => normalizeTagDraft(filter.value.draft), async (needle) => {
  const token = ++suggestToken
  if (!needle) {
    suggestions.value = []
    activeIndex.value = -1
    return
  }

  const { data, error } = await api.api.tags.suggest.get({
    query: {
      q: needle,
      ...(tags.value.length > 0 ? { exclude: tags.value.join(',') } : {}),
    },
    fetch: { credentials: 'include' },
  })
  if (token !== suggestToken) return
  if (error || !data || !('tags' in data)) {
    suggestions.value = []
    return
  }

  suggestions.value = data.tags
    .filter(tag => !filter.value.selected.includes(tag.name))
    .map(tag => ({
      name: tag.name,
      category: tag.category,
      matchedAlias: ('matchedAlias' in tag ? tag.matchedAlias : null) ?? null,
    }))
})
</script>

<template>
  <div
    class="relative w-full sm:max-w-xl"
    @focusout="onFocusOut"
  >
    <div
      class="flex min-h-10 flex-wrap items-center gap-1.5 rounded-[var(--radius-md)] bg-default px-2 py-1.5 ring-1 ring-inset ring-accented focus-within:ring-2 focus-within:ring-primary"
    >
      <span
        v-for="tag in filter.selected"
        :key="tag"
        class="inline-flex items-center gap-0.5 rounded-full bg-elevated py-0.5 ps-2 pe-0.5 text-xs font-medium text-highlighted"
      >
        {{ tag }}
        <UButton
          type="button"
          color="neutral"
          variant="link"
          size="xs"
          icon="i-lucide-x"
          :aria-label="`Remove ${tag}`"
          @click="remove(tag)"
        />
      </span>
      <input
        :value="filter.draft"
        type="text"
        role="combobox"
        class="min-w-32 flex-1 bg-transparent py-1 text-sm text-highlighted outline-none placeholder:text-dimmed"
        :placeholder="filter.selected.length === 0 ? props.placeholder : ''"
        :aria-expanded="suggestions.length > 0"
        aria-autocomplete="list"
        aria-label="Tag filter"
        @input="onInput"
        @keydown.enter.prevent="onEnter"
        @keydown.backspace="onBackspace"
        @keydown.escape="suggestions = []"
        @keydown.down.prevent="moveActive(1)"
        @keydown.up.prevent="moveActive(-1)"
      >
    </div>

    <ul
      v-if="suggestions.length > 0"
      role="listbox"
      class="absolute z-20 mt-1 max-h-60 w-full overflow-x-hidden overflow-y-auto rounded-[var(--radius-md)] bg-default p-1 shadow-lg ring-1 ring-inset ring-accented"
    >
      <li
        v-for="(item, index) in suggestions"
        :key="item.matchedAlias ? `${item.matchedAlias}->${item.name}` : item.name"
        role="option"
        :aria-selected="index === activeIndex"
      >
        <button
          type="button"
          class="flex w-full min-w-0 items-center justify-between gap-3 rounded-[calc(var(--radius-md)-2px)] px-2.5 py-1.5 text-left text-sm hover:bg-elevated"
          :class="index === activeIndex ? 'bg-elevated' : ''"
          @mousedown.prevent="pick(item.name)"
        >
          <span class="min-w-0 flex-1 overflow-hidden">
            <span class="block truncate font-medium text-highlighted">
              {{ item.matchedAlias ?? item.name }}
            </span>
            <span
              v-if="item.matchedAlias"
              class="block truncate text-xs text-dimmed"
            >
              Alias → {{ item.name }}
            </span>
          </span>
          <span class="shrink-0 text-xs text-dimmed capitalize">{{ item.category }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>
