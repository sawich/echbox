export default defineAppConfig({
  ui: {
    colors: {
      primary: 'glacier',
      secondary: 'moss',
      tertiary: 'moss',
      success: 'moss',
      info: 'glacier',
      warning: 'amber',
      error: 'crimson',
      neutral: 'harbor',
    },
    button: {
      slots: {
        base: [
          'rounded-[var(--radius-md)] font-medium',
          'transition-[background-color,box-shadow,color,transform] duration-150 ease-[var(--ed-ease-emphasized)]',
          'active:scale-[0.98]',
        ],
      },
      variants: {
        size: {
          xs: {
            base: 'px-2 py-1 text-xs gap-1.5 min-h-7',
          },
          sm: {
            base: 'px-2.5 py-1.5 text-[13px] gap-1.5 min-h-8',
          },
          md: {
            base: 'px-3.5 py-2 text-sm gap-2 min-h-9',
          },
          lg: {
            base: 'px-4 py-2.5 text-[15px] gap-2 min-h-10',
          },
        },
      },
      compoundVariants: [
        {
          color: 'primary',
          variant: 'solid',
          class:
            'text-white bg-[image:var(--ed-gradient-primary)] hover:brightness-110 active:brightness-95 disabled:bg-[image:none] shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_1px_2px_rgb(0_0_0/0.25)]',
        },
        {
          color: 'success',
          variant: 'solid',
          class:
            'text-white bg-[image:var(--ed-gradient-success)] hover:brightness-110 active:brightness-95 disabled:bg-[image:none] shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_1px_2px_rgb(0_0_0/0.25)]',
        },
        {
          color: 'primary',
          variant: 'outline',
          class:
            'ring-1 ring-inset ring-[color-mix(in_oklab,var(--ed-primary)_50%,transparent)] text-[var(--ed-primary)] hover:bg-[color-mix(in_oklab,var(--ed-primary)_calc(var(--ed-state-hover)*100%),transparent)]',
        },
        {
          color: 'neutral',
          variant: 'outline',
          class:
            'ring-1 ring-inset ring-[var(--ed-outline-variant)] bg-[var(--ed-surface-container)] hover:bg-[var(--ed-surface-container-high)]',
        },
      ],
    },
    card: {
      slots: {
        root: 'rounded-[var(--radius-lg)] bg-[var(--ed-surface-container)] ring-1 ring-[var(--ed-outline-variant)] shadow-[var(--ed-shadow-card)] overflow-hidden',
        header: 'p-4 sm:px-5',
        body: 'p-4 sm:p-5',
        footer: 'p-4 sm:px-5',
      },
    },
    input: {
      slots: {
        base: 'rounded-[var(--radius-md)] bg-[var(--ed-surface-container)] ring-[var(--ed-outline-variant)] hover:ring-[var(--ed-outline)] focus-visible:ring-[var(--ed-primary)] transition-shadow',
      },
    },
    textarea: {
      slots: {
        base: 'rounded-[var(--radius-md)] bg-[var(--ed-surface-container)] ring-[var(--ed-outline-variant)] hover:ring-[var(--ed-outline)] focus-visible:ring-[var(--ed-primary)] transition-shadow',
      },
    },
    select: {
      slots: {
        base: 'rounded-[var(--radius-md)] bg-[var(--ed-surface-container)] ring-[var(--ed-outline-variant)]',
        content: 'rounded-[var(--radius-md)] bg-[var(--ed-surface-container)] ring-[var(--ed-outline-variant)] shadow-[var(--ed-shadow-pop)]',
      },
    },
    fileUpload: {
      slots: {
        base: 'rounded-[var(--radius-lg)] border-[var(--ed-outline)] bg-[var(--ed-surface-container-low)] hover:bg-[color-mix(in_oklab,var(--ed-primary)_5%,var(--ed-surface-container-low))] transition-colors',
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
          'rounded-[var(--radius-xl)] bg-[var(--ed-surface-container)] ring-1 ring-[var(--ed-outline-variant)] shadow-[var(--ed-shadow-lift)]',
      },
    },
    dropdownMenu: {
      slots: {
        content: 'rounded-[var(--radius-md)] bg-[var(--ed-surface-container)] ring-[var(--ed-outline-variant)] shadow-[var(--ed-shadow-pop)] p-1',
        item: 'rounded-[var(--radius-sm)]',
      },
    },
    tooltip: {
      slots: {
        content: 'rounded-[var(--radius-sm)] bg-[var(--ed-inverse-surface)] text-[var(--ed-inverse-on-surface)] ring-0 shadow-[var(--ed-shadow-pop)]',
        text: 'text-[var(--ed-inverse-on-surface)]',
      },
    },
    toast: {
      slots: {
        root: 'rounded-[var(--radius-lg)] bg-[var(--ed-surface-container-high)] ring-1 ring-[var(--ed-outline-variant)] shadow-[var(--ed-shadow-pop)]',
      },
    },
    alert: {
      slots: {
        root: 'rounded-[var(--radius-md)]',
      },
    },
    empty: {
      slots: {
        root: 'rounded-[var(--radius-lg)]',
      },
    },
    skeleton: {
      base: 'rounded-[var(--radius-md)] bg-[var(--ed-surface-container-high)]',
    },
    pagination: {
      slots: {
        list: 'gap-1',
      },
    },
    avatar: {
      slots: {
        root: 'ring-1 ring-[var(--ed-outline-variant)]',
      },
    },
    separator: {
      slots: {
        border: 'border-[var(--ed-outline-variant)]',
      },
    },
  },
})
