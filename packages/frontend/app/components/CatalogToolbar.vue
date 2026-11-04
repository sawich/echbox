<script setup lang="ts">
import { type CatalogSort, catalogSortOptions } from '~/utils/catalog'

withDefaults(defineProps<{
  placeholder?: string
  /** Hide sort options that depend on votes. */
  ratings?: boolean
}>(), {
  placeholder: 'Search…',
  ratings: true,
})

const query = defineModel<string>('query', { required: true })
const sort = defineModel<CatalogSort>('sort', { required: true })
</script>

<template>
  <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
    <UInput
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
        v-for="option in catalogSortOptions.filter(o => ratings || o.value !== 'top')"
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
