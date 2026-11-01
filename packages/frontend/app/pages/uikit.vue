<script setup lang="ts">
const toast = useToast()

function ping() {
  toast.add({
    title: 'Ink mark',
    description: 'Editorial state feedback',
    color: 'primary',
    icon: 'i-lucide-pen-line',
  })
}
</script>

<template>
  <main class="mx-auto flex w-full max-w-3xl flex-col justify-center gap-8 px-5 py-8 sm:px-6">
    <header class="space-y-2">
      <EdLabel>echbox · uikit</EdLabel>
      <h1 class="ed-display-lg text-[var(--ed-on-surface)]">
        Ink catalog
        <span class="text-[var(--ed-primary)]">tokens</span>
      </h1>
      <p class="ed-body-md max-w-md text-[var(--ed-on-surface-variant)]">
        Dense editorial surfaces, vermillion accent, and caption typography
        for a dark card library.
      </p>
    </header>

    <EdSurface
      :elev="2"
      class="space-y-6 p-5 ring-1 ring-[var(--ed-outline-variant)] sm:p-6"
    >
      <div class="flex flex-wrap gap-3">
        <UButton
          icon="i-lucide-pen-line"
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
          color="tertiary"
          variant="outline"
        >
          Tertiary
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
        >
          Ghost
        </UButton>
      </div>

      <div class="grid gap-3 sm:grid-cols-3">
        <EdSurface
          :elev="3"
          class="p-4"
        >
          <p class="ed-label-md mb-2 text-[var(--ed-primary)]">
            Primary
          </p>
          <p class="ed-title-md text-[var(--ed-on-surface)]">
            Vermillion
          </p>
        </EdSurface>
        <EdSurface
          :elev="3"
          class="p-4"
        >
          <p class="ed-label-md mb-2 text-[var(--ed-secondary)]">
            Secondary
          </p>
          <p class="ed-title-md text-[var(--ed-on-surface)]">
            Parchment
          </p>
        </EdSurface>
        <EdSurface
          :elev="3"
          class="p-4"
        >
          <p class="ed-label-md mb-2 text-[var(--ed-on-surface-variant)]">
            Neutral
          </p>
          <p class="ed-title-md text-[var(--ed-on-surface)]">
            Charcoal ink
          </p>
        </EdSurface>
      </div>

      <UInput
        placeholder="Editorial field"
        icon="i-lucide-search"
        size="lg"
      />
    </EdSurface>
  </main>
</template>
