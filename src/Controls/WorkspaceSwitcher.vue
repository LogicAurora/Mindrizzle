<script setup lang="ts">
import { computed } from 'vue'
import {
  mdiArrowDown,
  mdiArrowUp,
  mdiCheck,
  mdiChevronDown,
  mdiClose,
  mdiDotsVertical,
  mdiFileDocumentOutline,
  mdiFolderOutline,
  mdiFolderPlus,
  mdiPencilOutline,
} from '@mdi/js'

export interface WorkspaceOption {
  id: string
  name: string
  kind: 'workspace' | 'external'
  isEditable?: boolean
}

const MOVE_UP = -1
const MOVE_DOWN = 1

const props = defineProps<{
  modelValue: string
  options: WorkspaceOption[]
  canAddWorkspace: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'add-workspace': []
  'rename-workspace': [id: string]
  'move-workspace': [id: string, offset: number]
  'remove-workspace': [id: string]
}>()

const activeOption = computed(
  () => props.options.find((option) => option.id === props.modelValue) ?? props.options[0],
)

const editableIds = computed(() =>
  props.options.filter((option) => option.isEditable).map((option) => option.id),
)

function isMoveDisabled(id: string, offset: number): boolean {
  const target = editableIds.value.indexOf(id) + offset
  return target < 0 || target >= editableIds.value.length
}

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
    <v-list density="compact" min-width="240" class="py-1">
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
          <v-menu v-if="option.isEditable" location="bottom end" offset="4">
            <template #activator="{ props: menuProps }">
              <v-btn v-bind="menuProps" :icon="mdiDotsVertical" size="x-small" variant="text" @click.stop />
            </template>
            <v-list density="compact" min-width="140">
              <v-list-item @click="emit('rename-workspace', option.id)">
                <template #prepend><v-icon :icon="mdiPencilOutline" size="small" /></template>
                <v-list-item-title>重命名</v-list-item-title>
              </v-list-item>
              <v-list-item
                :disabled="isMoveDisabled(option.id, MOVE_UP)"
                @click="emit('move-workspace', option.id, MOVE_UP)"
              >
                <template #prepend><v-icon :icon="mdiArrowUp" size="small" /></template>
                <v-list-item-title>上移</v-list-item-title>
              </v-list-item>
              <v-list-item
                :disabled="isMoveDisabled(option.id, MOVE_DOWN)"
                @click="emit('move-workspace', option.id, MOVE_DOWN)"
              >
                <template #prepend><v-icon :icon="mdiArrowDown" size="small" /></template>
                <v-list-item-title>下移</v-list-item-title>
              </v-list-item>
              <v-divider class="my-1" />
              <v-list-item @click="emit('remove-workspace', option.id)">
                <template #prepend><v-icon :icon="mdiClose" size="small" /></template>
                <v-list-item-title>移出列表</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>
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
