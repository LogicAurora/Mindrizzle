<script setup lang="ts">
import { computed } from 'vue'
import { mdiCheck, mdiChevronDown, mdiFileDocumentOutline, mdiFolderOutline, mdiFolderPlus } from '@mdi/js'

export interface WorkspaceOption {
  id: string
  name: string
  kind: 'workspace' | 'external'
}

const props = defineProps<{
  modelValue: string
  options: WorkspaceOption[]
  canAddWorkspace: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'add-workspace': []
}>()

const activeOption = computed(
  () => props.options.find((option) => option.id === props.modelValue) ?? props.options[0],
)

const selectOption = (id: string) => emit('update:modelValue', id)
</script>

<template>
  <v-menu location="bottom start" offset="4">
    <template #activator="{ props: activatorProps }">
      <v-btn v-bind="activatorProps" variant="text" class="workspace-switcher__trigger text-white">
        <v-icon :icon="mdiFolderOutline" start />
        <span class="workspace-switcher__label">{{ activeOption?.name ?? '默认工作区' }}</span>
        <v-icon :icon="mdiChevronDown" end />
      </v-btn>
    </template>
    <v-list density="compact" min-width="220" class="py-1">
      <v-list-item
        v-for="option in options"
        :key="option.id"
        :active="option.id === modelValue"
        @click="selectOption(option.id)"
      >
        <template #prepend>
          <v-icon :icon="option.kind === 'external' ? mdiFileDocumentOutline : mdiFolderOutline" />
        </template>
        <v-list-item-title>{{ option.name }}</v-list-item-title>
        <template #append>
          <v-icon v-if="option.id === modelValue" :icon="mdiCheck" size="small" />
        </template>
      </v-list-item>
      <template v-if="canAddWorkspace">
        <v-divider class="my-1" />
        <v-list-item @click="emit('add-workspace')">
          <template #prepend>
            <v-icon :icon="mdiFolderPlus" />
          </template>
          <v-list-item-title>添加工作区</v-list-item-title>
        </v-list-item>
      </template>
    </v-list>
  </v-menu>
</template>

<style scoped>
.workspace-switcher__trigger {
  /* teleport 进工具栏后拿不到 VBtn 默认值，宽度得自己收住 */
  max-width: 260px;
}

.workspace-switcher__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
