<script setup lang="ts">
const { runningTasks, activeToastTask } = useAppTasks()
const route = useRoute()

const visible = computed(() =>
  runningTasks.value.length > 0 && !route.path.startsWith('/tasks'),
)

const moreCount = computed(() => Math.max(0, runningTasks.value.length - 1))
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="translate-y-2 opacity-0"
    enter-to-class="translate-y-0 opacity-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="translate-y-0 opacity-100"
    leave-to-class="translate-y-2 opacity-0"
  >
    <NuxtLink
      v-if="visible && activeToastTask"
      to="/tasks"
      class="ed-chrome fixed right-4 bottom-4 z-50 flex w-[min(100%-2rem,20rem)] items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--ed-outline-variant)] bg-[var(--ed-surface-container)] p-3 shadow-[var(--ed-shadow-pop)] transition-colors hover:border-[color-mix(in_oklab,var(--ed-primary)_40%,var(--ed-outline-variant))] sm:right-5 sm:bottom-5"
      :aria-label="`Open tasks: ${activeToastTask.title}`"
    >
      <span class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[color-mix(in_oklab,var(--ed-primary)_14%,transparent)] text-primary">
        <UIcon
          name="i-lucide-loader-circle"
          class="size-4 animate-spin"
        />
      </span>
      <span class="min-w-0 flex-1">
        <Transition
          mode="out-in"
          enter-active-class="transition duration-200 ease-out"
          enter-from-class="opacity-0"
          enter-to-class="opacity-100"
          leave-active-class="transition duration-100 ease-in"
          leave-from-class="opacity-100"
          leave-to-class="opacity-0"
        >
          <span
            :key="activeToastTask.id"
            class="block"
          >
            <span class="block truncate text-sm font-medium text-highlighted">
              {{ activeToastTask.title }}
            </span>
            <span
              v-if="activeToastTask.subtitle"
              class="mt-0.5 block truncate text-xs text-muted"
            >
              {{ activeToastTask.subtitle }}
            </span>
          </span>
        </Transition>
        <span
          v-if="moreCount > 0"
          class="mt-1 block text-xs text-dimmed"
        >
          +{{ moreCount }} more running
        </span>
      </span>
      <UIcon
        name="i-lucide-chevron-right"
        class="mt-1 size-4 shrink-0 text-dimmed"
      />
    </NuxtLink>
  </Transition>
</template>
