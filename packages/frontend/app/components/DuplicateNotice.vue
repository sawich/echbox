<script setup lang="ts">
defineProps<{
  to: string
  label: string
  /** Lead-in before the link. */
  lead?: string
}>()

defineEmits<{ navigate: [] }>()
</script>

<template>
  <UAlert
    color="warning"
    variant="subtle"
    icon="i-lucide-copy-check"
    title="Already uploaded"
  >
    <template #description>
      {{ lead ?? 'This exact file already exists as' }}
      <NuxtLink
        :to="to"
        class="font-medium underline underline-offset-2"
        @click="$emit('navigate')"
      >
        {{ label }}</NuxtLink>.
    </template>
  </UAlert>
</template>
