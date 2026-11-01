import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))

export default defineNuxtConfig({
  $meta: {
    name: 'uikit',
  },
  modules: ['@nuxt/ui'],
  css: [join(currentDir, './app/assets/css/main.css')],
  colorMode: {
    preference: 'system',
    fallback: 'dark',
    classSuffix: '',
  },
  fonts: {
    families: [
      { name: 'Geist', provider: 'google', weights: [400, 500, 600, 700] },
      { name: 'Geist Mono', provider: 'google', weights: [400, 500] },
    ],
  },
  ui: {
    theme: {
      colors: [
        'primary',
        'secondary',
        'tertiary',
        'info',
        'success',
        'warning',
        'error',
      ],
      defaultVariants: {
        color: 'primary',
        size: 'md',
      },
    },
  },
})
