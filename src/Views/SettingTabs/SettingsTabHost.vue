<script setup lang="ts">
import { provide, toRef } from 'vue';

import { settingsTabActiveKey } from './settingsTabContext';

const props = defineProps<{ active: boolean }>();

provide(settingsTabActiveKey, toRef(props, 'active'));
</script>

<template>
  <slot />
</template>
