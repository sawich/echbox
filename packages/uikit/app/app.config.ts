export default defineAppConfig({
  ui: {
    colors: {
      primary: 'vermilion',
      secondary: 'parchment',
      tertiary: 'parchment',
      success: 'parchment',
      info: 'vermilion',
      warning: 'parchment',
      error: 'oxblood',
      neutral: 'ink',
    },
    button: {
      slots: {
        base: [
          'rounded-[var(--radius-md)] font-semibold tracking-wide',
          'transition-[background-color,box-shadow,color,transform] duration-200 ease-[var(--ed-ease-emphasized)]',
          'active:scale-[0.98]',
        ],
      },
      variants: {
        size: {
          md: {
            base: 'px-4 py-2 text-sm gap-2 min-h-9',
          },
          lg: {
            base: 'px-5 py-2.5 text-base gap-2 min-h-11',
          },
        },
      },
      compoundVariants: [
        {
          color: 'primary',
          variant: 'solid',
          class:
            'shadow-[0_0_0_1px_color-mix(in_oklab,var(--ed-primary)_35%,transparent)]',
        },
        {
          color: 'primary',
          variant: 'outline',
          class:
            'ring-1 ring-inset ring-[color-mix(in_oklab,var(--ed-primary)_50%,transparent)] text-[var(--ed-primary)] hover:bg-[color-mix(in_oklab,var(--ed-primary)_calc(var(--ed-state-hover)*100%),transparent)]',
        },
      ],
    },
    card: {
      slots: {
        root: 'rounded-[var(--radius-lg)] bg-[var(--ed-surface-container)] ring-1 ring-[var(--ed-outline-variant)] overflow-hidden',
        header: 'p-4 sm:px-5',
        body: 'p-4 sm:p-5',
        footer: 'p-4 sm:px-5',
      },
    },
    input: {
      slots: {
        base: 'rounded-[var(--radius-sm)] bg-[var(--ed-surface-container-highest)] ring-[var(--ed-outline-variant)] focus-visible:ring-[var(--ed-primary)]',
      },
    },
    textarea: {
      slots: {
        base: 'rounded-[var(--radius-sm)] bg-[var(--ed-surface-container-highest)] ring-[var(--ed-outline-variant)] focus-visible:ring-[var(--ed-primary)]',
      },
    },
    badge: {
      slots: {
        base: 'rounded-[var(--radius-xs)] font-semibold tracking-wide',
      },
    },
    modal: {
      slots: {
        content:
          'rounded-[var(--radius-lg)] bg-[var(--ed-surface-container-high)] ring-1 ring-[var(--ed-outline-variant)]',
      },
    },
    toast: {
      slots: {
        root: 'rounded-[var(--radius-md)] bg-[var(--ed-surface-container-high)] ring-1 ring-[var(--ed-outline-variant)]',
      },
    },
  },
})
