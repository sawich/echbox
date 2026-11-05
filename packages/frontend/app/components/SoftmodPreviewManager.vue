<script setup lang="ts">
const SOFTMOD_PREVIEW_LIMIT = 3

const props = defineProps<{
  softmodId: string
  previewUrls: string[]
  apiUrl: string
  canEdit: boolean
}>()

const emit = defineEmits<{
  changed: []
}>()

const error = ref<string | null>(null)
const busy = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const slotsLeft = computed(() => Math.max(0, SOFTMOD_PREVIEW_LIMIT - props.previewUrls.length))

function previewId(url: string) {
  return url.split('/').filter(Boolean).at(-1) ?? ''
}

function src(url: string) {
  return `${props.apiUrl}${url}`
}

async function addFile(file: File) {
  if (props.previewUrls.length >= SOFTMOD_PREVIEW_LIMIT) {
    error.value = 'A softmod can have at most 3 preview images.'
    return
  }
  busy.value = true
  error.value = null
  try {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${props.apiUrl}/api/softmods/${encodeURIComponent(props.softmodId)}/previews`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    })
    const body = await res.json().catch(() => null) as { error?: string } | null
    if (!res.ok) {
      error.value = body?.error || `Preview upload failed (${res.status})`
      return
    }
    emit('changed')
  }
  finally {
    busy.value = false
  }
}

async function onPick(event: Event) {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  let count = props.previewUrls.length
  for (const file of files) {
    if (count >= SOFTMOD_PREVIEW_LIMIT) {
      error.value = 'A softmod can have at most 3 preview images.'
      break
    }
    await addFile(file)
    if (error.value) break
    count += 1
  }
}

async function remove(url: string) {
  const id = previewId(url)
  if (!id || busy.value) return
  busy.value = true
  error.value = null
  try {
    const res = await fetch(
      `${props.apiUrl}/api/softmods/${encodeURIComponent(props.softmodId)}/previews/${encodeURIComponent(id)}`,
      { method: 'DELETE', credentials: 'include' },
    )
    const body = await res.json().catch(() => null) as { error?: string } | null
    if (!res.ok) {
      error.value = body?.error || `Could not delete preview (${res.status})`
      return
    }
    emit('changed')
  }
  finally {
    busy.value = false
  }
}

async function move(index: number, delta: number) {
  const nextIndex = index + delta
  if (nextIndex < 0 || nextIndex >= props.previewUrls.length || busy.value) return
  const ordered = [...props.previewUrls]
  const [item] = ordered.splice(index, 1)
  if (!item) return
  ordered.splice(nextIndex, 0, item)
  busy.value = true
  error.value = null
  try {
    const res = await fetch(`${props.apiUrl}/api/softmods/${encodeURIComponent(props.softmodId)}/previews`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderedIds: ordered.map(previewId) }),
    })
    const body = await res.json().catch(() => null) as { error?: string } | null
    if (!res.ok) {
      error.value = body?.error || `Could not reorder previews (${res.status})`
      return
    }
    emit('changed')
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-3">
    <div
      v-if="previewUrls.length === 0"
      class="text-sm text-muted"
    >
      No previews yet.
    </div>
    <ul
      v-else
      class="grid gap-3 sm:grid-cols-3"
    >
      <li
        v-for="(url, index) in previewUrls"
        :key="url"
        class="space-y-2"
      >
        <img
          :src="src(url)"
          alt=""
          class="aspect-video w-full rounded-[var(--radius-md)] object-cover ring-1 ring-default"
        >
        <div
          v-if="canEdit"
          class="flex flex-wrap gap-1"
        >
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-chevron-left"
            :disabled="busy || index === 0"
            aria-label="Move preview earlier"
            @click="move(index, -1)"
          />
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-chevron-right"
            :disabled="busy || index === previewUrls.length - 1"
            aria-label="Move preview later"
            @click="move(index, 1)"
          />
          <UButton
            size="xs"
            color="error"
            variant="ghost"
            icon="i-lucide-trash-2"
            :disabled="busy"
            aria-label="Delete preview"
            @click="remove(url)"
          />
        </div>
      </li>
    </ul>
    <div v-if="canEdit">
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        multiple
        class="sr-only"
        @change="onPick"
      >
      <UButton
        size="sm"
        color="neutral"
        variant="outline"
        icon="i-lucide-image-plus"
        :loading="busy"
        :disabled="slotsLeft === 0"
        @click="fileInput?.click()"
      >
        {{ slotsLeft === 0 ? '3 previews' : `Add preview (${slotsLeft} left)` }}
      </UButton>
    </div>
    <p
      v-if="error"
      class="text-sm text-error"
    >
      {{ error }}
    </p>
  </div>
</template>
