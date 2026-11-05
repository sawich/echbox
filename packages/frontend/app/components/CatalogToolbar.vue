<script setup lang="ts">
import { type CatalogSort, catalogSortOptions, taggableCatalogSortOptions } from '~/utils/catalog'

const props = withDefaults(defineProps<{
  placeholder?: string
  /** Hide sort options that depend on votes. */
  ratings?: boolean
  /** `tags` is chip search. `text` keeps the plugin title query. */
  search?: 'tags' | 'text'
}>(), {
  placeholder: 'Search…',
  ratings: true,
  search: 'text',
})

const query = defineModel<string>('query', { default: '' })
const tags = defineModel<string[]>('tags', { default: () => [] })
const sort = defineModel<CatalogSort>('sort', { required: true })

const emit = defineEmits<{
  apply: [tags: string[]]
}>()

const sortOptions = computed(() => {
  const options = props.search === 'tags' ? taggableCatalogSortOptions : catalogSortOptions
  return options.filter(option => props.ratings || option.value !== 'top')
})

watch(() => props.search, (mode) => {
  if (mode === 'tags' && sort.value === 'title') sort.value = 'recent'
}, { immediate: true })
</script>

<template>
  <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
    <TagInput
      v-if="search === 'tags'"
      v-model:tags="tags"
      :placeholder="placeholder"
      @apply="emit('apply', $event)"
    />
    <UInput
      v-else
      v-model="query"
      :placeholder="placeholder"
      icon="i-lucide-search"
      class="w-full sm:max-w-sm"
      :ui="{ trailing: 'pe-1' }"
    >
      <template
        v-if="query"
        #trailing
      >
        <UButton
          color="neutral"
          variant="link"
          size="sm"
          icon="i-lucide-x"
          aria-label="Clear search"
          @click="query = ''"
        />
      </template>
    </UInput>

    <div
      class="ed-segment ed-chrome w-fit sm:ml-auto"
      role="group"
      aria-label="Sort"
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
</template>
