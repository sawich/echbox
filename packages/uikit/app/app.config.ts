export default defineAppConfig({
  ui: {
    colors: {
      primary: 'ember',
      secondary: 'iris',
      tertiary: 'jade',
      success: 'jade',
      info: 'iris',
      warning: 'amber',
      error: 'crimson',
      neutral: 'graphite',
    },
    button: {
      slots: {
        base: [
          'rounded-full font-medium',
          'transition-[background-color,box-shadow,color,transform] duration-200 ease-[var(--ed-ease-emphasized)]',
          'active:scale-[0.97]',
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
            'shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_1px_2px_rgb(0_0_0/0.18),0_6px_20px_-8px_var(--ed-primary)]',
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
        root: 'rounded-[var(--radius-xl)] bg-[var(--ed-surface-container)] ring-1 ring-[var(--ed-outline-variant)] shadow-[var(--ed-shadow-card)] overflow-hidden',
        header: 'p-4 sm:px-6',
        body: 'p-4 sm:p-6',
        footer: 'p-4 sm:px-6',
      },
    },
    input: {
      slots: {
        base: 'rounded-[var(--radius-md)] bg-[var(--ed-surface-container-high)] ring-[var(--ed-outline-variant)] focus-visible:ring-[var(--ed-primary)] transition-shadow',
      },
    },
    textarea: {
      slots: {
        base: 'rounded-[var(--radius-md)] bg-[var(--ed-surface-container-high)] ring-[var(--ed-outline-variant)] focus-visible:ring-[var(--ed-primary)] transition-shadow',
      },
    },
    select: {
      slots: {
        base: 'rounded-[var(--radius-md)] bg-[var(--ed-surface-container-high)] ring-[var(--ed-outline-variant)]',
      },
    },
    fileUpload: {
      slots: {
        base: 'rounded-[var(--radius-lg)] border-[var(--ed-outline)] bg-[var(--ed-surface-container-high)] hover:bg-[color-mix(in_oklab,var(--ed-primary)_6%,var(--ed-surface-container-high))] transition-colors',
      },
    },
    badge: {
      slots: {
        base: 'rounded-full font-medium',
      },
    },
    modal: {
      slots: {
        overlay: 'bg-[color-mix(in_oklab,var(--ed-surface-container-lowest)_70%,transparent)] backdrop-blur-sm',
        content:
          'rounded-[var(--radius-2xl)] bg-[var(--ed-surface-container)] ring-1 ring-[var(--ed-outline-variant)] shadow-[var(--ed-shadow-lift)]',
      },
    },
    dropdownMenu: {
      slots: {
        content: 'rounded-[var(--radius-lg)] bg-[var(--ed-surface-container)] ring-[var(--ed-outline-variant)] shadow-[var(--ed-shadow-lift)]',
        item: 'rounded-[var(--radius-sm)]',
      },
    },
    toast: {
      slots: {
        root: 'rounded-[var(--radius-lg)] bg-[var(--ed-surface-container-high)] ring-1 ring-[var(--ed-outline-variant)]',
      },
    },
    alert: {
      slots: {
        root: 'rounded-[var(--radius-lg)]',
      },
    },
    empty: {
      slots: {
        root: 'rounded-[var(--radius-xl)]',
      },
    },
    skeleton: {
      base: 'rounded-[var(--radius-md)] bg-[var(--ed-surface-container-high)]',
    },
  },
})
