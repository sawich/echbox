<template>
  <div class="ed-atmosphere flex min-h-dvh flex-col">
    <AppNav />
    <div class="ed-page-enter flex-1">
      <slot />
    </div>
    <footer class="border-t border-default">
      <div class="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-dimmed sm:px-6">
        <span>echbox · Koikatsu community library</span>
        <NuxtLink
          to="/uikit"
          class="inline-flex items-center gap-1.5 transition-colors hover:text-highlighted"
        >
          <UIcon
            name="i-lucide-swatch-book"
            class="size-4"
          />
          UI kit
        </NuxtLink>
      </div>
    </footer>
  </div>
</template>
