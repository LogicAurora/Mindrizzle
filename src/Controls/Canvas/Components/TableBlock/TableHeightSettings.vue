<template>
  <v-list density="compact">
    <v-list-item class="px-3">
      <v-switch :model-value="fitHeight" color="primary" label="高度适应内容" hint="块高随表格行数自动调整"
        persistent-hint hide-details :disabled="readOnly"
        @update:model-value="(value) => emit('update', { fitHeight: value === true })" />
    </v-list-item>
  </v-list>
</template>

<script setup lang="ts">
defineProps<{
  fitHeight: boolean
  readOnly: boolean
}>()

const emit = defineEmits<{ (e: 'update', patch: Record<string, unknown>): void }>()
</script>
