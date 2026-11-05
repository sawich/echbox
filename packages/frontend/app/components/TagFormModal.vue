<script setup lang="ts">
import type { TagCategory } from '@echbox/shared'
import { normalizeTagDraft } from '~/utils/tag-filter'

const open = defineModel<boolean>('open', { default: false })

const props = withDefaults(defineProps<{
  mode?: 'create' | 'edit'
  tagId?: string
  initialName?: string
  initialCategory?: TagCategory
  initialAliases?: string[]
}>(), {
  mode: 'create',
  initialName: '',
  initialCategory: 'general',
  initialAliases: () => [],
})

const emit = defineEmits<{
  saved: [payload: { id: string, name: string, category: TagCategory, aliases: string[] }]
}>()

const api = useApi()
const { user, login } = useAuth()

const name = ref('')
const category = ref<TagCategory>('general')
const aliasDraft = ref('')
const aliases = ref<string[]>([])
const aliasesDirty = ref(false)
const error = ref<string | null>(null)
const busy = ref(false)

const categories: { label: string, value: TagCategory }[] = [
  { label: 'Author', value: 'author' },
  { label: 'License', value: 'license' },
  { label: 'Character', value: 'character' },
  { label: 'Franchise', value: 'franchise' },
  { label: 'General', value: 'general' },
]

const title = computed(() => props.mode === 'edit' ? 'Edit tag' : 'Create tag')
const description = computed(() =>
  props.mode === 'edit'
    ? 'Rename, change category, or replace aliases.'
    : 'Choose a category. Names use underscores; aliases are optional.',
)

watch(open, (isOpen) => {
  if (!isOpen) return
  name.value = props.initialName
  category.value = props.initialCategory
  aliases.value = [...props.initialAliases]
  aliasDraft.value = ''
  aliasesDirty.value = false
  error.value = null
})

function addAlias() {
  const normalized = normalizeTagDraft(aliasDraft.value)
  aliasDraft.value = ''
  if (!normalized) return
  if (aliases.value.includes(normalized)) return
  aliases.value = [...aliases.value, normalized]
  aliasesDirty.value = true
}

function removeAlias(alias: string) {
  aliases.value = aliases.value.filter(item => item !== alias)
  aliasesDirty.value = true
}

async function submit() {
  if (!user.value) {
    login()
    return
  }
  const normalizedName = normalizeTagDraft(name.value)
  if (!normalizedName) {
    error.value = 'Enter a tag name'
    return
  }
  busy.value = true
  error.value = null
  try {
    if (props.mode === 'create') {
      const { data, error: err } = await api.api.tags.post(
        { name: normalizedName, category: category.value },
        { fetch: { credentials: 'include' } },
      )
      if (err || !data || !('id' in data)) {
        const val = err?.value as { error?: string } | undefined
        error.value = val?.error || (err?.status === 409 ? 'That tag already exists' : 'Could not create tag')
        return
      }
      let finalAliases = [...aliases.value]
      if (aliases.value.length > 0) {
        const { data: updated, error: patchErr } = await api.api.tags({ id: data.id }).patch(
          { aliases: aliases.value },
          { fetch: { credentials: 'include' } },
        )
        if (patchErr) {
          const val = patchErr.value as { error?: string } | undefined
          error.value = val?.error || 'Tag created, but aliases failed'
          emit('saved', {
            id: data.id,
            name: data.name as string,
            category: data.category as TagCategory,
            aliases: [],
          })
          open.value = false
          return
        }
        if (updated && 'name' in updated) {
          finalAliases = aliases.value
        }
      }
      emit('saved', {
        id: data.id as string,
        name: data.name as string,
        category: data.category as TagCategory,
        aliases: finalAliases,
      })
      open.value = false
      return
    }

    if (!props.tagId) {
      error.value = 'Missing tag id'
      return
    }
    const body: { name?: string, category?: TagCategory, aliases?: string[] } = {
      name: normalizedName,
      category: category.value,
    }
    if (aliasesDirty.value) body.aliases = aliases.value
    const { data, error: err } = await api.api.tags({ id: props.tagId }).patch(
      body,
      { fetch: { credentials: 'include' } },
    )
    if (err || !data || !('id' in data)) {
      const val = err?.value as { error?: string } | undefined
      error.value = val?.error || (err?.status === 409 ? 'That name or alias is already taken' : 'Could not update tag')
      return
    }
    emit('saved', {
      id: data.id as string,
      name: data.name as string,
      category: data.category as TagCategory,
      aliases: aliasesDirty.value ? [...aliases.value] : [...props.initialAliases],
    })
    open.value = false
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="title"
    :description="description"
    :ui="{ content: 'sm:max-w-md' }"
  >
    <template #body>
      <form
        id="tag-form-modal"
        class="grid gap-4"
        @submit.prevent="submit"
      >
        <UFormField
          label="Name"
          required
        >
          <UInput
            v-model="name"
            placeholder="blonde_hair"
            class="w-full font-mono"
            :disabled="busy"
          />
        </UFormField>

        <UFormField
          label="Category"
          required
        >
          <USelect
            v-model="category"
            :items="categories"
            value-key="value"
            class="w-full"
            :disabled="busy"
          />
        </UFormField>

        <UFormField
          label="Aliases"
          hint="Optional"
        >
          <div class="space-y-2">
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="alias in aliases"
                :key="alias"
                class="inline-flex items-center gap-0.5 rounded-full bg-elevated py-0.5 pe-0.5 ps-2 text-xs font-medium text-highlighted"
              >
                {{ alias }}
                <UButton
                  type="button"
                  color="neutral"
                  variant="link"
                  size="xs"
                  icon="i-lucide-x"
                  :aria-label="`Remove ${alias}`"
                  :disabled="busy"
                  @click="removeAlias(alias)"
                />
              </span>
            </div>
            <div class="flex gap-2">
              <UInput
                v-model="aliasDraft"
                placeholder="Add alias…"
                class="w-full font-mono"
                :disabled="busy"
                @keydown.enter.prevent="addAlias"
              />
              <UButton
                type="button"
                color="neutral"
                variant="outline"
                :disabled="busy || !aliasDraft.trim()"
                @click="addAlias"
              >
                Add
              </UButton>
            </div>
          </div>
        </UFormField>

        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="error"
        />
      </form>
    </template>

    <template #footer="{ close }">
      <div class="flex w-full justify-end gap-2">
        <UButton
          type="button"
          variant="ghost"
          color="neutral"
          :disabled="busy"
          @click="close()"
        >
          Cancel
        </UButton>
        <UButton
          type="submit"
          form="tag-form-modal"
          color="primary"
          :loading="busy"
        >
          {{ mode === 'edit' ? 'Save' : 'Create' }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
