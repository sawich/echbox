<script setup lang="ts">
import type { CardVoteValue } from '@echbox/shared'

const toast = useToast()

function ping() {
  toast.add({
    title: 'Saved',
    description: 'Toast feedback in the graphite theme',
    color: 'primary',
    icon: 'i-lucide-sparkles',
  })
}

const swatches = [
  { name: 'Primary', token: '--ed-primary', label: 'Glacier' },
  { name: 'Secondary', token: '--ed-secondary', label: 'Moss' },
  { name: 'Tertiary', token: '--ed-tertiary', label: 'Moss' },
  { name: 'Error', token: '--ed-error', label: 'Crimson' },
  { name: 'Sidebar', token: '--ed-sidebar', label: 'Chrome' },
  { name: 'Surface', token: '--ed-surface-container', label: 'Harbor' },
]

const demoVote = ref<CardVoteValue | null>('like')
const demoLikes = computed(() => 41 + (demoVote.value === 'like' ? 1 : 0))
const demoDislikes = computed(() => 6 + (demoVote.value === 'dislike' ? 1 : 0))
const demoVersion = ref<string | null>('demo-v2')
const demoQuery = ref('')
const demoSort = ref<'recent' | 'top' | 'title'>('recent')
const demoTab = ref('characters')
const demoTabs = [
  { key: 'characters', label: 'Characters', icon: 'i-lucide-user-round' },
  { key: 'scenes', label: 'Scenes', icon: 'i-lucide-clapperboard' },
  { key: 'plugins', label: 'Plugins', icon: 'i-lucide-puzzle' },
]
const demoNav = ref('library')
const demoNavItems = [
  { key: 'library', label: 'Library', icon: 'i-lucide-library' },
  { key: 'store', label: 'Store', icon: 'i-lucide-store' },
  { key: 'tasks', label: 'Tasks', icon: 'i-lucide-list-todo', badge: 2 },
]
</script>

