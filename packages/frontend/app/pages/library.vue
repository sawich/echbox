<script setup lang="ts">
import { useLibraryInstances } from '~/composables/useLibraryInstances'
const route = useRoute()
const router = useRouter()
const { entries, loadGames, refreshInstalled } = useLibraryInstances()

onMounted(() => {
  void loadGames()
  void refreshInstalled()
})

const selectedInstanceId = computed(() => {
  const param = route.params.instanceId
  return typeof param === 'string' ? param : null
})

// Landing on /library with installs present opens the first game, like a launcher would.
watch(entries, (list) => {
  if (route.path !== '/library' && !route.path.startsWith('/library/')) return
  if (selectedInstanceId.value) return
  if (list.length > 0) {
    void router.replace(`/library/${list[0]!.instance.instanceId}`)
  }
}, { immediate: true })
</script>

<template>
  <NuxtPage />
</template>
