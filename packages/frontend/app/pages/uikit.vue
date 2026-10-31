<script setup lang="ts">
const toast = useToast()

function ping() {
  toast.add({
    title: 'Neon pulse',
    description: 'Material 3 state feedback',
    color: 'primary',
    icon: 'i-lucide-zap',
  })
}
</script>

<template>
  <main class="mx-auto flex w-full max-w-3xl flex-col justify-center gap-10 px-6 py-10">
    <header class="space-y-3">
      <M3Label>echbox · uikit</M3Label>
      <h1 class="m3-display-lg text-[var(--m3-on-surface)]">
        Dark neon
        <span class="text-[var(--m3-primary)]">M3</span>
      </h1>
      <p class="m3-body-md max-w-md text-[var(--m3-on-surface-variant)]">
        Tonal surfaces, role-based color, and restrained neon accents —
        Material 3 on a night field.
      </p>
    </header>

    <M3Surface
      :elev="2"
      neon
      class="space-y-6 p-6 sm:p-8"
    >
      <div class="flex flex-wrap gap-3">
        <UButton
          icon="i-lucide-zap"
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
        <M3Surface
          :elev="3"
          class="p-4"
        >
          <p class="m3-label-md mb-2 text-[var(--m3-primary)]">
            Primary
          </p>
          <p class="m3-title-md text-[var(--m3-on-surface)]">
            Cyan pulse
          </p>
        </M3Surface>
        <M3Surface
          :elev="3"
          class="p-4"
        >
          <p class="m3-label-md mb-2 text-[var(--m3-secondary)]">
            Secondary
          </p>
          <p class="m3-title-md text-[var(--m3-on-surface)]">
            Acid lime
          </p>
        </M3Surface>
        <M3Surface
          :elev="3"
          class="p-4"
        >
          <p class="m3-label-md mb-2 text-[var(--m3-tertiary)]">
            Tertiary
          </p>
          <p class="m3-title-md text-[var(--m3-on-surface)]">
            Hot pink
          </p>
        </M3Surface>
      </div>

      <UInput
        placeholder="M3 outlined field"
        icon="i-lucide-search"
        size="lg"
      />
    </M3Surface>
  </main>
</template>