<template>
  <main class="ed-page-enter mx-auto w-full max-w-5xl space-y-8 px-5 py-6 sm:px-8 sm:py-7">
    <header class="space-y-3">
      <EdLabel>echbox · uikit</EdLabel>
      <h1 class="ed-display-lg text-highlighted">
        Slate <span class="ed-text-gradient">desktop</span>
      </h1>
      <p class="max-w-xl text-sm text-muted">
        Steam-like navy surfaces, a glacier blue accent and moss green for installed
        states. The sidebar stays vertical at every width and collapses to an icon
        rail below 768px. Light and dark follow the system; toggle from the sidebar.
      </p>
    </header>

    <section class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <div
        v-for="swatch in swatches"
        :key="swatch.token"
        class="ed-card overflow-hidden"
      >
        <div
          class="h-14 border-b border-default"
          :style="{ background: `var(${swatch.token})` }"
        />
        <div class="space-y-0.5 p-3">
          <p class="text-sm font-medium text-highlighted">
            {{ swatch.label }}
          </p>
          <p class="font-mono text-[11px] text-dimmed">
            {{ swatch.token }}
          </p>
        </div>
      </div>
    </section>

    <div class="grid gap-5 lg:grid-cols-[15rem_1fr]">
      <SectionCard
        title="Sidebar"
        icon="i-lucide-panel-left"
        class="p-3!"
      >
        <nav
          class="ed-chrome space-y-0.5"
          aria-label="Demo navigation"
        >
          <button
            v-for="item in demoNavItems"
            :key="item.key"
            type="button"
            class="ed-nav-item"
            :class="demoNav === item.key ? 'is-active' : ''"
            @click="demoNav = item.key"
          >
            <UIcon
              :name="item.icon"
              class="ed-nav-icon size-4.5"
            />
            {{ item.label }}
            <span
              v-if="item.badge"
              class="ml-auto grid min-w-5 place-items-center rounded-full bg-[var(--ed-primary)] px-1.5 text-[10px] font-semibold leading-4 text-[var(--ed-on-primary)]"
            >
              {{ item.badge }}
            </span>
          </button>
        </nav>
      </SectionCard>

      <SectionCard
        title="Tabs and segments"
        icon="i-lucide-layout-panel-top"
      >
        <div class="space-y-5">
          <div
            class="-mx-5 flex gap-5 border-b border-[var(--ed-outline-variant)] px-5"
            role="tablist"
          >
            <button
              v-for="t in demoTabs"
              :key="t.key"
              type="button"
              role="tab"
              class="ed-tab"
              :aria-selected="demoTab === t.key"
              @click="demoTab = t.key"
            >
              <UIcon
                :name="t.icon"
                class="size-4"
              />
              {{ t.label }}
            </button>
          </div>
          <CatalogToolbar
            v-model:query="demoQuery"
            v-model:sort="demoSort"
          />
        </div>
      </SectionCard>
    </div>

    <SectionCard
      title="Actions"
      icon="i-lucide-mouse-pointer-click"
    >
      <div class="flex flex-wrap gap-3">
        <UButton
          icon="i-lucide-sparkles"
          @click="ping"
        >
          Primary
        </UButton>
        <UButton
          color="secondary"
          variant="soft"
        >
          Secondary
        </UButton>
        <UButton
          color="primary"
          variant="outline"
        >
          Outline
        </UButton>
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-download"
        >
          Neutral
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
        >
          Ghost
        </UButton>
        <UButton
          color="error"
          variant="soft"
          icon="i-lucide-trash-2"
        >
          Danger
        </UButton>
      </div>
      <div class="mt-4 flex flex-wrap gap-2">
        <UBadge
          color="neutral"
          variant="subtle"
        >
          character
        </UBadge>
        <UBadge
          color="primary"
          variant="subtle"
          icon="i-lucide-history"
        >
          3 versions
        </UBadge>
        <UBadge
          color="secondary"
          variant="subtle"
          icon="i-lucide-badge-check"
        >
          Author
        </UBadge>
        <UBadge
          color="success"
          variant="subtle"
          icon="i-lucide-check"
        >
          Installed
        </UBadge>
        <UBadge color="primary">
          v4
        </UBadge>
      </div>
    </SectionCard>

    <div class="grid gap-5 lg:grid-cols-2">
      <SectionCard
        title="Rating"
        icon="i-lucide-thumbs-up"
      >
        <CardVoteControls
          :likes="demoLikes"
          :dislikes="demoDislikes"
          :my-vote="demoVote"
          interactive
          @vote="demoVote = $event"
        />
      </SectionCard>

      <SectionCard
        title="Versions"
        icon="i-lucide-history"
      >
        <VersionList
          v-model="demoVersion"
          :versions="[
            { id: 'demo-v1', semver: '1.0.0', createdAt: '2026-03-02T10:00:00.000Z', notes: 'Initial release' },
            { id: 'demo-v2', semver: '1.1.0', createdAt: '2026-09-14T18:30:00.000Z', notes: 'New outfit and hair' },
          ]"
        />
      </SectionCard>
    </div>

    <SectionCard
      title="Forms"
      icon="i-lucide-text-cursor-input"
    >
      <div class="space-y-5">
        <div class="grid gap-5 sm:grid-cols-2">
          <UFormField
            label="Title"
            hint="Optional"
          >
            <UInput
              placeholder="Character title"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="With error"
            error="That title is taken"
          >
            <UInput
              model-value="Sakura"
              class="w-full"
            />
          </UFormField>
        </div>
        <UFileUpload
          accept="image/png"
          icon="i-lucide-image-up"
          label="Drop PNG here"
          description="or click to browse"
          layout="list"
          class="min-h-32"
        />
      </div>
    </SectionCard>

    <div class="grid gap-5 lg:grid-cols-2">
      <UEmpty
        icon="i-lucide-images"
        title="No cards yet"
        description="Empty state for galleries."
        variant="soft"
      />
      <DangerZone subject="this demo item" />
    </div>
  </main>
</template>
