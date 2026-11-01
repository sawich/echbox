<script setup lang="ts">
defineProps<{
  /** What gets deleted, e.g. "this scene". */
  subject: string
  busy?: boolean
  error?: string | null
}>()

defineEmits<{ confirm: [] }>()

const confirming = ref(false)
</script>

<template>
  <div class="space-y-3 rounded-[var(--radius-lg)] border border-[color-mix(in_oklab,var(--ed-error)_30%,transparent)] bg-[color-mix(in_oklab,var(--ed-error)_5%,transparent)] p-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="space-y-0.5">
        <p class="text-sm font-medium text-highlighted">
          {{ confirming ? 'Are you sure?' : 'Danger zone' }}
        </p>
        <p class="text-sm text-muted">
          {{ confirming
            ? `This permanently removes ${subject} and every version. It cannot be undone.`
            : `Delete ${subject} and all versions permanently.` }}
        </p>
      </div>
      <div class="flex gap-2">
        <template v-if="confirming">
          <UButton
            size="sm"
            color="neutral"
            variant="ghost"
            @click="confirming = false"
          >
            Cancel
          </UButton>
          <UButton
            size="sm"
            color="error"
            icon="i-lucide-trash-2"
            :loading="busy"
            @click="$emit('confirm')"
          >
            Delete forever
          </UButton>
        </template>
        <UButton
          v-else
          size="sm"
          color="error"
          variant="outline"
          icon="i-lucide-trash-2"
          @click="confirming = true"
        >
          Delete
        </UButton>
      </div>
    </div>
    <p
      v-if="error"
      class="text-sm text-error"
    >
      {{ error }}
    </p>
  </div>
</template>
