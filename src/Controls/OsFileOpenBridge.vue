<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { useRouter } from 'vue-router';

import { watchOsOpenFile } from '../utils/osFileOpen';
import { useOpenNote } from '../utils/useOpenNote';

const router = useRouter();
const openNote = useOpenNote();
let stopWatching: (() => void) | undefined;

onMounted(async () => {
  await router.isReady();
  stopWatching = watchOsOpenFile(openNote);
});

onBeforeUnmount(() => stopWatching?.());
</script>

<template></template>
