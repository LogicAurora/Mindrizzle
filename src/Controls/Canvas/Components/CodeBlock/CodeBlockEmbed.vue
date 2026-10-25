<template>
  <div class="standalone-code-block">
    <CodeBlockEditor :code="modelValue ?? ''" :language="language ?? 'plaintext'" :read-only="readOnly === true"
      @update:code="(value) => emit('update:modelValue', value)"
      @update:language="(value) => emit('update:language', value)" />
  </div>
</template>

<script setup lang="ts">
import CodeBlockEditor from './CodeBlockEditor.vue'

defineProps<{
  modelValue?: string
  language?: string
  readOnly?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'update:language', value: string): void
}>()
</script>

<style scoped>
.standalone-code-block {
  width: 100%;
  height: 100%;
}
</style>
