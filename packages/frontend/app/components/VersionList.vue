<script setup lang="ts">
import { compareSemver } from '@echbox/shared'
import { formatRelativeTime, formatShortDate } from '~/utils/format'

type VersionEntry = {
  id: string
  semver: string
  createdAt: string
  notes?: string
}

const props = defineProps<{
  versions: VersionEntry[]
  latestVersionId?: string | null
  deletable?: boolean
  deletingId?: string | null
}>()

const emit = defineEmits<{
  delete: [versionId: string]
}>()

const selected = defineModel<string | null>({ required: true })

const ordered = computed(() =>
  [...props.versions].sort((a, b) => compareSemver(b.semver, a.semver)),
)

const latestId = computed(
  () => props.latestVersionId ?? ordered.value[0]?.id ?? null,
)

const confirmId = ref<string | null>(null)

function requestDelete(versionId: string, event: Event) {
  event.stopPropagation()
  confirmId.value = versionId
}

function cancelDelete(event?: Event) {
  event?.stopPropagation()
  confirmId.value = null
}

function confirmDelete(versionId: string, event: Event) {
  event.stopPropagation()
  confirmId.value = null
  emit('delete', versionId)
}
</script>

<template>
  <ol
    v-if="ordered.length"
    class="relative space-y-1"
  >
    <li
      v-for="ver in ordered"
      :key="ver.id"
    >
      <div
        class="group relative rounded-[var(--radius-md)] transition-colors"
        :class="[
          selected === ver.id
            ? 'bg-[color-mix(in_oklab,var(--ed-primary)_10%,transparent)]'
            : 'hover:bg-[var(--ed-surface-container-high)]',
          deletable
            ? confirmId === ver.id ? 'pr-36' : 'pr-10'
            : '',
        ]"
      >
        <button
          type="button"
          class="flex w-full items-start gap-3 px-3 py-2.5 text-left"
          :aria-current="selected === ver.id ? 'true' : undefined"
          @click="selected = ver.id"
        >
          <span
            class="mt-1.5 size-2.5 shrink-0 rounded-full ring-4 transition-colors"
            :class="selected === ver.id
              ? 'bg-[var(--ed-primary)] ring-[color-mix(in_oklab,var(--ed-primary)_20%,transparent)]'
              : 'bg-[var(--ed-outline)] ring-transparent'"
          />
          <span class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="flex flex-wrap items-center gap-2">
              <span
                class="font-mono text-sm font-medium"
                :class="selected === ver.id ? 'text-primary' : 'text-highlighted'"
              >{{ ver.semver }}</span>
              <UBadge
                v-if="ver.id === latestId"
                size="sm"
                color="neutral"
                variant="subtle"
              >
                latest
              </UBadge>
              <time
                :datetime="ver.createdAt"
                :title="formatShortDate(ver.createdAt)"
                class="ml-auto text-xs text-dimmed"
              >{{ formatRelativeTime(ver.createdAt) }}</time>
            </span>
            <span
              v-if="ver.notes"
              class="text-sm text-pretty text-muted"
            >{{ ver.notes }}</span>
          </span>
        </button>

        <div
          v-if="deletable"
          class="absolute inset-y-0 right-1.5 flex items-center"
        >
          <div
            v-if="confirmId === ver.id"
            class="flex items-center gap-1"
          >
            <UButton
              size="xs"
              color="error"
              variant="soft"
              :loading="deletingId === ver.id"
              :disabled="Boolean(deletingId)"
              @click="confirmDelete(ver.id, $event)"
            >
              Delete
            </UButton>
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              :disabled="Boolean(deletingId)"
              @click="cancelDelete($event)"
            >
              Cancel
            </UButton>
          </div>
          <UButton
            v-else
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-trash-2"
            :disabled="Boolean(deletingId)"
            aria-label="Delete version"
            @click="requestDelete(ver.id, $event)"
          />
        </div>
      </div>
    </li>
  </ol>
  <p
    v-else
    class="px-1 py-2 text-sm text-muted"
  >
    No versions published yet.
  </p>
</template>
