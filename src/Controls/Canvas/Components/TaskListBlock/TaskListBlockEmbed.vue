<template>
  <TaskListView :title="title" :tasks="tasks" :read-only="readOnly === true" @update:title="onTitleUpdate"
    @update:tasks="onTasksUpdate" />
  <Teleport v-if="settingsHost" :to="settingsHost">
    <TaskSettings :title="title" :tasks="tasks" :read-only="readOnly === true" @update="onSettingsUpdate" />
  </Teleport>
</template>

<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'

// 根是「内容 + Teleport」的 fragment，透传 attrs 无处可落

defineOptions({ inheritAttrs: false })

import type { TaskItem } from '../../Registry/canvasComponents.ts'
import { EMBED_SETTINGS_HOST_KEY } from '../../Sdk/embedSettingsHost.ts'
import TaskListView from './TaskListView.vue'
import TaskSettings from './TaskSettings.vue'
import { normalizeTasks } from './taskItems.ts'

const props = defineProps<{
  title?: string
  tasks?: unknown
  readOnly?: boolean
}>()

const emit = defineEmits<{ (e: 'update-props', patch: Record<string, unknown>): void }>()

const settingsHost = inject(EMBED_SETTINGS_HOST_KEY, ref(null))
const tasks = ref<TaskItem[]>(normalizeTasks(props.tasks))
const title = computed(() => String(props.title ?? ''))

// 节点 attrs 换了（撤销/重做）就回灌，自己写回的是同一引用，据此避免覆盖输入
watch(
  () => props.tasks,
  (next) => {
    if (next !== tasks.value) tasks.value = normalizeTasks(next)
  },
)

const onTasksUpdate = (next: TaskItem[]) => {
  tasks.value = next
  emit('update-props', { tasks: next })
}

const onTitleUpdate = (next: string) => {
  emit('update-props', { title: next })
}

const onSettingsUpdate = (patch: Record<string, unknown>) => {
  if (Array.isArray(patch.tasks)) tasks.value = patch.tasks as TaskItem[]
  emit('update-props', patch)
}
</script>
