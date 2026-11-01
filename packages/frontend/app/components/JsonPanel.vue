<script setup lang="ts">
const props = withDefaults(defineProps<{
  title?: string
  value: unknown
}>(), {
  title: 'Summary',
})

const open = ref(false)
const text = computed(() => JSON.stringify(props.value ?? {}, null, 2))
const { copy, copied } = useClipboard({ copiedDuring: 1500 })
</script>

<template>
  <UCollapsible
    v-model:open="open"
    class="ed-card overflow-hidden"
  >
    <button
      type="button"
      class="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-[var(--ed-surface-container-high)] sm:px-6"
    >
      <span class="grid size-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[var(--ed-surface-container-high)] text-muted">
        <UIcon
          name="i-lucide-braces"
          class="size-4.5"
        />
      </span>
      <span class="flex-1 text-base font-semibold text-highlighted">{{ title }}</span>
      <UIcon
        name="i-lucide-chevron-down"
        class="size-5 text-dimmed transition-transform duration-200"
        :class="open ? 'rotate-180' : ''"
      />
    </button>

    <template #content>
      <div class="relative border-t border-default bg-[var(--ed-surface-container-low)]">
        <UButton
          size="xs"
          color="neutral"
          variant="soft"
          :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
          class="absolute top-3 right-3"
          @click="copy(text)"
        >
          {{ copied ? 'Copied' : 'Copy' }}
        </UButton>
        <pre class="max-h-96 overflow-auto p-5 font-mono text-xs leading-relaxed text-muted sm:px-6">{{ text }}</pre>
      </div>
    </template>
  </UCollapsible>
</template>
