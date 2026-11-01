<script setup lang="ts">
withDefaults(defineProps<{
  title?: string
  message?: string | null
  retry?: boolean
}>(), {
  title: 'Something went wrong',
  message: null,
  retry: true,
})

defineEmits<{ retry: [] }>()
</script>

<template>
  <UEmpty
    icon="i-lucide-cloud-off"
    :title="title"
    :description="message || 'Is the backend running on the API URL?'"
    variant="soft"
    :actions="retry
      ? [{ label: 'Try again', icon: 'i-lucide-rotate-cw', color: 'neutral', variant: 'outline', onClick: () => $emit('retry') }]
      : []"
    class="py-14"
  />
</template>
