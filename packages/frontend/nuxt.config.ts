// https://nuxt.com/docs/api/configuration/nuxt-config
// https://v2.tauri.app/start/frontend/nuxt/
export default defineNuxtConfig({
  extends: ['@echbox/uikit'],
  modules: ['@nuxt/eslint', '@nuxt/image', '@vueuse/nuxt/module'],
  compatibilityDate: '2025-07-15',
  // (optional) Enable the Nuxt devtools
  devtools: { enabled: true },
  // Enable SSG — Tauri doesn’t support server-based solutions
  ssr: false,
  runtimeConfig: {
    public: {
      // Override with NUXT_PUBLIC_API_URL
      apiUrl: 'http://localhost:3001',
    },
  },
  typescript: {
    strict: true,
  },
  // Discoverable by other devices when running on iOS physical devices
  devServer: {
    host: '0',
  },
  vite: {
    // Better support for Tauri CLI output
    clearScreen: false,
    // Additional env vars: https://v2.tauri.app/reference/environment-variables/
    envPrefix: ['VITE_', 'TAURI_'],
    server: {
      // Tauri requires a consistent port
      strictPort: true,
    },
  },
  // Avoids error [unhandledRejection] EMFILE: too many open files, watch
  ignore: ['**/src-tauri/**'],
  nitro: {
    // Match Tauri frontendDist: ../dist
    output: {
      publicDir: '../dist',
    },
  },
})
