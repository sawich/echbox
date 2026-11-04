<script setup lang="ts">
import type { AppTask, AppTaskStatus } from '~/composables/useAppTasks'

useSeoMeta({ title: 'Tasks · echbox' })

const { tasks, runningTasks, clearCompleted } = useAppTasks()

const STATUS_ORDER: Record<AppTaskStatus, number> = {
  running: 0,
  failed: 1,
  succeeded: 2,
}

const sorted = computed(() =>
  [...tasks.value].sort((a, b) => {
    const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    if (byStatus !== 0) return byStatus
    return b.createdAt.localeCompare(a.createdAt)
  }),
)

const hasCompleted = computed(() =>
  tasks.value.some(t => t.status !== 'running'),
)

const summary = computed(() => {
  const running = runningTasks.value.length
  const finished = tasks.value.length - running
  if (running > 0) {
    return finished > 0 ? `${running} running · ${finished} finished` : `${running} running`
  }
  if (tasks.value.length > 0) return 'All finished this session'
  return 'Installs and uninstalls show up here while they run.'
})

function statusIcon(status: AppTaskStatus) {
  switch (status) {
    case 'running':
      return 'i-lucide-loader-circle'
    case 'succeeded':
      return 'i-lucide-check'
    case 'failed':
      return 'i-lucide-x'
  }
}

function statusLabel(task: AppTask) {
  switch (task.status) {
    case 'running':
      return 'Running'
    case 'succeeded':
      return 'Done'
    case 'failed':
      return task.error || 'Failed'
  }
}

function statusClass(status: AppTaskStatus) {
  switch (status) {
    case 'running':
      return 'bg-primary/15 text-primary'
    case 'succeeded':
      return 'bg-success/15 text-success'
    case 'failed':
      return 'bg-error/15 text-error'
  }
}
</script>

<template>
  <main class="ed-page-enter mx-auto w-full max-w-3xl space-y-6 px-5 py-6 sm:px-8 sm:py-7">
    <PageHeader
      eyebrow="Desktop"
      icon="i-lucide-list-todo"
      title="Tasks"
      :description="summary"
      :count="runningTasks.length > 0 ? runningTasks.length : null"
    >
      <template
        v-if="hasCompleted"
        #actions
      >
        <UButton
          color="neutral"
          variant="soft"
          size="sm"
          icon="i-lucide-eraser"
          @click="clearCompleted"
        >
          Clear completed
        </UButton>
      </template>
    </PageHeader>

    <UEmpty
      v-if="sorted.length === 0"
      icon="i-lucide-list-todo"
      title="No tasks yet"
      description="Start an install from Library or Store and it will appear here."
      variant="soft"
      class="py-14"
    />

    <ul
      v-else
      class="ed-card ed-list ed-stagger overflow-hidden"
    >
      <li
        v-for="task in sorted"
        :key="task.id"
        class="flex items-start gap-3 px-4 py-3"
      >
        <span
          class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-[var(--radius-md)]"
          :class="statusClass(task.status)"
        >
          <UIcon
            :name="statusIcon(task.status)"
            class="size-4"
            :class="task.status === 'running' ? 'animate-spin' : ''"
          />
        </span>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-highlighted">
            {{ task.title }}
          </p>
          <p
            v-if="task.subtitle"
            class="mt-0.5 truncate text-xs text-muted"
          >
            {{ task.subtitle }}
          </p>
          <p
            class="mt-1 text-xs"
            :class="task.status === 'failed' ? 'text-error' : 'text-dimmed'"
          >
            {{ statusLabel(task) }}
          </p>
        </div>
      </li>
    </ul>
  </main>
</template>
